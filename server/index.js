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
    setCors(res)
    res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8' })
    const emit = (obj) => res.write(JSON.stringify(obj) + '\n')
    try {
      await answerFromCloudFiles(emit, body.message || '', body.history || [])
    } catch (error) {
      console.error(error)
      emit({ type: 'final', display: { answer: error.message || 'Unexpected error', files: [] }, raw: {} })
    }
    res.end()
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

async function answerFromCloudFiles(emit, message, history) {
  if (!message.trim()) {
    emit({ type: 'final', display: { answer: 'Message is required', files: [] }, raw: {} })
    return
  }

  const status = await getStatus()
  const plan = await createSearchPlan(message, history)
  emit({ type: 'plan', plan })

  if (!plan.needsFiles) {
    const answer = await chatReply(message, history)
    emit({
      type: 'final',
      display: { answer, files: [], data: [], visual: null },
      raw: { plan },
    })
    return
  }

  if (!status.google && !status.microsoft) {
    emit({
      type: 'final',
      display: {
        answer:
          'Connect Google Drive first, then I can search your files and answer from their contents.',
        files: [],
      },
      raw: { plan, status },
    })
    return
  }

  const providerNames = plan.providers?.length
    ? plan.providers.filter((provider) => status[provider])
    : ['google', 'microsoft'].filter((provider) => status[provider])
  const queries = plan.queries?.length ? plan.queries.slice(0, 5) : [message]

  const results = []
  for (const provider of providerNames) {
    for (const query of queries) {
      const found = provider === 'google'
        ? await searchGoogleDrive(query)
        : await searchMicrosoftDrive(query)
      results.push(...found)
    }
  }

  const uniqueResults = dedupeFiles(results).slice(0, 15)
  const candidates = await Promise.all(
    uniqueResults.slice(0, 12).map(async (file) => ({
      ...file,
      text: await readFileText(file),
    })),
  )

  const ranked = await rerankCandidates(message, candidates)
  emit({ type: 'rerank', candidates: candidates.length, kept: Math.min(ranked.length, 5) })

  const filesWithText = ranked.slice(0, 5)
  const display = await synthesizeAnswer(message, filesWithText)
  emit({
    type: 'final',
    display,
    raw: {
      plan,
      candidatesConsidered: candidates.map(({ text, ...file }) => ({ ...file, textPreview: (text || '').slice(0, 200) })),
      files: filesWithText.map(({ text, ...file }) => ({
        ...file,
        textPreview: (text || '').slice(0, 800),
      })),
    },
  })
}

async function rerankCandidates(question, candidates) {
  if (candidates.length <= 5 || !process.env.ANTHROPIC_API_KEY) return candidates

  const summaries = candidates.map((file, index) => ({
    index,
    name: file.name,
    mimeType: file.mimeType,
    snippet: (file.text || '').slice(0, 400).replace(/\s+/g, ' ').trim(),
  }))

  const text = await callAnthropic({
    system: [
      'You are a relevance ranker for cloud-file search results.',
      'Given a user question and candidate files (name, MIME type, content snippet),',
      'rank ALL candidates from most to least likely to answer the question.',
      '',
      'Return ONLY JSON: {"order":[<index>,<index>,...]} where each index is an integer referring to a candidate.',
      'Include EVERY candidate index exactly once. Most relevant first, irrelevant last.',
      '',
      'Heuristics:',
      '- A small spreadsheet whose content matches the question topic is MORE relevant than a large unrelated PDF that happens to mention the same word.',
      '- Filename signals matter: a file named "Sales Report" is more relevant to a sales question than a generic doc.',
      '- For numerical/quantitative questions, prefer spreadsheets and structured data over prose.',
      '- For prose questions, prefer documents and presentations over spreadsheets.',
    ].join('\n'),
    messages: [{ role: 'user', content: JSON.stringify({ question, candidates: summaries }) }],
    maxTokens: 300,
  })

  const parsed = parseJson(text, null)
  if (!parsed?.order || !Array.isArray(parsed.order)) return candidates

  const seen = new Set()
  const ordered = []
  for (const i of parsed.order) {
    if (Number.isInteger(i) && i >= 0 && i < candidates.length && !seen.has(i)) {
      ordered.push(candidates[i])
      seen.add(i)
    }
  }
  for (let i = 0; i < candidates.length; i++) {
    if (!seen.has(i)) ordered.push(candidates[i])
  }
  return ordered
}

