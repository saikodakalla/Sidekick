Sidekick Product Launch Agent

Current codebase assessment





**[server/index.js](server/index.js)** — single-file Node HTTP server. Relevant existing utilities:





searchGoogleDrive(query) — searches Drive by name + fullText



readFileText(file) — exports/downloads Drive file content



getAccessToken(provider) — handles token refresh



callAnthropic({system, messages, maxTokens}) — wraps Claude API



createSearchPlan(message, history) — Claude call returning {providers, queries, reason}, needs extension to return intent



answerFromCloudFiles(emit, message, history) — the existing agent runner that emits NDJSON plan then final



route(req, res) — the router, needs two new routes



**[src/App.jsx](src/App.jsx)** — all frontend code. Relevant pieces:





const products = [...] — static const array (lines 93–112), must become useState



SidekickPanel — renders messages; reads message.files and message.visual; needs message.product



ProductsSection + DataTable — renders the product table; must consume lifted state



**[src/App.css](src/App.css)** — all styles, needs new classes for draft card and validation checklist



No TypeScript — project is plain JSX; types below are JsDoc-style definitions



Architecture overview

flowchart TD
    user([User types message]) --> chat["POST /api/chat"]
    chat --> intentRouter["createSearchPlan (extended)\nreturns intent: product_create"]
    intentRouter -->|intent = product_create| agentFlow["productAgentFlow(emit, message)"]
    intentRouter -->|intent = files / chat| existing["existing answerFromCloudFiles"]
    agentFlow --> emit1["emit {type:'plan', plan:{intent:'product_create', needsFiles:true}}"]
    agentFlow --> driveSearch["searchGoogleDrive(query)"]
    driveSearch --> readFile["readFileText(file)"]
    readFile --> extractLLM["callAnthropic: extractAndGenerateDraft(docText)"]
    extractLLM --> validate["validateProductDraft(draft)"]
    validate --> emit2["emit {type:'final', display:{answer, product:ProductDraft, files}}"]
    emit2 --> fe["SidekickPanel message handler"]
    fe --> draftCard["ProductDraftCard component"]
    draftCard -->|user clicks Create| createRoute["POST /api/products/create"]
    createRoute --> saveJson["write server/.products.json"]
    saveRoute --> feState["setProducts((prev) => [...prev, newProduct])"]
    feState --> table["ProductsSection DataTable"]



Data models (JSDoc — no TypeScript required)

/**
 * @typedef {Object} DriveSearchResult
 * @property {'google'|'microsoft'} provider
 * @property {string} id
 * @property {string} name
 * @property {string} mimeType
 * @property {string} webUrl
 * @property {string} modifiedTime
 * @property {number|undefined} size
 */

/**
 * @typedef {Object} ProductOption
 * @property {string} name       - e.g. "Size"
 * @property {string[]} values   - e.g. ["S", "M", "L", "XL"]
 */

/**
 * @typedef {Object} ProductVariant
 * @property {string} title      - e.g. "S / Black"
 * @property {string} price      - e.g. "89.00"
 * @property {string} sku
 * @property {number} inventoryQuantity
 */

/**
 * @typedef {Object} ProductMetafield
 * @property {string} namespace
 * @property {string} key
 * @property {string} value
 */

/**
 * @typedef {Object} ProductDraft
 * @property {string} title
 * @property {string} descriptionHtml
 * @property {string|null} price
 * @property {string} vendor
 * @property {string} productType
 * @property {'DRAFT'} status
 * @property {string[]} tags
 * @property {ProductOption[]} options
 * @property {ProductVariant[]} variants
 * @property {ProductMetafield[]} metafields
 * @property {{title:string, description:string}} seo
 * @property {string[]} warnings
 */

/**
 * @typedef {Object} ProductValidationResult
 * @property {boolean} valid
 * @property {string[]} warnings
 * @property {string[]} missingRequired  - field names Claude returned null for
 */



LLM prompts

A. Extract + generate ProductDraft (one Claude call)

System prompt for extractAndGenerateDraft(docText):

