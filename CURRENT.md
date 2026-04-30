# Current Project State

This project is a Vite + React web app that recreates a Shopify Admin-style dashboard with a Sidekick-style AI panel.

## What Is Built

- Shopify-like admin shell with:
  - Black top header
  - Shopify logo from `public/png-clipart-shopify-logo-e-commerce-business-super-sale-angle-text.png`
  - Functional top search bar
  - Left sidebar navigation grouped into primary links, Sales channels, Apps, and Settings
  - Main Home dashboard matching the provided Shopify admin reference: analytics card, line chart, live visitors, payout pill, tasks, and “Grow your audience” card
  - Orders, Products, Customers, Analytics, Marketing, Discounts, Sales channels, Apps, and Finances section views

- Sidekick chat panel with:
  - Provided Sidekick mask icon from `public/sidekick-icon.svg`
  - Shopify-like starter state with intro text, prompt chips, and input composer
  - Neutral black assistant body text
  - Purple text only for prompt/action buttons
  - Sidekick logo beside assistant responses
  - User messages with `SK` avatar
  - Basic interactive message sending
  - Source file display and simple visual-summary rendering for API responses
  - Expand icon removed; only close button remains

- Dark mode:
  - Toggle in the top bar
  - Dark variants for dashboard, sidebar, cards, Sidekick panel, and charts

- Search:
  - Top search bar is now a real form
  - Live results for dashboard sections, orders, products, customers, sales channels, apps, and dashboard tasks
  - Selecting a result navigates to the matching section

## Files Changed

- `src/App.jsx`
  - Main app UI, search behavior, Sidekick chat behavior, OAuth connect links, chat API calls

- `src/App.css`
  - Dashboard layout, Shopify-style shell, dark mode, Sidekick UI, search dropdown, charts/cards

- `src/index.css`
  - Global styles and Inter font

- `index.html`
  - Updated title

- `vite.config.js`
  - Added dev proxy:
    ```js
    server: {
      proxy: {
        '/api': 'http://127.0.0.1:8787',
      },
    }
    ```

- `package.json`
  - Added:
    ```json
    "api": "node server/index.js"
    ```

- `.env.example`
  - Added required environment variable placeholders

- `.gitignore`
  - Ignores `server/.tokens.json`

- `server/index.js`
  - New local Node API server scaffold for:
    - Anthropic Messages API
    - Google Drive OAuth + search + file reads
    - Microsoft Graph OAuth + OneDrive search + file reads
    - `/api/status`
    - `/api/chat`
    - `/api/oauth/google/start`
    - `/api/oauth/google/callback`
    - `/api/oauth/microsoft/start`
    - `/api/oauth/microsoft/callback`

- Assets:
  - `public/sidekick-icon.svg`
  - `public/shopify-bag.svg`
  - `public/shopify-logo.png`
  - `public/png-clipart-shopify-logo-e-commerce-business-super-sale-angle-text.png`

## How To Run

Frontend:

```bash
npm run dev
```

API server:

```bash
npm run api
```

Expected local URLs:

```text
Frontend: http://127.0.0.1:5173/
API:      http://127.0.0.1:8787/
```

The Vite dev server proxies `/api/*` to `http://127.0.0.1:8787`.

## Required API Credentials

Create a `.env.local` file based on `.env.example`.

### Anthropic

Needed for Claude/Haiku chat and file synthesis.

```env
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-4-5
```

Current intended model:

```text
claude-haiku-4-5
```

### Google Drive

Create a Google Cloud project, enable Google Drive API, and create OAuth 2.0 Web Application credentials.

Redirect URI:

```text
http://127.0.0.1:8787/api/oauth/google/callback
```

Env vars:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://127.0.0.1:8787/api/oauth/google/callback
```

Scope currently used:

```text
https://www.googleapis.com/auth/drive.readonly
```

### Microsoft OneDrive

Create a Microsoft Entra / Azure app registration and use Microsoft Graph.

Redirect URI:

```text
http://127.0.0.1:8787/api/oauth/microsoft/callback
```

Env vars:

```env
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_REDIRECT_URI=http://127.0.0.1:8787/api/oauth/microsoft/callback
```

Graph delegated permissions:

```text
Files.Read
User.Read
offline_access
```

### App Origins

```env
APP_ORIGIN=http://127.0.0.1:5173
API_ORIGIN=http://127.0.0.1:8787
```

## API Design

The browser never calls Anthropic directly. It calls the local Node API:

```text
POST /api/chat
```

Request shape:

```json
{
  "message": "What changed in my sales spreadsheet?",
  "history": []
}
```

Response shape:

```json
{
  "ok": true,
  "display": {
    "answer": "Plain English answer for the UI",
    "files": [
      {
        "title": "source.csv",
        "provider": "google",
        "url": "https://...",
        "reason": "Why this file was used"
      }
    ],
    "data": [],
    "visual": {
      "type": "bar",
      "title": "Example",
      "points": [
        { "label": "Jan", "value": 12 }
      ]
    }
  },
  "raw": {
    "plan": {},
    "files": []
  }
}
```

Backend flow:

1. Ask Anthropic/Haiku for a compact JSON search plan.
2. Search Google Drive and/or OneDrive using OAuth tokens.
3. Read supported file content.
4. Send excerpts back to Anthropic.
5. Return structured JSON for the React UI.

## Known Limitations / Next Fixes

1. `npm run build` currently passed after the recent frontend/API changes.

2. `node --check server/index.js` passed.

3. `npm run lint` was failing only because ESLint was treating Node globals in `server/index.js` as undefined:

```text
process is not defined
Buffer is not defined
```

Fix options:

- Update `eslint.config.js` to include Node globals for `server/**/*.js`.
- Or add a file-level ESLint global comment in `server/index.js`.

Suggested clean fix in `eslint.config.js`:

```js
import globals from 'globals'

export default [
  // existing config...
  {
    files: ['server/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
]
```

4. `server/index.js` uses only built-in Node APIs and native `fetch`; no server dependencies were added.

5. File reading is intentionally conservative:
   - Google Docs export to text
   - Google Sheets export to CSV
   - Google Slides export to text
   - Plain text/CSV/JSON/Markdown-style files
   - Microsoft files are searched through Graph and directly read only when likely text-like
   - Full Excel parsing is not implemented yet; that would require adding a package such as `xlsx` or using Microsoft Graph workbook APIs

6. OAuth tokens are stored locally in:

```text
server/.tokens.json
```

This is ignored by git. For production, replace this with encrypted storage or a database.

7. The API currently has no real user/session system. It is suitable as a local prototype, not multi-user production.

## Verification Already Done Before This Handoff

Earlier checks passed multiple times:

```bash
npm run build
npm run lint
```

After the API scaffold was added:

```bash
npm run build
node --check server/index.js
```

passed, while `npm run lint` needs the Node-globals config fix described above.

## Useful Sources Checked

- Anthropic Messages API docs:
  - `https://docs.anthropic.com/en/api/messages`

- Anthropic Haiku 4.5 announcement/model ID:
  - `https://www.anthropic.com/news/claude-haiku-4-5`
  - Model alias: `claude-haiku-4-5`

- Google Drive API scopes:
  - `https://developers.google.com/drive/api/guides/api-specific-auth`

- Microsoft Graph OneDrive / SharePoint search:
  - `https://learn.microsoft.com/en-us/graph/search-concept-files`
  - `https://learn.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_search`

