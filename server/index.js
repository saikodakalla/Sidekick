import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const tokenPath = path.join(__dirname, '.tokens.json')
const productsPath = path.join(__dirname, '.products.json')

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
      shopifyConfigured: isShopifyConfigured(),
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/shopify/status') {
    sendJson(res, 200, {
      configured: isShopifyConfigured(),
      storeDomain: isShopifyConfigured() ? process.env.SHOPIFY_STORE_DOMAIN : null,
    })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/shopify/products/create') {
    const body = await readJson(req)
    const result = await createShopifyDraftProduct(body.draft)
    sendJson(res, result.success ? 200 : 400, result)
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

  if (req.method === 'POST' && url.pathname === '/api/products/create') {
    const body = await readJson(req)
    const result = await createMockProduct(body.draft)
    sendJson(res, result.ok ? 200 : 400, result)
    return
  }

  const thumbMatch = url.pathname.match(/^\/api\/drive\/thumbnail\/([^/]+)$/)
  if (req.method === 'GET' && thumbMatch) {
    const fileId = thumbMatch[1]
    try {
      const token = await getAccessToken('google')
      if (!token) { res.writeHead(401); res.end(); return }
      const driveRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&acknowledgeAbuse=true`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!driveRes.ok) { res.writeHead(driveRes.status); res.end(); return }
      const contentType = driveRes.headers.get('content-type') || 'image/jpeg'
      setCors(res)
      res.writeHead(200, { 'content-type': contentType, 'cache-control': 'private, max-age=300' })
      driveRes.body.pipeTo(new WritableStream({ write(chunk) { res.write(chunk) }, close() { res.end() } }))
    } catch { res.writeHead(500); res.end() }
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/storefront/agent') {
    const body = await readJson(req)
    setCors(res)
    res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8' })
    const emit = (obj) => res.write(JSON.stringify(obj) + '\n')
    try {
      await runStorefrontAgent(emit, body.message || '', body.history || [])
    } catch (error) {
      console.error(error)
      emit({ type: 'final', answer: error.message || 'Unexpected error in storefront agent' })
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

  if (plan.intent === 'product_create') {
    await productAgentFlow(emit, message, plan, status)
    return
  }

  if (plan.intent === 'storefront_agent') {
    await runStorefrontAgentForChat(emit, message, history)
    return
  }

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
      'Return ONLY compact JSON: {"intent":"chat|files|product_create|storefront_agent","needsFiles":bool,"providers":["google","microsoft"],"queries":["kw1","kw2"],"reason":"..."}',
      '',
      'BIAS: When in doubt, ALWAYS prefer needsFiles=true and search. A false positive (searching when not needed) is harmless. A false negative (not searching when the user wanted Drive data) makes you useless.',
      '',
      'INTENT RULES (in priority order):',
      '- intent:"storefront_agent" when the user wants to publish, upload, push, or add something to their live website/store/storefront WITHOUT asking to scan Drive for a new doc first. Also covers: audit store, change theme, create pages/collections, delete/unpublish products, "publish it", "add it to my store", "upload it to my website". Set needsFiles:false.',
      '  KEY: if the conversation already has a product draft and the user says "publish it", "upload it", "add it to my site/store/website" → ALWAYS storefront_agent.',
      '  Triggers: "publish it", "upload it to my website", "add it to my store", "push it live", "audit my store", "update theme", "create a page", "create a collection", "list my pages", "publish all products", "show me my store", "make changes to the storefront".',
      '- intent:"product_create" ONLY when the user explicitly asks to SCAN Drive / find a doc / create a NEW product from scratch with no prior context. Set needsFiles:true.',
      '  Triggers: "scan for new product", "find a product doc", "create product from drive", "scan storefront ideas", "scan and upload".',
      '  DO NOT use product_create if the user is referring to something already shown in the conversation.',
      '- intent:"files" when the user wants to search, read, browse, or analyze files but not create a product. Set needsFiles:true.',
      '  Triggers: "drive" alone, "check my files", "what\'s in my drive", "show me my docs", vague file references.',
      '- intent:"chat" ONLY for: pure greetings ("hi", "hello"), pure chit-chat ("how are you"), or questions answerable entirely from general knowledge with zero need for the user\'s personal files.',
      '',
      'ROUTING — when needsFiles=true:',
      '- ANY mention of "drive", "docs", "files", "my data", "my store", "my products", "my sales", "our roadmap", named files, or personal storage.',
      '- Action verbs aimed at the storefront: scan, upload, sync, publish, create, draft, add.',
      '- Requests to summarize, analyze, find, look up, or report on anything specific.',
      '- VAGUE messages that could relate to Drive (e.g. just "drive", "show me", "what do I have").',
      '',
      'ROUTING — when needsFiles=false (VERY restrictive):',
      '- Pure greetings with no action intent ("hi", "hello", "thanks", "how are you").',
      '- Purely hypothetical or educational Shopify questions with zero reference to the user\'s own store or files.',
      '- Meta questions about the assistant only ("what can you do?").',
      'When needsFiles=false, return queries:[] and providers:[].',
      '',
      'QUERY RULES (only matter when needsFiles=true; the API does literal substring matching):',
      '- Each query is passed verbatim to Drive\'s `name contains` and `fullText contains` operators.',
      '- NO operators, NO quotes, NO field prefixes. Never emit `filename:`, `name:`, `:`, AND/OR, parentheses, or wildcards.',
      '- Prefer single distinctive words. Multi-word phrases only match if a file name/content contains that exact substring.',
      '- Output 3-5 candidate keywords covering different angles: the topic, distinctive nouns the user said, likely file-name fragments, related synonyms.',
      '- The user may NOT name a file. Infer keywords from the topic. Example: "what was my Q1 revenue?" -> ["revenue","sales","Q1","quarterly","financial"].',
      '- If the user does name a file, include that name AND 2-3 fallback keywords from the rest of the question.',
      '- For vague Drive browse requests (e.g. "drive" alone), use discovery keywords: ["product","sales","report","inventory","launch"].',
      '',
      'PROVIDER RULES:',
      '- Default to both ["google","microsoft"] unless the user explicitly names one.',
      '',
      'Examples:',
      'User: "hello" -> {"intent":"chat","needsFiles":false,"providers":[],"queries":[],"reason":"greeting"}',
      'User: "what can you do?" -> {"intent":"chat","needsFiles":false,"providers":[],"queries":[],"reason":"meta question"}',
      'User: "drive" -> {"intent":"files","needsFiles":true,"providers":["google","microsoft"],"queries":["product","sales","report","inventory","launch"],"reason":"user wants to browse Drive"}',
      'User: "what is in my Sidekick Test Sale sheet?" -> {"intent":"files","needsFiles":true,"providers":["google","microsoft"],"queries":["Sidekick","Test Sale","Sidekick Test"],"reason":"named file plus fallbacks"}',
      'User: "summarize my recent sales numbers" -> {"intent":"files","needsFiles":true,"providers":["google","microsoft"],"queries":["sales","revenue","quarterly","report"],"reason":"topic keywords for discovery"}',
      'User: "what is a good discount strategy for new customers?" -> {"intent":"chat","needsFiles":false,"providers":[],"queries":[],"reason":"general advice, no user data needed"}',
      'User: "scan for new product and upload to storefront" -> {"intent":"product_create","needsFiles":true,"providers":["google","microsoft"],"queries":["product","launch","brief","new","storefront"],"reason":"scan Drive for product brief and publish"}',
      'User: "create a product from the StormLite launch doc" -> {"intent":"product_create","needsFiles":true,"providers":["google","microsoft"],"queries":["StormLite","launch","product brief","StormLite launch"],"reason":"product creation from Drive doc"}',
      'User: "draft a product from my jacket brief in Drive" -> {"intent":"product_create","needsFiles":true,"providers":["google","microsoft"],"queries":["jacket","brief","launch","product"],"reason":"product creation from Drive doc"}',
      'User: "scan storefront ideas doc" -> {"intent":"product_create","needsFiles":true,"providers":["google","microsoft"],"queries":["storefront","ideas","product","brief"],"reason":"scan a doc for product/storefront ideas"}',
      'User: "audit my store" -> {"intent":"storefront_agent","needsFiles":false,"providers":[],"queries":[],"reason":"storefront audit request"}',
      'User: "publish it" -> {"intent":"storefront_agent","needsFiles":false,"providers":[],"queries":[],"reason":"follow-up publish action"}',
      'User: "upload it to my website" -> {"intent":"storefront_agent","needsFiles":false,"providers":[],"queries":[],"reason":"follow-up upload to storefront"}',
      'User: "no, i want you to upload it to my website" -> {"intent":"storefront_agent","needsFiles":false,"providers":[],"queries":[],"reason":"user wants storefront publish not another Drive scan"}',
      'User: "add it to my store" -> {"intent":"storefront_agent","needsFiles":false,"providers":[],"queries":[],"reason":"follow-up store publish"}',
      'User: "push it live" -> {"intent":"storefront_agent","needsFiles":false,"providers":[],"queries":[],"reason":"follow-up publish to storefront"}',
      'User: "create a Summer Sale collection" -> {"intent":"storefront_agent","needsFiles":false,"providers":[],"queries":[],"reason":"collection creation — store-level operation"}',
      'User: "what pages do I have?" -> {"intent":"storefront_agent","needsFiles":false,"providers":[],"queries":[],"reason":"listing store pages"}',
      'User: "publish all my draft products" -> {"intent":"storefront_agent","needsFiles":false,"providers":[],"queries":[],"reason":"publishing products — store-level operation"}',
      'User: "update my theme colors" -> {"intent":"storefront_agent","needsFiles":false,"providers":[],"queries":[],"reason":"theme modification"}',
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
    fields: 'files(id,name,mimeType,webViewLink,modifiedTime,size,parents)',
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
    parents: file.parents || [],
  }))
}

// ─── Drive Image Discovery ────────────────────────────────────────────────────

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const IMAGE_MIME_QUERY = IMAGE_MIME_TYPES.map((m) => `mimeType = '${m}'`).join(' or ')
const IMAGE_HERO_KEYWORDS = ['front', 'hero', 'product', 'lifestyle', 'main', 'cover', 'primary', 'feature']

async function searchDriveImagesInFolder(folderId) {
  const token = await getAccessToken('google')
  if (!token) return []

  const params = new URLSearchParams({
    q: `trashed=false and '${folderId}' in parents and (${IMAGE_MIME_QUERY})`,
    pageSize: '20',
    fields: 'files(id,name,mimeType,webViewLink,thumbnailLink,modifiedTime)',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  })

  try {
    const data = await fetchJson(`https://www.googleapis.com/drive/v3/files?${params}`, token)
    return data.files || []
  } catch {
    return []
  }
}