async function createSearchPlan(message, history) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { needsFiles: false, providers: [], queries: [], reason: 'Anthropic API key missing.' }
  }

  const text = await callAnthropic({
    system: [
      'You are the routing layer for Sidekick, a Shopify assistant.',
      'For every user message, decide whether it requires searching the user\'s Google Drive / OneDrive files,',
      'and if so, produce search keywords.',
      '',
      'Return ONLY compact JSON: {"needsFiles":bool,"providers":["google","microsoft"],"queries":["kw1","kw2"],"reason":"..."}',
      '',
      'ROUTING — when needsFiles=true:',
      '- The message asks about the user\'s own data, files, documents, spreadsheets, reports, or numbers.',
      '- The message references things only findable in their personal storage ("my sales", "our roadmap", "the Q1 report", "the deck I made", named files).',
      '- The message asks to summarize/analyze/look up something specific.',
      '',
      'ROUTING — when needsFiles=false:',
      '- Greetings or chit-chat ("hi", "hello", "thanks", "how are you").',
      '- Generic questions about Shopify or e-commerce concepts that don\'t need user data.',
      '- Meta questions about the assistant ("what can you do?").',
      '- Anything that can be answered without reading a file.',
      'When needsFiles=false, return queries:[] and providers:[].',
      '',
      'QUERY RULES (only matter when needsFiles=true; the API does literal substring matching):',
      '- Each query is passed verbatim to Drive\'s `name contains` and `fullText contains` operators.',
      '- NO operators, NO quotes, NO field prefixes. Never emit `filename:`, `name:`, `:`, AND/OR, parentheses, or wildcards.',
      '- Prefer single distinctive words. Multi-word phrases only match if a file name/content contains that exact substring.',
      '- Output 3-5 candidate keywords covering different angles: the topic, distinctive nouns the user said, likely file-name fragments, related synonyms.',
      '- The user may NOT name a file. Infer keywords from the topic. Example: "what was my Q1 revenue?" -> ["revenue","sales","Q1","quarterly","financial"].',
      '- If the user does name a file, include that name AND 2-3 fallback keywords from the rest of the question.',
      '',
      'PROVIDER RULES:',
      '- Default to both ["google","microsoft"] unless the user explicitly names one.',
      '',
      'Examples:',
      'User: "hello" -> {"needsFiles":false,"providers":[],"queries":[],"reason":"greeting"}',
      'User: "what can you do?" -> {"needsFiles":false,"providers":[],"queries":[],"reason":"meta question"}',
      'User: "what is in my Sidekick Test Sale sheet?" -> {"needsFiles":true,"providers":["google","microsoft"],"queries":["Sidekick","Test Sale","Sidekick Test"],"reason":"named file plus fallbacks"}',
      'User: "summarize my recent sales numbers" -> {"needsFiles":true,"providers":["google","microsoft"],"queries":["sales","revenue","quarterly","report"],"reason":"topic keywords for discovery"}',
      'User: "what is a good discount strategy for new customers?" -> {"needsFiles":false,"providers":[],"queries":[],"reason":"general advice, no user data needed"}',
    ].join('\n'),
    messages: [
      ...history.slice(-4).map((entry) => ({
        role: entry.sender === 'assistant' ? 'assistant' : 'user',
        content: entry.text || '',
      })),
      { role: 'user', content: message },
    ],
    maxTokens: 500,
  })

  return parseJson(text, { needsFiles: true, providers: [], queries: [message], reason: 'Could not parse plan; defaulting to file search.' })
}

async function chatReply(message, history) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return 'I need an Anthropic API key to answer. Add ANTHROPIC_API_KEY to .env.local.'
  }
  return callAnthropic({
    system: [
      'You are Sidekick, a friendly Shopify assistant.',
      'Reply conversationally and concisely in plain text. No JSON, no markdown headers.',
      'You can answer general questions about Shopify, e-commerce, and have casual chat.',
      'If the user asks about their specific data, files, or numbers, tell them to ask a question that names what they want (e.g. "summarize my Q1 sales") so you can search their connected Drive.',
      'Keep replies under 4 sentences unless the user asks for detail.',
    ].join('\n'),
    messages: [
      ...history.slice(-6).map((entry) => ({
        role: entry.sender === 'assistant' ? 'assistant' : 'user',
        content: entry.text || '',
      })),
      { role: 'user', content: message },
    ],
    maxTokens: 400,
  })
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

  const today = new Date().toISOString().slice(0, 10)
  const text = await callAnthropic({
    system: [
      `Today's date is ${today}. Use it when the user says "this year", "last year", "Q2 last year", "recent", etc.`,
      'Answer the user question from the provided cloud file excerpts.',
      'Return ONLY JSON in this shape:',
      '{',
      '  "answer": "plain English answer, 1-4 sentences",',
      '  "files": [{"title":"file name","provider":"google|microsoft","url":"https://...","reason":"why used"}],',
      '  "data": [{"label":"...","value":"..."}],',
      '  "visual": null OR a chart OR a table',
      '}',
      '',
      'Visual format options:',
      '- Omit (null) when a chart/table adds no value over the prose answer.',
      '- Bar/line chart: {"type":"bar"|"line","title":"...","points":[{"label":"Q1","value":150000}, ...]}',
      '  Use bar for category comparisons. Use line for time series / trends.',
      '- Table: {"type":"table","title":"...","headers":["Col 1","Col 2"],"rows":[["a","b"],["c","d"]]}',
      '  Use a table when the answer is best expressed as multiple rows × multiple columns (>= 2 columns).',
      '',
      'Choose the visual format that best fits the data:',
      '- Pure single-metric breakdowns (revenue by quarter) -> bar or line chart.',
      '- Trends over time -> line chart.',
      '- Multi-attribute comparisons (rows = items, columns = attributes) -> table.',
      '- Plain prose answers (no quantities) -> visual: null.',
      '',
      'If the files do not answer the question, set visual to null and say what is missing in answer.',
    ].join('\n'),
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