You extract product data from a launch brief and return a Shopify product draft as compact JSON only.
Schema:
type ProductDraft = {
  title: string;                    // required
  descriptionHtml?: string;          // strongly recommended
  vendor?: string;
  productType?: string;
  status: "DRAFT" | "ACTIVE";        // use DRAFT by default
  tags?: string[];
  handle?: string;
  seo?: {
    title?: string;
    description?: string;
  };

  productOptions?: {
    name: string;
    values: { name: string }[];
  }[];

  variants?: {
    price: string;                   // required for sellable variant
    sku?: string;
    optionValues?: {
      optionName: string;
      name: string;
    }[];
    inventoryQuantities?: {
      locationId: string;
      name?: "available";
      quantity: number;
    }[];
    taxable?: boolean;
    barcode?: string;
  }[];

  metafields?: {
    namespace: string;
    key: string;
    value: string;
    type: string;
  }[];

  media?: {
    originalSource: string;
    alt?: string;
    mediaContentType: "IMAGE" | "VIDEO" | "MODEL_3D" | "EXTERNAL_VIDEO";
  }[];

  publicationIds?: string[];          // needed only when publishing
};
Rules:
- Never invent a price. If price is missing, set price to null and add "Missing price" to warnings.
- Generate all cartesian-product variant combinations from options (max 20).
- Always set status to "DRAFT".
- Add a warning for every field you cannot find: "Missing product images", "Missing inventory quantity", etc.
- Return ONLY the JSON object, no markdown.

User message: the raw Drive document text.

B. Server-side validation (no LLM needed)

function validateProductDraft(draft) {
  const warnings = [...(draft.warnings || [])]
  const missingRequired = []
  if (!draft.title) missingRequired.push('title')
  if (!draft.price) missingRequired.push('price')
  if (!draft.options?.length) warnings.push('No variants defined')
  return { valid: missingRequired.length === 0, warnings, missingRequired }
}

C. Final assistant text (template string — no LLM call, fast + reliable)

const answer = validation.valid
  ? `I found "${sourceFile.name}" in your Google Drive and extracted a product draft for "${draft.title}". Review the details below and click Create Draft Product to add it to your store.`
  : `I found "${sourceFile.name}" and extracted a draft, but ${validation.missingRequired.length} required field(s) are missing. Review the warnings and fill them in before creating.`

D. Intent detection extension — extend createSearchPlan system prompt

Add to the existing system prompt:

Also return "intent": one of "chat", "files", or "product_create".
Set intent to "product_create" when the user asks to create, draft, or launch a product from a doc, file, or brief.



API contracts

Extended: POST /api/chat (NDJSON stream, no signature change)

New intermediate event emitted by productAgentFlow:

{ "type": "plan", "plan": { "intent": "product_create", "needsFiles": true } }

Extended final event — adds product field to display:

{
  "type": "final",
  "display": {
    "answer": "I found the StormLite launch doc...",
    "files": [{ "title": "StormLite Launch Brief", "provider": "google", "url": "..." }],
    "product": { /* ProductDraft */ },
    "visual": null
  },
  "raw": { "sourceFile": { /* DriveSearchResult */ }, "validation": { /* ProductValidationResult */ } }
}

New: POST /api/products/create

Request:

{ "draft": { /* ProductDraft */ } }

Response (success):

{ "ok": true, "product": { "id": "mock-123", "title": "...", "status": "Draft", "inventory": "0 in stock", "type": "Jacket" } }

Response (error):

{ "ok": false, "error": "title is required" }

Server logic:





Validate required fields (title, price)



Generate a mock id ("mock-" + Date.now())



Read existing server/.products.json (or [])



Append new product, write back



Return the new product in the shape the frontend DataTable already expects



Files to edit / create

Edit: [server/index.js](server/index.js)





In route(): add POST /api/products/create handler



In createSearchPlan(): extend system prompt to return intent field



In answerFromCloudFiles(): branch on intent === 'product_create' → call productAgentFlow(emit, message)



Add functions: productAgentFlow, extractAndGenerateDraft, validateProductDraft, readMockProducts, saveMockProduct