async function searchDriveImagesGlobal(productTitle, fallbackQueries) {
  const token = await getAccessToken('google')
  if (!token) return []

  const terms = [productTitle, ...fallbackQueries].filter(Boolean)
  const searchWord = terms[0]?.split(/\s+/).find((w) => w.length > 2) || terms[0] || 'product'
  const escaped = searchWord.replaceAll("'", "\\'")

  const params = new URLSearchParams({
    q: `trashed=false and (${IMAGE_MIME_QUERY}) and name contains '${escaped}'`,
    pageSize: '15',
    fields: 'files(id,name,mimeType,webViewLink,thumbnailLink,modifiedTime)',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  })

  try {
    const data = await fetchJson(`https://www.googleapis.com/drive/v3/files?${params}`, token)
    return data.files || []
  } catch {
    return []
  }
}

async function rankAndSelectImages(images, productTitle, productDescription) {
  const titleWords = productTitle.toLowerCase().split(/\s+/).filter((w) => w.length > 2)

  // Heuristic pre-score
  const prescored = images.map((img) => {
    const nameLower = img.name.toLowerCase()
    let score = 0
    for (const kw of IMAGE_HERO_KEYWORDS) {
      if (nameLower.includes(kw)) score += 2
    }
    for (const w of titleWords) {
      if (nameLower.includes(w)) score += 3
    }
    return { ...img, _score: score }
  })

  const seen = new Set()
  const candidates = prescored
    .filter((img) => {
      if (seen.has(img.id)) return false
      seen.add(img.id)
      return true
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, 8) // gather more before AI filtering

  if (!candidates.length) return []

  // AI validation: ask Haiku which images actually match this product
  try {
    const imageList = candidates.map((img, i) => `${i + 1}. "${img.name}"`).join('\n')
    const aiResponse = await callAnthropicReasoning({
      system: `You are an image relevance validator for an e-commerce product upload system.
Given a product title, optional description, and a list of image filenames from Google Drive,
decide which images actually depict or directly relate to this product.
Return ONLY a JSON array of the 1-indexed positions that are relevant, e.g. [1,3].
If none match, return []. No explanation — only the JSON array.`,
      messages: [
        {
          role: 'user',
          content: `Product title: "${productTitle}"
${productDescription ? `Product description: "${productDescription.slice(0, 300)}"` : ''}

Image filenames:
${imageList}

Which image numbers actually match this product?`,
        },
      ],
      maxTokens: 200,
    })

    const match = aiResponse.match(/\[[\d,\s]*\]/)
    if (match) {
      const kept = JSON.parse(match[0])
      if (Array.isArray(kept) && kept.length > 0) {
        const filtered = kept.map((i) => candidates[i - 1]).filter(Boolean).slice(0, 3)
        if (filtered.length > 0) return filtered
      }
    }
  } catch {
    // fall through to heuristic result
  }

  return candidates.slice(0, 3)
}

function driveImageToMediaDraft(image) {
  return {
    originalSource: `https://drive.google.com/uc?export=download&id=${image.id}`,
    mediaContentType: 'IMAGE',
    alt: image.name.replace(/\.[^.]+$/, ''),
    sourceFileName: image.name,
    driveFileId: image.id,
    thumbnailLink: image.thumbnailLink || null,
  }
}

async function findDriveImagesForProduct(sourceFile, productTitle, fallbackQueries, productDescription) {
  try {
    let images = []

    if (sourceFile.provider === 'google') {
      const parentIds = sourceFile.parents?.length ? sourceFile.parents : []
      if (parentIds.length) {
        images = await searchDriveImagesInFolder(parentIds[0])
      }
    }

    if (!images.length) {
      images = await searchDriveImagesGlobal(productTitle, fallbackQueries)
    }

    const ranked = await rankAndSelectImages(images, productTitle, productDescription)
    return ranked.map(driveImageToMediaDraft)
  } catch {
    return []
  }
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

// Uses claude-opus-4-7 with adaptive thinking + prompt caching for high-stakes reasoning.
// System prompt is cached so repeated calls (rerank, extract) don't re-process the large prompt.
async function callAnthropicReasoning({ system, messages, maxTokens }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing')

  // Cache the system prompt — stable across calls, saves tokens on repeated reranks
  const systemBlocks = [
    {
      type: 'text',
      text: system,
      cache_control: { type: 'ephemeral' },
    },
  ]

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: maxTokens,
      system: systemBlocks,
      messages,
    }),
  })

  if (!response.ok) {
    throw new Error(`Anthropic reasoning API failed: ${response.status} ${await response.text()}`)
  }

  const data = await response.json()
  return data.content?.map((b) => b.text || '').join('\n').trim() || ''
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

// ─── Product Launch Agent ────────────────────────────────────────────────────

