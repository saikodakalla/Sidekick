import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const tokenPath = path.join(__dirname, '.tokens.json')

loadEnv(path.join(projectRoot, '.env'))
loadEnv(path.join(projectRoot, '.env.local'))

const PORT = Number(process.env.API_PORT || 8787)
const API_ORIGIN = process.env.API_ORIGIN || `http://127.0.0.1:${PORT}`
const APP_ORIGIN = process.env.APP_ORIGIN || 'http://127.0.0.1:5173'
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5'

const providerConfig = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || `${API_ORIGIN}/api/oauth/google/callback`,
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/drive.readonly',
    ].join(' '),
  },
  microsoft: {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    redirectUri: process.env.MICROSOFT_REDIRECT_URI || `${API_ORIGIN}/api/oauth/microsoft/callback`,
    scope: ['offline_access', 'User.Read', 'Files.Read'].join(' '),
  },
}

const server = createServer(async (req, res) => {
  try {
    await route(req, res)
  } catch (error) {
    console.error(error)
    sendJson(res, 500, {
      ok: false,
      error: error.message || 'Unexpected server error',
    })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Sidekick API listening on ${API_ORIGIN}`)
})

async function route(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url, API_ORIGIN)

  if (req.method === 'GET' && url.pathname === '/api/status') {
    const tokens = await readTokens()
    sendJson(res, 200, {
      ok: true,
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      model: ANTHROPIC_MODEL,
      google: Boolean(tokens.google?.refresh_token || tokens.google?.access_token),
      microsoft: Boolean(tokens.microsoft?.refresh_token || tokens.microsoft?.access_token),
      googleConfigured: Boolean(providerConfig.google.clientId && providerConfig.google.clientSecret),
      microsoftConfigured: Boolean(providerConfig.microsoft.clientId && providerConfig.microsoft.clientSecret),
    })
    return
  }

  const oauthStart = url.pathname.match(/^\/api\/oauth\/(google|microsoft)\/start$/)
  if (req.method === 'GET' && oauthStart) {
    startOAuth(res, oauthStart[1])
    return
  }

  const oauthCallback = url.pathname.match(/^\/api\/oauth\/(google|microsoft)\/callback$/)
  if (req.method === 'GET' && oauthCallback) {
    await finishOAuth(res, oauthCallback[1], url)
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    const body = await readJson(req)
    const result = await answerFromCloudFiles(body.message || '', body.history || [])
    sendJson(res, 200, result)
    return
  }

  sendJson(res, 404, { ok: false, error: 'Not found' })
}

function startOAuth(res, provider) {
  const config = providerConfig[provider]
  if (!config.clientId || !config.clientSecret) {
    redirect(res, `${APP_ORIGIN}?oauth_error=${provider}_not_configured`)
    return
  }

  const authUrl = new URL(config.authUrl)
  authUrl.searchParams.set('client_id', config.clientId)
  authUrl.searchParams.set('redirect_uri', config.redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', config.scope)

  if (provider === 'google') {
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('prompt', 'consent')
  } else {
    authUrl.searchParams.set('prompt', 'select_account')
  }

  redirect(res, authUrl.toString())
}

async function finishOAuth(res, provider, url) {
  const code = url.searchParams.get('code')
  if (!code) {
    redirect(res, `${APP_ORIGIN}?oauth_error=${provider}_missing_code`)
    return
  }

  const config = providerConfig[provider]
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  })

  const token = await postForm(config.tokenUrl, params)
  await saveProviderToken(provider, normalizeToken(token))
  redirect(res, `${APP_ORIGIN}?connected=${provider}`)
}

async function answerFromCloudFiles(message, history) {
  if (!message.trim()) {
    return { ok: false, error: 'Message is required' }
  }

  const status = await getStatus()
  if (!status.google && !status.microsoft) {
    return {
      ok: true,
      display: {
        answer:
          'Connect Google Drive or OneDrive first, then I can search approved files and answer from their contents.',
        files: [],
      },
      raw: { status },
    }
  }

  const plan = await createSearchPlan(message, history)
  const providerNames = plan.providers?.length
    ? plan.providers.filter((provider) => status[provider])
    : ['google', 'microsoft'].filter((provider) => status[provider])
  const queries = plan.queries?.length ? plan.queries.slice(0, 3) : [message]

  const results = []
  for (const provider of providerNames) {
    for (const query of queries) {
      const found = provider === 'google'
        ? await searchGoogleDrive(query)
        : await searchMicrosoftDrive(query)
      results.push(...found)
    }
  }

  const uniqueResults = dedupeFiles(results).slice(0, 8)
  const filesWithText = []
  for (const file of uniqueResults.slice(0, 5)) {
    filesWithText.push({
      ...file,
      text: await readFileText(file),
    })
  }

  const display = await synthesizeAnswer(message, filesWithText)
  return {
    ok: true,
    display,
    raw: {
      plan,
      files: filesWithText.map(({ text, ...file }) => ({
        ...file,
        textPreview: text.slice(0, 800),
      })),
    },
  }
}

async function createSearchPlan(message, history) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { providers: [], queries: [message], reason: 'Anthropic API key missing; using direct query.' }
  }

  const text = await callAnthropic({
    system:
      'You turn a user question into cloud file search queries. Return only compact JSON: {"providers":["google","microsoft"],"queries":["..."],"reason":"..."}. Use both providers unless the user names one. Keep queries short.',
    messages: [
      ...history.slice(-4).map((entry) => ({
        role: entry.sender === 'assistant' ? 'assistant' : 'user',
        content: entry.text || '',
      })),
      { role: 'user', content: message },
    ],
    maxTokens: 500,
  })

  return parseJson(text, { providers: [], queries: [message], reason: 'Could not parse plan.' })
}

async function synthesizeAnswer(question, files) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      answer:
        files.length === 0
          ? 'I did not find matching cloud files. Add an Anthropic API key to enable smart synthesis.'
          : `I found ${files.length} matching file${files.length === 1 ? '' : 's'}, but Anthropic is not configured yet. Open the source files below to inspect them.`,
      files: files.map(toDisplayFile),
      visual: null,
    }
  }

  const context = files.map((file, index) => ({
    index: index + 1,
    provider: file.provider,
    name: file.name,
    mimeType: file.mimeType,
    url: file.webUrl,
    text: file.text.slice(0, 7000),
  }))

  const text = await callAnthropic({
    system:
      'Answer from the provided cloud file excerpts. Return only JSON: {"answer":"plain English answer","files":[{"title":"file","provider":"google|microsoft","url":"https://...","reason":"why used"}],"data":[{"label":"...","value":"..."}],"visual":{"type":"bar|line|table|null","title":"...","points":[{"label":"...","value":123}]}}. If the files do not answer the question, say what is missing.',
    messages: [
      {
        role: 'user',
        content: JSON.stringify({ question, files: context }),
      },
    ],
    maxTokens: 1400,
  })

  const parsed = parseJson(text, null)
  if (!parsed) {
    return {
      answer: text,
      files: files.map(toDisplayFile),
      visual: null,
    }
  }

  return {
    answer: parsed.answer || 'I searched the connected files and prepared the result.',
    files: Array.isArray(parsed.files) ? parsed.files : files.map(toDisplayFile),
    data: Array.isArray(parsed.data) ? parsed.data : [],
    visual: parsed.visual || null,
  }
}

async function searchGoogleDrive(query) {
  const token = await getAccessToken('google')
  if (!token) return []

  const escaped = query.replaceAll("'", "\\'")
  const params = new URLSearchParams({
    q: `trashed=false and (name contains '${escaped}' or fullText contains '${escaped}')`,
    pageSize: '8',
    fields: 'files(id,name,mimeType,webViewLink,modifiedTime,size)',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  })
  const data = await fetchJson(`https://www.googleapis.com/drive/v3/files?${params}`, token)
  return (data.files || []).map((file) => ({
    provider: 'google',
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    webUrl: file.webViewLink,
    modifiedTime: file.modifiedTime,
    size: file.size,
  }))
}

async function searchMicrosoftDrive(query) {
  const token = await getAccessToken('microsoft')
  if (!token) return []

  const encoded = encodeURIComponent(query.replaceAll("'", "''"))
  const data = await fetchJson(
    `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encoded}')?$top=8&select=id,name,webUrl,file,folder,size,lastModifiedDateTime`,
    token,
  )
  return (data.value || [])
    .filter((item) => item.file)
    .map((file) => ({
      provider: 'microsoft',
      id: file.id,
      name: file.name,
      mimeType: file.file?.mimeType || 'application/octet-stream',
      webUrl: file.webUrl,
      modifiedTime: file.lastModifiedDateTime,
      size: file.size,
    }))
}

async function readFileText(file) {
  try {
    const token = await getAccessToken(file.provider)
    if (!token) return ''

    if (file.provider === 'google') {
      const exportMime = googleExportMime(file.mimeType)
      const url = exportMime
        ? `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=${encodeURIComponent(exportMime)}`
        : `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`
      return await fetchText(url, token)
    }

    if (!isLikelyText(file.mimeType, file.name)) {
      return `[${file.name}] is not a directly readable text/CSV file. Metadata matched the search.`
    }

    return await fetchText(`https://graph.microsoft.com/v1.0/me/drive/items/${file.id}/content`, token)
  } catch (error) {
    return `[Could not read ${file.name}: ${error.message}]`
  }
}

function googleExportMime(mimeType) {
  if (mimeType === 'application/vnd.google-apps.document') return 'text/plain'
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'text/csv'
  if (mimeType === 'application/vnd.google-apps.presentation') return 'text/plain'
  return null
}

function isLikelyText(mimeType, name) {
  return (
    mimeType.startsWith('text/') ||
    mimeType.includes('json') ||
    mimeType.includes('csv') ||
    /\.(txt|csv|json|md|tsv)$/i.test(name)
  )
}

async function callAnthropic({ system, messages, maxTokens }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  })

  if (!response.ok) {
    throw new Error(`Anthropic API failed: ${response.status} ${await response.text()}`)
  }

  const data = await response.json()
  return data.content?.map((block) => block.text || '').join('\n').trim() || ''
}