Edit: [src/App.jsx](src/App.jsx)





Lift const products = [...] → const [products, setProducts] = useState([...]) inside App()



Pass products and setProducts as props to SidekickPanel



In SidekickPanel.sendPrompt: handle event.display?.product → store in message.product



In message render loop: if message.product, render <ProductDraftCard draft={message.product} files={message.files} onCreate={...} />



Add ProductDraftCard({ draft, files, onCreated, setProducts }) component



Add ValidationChecklist({ warnings, missingRequired }) component



Update ProductsSection to accept products as prop instead of module-level const

Edit: [src/App.css](src/App.css)

New classes: .product-draft-card, .draft-badge, .gdrive-badge, .validation-checklist, .checklist-item, .checklist-item.warning, .checklist-item.error, .draft-field-row, .draft-create-button, .draft-success-banner



UI component plan

ProductDraftCard layout (inside an AssistantBubble):

┌─────────────────────────────────────────────┐
│  [DRAFT] [Source: Google Drive · StormLite] │
│  StormLite Commuter Rain Jacket             │
│  $89.00 · Jacket · Demo Rain Co.            │
│                                             │
│  Variants: S/Black, S/Navy, M/Black ...     │
│  Tags: rain-gear, commuter, waterproof      │
│                                             │
│  Validation checklist                       │
│  ⚠ Missing product images                  │
│  ⚠ Missing inventory quantity              │
│                                             │
│         [ Create Draft Product ]            │
└─────────────────────────────────────────────┘

After clicking "Create Draft Product":





Button shows loading state



POST /api/products/create called



On success: button replaced by green "Product created!" banner, product appears in Products section



Mock product persistence

Pattern mirrors .tokens.json:

const productsPath = path.join(__dirname, '.products.json')

async function readMockProducts() {
  if (!existsSync(productsPath)) return []
  return JSON.parse(await readFile(productsPath, 'utf8'))
}

async function saveMockProduct(product) {
  const products = await readMockProducts()
  products.push(product)
  await writeFile(productsPath, JSON.stringify(products, null, 2))
}

The frontend also has the product added to useState immediately on success (no page reload needed).



Fallback handling





No Drive doc found: productAgentFlow falls through to answerFromCloudFiles with a message: "I couldn't find a product launch doc matching your query in Google Drive."



Multiple docs found: pick highest-ranked Drive result (index 0); note in answer: "I used the most relevant doc found."



Extraction fails / Claude returns invalid JSON: parseJson(text, null) → if null, emit final with answer: "I found the doc but couldn't extract structured product data."



Missing required fields: validateProductDraft sets valid: false; UI shows all warnings; "Create Draft Product" button still enabled but shows a warning header



Missing price: Claude sets price: null; warning added; POST /api/products/create rejects with { ok: false, error: 'price is required' } until user edits



No Drive connected: same guard already in answerFromCloudFiles — returns connect-Drive message



Optional Shopify Admin API stub (P2)

A utility function (not wired up) to show how this maps:

function mapProductDraftToShopifyGraphQLInput(draft) {
  return {
    title: draft.title,
    descriptionHtml: draft.descriptionHtml,
    vendor: draft.vendor,
    productType: draft.productType,
    status: 'DRAFT',
    tags: draft.tags,
    options: draft.options.map(o => o.name),
    variants: draft.variants.map(v => ({
      options: v.title.split(' / '),
      price: v.price,
      sku: v.sku,
      inventoryQuantities: [{ availableQuantity: 0, locationId: 'gid://shopify/Location/...' }]
    })),
    metafields: draft.metafields,
    seo: draft.seo,
  }
}
// Required Shopify scope: write_products
// Mutation: productCreate(input: ProductInput!)



Acceptance criteria





User asks "Create a product from the StormLite launch doc" in Sidekick



Sidekick shows "Checking Google Drive…" loading state



App retrieves the relevant Drive doc and extracts a structured ProductDraft



ProductDraftCard renders inside the chat with title, price, variants, tags, warnings



User clicks "Create Draft Product"



Product appears in the Products section table with status Draft



Assistant message explains what was created and which fields need review