async function rerankForProductCreate(message, candidates) {
  const DEV_NAME = /changelog|readme|package|license|contributing|config|setup|install|makefile|dockerfile|gruntfile|gemfile|procfile/i
  const DEV_EXT = /\.(md|json|js|ts|jsx|tsx|py|rb|go|java|css|html|xml|yaml|yml|lock|log|sh|env|toml|ini|cfg)$/i
  // "project" in name = planning/meta doc, not a product brief
  const META_NAME = /project|roadmap|strategy|proposal|planning|vision|sprint|backlog|milestone|saas|app\s*idea/i
  const STOREFRONT_NAME = /storefront|store\s*front/i
  const PRODUCT_BRIEF_NAME = /product\s*(brief|idea|ideas|launch|listing)|brief|launch\s*doc|product\s*spec/i
  const PRICE_IN_TEXT = /\$\s*\d+|\d+\s*(dollars?|USD|per\s+\w+)/i
  const PRODUCT_ITEM_TEXT = /add\s+\w+\s+product|new\s+product|item\s+to\s+(add|list|sell)|price\s+it\s+at/i

  const scored = candidates.map((file) => {
    let score = 0
    const name = file.name || ''
    const mime = file.mimeType || ''
    const snippet = (file.text || '').slice(0, 800)

    // File type scoring
    if (mime === 'application/vnd.google-apps.document') score += 15
    else if (mime === 'application/vnd.google-apps.spreadsheet') score += 8
    else if (DEV_EXT.test(name)) score -= 25
    else if (mime.startsWith('text/plain')) score -= 5

    // Name: developer files → hard penalize
    if (DEV_NAME.test(name)) score -= 30

    // Name: meta/project docs → penalize (not product briefs)
    if (META_NAME.test(name)) score -= 20

    // Name: storefront-specific → strong boost
    if (STOREFRONT_NAME.test(name)) score += 18

    // Name: looks like a product brief → boost
    if (PRODUCT_BRIEF_NAME.test(name)) score += 14

    // Name: has "ideas" without "project" → moderate boost
    if (/ideas?/i.test(name) && !META_NAME.test(name)) score += 8

    // Content: price mentioned → very strong signal this has a real product
    if (PRICE_IN_TEXT.test(snippet)) score += 20

    // Content: "add X product", "new product", "price it at" → strongest content signal
    if (PRODUCT_ITEM_TEXT.test(snippet)) score += 25

    // Content: dev/changelog signals → penalize
    if (/changelog|version\s*\d|bug\s*fix|release\s*notes|commit|pull\s*request/i.test(snippet)) score -= 20

    // Content: SaaS/tech project language → penalize
    if (/saas|api\s+endpoint|microservice|database\s+schema|deployment|kubernetes|docker/i.test(snippet)) score -= 15

    // Recency bonus
    if (file.modifiedTime) {
      const days = (Date.now() - new Date(file.modifiedTime).getTime()) / 86400000
      if (days < 1) score += 8
      else if (days < 7) score += 4
      else if (days < 30) score += 1
    }

    return { ...file, _hScore: score }
  })

  scored.sort((a, b) => b._hScore - a._hScore)

  // If top candidate is clearly dominant (score gap > 15), trust heuristics alone
  if (scored.length > 1 && scored[0]._hScore - scored[1]._hScore > 15) return scored

  // LLM validation over top 6 when scores are close
  const top = scored.slice(0, 6)
  if (top.length <= 1 || !process.env.ANTHROPIC_API_KEY) return scored

  const summaries = top.map((file, i) => ({
    index: i,
    name: file.name,
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime,
    heuristicScore: file._hScore,
    snippet: (file.text || '').slice(0, 500).replace(/\s+/g, ' ').trim(),
  }))

  const text = await callAnthropicReasoning({
    system: [
      'You are selecting the ONE document that contains specific retail products to add to a Shopify storefront.',
      'The ideal document has: a list of physical/digital products to sell, their prices, and descriptions.',
      '',
      'CRITICAL DISTINCTIONS:',
      '- "Storefront Ideas" = ideas for products to sell → CORRECT (this is a product brief)',
      '- "Shopify Project Ideas" = a planning doc for a software project → WRONG (this is a meta doc)',
      '- A doc saying "Add water bottle, price $20" → CORRECT (concrete product to create)',
      '- A doc about SaaS features, APIs, or app architecture → WRONG (not a product brief)',
      '',
      'STRONGLY PREFER:',
      '- Google Docs with product names, prices ($X), or "add [item]" instructions',
      '- Names like "Storefront Ideas", "Product Brief", "New Products", "Product Launch"',
      '- Content that looks like a merchant\'s product wishlist or product spec',
      '',
      'STRONGLY AVOID:',
      '- "Project Ideas" docs — these are feature/project planning, not product briefs',
      '- CHANGELOG.md, README.md, technical docs, code files',
      '- Docs about SaaS, APIs, apps, or software development',
      '',
      'Think carefully about the file names and content snippets before ranking.',
      'Return ONLY JSON: {"order":[0,1,2,...]} — best product brief first. Include every index exactly once.',
    ].join('\n'),
    messages: [{ role: 'user', content: JSON.stringify({ userRequest: message, candidates: summaries }) }],
    maxTokens: 3000,
  })

  const parsed = parseJson(text, null)
  if (!parsed?.order || !Array.isArray(parsed.order)) return scored

  const seen = new Set()
  const ordered = []
  for (const i of parsed.order) {
    if (Number.isInteger(i) && i >= 0 && i < top.length && !seen.has(i)) {
      ordered.push(top[i])
      seen.add(i)
    }
  }
  for (let i = 0; i < top.length; i++) {
    if (!seen.has(i)) ordered.push(top[i])
  }
  for (const file of scored.slice(6)) ordered.push(file)

  return ordered
}

async function productAgentFlow(emit, message, plan, status) {
  if (!status.google && !status.microsoft) {
    emit({
      type: 'final',
      display: {
        answer: 'Connect Google Drive first so I can find your product launch doc.',
        files: [],
      },
      raw: { plan },
    })
    return
  }

  const providerNames = plan.providers?.length
    ? plan.providers.filter((p) => status[p])
    : ['google', 'microsoft'].filter((p) => status[p])
  const queries = plan.queries?.length ? plan.queries.slice(0, 5) : [message]

  // Also always search for "product" + "ideas" + "brief" + "storefront" to cast a wide net
  const discoveryQueries = ['product ideas', 'product brief', 'storefront ideas', 'new product', 'product launch']
  const allQueries = [...new Set([...queries, ...discoveryQueries])]

  const results = []
  for (const provider of providerNames) {
    for (const query of allQueries.slice(0, 8)) {
      const found = provider === 'google'
        ? await searchGoogleDrive(query)
        : await searchMicrosoftDrive(query)
      results.push(...found)
    }
  }

  const deduped = dedupeFiles(results)
  if (deduped.length === 0) {
    emit({
      type: 'final',
      display: {
        answer: "I couldn't find a product launch doc matching your query in Google Drive. Try rephrasing or check that the doc exists.",
        files: [],
      },
      raw: { plan },
    })
    return
  }

  // Read content for top candidates so the reranker can see what's inside
  const withText = await Promise.all(
    deduped.slice(0, 15).map(async (file) => ({ ...file, text: await readFileText(file) })),
  )

  const ranked = await rerankForProductCreate(message, withText)
  emit({ type: 'rerank', candidates: withText.length, kept: 1 })

  const sourceFile = ranked[0]
  const docText = sourceFile.text || await readFileText(sourceFile)

  if (!process.env.ANTHROPIC_API_KEY) {
    emit({
      type: 'final',
      display: {
        answer: `I found "${sourceFile.name}" but need an Anthropic API key to extract product data from it.`,
        files: [toDisplayFile(sourceFile)],
      },
      raw: { plan, sourceFile },
    })
    return
  }

  const draft = await extractAndGenerateDraft(docText)
  if (!draft) {
    emit({
      type: 'final',
      display: {
        answer: `I found "${sourceFile.name}" but couldn't extract structured product data from it. The document may not contain enough product information.`,
        files: [toDisplayFile(sourceFile)],
      },
      raw: { plan, sourceFile },
    })
    return
  }

  // Search for product images in the same Drive folder (or globally as fallback)
  const imageMedia = await findDriveImagesForProduct(sourceFile, draft.title, plan.queries || [], draft.description)
  if (imageMedia.length) {
    draft.media = imageMedia
    // Remove any "Missing product images" warning since we found some
    if (draft.warnings) {
      draft.warnings = draft.warnings.filter((w) => !w.toLowerCase().includes('missing product image'))
    }
  } else {
    if (!draft.warnings) draft.warnings = []
    if (!draft.warnings.some((w) => w.toLowerCase().includes('image'))) {
      draft.warnings.push('No product images found in Drive folder')
    }
  }

  const validation = validateProductDraft(draft)
  const noteMultiple = ranked.length > 1 ? ` (${ranked.length - 1} other doc${ranked.length > 2 ? 's' : ''} found — using the most relevant one)` : ''
  const imageNote = imageMedia.length ? ` Found ${imageMedia.length} image${imageMedia.length > 1 ? 's' : ''} in Drive.` : ''
  const answer = validation.valid
    ? `I found "${sourceFile.name}" in your Google Drive${noteMultiple} and extracted a product draft for "${draft.title}".${imageNote} Review the details below and click Create Draft Product to add it to your store.`
    : `I found "${sourceFile.name}"${noteMultiple} and extracted a draft for "${draft.title}", but ${validation.missingRequired.length} required field(s) are missing.${imageNote} Review the warnings before creating.`

  emit({
    type: 'final',
    display: {
      answer,
      files: [toDisplayFile(sourceFile)],
      product: draft,
      visual: null,
    },
    raw: { plan, sourceFile, validation },
  })
}

async function extractAndGenerateDraft(docText) {
  const text = await callAnthropicReasoning({
    system: [
      'You extract product data from a launch brief and return a Shopify product draft as compact JSON only.',
      'Return ONLY a valid JSON object — no markdown, no explanation.',
      '',
      'Required schema:',
      '{',
      '  "title": "string (required)",',
      '  "descriptionHtml": "<p>...</p> (required)",',
      '  "price": "89.00 as string, or null if not stated in the document",',
      '  "vendor": "string or null",',
      '  "productType": "string or null",',
      '  "status": "ACTIVE",',
      '  "tags": ["string"],',
      '  "options": [{"name": "Size", "values": ["S", "M", "L", "XL"]}],',
      '  "variants": [{"title": "S / Black", "price": "89.00", "sku": "", "inventoryQuantity": 0}],',
      '  "metafields": [{"namespace": "custom", "key": "use_case", "value": "commuting"}],',
      '  "seo": {"title": "string", "description": "string"},',
      '  "warnings": ["string"]',
      '}',
      '',
      'Rules:',
      '- NEVER invent a price. If no price appears in the document, set price to null and add "Missing price" to warnings.',
      '- Generate all cartesian-product variant combinations from options (max 20 variants).',
      '- Always set status to "ACTIVE".',
      '- Add a warning for every important missing field: "Missing product images", "Missing inventory quantity", "Missing vendor", etc.',
      '- Keep descriptionHtml concise — 1-2 sentences as a <p> tag.',
      '- Infer sensible tags from the product category, use case, and features.',
      '- Return ONLY the JSON object, no markdown, no code fences.',
    ].join('\n'),
    messages: [{ role: 'user', content: docText.slice(0, 10000) }],
    maxTokens: 4000,
  })

  return parseJson(text, null)
}