async function getAccessToken(provider) {
  const tokens = await readTokens()
  const token = tokens[provider]
  if (!token) return null

  if (token.access_token && token.expires_at && token.expires_at > Date.now() + 60_000) {
    return token.access_token
  }

  if (!token.refresh_token) return token.access_token || null

  const config = providerConfig[provider]
  const refreshed = await postForm(
    config.tokenUrl,
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
    }),
  )
  const nextToken = normalizeToken({ ...refreshed, refresh_token: refreshed.refresh_token || token.refresh_token })
  await saveProviderToken(provider, nextToken)
  return nextToken.access_token
}

function normalizeToken(token) {
  return {
    ...token,
    expires_at: Date.now() + Number(token.expires_in || 3600) * 1000,
  }
}

async function getStatus() {
  const tokens = await readTokens()
  return {
    google: Boolean(tokens.google?.refresh_token || tokens.google?.access_token),
    microsoft: Boolean(tokens.microsoft?.refresh_token || tokens.microsoft?.access_token),
  }
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`Cloud API failed: ${response.status} ${await response.text()}`)
  return response.json()
}

async function fetchText(url, token) {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`File download failed: ${response.status}`)
  const text = await response.text()
  return text.slice(0, 12000)
}

async function postForm(url, params) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params,
  })
  if (!response.ok) throw new Error(`Token exchange failed: ${response.status} ${await response.text()}`)
  return response.json()
}

async function readTokens() {
  if (!existsSync(tokenPath)) return {}
  return JSON.parse(await readFile(tokenPath, 'utf8'))
}

async function saveProviderToken(provider, token) {
  await mkdir(__dirname, { recursive: true })
  const tokens = await readTokens()
  tokens[provider] = token
  await writeFile(tokenPath, JSON.stringify(tokens, null, 2))
}

function dedupeFiles(files) {
  const seen = new Set()
  return files.filter((file) => {
    const key = `${file.provider}:${file.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function toDisplayFile(file) {
  return {
    title: file.name,
    provider: file.provider,
    url: file.webUrl,
    reason: 'Matched the query in connected cloud storage.',
  }
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return fallback
    try {
      return JSON.parse(match[0])
    } catch {
      return fallback
    }
  }
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

function sendJson(res, status, data) {
  setCors(res)
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(data))
}

function redirect(res, location) {
  res.writeHead(302, { location })
  res.end()
}

function setCors(res) {
  res.setHeader('access-control-allow-origin', APP_ORIGIN)
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type')
}

function loadEnv(filePath) {
  if (!existsSync(filePath)) return
  const content = readFileSync(filePath, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index === -1) continue
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}