/**
 * @param {object} draft
 * @returns {{ valid: boolean, warnings: string[], missingRequired: string[] }}
 */
function validateProductDraft(draft) {
  const warnings = [...(draft.warnings || [])]
  const missingRequired = []

  if (!draft.title) missingRequired.push('title')
  if (!draft.price) {
    missingRequired.push('price')
    if (!warnings.some((w) => w.toLowerCase().includes('price'))) {
      warnings.push('Missing price')
    }
  }
  if (!draft.options?.length) {
    if (!warnings.some((w) => w.toLowerCase().includes('variant'))) {
      warnings.push('No product variants defined')
    }
  }

  return { valid: missingRequired.length === 0, warnings, missingRequired }
}

async function readMockProducts() {
  if (!existsSync(productsPath)) return []
  try {
    return JSON.parse(await readFile(productsPath, 'utf8'))
  } catch {
    return []
  }
}

async function saveMockProduct(product) {
  await mkdir(__dirname, { recursive: true })
  const products = await readMockProducts()
  products.push(product)
  await writeFile(productsPath, JSON.stringify(products, null, 2))
}

async function createMockProduct(draft) {
  if (!draft?.title) return { ok: false, error: 'title is required' }
  if (!draft?.price) return { ok: false, error: 'price is required — fill in the price field before creating' }

  const inventoryLabel = draft.variants?.length
    ? `${draft.variants.length} variant${draft.variants.length > 1 ? 's' : ''}`
    : '0 in stock'

  const product = {
    id: `mock-${Date.now()}`,
    title: draft.title,
    status: 'Draft',
    inventory: inventoryLabel,
    type: draft.productType || 'Uncategorized',
    vendor: draft.vendor || '',
    price: draft.price,
    tags: draft.tags || [],
    createdAt: new Date().toISOString(),
  }

  await saveMockProduct(product)
  return { ok: true, product }
}

// ─── Shopify Admin GraphQL ───────────────────────────────────────────────────

function isShopifyConfigured() {
  return Boolean(
    process.env.SHOPIFY_STORE_DOMAIN &&
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN &&
    process.env.SHOPIFY_API_VERSION,
  )
}

async function shopifyAdminGraphQL(query, variables = {}) {
  if (!isShopifyConfigured()) {
    throw new Error('Shopify Admin API is not configured. Add SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN, and SHOPIFY_API_VERSION to .env.')
  }

  const { SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_API_VERSION } = process.env
  const endpoint = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-shopify-access-token': SHOPIFY_ADMIN_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Shopify API HTTP ${response.status}: ${body.slice(0, 300)}`)
  }

  const json = await response.json()

  if (json.errors?.length) {
    const msg = json.errors.map((e) => e.message).join('; ')
    throw new Error(`Shopify GraphQL errors: ${msg}`)
  }

  return json.data
}

const STAGED_UPLOAD_MUTATION = `
  mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters { name value }
      }
      userErrors { field message }
    }
  }
`

async function stageAndUploadDriveImages(mediaItems) {
  const token = await getAccessToken('google')
  if (!token || !mediaItems.length) return []

  const results = []
  for (const item of mediaItems) {
    try {
      const driveRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${item.driveFileId}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!driveRes.ok) continue

      const imageBuffer = await driveRes.arrayBuffer()
      const mimeType = (driveRes.headers.get('content-type') || 'image/jpeg').split(';')[0].trim()

      // Always derive extension from actual MIME to avoid Shopify "extension doesn't match format" error
      const MIME_TO_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
      const ext = MIME_TO_EXT[mimeType] || 'jpg'
      const baseName = (item.sourceFileName || 'product-image').replace(/\.[^.]+$/, '')
      const filename = `${baseName}.${ext}`

      const stagedData = await shopifyAdminGraphQL(STAGED_UPLOAD_MUTATION, {
        input: [{
          filename,
          mimeType,
          resource: 'IMAGE',
          httpMethod: 'POST',
          fileSize: String(imageBuffer.byteLength),
        }],
      })

      const target = stagedData?.stagedUploadsCreate?.stagedTargets?.[0]
      if (!target) continue

      const formData = new FormData()
      for (const param of target.parameters) {
        formData.append(param.name, param.value)
      }
      formData.append('file', new Blob([imageBuffer], { type: mimeType }), filename)

      const uploadRes = await fetch(target.url, { method: 'POST', body: formData })
      if (!uploadRes.ok) continue

      results.push({ originalSource: target.resourceUrl, mediaContentType: 'IMAGE', alt: item.alt || null })
    } catch {
      // skip failed image
    }
  }
  return results
}

const PRODUCT_CREATE_MUTATION = `
  mutation productCreate($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
    productCreate(product: $product, media: $media) {
      product {
        id
        title
        status
        handle
        onlineStorePreviewUrl
        variants(first: 1) {
          nodes { id }
        }
        media(first: 5) {
          nodes {
            id
            alt
            mediaContentType
            status
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`

const VARIANT_PRICE_MUTATION = `
  mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id price }
      userErrors { field message }
    }
  }
`

function buildProductResult(p) {
  const numericId = p.id.replace('gid://shopify/Product/', '')
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || ''
  const storeSlug = storeDomain.replace('.myshopify.com', '')
  return {
    id: p.id,
    numericId,
    title: p.title,
    status: p.status,
    handle: p.handle,
    adminUrl: `https://admin.shopify.com/store/${storeSlug}/products/${numericId}`,
    previewUrl: p.onlineStorePreviewUrl || null,
    media: p.media?.nodes || [],
  }
}

async function setVariantPrice(product, priceStr) {
  if (!priceStr || isNaN(parseFloat(priceStr))) return
  const variantId = product?.variants?.nodes?.[0]?.id
  if (!variantId) return
  try {
    await shopifyAdminGraphQL(VARIANT_PRICE_MUTATION, {
      productId: product.id,
      variants: [{ id: variantId, price: priceStr }],
    })
  } catch {
    // non-fatal — product still created
  }
}

async function createShopifyDraftProduct(draft) {
  if (!draft?.title) {
    return { success: false, errors: [{ field: 'title', message: 'title is required' }] }
  }

  if (!isShopifyConfigured()) {
    return { success: false, errors: [{ field: null, message: 'Shopify Admin API is not configured on this server.' }] }
  }

  const input = { status: draft.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT' }
  if (draft.title) input.title = String(draft.title).trim()
  if (draft.descriptionHtml) input.descriptionHtml = String(draft.descriptionHtml)
  if (draft.vendor) input.vendor = String(draft.vendor)
  if (draft.productType) input.productType = String(draft.productType)
  if (Array.isArray(draft.tags) && draft.tags.length) input.tags = draft.tags

  // Price is applied after creation via productVariantsBulkUpdate (not supported in ProductCreateInput)
  const priceStr = draft.price
    ? parseFloat(String(draft.price).replace(/[^0-9.]/g, '')).toFixed(2)
    : null

  // Stage and upload Drive images so Shopify can fetch them
  const stagedMedia = await stageAndUploadDriveImages(
    (draft.media || []).filter((m) => m.driveFileId),
  )

  // Fall back to direct URL for any items without a driveFileId
  const directMedia = (draft.media || [])
    .filter((m) => !m.driveFileId && m.originalSource && m.mediaContentType)
    .map((m) => ({ originalSource: m.originalSource, mediaContentType: m.mediaContentType, alt: m.alt || null }))

  const mediaInput = [...stagedMedia, ...directMedia]

  try {
    const variables = { product: input }
    if (mediaInput.length) variables.media = mediaInput

    const data = await shopifyAdminGraphQL(PRODUCT_CREATE_MUTATION, variables)
    const result = data?.productCreate

    if (!result) {
      return { success: false, errors: [{ field: null, message: 'Unexpected empty response from Shopify.' }] }
    }

    if (result.userErrors?.length) {
      const mediaErrors = result.userErrors.filter((e) =>
        e.field?.includes('media') || e.message?.toLowerCase().includes('media') || e.message?.toLowerCase().includes('image'),
      )
      const otherErrors = result.userErrors.filter((e) => !mediaErrors.includes(e))
      if (otherErrors.length) {
        return { success: false, errors: result.userErrors }
      }
      // Product created but media failed — still set price then return
      await setVariantPrice(result.product, priceStr)
      return { success: true, mediaErrors, product: buildProductResult(result.product) }
    }

    // Set price on the default variant via a separate mutation
    await setVariantPrice(result.product, priceStr)

    // Publish to the Online Store channel so it appears on the storefront
    if (draft.status === 'ACTIVE') {
      try { await publishToAllChannels(result.product.id) } catch { /* non-fatal */ }
    }

    return {
      success: true,
      mediaErrors: [],
      product: buildProductResult(result.product),
    }
  } catch (error) {
    return { success: false, errors: [{ field: null, message: error.message }] }
  }
}

// ─── Legacy GraphQL input mapper (reference/P2) ──────────────────────────────
// Used when variants + options + metafields are added later.
// Required scope: write_products
function mapProductDraftToShopifyGraphQLInput(draft) {
  return {
    title: draft.title,
    descriptionHtml: draft.descriptionHtml,
    vendor: draft.vendor,
    productType: draft.productType,
    status: 'DRAFT',
    tags: draft.tags,
    // TODO: productOptions + productVariantsBulkCreate for price/inventory per variant
    // TODO: metafields
    // TODO: media
  }
}

// ─── Storefront Auditor ───────────────────────────────────────────────────────

async function shopifyRest(method, path, body) {
  if (!isShopifyConfigured()) throw new Error('Shopify not configured')
  const { SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_API_VERSION } = process.env
  const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}${path}`
  const options = {
    method,
    headers: {
      'content-type': 'application/json',
      'x-shopify-access-token': SHOPIFY_ADMIN_ACCESS_TOKEN,
    },
  }
  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body)
  }
  const response = await fetch(url, options)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Shopify REST ${method} ${path} failed: ${response.status} ${text.slice(0, 300)}`)
  }
  return response.json()
}

async function getProductsWithDetails() {
  const data = await shopifyAdminGraphQL(`{
    products(first: 10) {
      nodes {
        id title status handle descriptionHtml productType vendor tags
        priceRangeV2 { minVariantPrice { amount currencyCode } }
        images(first: 3) { nodes { url altText } }
        variants(first: 5) { nodes { title price sku inventoryQuantity } }
        metafields(first: 5) { nodes { namespace key value } }
      }
    }
  }`)
  return data?.products?.nodes || []
}

async function toolGetStorefrontAudit() {
  const results = {}

  // Fetch products via GraphQL
  try {
    const data = await shopifyAdminGraphQL(`
      {
        products(first: 10) {
          nodes {
            id
            title
            status
            handle
            priceRangeV2 {
              minVariantPrice { amount currencyCode }
            }
            totalInventory
          }
        }
      }
    `)
    results.products = data?.products?.nodes || []
  } catch (err) {
    results.productsError = err.message
  }

  // Fetch pages via REST
  try {
    const pagesData = await shopifyRest('GET', '/pages.json?limit=10')
    results.pages = (pagesData.pages || []).map((p) => ({
      id: p.id,
      title: p.title,
      handle: p.handle,
      published: p.published_at !== null,
    }))
  } catch (err) {
    results.pagesError = err.message
  }

  // Fetch active theme settings summary
  try {
    const settings = await toolGetThemeSettings()
    results.themeSettings = settings
      ? { fetched: true, colorSchemeCount: Object.keys(settings.current || {}).length }
      : { fetched: false }
  } catch (err) {
    results.themeSettingsError = err.message
  }

  return results
}

async function toolGetThemeSettings() {
  if (!isShopifyConfigured()) throw new Error('Shopify not configured')
  const { SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_API_VERSION } = process.env

  // Get active theme id
  const themesUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/themes.json`
  const themesRes = await fetch(themesUrl, {
    headers: { 'x-shopify-access-token': SHOPIFY_ADMIN_ACCESS_TOKEN },
  })
  if (!themesRes.ok) throw new Error(`Could not fetch themes: ${themesRes.status}`)
  const themesData = await themesRes.json()
  const activeTheme = (themesData.themes || []).find((t) => t.role === 'main')
  if (!activeTheme) throw new Error('No active theme found')

  const assetUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/themes/${activeTheme.id}/assets.json?asset[key]=config/settings_data.json`
  const assetRes = await fetch(assetUrl, {
    headers: { 'x-shopify-access-token': SHOPIFY_ADMIN_ACCESS_TOKEN },
  })
  if (!assetRes.ok) throw new Error(`Could not fetch settings_data.json: ${assetRes.status}`)
  const assetData = await assetRes.json()
  const rawValue = assetData?.asset?.value
  if (!rawValue) throw new Error('settings_data.json value is empty')
  return parseJson(rawValue, {})
}

async function toolUpdateThemeSettings(updates) {
  if (!isShopifyConfigured()) throw new Error('Shopify not configured')
  const { SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_API_VERSION } = process.env

  // Get active theme id
  const themesUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/themes.json`
  const themesRes = await fetch(themesUrl, {
    headers: { 'x-shopify-access-token': SHOPIFY_ADMIN_ACCESS_TOKEN },
  })
  if (!themesRes.ok) throw new Error(`Could not fetch themes: ${themesRes.status}`)
  const themesData = await themesRes.json()
  const activeTheme = (themesData.themes || []).find((t) => t.role === 'main')
  if (!activeTheme) throw new Error('No active theme found')

  // Read current settings
  const current = await toolGetThemeSettings()

  // Deep merge updates into current
  function deepMerge(target, source) {
    const result = { ...target }
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = deepMerge(target[key] || {}, source[key])
      } else {
        result[key] = source[key]
      }
    }
    return result
  }
  const merged = deepMerge(current, updates)

  // Write back
  const putUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/themes/${activeTheme.id}/assets.json`
  const putRes = await fetch(putUrl, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'x-shopify-access-token': SHOPIFY_ADMIN_ACCESS_TOKEN,
    },
    body: JSON.stringify({ asset: { key: 'config/settings_data.json', value: JSON.stringify(merged) } }),
  })
  if (!putRes.ok) {
    const text = await putRes.text()
    throw new Error(`Could not update settings_data.json: ${putRes.status} ${text.slice(0, 200)}`)
  }
  return { updated: true }
}

async function toolGetPages() {
  const data = await shopifyRest('GET', '/pages.json?limit=25')
  return (data.pages || []).map((p) => ({
    id: p.id,
    title: p.title,
    handle: p.handle,
    body_html: p.body_html,
    published: p.published_at !== null,
    created_at: p.created_at,
  }))
}

async function toolCreateOrUpdatePage({ id, title, body_html, handle, published }) {
  if (id) {
    const data = await shopifyRest('PUT', `/pages/${id}.json`, {
      page: { id, title, body_html, handle, published },
    })
    return data.page
  }
  const data = await shopifyRest('POST', '/pages.json', {
    page: { title, body_html, handle, published: published ?? true },
  })
  return data.page
}

async function toolGetMenus() {
  const data = await shopifyAdminGraphQL(`
    {
      menus(first: 10) {
        nodes {
          id
          title
          handle
          items {
            title
            url
          }
        }
      }
    }
  `)
  return data?.menus?.nodes || []
}

async function toolCreateCollection({ title, descriptionHtml, published }) {
  const data = await shopifyAdminGraphQL(
    `
    mutation collectionCreate($input: CollectionInput!) {
      collectionCreate(input: $input) {
        collection {
          id
          title
          handle
        }
        userErrors { field message }
      }
    }
  `,
    { input: { title, descriptionHtml, published: published ?? true } },
  )
  const result = data?.collectionCreate
  if (result?.userErrors?.length) {
    throw new Error(result.userErrors.map((e) => e.message).join('; '))
  }
  return result?.collection
}

async function toolPublishProduct(productId) {
  const gid = productId.startsWith('gid://') ? productId : `gid://shopify/Product/${productId}`
  const data = await shopifyAdminGraphQL(
    `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id title status }
        userErrors { field message }
      }
    }
  `,
    { input: { id: gid, status: 'ACTIVE' } },
  )
  const result = data?.productUpdate
  if (result?.userErrors?.length) {
    throw new Error(result.userErrors.map((e) => e.message).join('; '))
  }
  // Also publish to the Online Store sales channel so it appears on the storefront
  try { await publishToAllChannels(gid) } catch { /* non-fatal */ }
  return result?.product
}

let _allPublicationIds = null
async function publishToAllChannels(productGid) {
  if (!_allPublicationIds) {
    const pubData = await shopifyAdminGraphQL(`{ publications(first: 50) { nodes { id name } } }`)
    const nodes = pubData?.publications?.nodes || []
    _allPublicationIds = nodes.map((p) => p.id)
  }
  if (!_allPublicationIds.length) return
  await shopifyAdminGraphQL(`
    mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors { field message }
      }
    }
  `, { id: productGid, input: _allPublicationIds.map((publicationId) => ({ publicationId })) })
}

async function toolScanDriveForProduct(query) {
  const token = await getAccessToken('google')
  if (!token) return { error: 'Google Drive not connected', files: [] }

  const results = await searchGoogleDrive(query)
  if (!results.length) return { files: [], message: 'No Drive files found for query: ' + query }

  const deduped = dedupeFiles(results).slice(0, 5)
  const withText = await Promise.all(
    deduped.map(async (file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      webUrl: file.webUrl,
      text: await readFileText(file),
    })),
  )
  return { files: withText }
}

// ─── Audit Agents ────────────────────────────────────────────────────────────

async function runUXAudit(emit) {
  emit({ type: 'audit_step', step: 'Initializing UX Auditor Agent…', agent: 'ux' })
  emit({ type: 'audit_step', step: 'Connecting to Shopify Admin — fetching theme, navigation, pages, and products in parallel…', agent: 'ux' })

  const [themeSettings, menus, pages, auditData, collectionsData] = await Promise.all([
    toolGetThemeSettings().catch(() => null),
    toolGetMenus().catch(() => []),
    toolGetPages().catch(() => []),
    toolGetStorefrontAudit().catch(() => ({})),
    shopifyAdminGraphQL(`{ collections(first: 10) { nodes { id title handle } } }`).catch(() => null),
  ])

  const snapshot = {
    products: (auditData.products || []).map((p) => ({
      title: p.title,
      status: p.status,
      hasPrice: !!(p.priceRangeV2?.minVariantPrice?.amount && parseFloat(p.priceRangeV2.minVariantPrice.amount) > 0),
    })),
    pages: (pages || []).map((p) => ({
      title: p.title,
      handle: p.handle,
      published: p.published,
      hasContent: (p.body_html || '').replace(/<[^>]+>/g, '').trim().length > 80,
    })),
    navigation: menus || [],
    collections: collectionsData?.collections?.nodes || [],
    theme: themeSettings
      ? {
          colorSchemeCount: Object.keys(themeSettings.current || {}).length,
          sectionTypes: Object.keys(themeSettings.sections || {}).slice(0, 20),
        }
      : null,
  }

  emit({ type: 'audit_step', step: 'Analyzing brand design system, navigation architecture, and trust signals…', agent: 'ux' })
  emit({ type: 'audit_step', step: 'Scoring 5 UX dimensions against rubric (First Impression, Navigation, Trust, Content, Design)…', agent: 'ux' })

  const raw = await callAnthropic({
    system: [
      'You are a senior UX auditor for Shopify storefronts.',
      'Given a store snapshot, score EACH of the following 5 dimensions from 0–10.',
      'For each dimension provide: score (integer 0-10), why (one sentence describing what you found), recommendation (one specific actionable fix, or "None needed" if score >= 9).',
      '',
      'Dimensions:',
      '1. First Impression & Homepage Clarity — Is there a clear hero/value proposition? Are trust signals visible? Key pages (home, about) exist?',
      '2. Navigation & Discoverability — Are menus clear and well-structured? Are collections organized? Can a shopper find a product in 3 clicks or fewer?',
      '3. Trust Signals & Credibility — Do About, Contact, and Policy pages exist WITH real content (hasContent: true)? Social proof indicators?',
      '4. Content Completeness — Are pages populated with real content? Are products ACTIVE with prices? No empty placeholders?',
      '5. Design Consistency & Usability — Does the theme have defined color schemes? Are section types varied and purposeful? Coherent visual system?',
      '',
      'Also output:',
      '  overallScore: weighted average rounded to one decimal',
      '  topFrictions: array of top 3 friction strings (most urgent issues)',
      '  topWins: array of top 3 wins (things already working well)',
      '',
      'Return ONLY valid compact JSON matching exactly:',
      '{"overallScore":7.2,"dimensions":[{"name":"...","score":8,"why":"...","recommendation":"..."}],"topFrictions":["..."],"topWins":["..."]}',
    ].join('\n'),
    messages: [{ role: 'user', content: JSON.stringify(snapshot) }],
    maxTokens: 1400,
  })

  const report = parseJson(raw, null)
  if (!report) return { error: 'Could not parse UX audit response from Claude.' }

  emit({ type: 'audit_step', step: `UX Auditor Agent complete — overall score ${report.overallScore}/10`, agent: 'ux', done: true })
  emit({ type: 'audit_report', auditType: 'ux', report })
  return report
}

async function runProductClarityAudit(emit) {
  emit({ type: 'audit_step', step: 'Initializing Product Clarity Agent…', agent: 'product_clarity' })
  emit({ type: 'audit_step', step: 'Loading full product catalog from Shopify Admin (descriptions, images, variants, metafields)…', agent: 'product_clarity' })

  let products
  try {
    products = await getProductsWithDetails()
  } catch (err) {
    return { error: `Could not fetch products: ${err.message}` }
  }

  if (!products.length) return { error: 'No products found in store.' }

  emit({ type: 'audit_step', step: `Inferring target audiences and scoring clarity across ${products.length} product listings…`, agent: 'product_clarity' })

  // Score each product using Haiku with prompt caching
  const productScores = await Promise.all(
    products.map(async (product) => {
      const snap = {
        title: product.title,
        vendor: product.vendor || '',
        productType: product.productType || '',
        descriptionText: (product.descriptionHtml || '').replace(/<[^>]+>/g, '').trim().slice(0, 1000),
        imageCount: product.images?.nodes?.length || 0,
        variants: (product.variants?.nodes || []).map((v) => ({
          title: v.title,
          price: v.price,
          sku: v.sku,
          inventory: v.inventoryQuantity,
        })),
        tags: product.tags || [],
        metafields: (product.metafields?.nodes || []).map((m) => `${m.namespace}.${m.key}: ${m.value}`),
        status: product.status,
      }

      const resp = await callAnthropicReasoning({
        system: [
          'You are a senior e-commerce copywriter and conversion specialist.',
          'Analyze this Shopify product listing and score it on 4 dimensions (each 0-10):',
          '',
          '1. descriptionQuality — Is the description compelling, benefit-led, and specific to a real use case?',
          '   0-3: missing or generic feature list. 4-6: adequate but not compelling. 7-8: benefit-focused with good specificity. 9-10: excellent — answers objections, paints a vivid use-case picture.',
          '2. visualCompleteness — 0 = no images, 5 = 1 image, 8 = 2 images, 10 = 3+ images.',
          '3. pricingVariantClarity — Are variants titled clearly? Are all prices set and sensible?',
          '   0 = no variants or $0 price. 5 = some variants missing price. 10 = all variants clearly named and priced.',
          '4. audienceKeywordClarity — Can a shopper or AI immediately tell who this is for and what problem it solves?',
          '   Look at title, tags, product type, description. 0 = no audience signal. 10 = crystal-clear audience + use case + benefit keywords.',
          '',
          'Also infer:',
          '- inferredAudience: a 1-sentence description of who this product is for (age, lifestyle, need), based only on the listing data.',
          '- inferredBusinessType: what kind of business this is (e.g. "outdoor gear brand targeting hikers", "premium skincare for professionals").',
          '- missingFields: list any important fields that are absent (e.g. "No description", "No images", "No variants", "No tags", "Price is $0").',
          '- topSuggestions: 2-3 specific, actionable improvements — not generic advice. Reference the actual product.',
          '',
          'Return ONLY compact JSON:',
          '{"productTitle":"...","inferredAudience":"...","inferredBusinessType":"...","scores":{"descriptionQuality":7,"visualCompleteness":10,"pricingVariantClarity":8,"audienceKeywordClarity":6},"averageScore":7.75,"missingFields":["..."],"topSuggestions":["...","..."]}',
        ].join('\n'),
        messages: [{ role: 'user', content: JSON.stringify(snap) }],
        maxTokens: 700,
      })

      return parseJson(resp, { productTitle: product.title, averageScore: null, error: 'Could not score' })
    }),
  )

  const scored = productScores.filter((p) => p.averageScore !== null)
  const overall = scored.length
    ? parseFloat((scored.reduce((s, p) => s + p.averageScore, 0) / scored.length).toFixed(1))
    : null

  const report = {
    overallClarityScore: overall,
    products: productScores,
    topImprovements: productScores
      .flatMap((p) => (p.topSuggestions || []).map((s) => `${p.productTitle}: ${s}`))
      .slice(0, 5),
  }

  emit({ type: 'audit_step', step: `Product Clarity Agent complete — overall clarity score ${overall ?? 'n/a'}/10`, agent: 'product_clarity', done: true })
  emit({ type: 'audit_report', auditType: 'product_clarity', report })
  return report
}

async function runDiscoverabilityAudit(emit) {
  emit({ type: 'audit_step', step: 'Initializing Discoverability Scout Agent…', agent: 'discoverability' })
  emit({ type: 'audit_step', step: 'Loading product catalog for agentic discovery simulation…', agent: 'discoverability' })

  let products
  try {
    products = await getProductsWithDetails()
  } catch (err) {
    return { error: `Could not fetch products: ${err.message}` }
  }

  if (!products.length) return { error: 'No products found in store.' }

  const catalog = products.map((p) => ({
    title: p.title,
    description: (p.descriptionHtml || '').replace(/<[^>]+>/g, '').slice(0, 500),
    tags: p.tags || [],
    productType: p.productType || '',
  }))

  emit({ type: 'audit_step', step: 'Generating 6 realistic AI shopper personas and purchase queries…', agent: 'discoverability' })

  const queriesRaw = await callAnthropicReasoning({
    system: [
      'You are a consumer research assistant.',
      'Given a product catalog, generate exactly 6 realistic shopper search queries that a typical customer might type into an AI shopping assistant.',
      'Vary the intent: specific product search, problem-based, gift idea, use-case, comparison, occasion-based.',
      'Return ONLY a JSON array of 6 strings: ["query1","query2","query3","query4","query5","query6"]',
    ].join('\n'),
    messages: [{ role: 'user', content: JSON.stringify(catalog) }],
    maxTokens: 300,
  })

  const queries = parseJson(queriesRaw, [])
  if (!Array.isArray(queries) || !queries.length) {
    return { error: 'Could not generate shopper queries.' }
  }

  emit({ type: 'audit_step', step: `Simulating ${queries.length} agentic discovery queries — would an AI shopping assistant recommend your products?`, agent: 'discoverability' })

  // For each query, ask a "cold" Claude (no store identity) if it would recommend any product
  const queryResults = await Promise.all(
    queries.map(async (query) => {
      const resp = await callAnthropicReasoning({
        system: [
          'You are a neutral AI shopping assistant. A shopper asked you a question.',
          'Based ONLY on the product catalog provided, decide if you would recommend any products.',
          'For each product, rate relevance: 0=not relevant, 1=loosely, 2=relevant, 3=highly relevant.',
          'Return ONLY compact JSON:',
          '{"query":"...","wouldRecommend":true,"recommendations":[{"productTitle":"...","relevance":2,"reason":"..."}],"gaps":"what is missing in the catalog for this query"}',
        ].join('\n'),
        messages: [{ role: 'user', content: JSON.stringify({ query, catalog }) }],
        maxTokens: 500,
      })
      const result = parseJson(resp, { query, wouldRecommend: false, recommendations: [], gaps: '' })
      result.query = query
      return result
    }),
  )

  const queriesWithRec = queryResults.filter((q) => q.wouldRecommend).length
  const discoverabilityScore = Math.round((queriesWithRec / queries.length) * 100)

  const neverRecommended = catalog
    .filter((p) =>
      !queryResults.some((q) =>
        (q.recommendations || []).some((r) => r.productTitle === p.title && r.relevance >= 2),
      ),
    )
    .map((p) => p.title)

  const report = {
    overallDiscoverabilityScore: discoverabilityScore,
    queriesTested: queries.length,
    queriesWithRecommendation: queriesWithRec,
    neverRecommended,
    queryResults,
    topImprovements: queryResults
      .filter((q) => !q.wouldRecommend && q.gaps)
      .map((q) => `"${q.query}": ${q.gaps}`)
      .slice(0, 4),
  }

  emit({ type: 'audit_step', step: `Discoverability Scout complete — ${discoverabilityScore}% of queries matched at least one product`, agent: 'discoverability', done: true })
  emit({ type: 'audit_report', auditType: 'discoverability', report })
  return report
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const STOREFRONT_TOOLS = [
  {
    name: 'get_storefront_audit',
    description: 'Fetch a summary of the current storefront: products, pages, and theme settings overview.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_theme_settings',
    description: 'Read the full settings_data.json from the active theme.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'update_theme_settings',
    description: 'Deep-merge updates into the active theme settings_data.json.',
    input_schema: {
      type: 'object',
      properties: {
        updates: {
          type: 'object',
          description: 'Nested object of settings keys and values to merge into current settings_data.json.',
        },
      },
      required: ['updates'],
    },
  },
  {
    name: 'get_pages',
    description: 'List all storefront pages (title, handle, published status, body HTML).',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'create_or_update_page',
    description: 'Create a new page or update an existing one (pass id to update).',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Page ID for updates; omit to create.' },
        title: { type: 'string' },
        body_html: { type: 'string' },
        handle: { type: 'string' },
        published: { type: 'boolean' },
      },
      required: ['title', 'body_html'],
    },
  },
  {
    name: 'get_menus',
    description: 'Fetch all navigation menus and their items.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'create_collection',
    description: 'Create a new product collection.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        descriptionHtml: { type: 'string' },
        published: { type: 'boolean' },
      },
      required: ['title'],
    },
  },
  {
    name: 'publish_product',
    description: 'Set a product status to ACTIVE (publish it).',
    input_schema: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Shopify product GID or numeric ID.' },
      },
      required: ['productId'],
    },
  },
  {
    name: 'scan_drive_for_product',
    description: 'Search Google Drive for files matching a query and return their text content for product extraction.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term to find relevant Drive files.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'delete_product',
    description: 'Permanently delete a product from the Shopify store.',
    input_schema: {
      type: 'object',
      properties: { productId: { type: 'string', description: 'Product GID or numeric ID' } },
      required: ['productId'],
    },
  },
  {
    name: 'unpublish_product',
    description: 'Set a product back to Draft (hide it from the storefront without deleting).',
    input_schema: {
      type: 'object',
      properties: { productId: { type: 'string' } },
      required: ['productId'],
    },
  },
  {
    name: 'update_product',
    description: 'Update an existing product\'s title, description, price, vendor, type, or tags.',
    input_schema: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Product GID or numeric ID' },
        fields: {
          type: 'object',
          description: 'Fields to update: title, descriptionHtml, price, vendor, productType, tags',
        },
      },
      required: ['productId', 'fields'],
    },
  },
  {
    name: 'delete_page',
    description: 'Delete a page from the Shopify store.',
    input_schema: {
      type: 'object',
      properties: { pageId: { type: 'number', description: 'Numeric page ID' } },
      required: ['pageId'],
    },
  },
  {
    name: 'delete_collection',
    description: 'Delete a collection from the Shopify store.',
    input_schema: {
      type: 'object',
      properties: { collectionId: { type: 'string', description: 'Collection GID or numeric ID' } },
      required: ['collectionId'],
    },
  },
  {
    name: 'add_product_to_collection',
    description: 'Add a product to an existing collection.',
    input_schema: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
        collectionId: { type: 'string' },
      },
      required: ['productId', 'collectionId'],
    },
  },
  {
    name: 'create_shopify_product',
    description: 'Create a product in Shopify from a draft object. Sets status to ACTIVE to publish immediately when instructed.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        descriptionHtml: { type: 'string' },
        price: { type: 'string', description: 'Price as a string e.g. "29.99".' },
        vendor: { type: 'string' },
        productType: { type: 'string' },
        status: { type: 'string', enum: ['DRAFT', 'ACTIVE'], description: 'Use ACTIVE to publish immediately.' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'descriptionHtml'],
    },
  },
  {
    name: 'run_ux_audit',
    description: 'Run a structured read-only UX audit of the storefront. Fetches theme settings, navigation menus, pages, collections, and products, then scores 5 UX dimensions (First Impression, Navigation, Trust Signals, Content Completeness, Design Consistency) each 0-10. Returns an overall score, per-dimension justifications and recommendations, top frictions, and top wins.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'run_product_clarity_audit',
    description: 'Audit all Shopify product listings for description quality, visual completeness, pricing clarity, and audience/keyword clarity. Infers target audience and business type from the listing data alone. Returns per-product scores and specific, actionable suggestions.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'run_discoverability_audit',
    description: 'Test whether an AI shopping agent would recommend the store products for realistic shopper queries. Generates 6 shopper queries, then uses a neutral Claude instance to rate product relevance for each. Returns an overall discoverability score, which products are never recommended, and specific improvement suggestions.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
]

async function toolDeleteProduct(productId) {
  const gid = productId.startsWith('gid://') ? productId : `gid://shopify/Product/${productId}`
  const data = await shopifyAdminGraphQL(`
    mutation productDelete($input: ProductDeleteInput!) {
      productDelete(input: $input) {
        deletedProductId
        userErrors { field message }
      }
    }
  `, { input: { id: gid } })
  if (data?.productDelete?.userErrors?.length) {
    throw new Error(data.productDelete.userErrors.map((e) => e.message).join('; '))
  }
  return { success: true, deletedId: data?.productDelete?.deletedProductId }
}

async function toolUnpublishProduct(productId) {
  const gid = productId.startsWith('gid://') ? productId : `gid://shopify/Product/${productId}`
  const data = await shopifyAdminGraphQL(`
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id status }
        userErrors { field message }
      }
    }
  `, { input: { id: gid, status: 'DRAFT' } })
  if (data?.productUpdate?.userErrors?.length) {
    throw new Error(data.productUpdate.userErrors.map((e) => e.message).join('; '))
  }
  return data?.productUpdate?.product
}

async function toolUpdateProduct(productId, fields) {
  const gid = productId.startsWith('gid://') ? productId : `gid://shopify/Product/${productId}`
  const inputFields = { id: gid }
  if (fields.title) inputFields.title = fields.title
  if (fields.descriptionHtml) inputFields.descriptionHtml = fields.descriptionHtml
  if (fields.vendor) inputFields.vendor = fields.vendor
  if (fields.productType) inputFields.productType = fields.productType
  if (fields.tags) inputFields.tags = fields.tags

  const data = await shopifyAdminGraphQL(`
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id title status handle }
        userErrors { field message }
      }
    }
  `, { input: inputFields })
  if (data?.productUpdate?.userErrors?.length) {
    throw new Error(data.productUpdate.userErrors.map((e) => e.message).join('; '))
  }

  // Update price if provided
  if (fields.price) {
    const product = data?.productUpdate?.product
    if (product) {
      const varData = await shopifyAdminGraphQL(`
        { product(id: "${gid}") { variants(first:1) { nodes { id } } } }
      `)
      const variantId = varData?.product?.variants?.nodes?.[0]?.id
      if (variantId) {
        const priceStr = parseFloat(String(fields.price).replace(/[^0-9.]/g, '')).toFixed(2)
        await shopifyAdminGraphQL(`
          mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              userErrors { field message }
            }
          }
        `, { productId: gid, variants: [{ id: variantId, price: priceStr }] })
      }
    }
  }

  return data?.productUpdate?.product
}

async function toolDeletePage(pageId) {
  await shopifyRest('DELETE', `/pages/${pageId}.json`)
  return { success: true, deletedId: pageId }
}

async function toolDeleteCollection(collectionId) {
  const gid = collectionId.startsWith('gid://') ? collectionId : `gid://shopify/Collection/${collectionId}`
  const data = await shopifyAdminGraphQL(`
    mutation collectionDelete($input: CollectionDeleteInput!) {
      collectionDelete(input: $input) {
        deletedCollectionId
        userErrors { field message }
      }
    }
  `, { input: { id: gid } })
  if (data?.collectionDelete?.userErrors?.length) {
    throw new Error(data.collectionDelete.userErrors.map((e) => e.message).join('; '))
  }
  return { success: true, deletedId: data?.collectionDelete?.deletedCollectionId }
}

async function toolAddProductToCollection(productId, collectionId) {
  const productGid = productId.startsWith('gid://') ? productId : `gid://shopify/Product/${productId}`
  const collectionGid = collectionId.startsWith('gid://') ? collectionId : `gid://shopify/Collection/${collectionId}`
  const data = await shopifyAdminGraphQL(`
    mutation collectionAddProducts($id: ID!, $productIds: [ID!]!) {
      collectionAddProducts(id: $id, productIds: $productIds) {
        collection { id title }
        userErrors { field message }
      }
    }
  `, { id: collectionGid, productIds: [productGid] })
  if (data?.collectionAddProducts?.userErrors?.length) {
    throw new Error(data.collectionAddProducts.userErrors.map((e) => e.message).join('; '))
  }
  return data?.collectionAddProducts?.collection
}

async function executeTool(name, input, emit = () => {}) {
  switch (name) {
    case 'get_storefront_audit':
      return toolGetStorefrontAudit()
    case 'get_theme_settings':
      return toolGetThemeSettings()
    case 'update_theme_settings':
      return toolUpdateThemeSettings(input.updates)
    case 'get_pages':
      return toolGetPages()
    case 'create_or_update_page':
      return toolCreateOrUpdatePage(input)
    case 'delete_page':
      return toolDeletePage(input.pageId)
    case 'get_menus':
      return toolGetMenus()
    case 'create_collection':
      return toolCreateCollection(input)
    case 'delete_collection':
      return toolDeleteCollection(input.collectionId)
    case 'add_product_to_collection':
      return toolAddProductToCollection(input.productId, input.collectionId)
    case 'publish_product':
      return toolPublishProduct(input.productId)
    case 'unpublish_product':
      return toolUnpublishProduct(input.productId)
    case 'delete_product':
      return toolDeleteProduct(input.productId)
    case 'update_product':
      return toolUpdateProduct(input.productId, input.fields)
    case 'scan_drive_for_product':
      return toolScanDriveForProduct(input.query)
    case 'create_shopify_product': {
      const draft = {
        title: input.title,
        descriptionHtml: input.descriptionHtml,
        price: input.price || null,
        vendor: input.vendor || null,
        productType: input.productType || null,
        tags: input.tags || [],
        status: input.status || 'ACTIVE',
      }
      return createShopifyDraftProduct(draft)
    }
    case 'run_ux_audit':
      return runUXAudit(emit)
    case 'run_product_clarity_audit':
      return runProductClarityAudit(emit)
    case 'run_discoverability_audit':
      return runDiscoverabilityAudit(emit)
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

async function runStorefrontAgentForChat(emit, message, history) {
  const chatHistory = history.slice(-6).map((m) => ({
    role: m.sender === 'assistant' ? 'assistant' : 'user',
    content: m.text || '',
  }))
  const wrapEmit = (event) => {
    if (event.type === 'final') {
      emit({ type: 'final', display: { answer: event.answer, files: [] }, raw: {} })
    } else {
      emit(event)
    }
  }
  await runStorefrontAgent(wrapEmit, message, chatHistory)
}

async function runStorefrontAgent(emit, userMessage, history) {
  if (!process.env.ANTHROPIC_API_KEY) {
    emit({ type: 'final', answer: 'ANTHROPIC_API_KEY is not configured.' })
    return
  }

  const systemPrompt = [
    'You are a Shopify storefront agent for stormlite-jcdk0nv8.myshopify.com.',
    'You can audit and modify this store: products, pages, menus, collections, and theme settings.',
    'When asked to scan Drive and upload a product, set status to ACTIVE to publish immediately.',
    'When the user says "publish it", "upload it", "add it to my store/website" — look at the conversation history for the product name/details they are referring to, then create_shopify_product with that info and status ACTIVE.',
    'For non-audit actions, call get_storefront_audit first to understand the current state of the store.',
    '',
    'AUDIT ROUTING — when the user asks to audit the store, call the appropriate structured audit tool (do NOT use get_storefront_audit for these):',
    '- "audit UX", "check usability", "how does my store look", "UX review", "design feedback" → run_ux_audit',
    '- "audit product descriptions", "check my listings", "product clarity", "review my product copy" → run_product_clarity_audit',
    '- "would AI recommend my products", "check discoverability", "agentic SEO", "can AI find my products" → run_discoverability_audit',
    '- "full audit", "audit everything", "audit my store" → call run_ux_audit, then run_product_clarity_audit, then run_discoverability_audit in sequence',
    'After each audit tool returns, summarize the key findings in 2-3 sentences. No markdown bold (**), no bullet lists, no headers.',
    '',
    'Be decisive — take actions and report what you did in 2-3 sentences max. No bullet lists, no markdown bold (**), no headers.',
    'When reporting a product URL, always use https://stormlite-jcdk0nv8.myshopify.com/products/{handle} — never the shopifypreview.com URL.',
    'The store has password protection (password: yauwoh) — products with ACTIVE status ARE live on the real storefront.',
    'If Shopify is not configured, say so clearly.',
  ].join('\n')

  const messages = [
    ...history.map((entry) => ({
      role: entry.role === 'assistant' ? 'assistant' : 'user',
      content: entry.content || '',
    })),
    { role: 'user', content: userMessage },
  ]

  let iterations = 0
  const MAX_ITERATIONS = 10

  while (iterations < MAX_ITERATIONS) {
    iterations++

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        tools: STOREFRONT_TOOLS,
        messages,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Anthropic API error: ${response.status} ${errText.slice(0, 300)}`)
    }

    const data = await response.json()
    const { stop_reason, content } = data

    // Emit any text blocks from this turn as agent_text
    const textBlocks = content.filter((b) => b.type === 'text')
    for (const block of textBlocks) {
      if (block.text?.trim()) {
        emit({ type: 'agent_text', text: block.text.trim() })
      }
    }

    // Add assistant turn to messages
    messages.push({ role: 'assistant', content })

    if (stop_reason === 'end_turn' || stop_reason === 'stop_sequence') {
      const finalText = textBlocks.map((b) => b.text).join('\n').trim()
      emit({ type: 'final', answer: finalText || 'Done.' })
      return
    }

    // Process tool uses
    const toolUseBlocks = content.filter((b) => b.type === 'tool_use')
    if (!toolUseBlocks.length) {
      const finalText = textBlocks.map((b) => b.text).join('\n').trim()
      emit({ type: 'final', answer: finalText || 'Done.' })
      return
    }

    const toolResultContents = []
    for (const toolUse of toolUseBlocks) {
      emit({ type: 'tool_call', name: toolUse.name, input: toolUse.input })

      let toolResult
      let isError = false
      try {
        toolResult = await executeTool(toolUse.name, toolUse.input, emit)
      } catch (err) {
        toolResult = { error: err.message }
        isError = true
      }

      emit({ type: 'tool_result', name: toolUse.name, result: toolResult, error: isError })

      toolResultContents.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(toolResult),
      })
    }

    // Add tool results as user turn
    messages.push({ role: 'user', content: toolResultContents })
  }

  emit({ type: 'final', answer: 'Max iterations reached. The agent stopped after 10 rounds.' })
}

// ─────────────────────────────────────────────────────────────────────────────

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
