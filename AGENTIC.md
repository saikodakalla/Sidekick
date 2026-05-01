# Agentic Storefront Audit — Plan

Next-stage feature for Sidekick: when a merchant asks *"how ready is my store?"*, Sidekick spins up an AI shopper that browses the storefront, scores it against a structured rubric, and returns an actionable report.

## Why this is worth building

- Shopify Admin already has analytics and a theme inspector, but none of those *simulate a real shopper's journey and grade the experience*. CRO firms charge thousands for this; nobody has shipped a self-serve agentic version.
- The chat-driven Sidekick is the right surface — merchants ask in plain English, get a structured report back, and can drill into specific friction points.
- It reuses everything the file-search MVP already has (streaming progress events, table/chart rendering, conversational routing). The new code is mostly the agent runtime and the rubric.

## Reuse vs. new

| Piece | Status |
| ----- | ------ |
| Chat UI, message bubbles, loading indicator | reuse — add a `pending: 'audit'` state next to `'drive'` and `'thinking'` |
| NDJSON streaming (`plan` → `rerank` → `final`) | reuse — extend with `audit_started`, `page_visited`, `scoring`, `final` events |
| Intent router (`needsFiles` flag in `createSearchPlan`) | extend — make it return `intent: 'chat' \| 'files' \| 'audit'` |
| Visual rendering (`visual.type: 'bar' \| 'line' \| 'table'`) | reuse — score breakdown is a perfect fit for table or bar |
| Drive OAuth + file pipeline | irrelevant for this feature, leave alone |
| Browser agent runtime | NEW |
| Scoring rubric + prompt | NEW |
| Store URL input UX | NEW (small) |

## Three runtime options for the browser agent

Pick one early — switching is expensive.

| Option | Pros | Cons |
| ------ | ---- | ---- |
| **Anthropic Computer Use** (Claude drives a VM via screenshots + actions) | Native fit with existing Claude calls. Highest reasoning quality on visual tasks. | Heaviest infra: needs a sandboxed VM with Chromium running. Reference container exists but adds a Docker dep. ~$0.30–$1.00/audit. |
| **Browserbase + Stagehand** (hosted Chromium, TS SDK) | Fastest to ship. TS SDK matches existing Node stack. Persistent sessions, anti-bot handled. | Vendor lock-in. Per-minute cost. Stagehand's action vocabulary is more limited than Computer Use. |
| **Playwright + Claude vision** (DIY loop) | No new vendor. Fully controllable. Cheap (~$0.05/audit). | More code: write the agent loop yourself, handle DOM extraction, screenshot capture, action grounding. Longer iteration cycle to get reliable. |

**Recommendation for first cut:** Playwright + Claude vision. The agent loop is ~150 lines, gives full control over what gets captured, and lets you iterate the rubric without paying per page-load. Migrate to Computer Use or Browserbase later if reliability becomes the blocker.

## Scoring rubric (the load-bearing part)

Without a fixed rubric the scores drift run-to-run and the feature becomes useless. Score each dimension 0–10 with a one-sentence justification.

| # | Dimension | What the agent looks at |
| - | --------- | ----------------------- |
| 1 | First impression | Hero clarity, value prop, brand polish, trust signals visible above fold |
| 2 | Navigation & discovery | Top nav, category structure, search affordance, can a shopper find a representative product in ≤3 clicks |
| 3 | Product detail page | Image quality + count, copy quality, variants/options clarity, price clarity, social proof, CTA prominence |
| 4 | Cart UX | Add-to-cart feedback, cart drawer/page clarity, upsell tact, total + shipping transparency |
| 5 | Checkout friction | Guest checkout available, fields requested, payment options, perceived steps |
| 6 | Mobile parity | Same flow on a 390px viewport — does anything break, hide, or become unusable |
| 7 | Performance | LCP, CLS, time to interactive (Playwright + `performance.timing`) |
| 8 | Trust & credibility | Reviews, return policy visibility, contact info, secure-checkout indicators |
| 9 | SEO & metadata | Title, meta description, OG tags, structured data on PDPs |
| 10 | Brand consistency | Typography, color, voice consistent across pages |

Aggregate = weighted average. Output also includes top 3 friction points and top 3 wins, with a screenshot reference for each.

## Phased build

### Phase 1 — static audit MVP (no browser)
- New endpoint `POST /api/audit { url }`
- Server fetches the homepage HTML, extracts text + meta + JSON-LD
- Single Claude call: rubric system prompt + HTML excerpt → JSON score report
- Limitation: misses everything JS-rendered, can't navigate. But proves the rubric and report shape.

### Phase 2 — single-page screenshot audit
- Add Playwright headless Chromium
- Capture: full-page screenshot of homepage + DOM-extracted nav structure + Web Vitals
- Two Claude calls: vision call on the screenshot for dimensions 1, 2, 3, 8, 10; text call for dimensions 7, 9.

### Phase 3 — agentic shopper journey
- Agent loop: home → category → PDP → ATC → cart → checkout (stop before payment).
- Each step emits a streaming event (`page_visited`, `friction_observed`).
- Rubric score covers the full journey. This is the demo-winner.

### Phase 4 — report rendering
- Reuse `visual.type: 'table'` for the dimension breakdown.
- Add a new `visual.type: 'audit'` payload: `{ overallScore, dimensions: [{name, score, why, screenshotUrl}], frictions: [...], wins: [...] }`. Render in a dedicated React component.
- Optional: side-by-side compare mode (audit two storefronts).

## Intent routing changes

Update `createSearchPlan` in `server/index.js` to return one of three intents:

```json
{ "intent": "chat" | "files" | "audit", "auditUrl": "https://...", "queries": [...], "providers": [...] }
```

Detection signals for `intent: "audit"`:
- Phrases like *"how ready is my store"*, *"audit my storefront"*, *"how does my store look"*, *"score my store"*
- A URL in the message → likely `audit`
- Otherwise fall back to existing `chat` / `files` logic

The merchant's own store URL needs to come from somewhere. Options:
1. Ask once on first audit, persist in `server/.audit-config.json` (mirrors how `.tokens.json` works)
2. Read from a dropdown in the panel header
3. In a real Shopify embedded app, App Bridge gives this for free

## Streaming events for the audit path

```
{type: "audit_started", url: "..."}
{type: "page_visited", page: "home", screenshot: "..."}
{type: "page_visited", page: "pdp", productName: "..."}
{type: "scoring"}
{type: "final", display: {answer, visual: {type: "audit", ...}}, raw: {...}}
```

Frontend extends the loading indicator: show *"Visiting your storefront…"*, then *"Adding a sample product to cart…"*, then *"Scoring against rubric…"*. Same pattern as the existing Drive icon, just different copy + a different icon (cart? robot?).

## Cost & latency budget

Target: under 60s per audit, under $0.50.

- Phase 1 static: ~3s, ~$0.005
- Phase 2 single screenshot: ~12s, ~$0.04
- Phase 3 full journey: ~30–45s, ~$0.15–$0.40 depending on page count and runtime choice

## Open questions

1. **Real shopper or test shopper?** Should the agent ever submit checkout (with a $1 test order via Shopify Bogus Gateway), or stop at the checkout-page review? Stop-before-pay is the safer default.
2. **How do we handle stores behind password protection?** Lots of dev stores are. Need a way for the merchant to provide the storefront password.
3. **Anti-bot.** Shopify doesn't block its own merchants' headless traffic, but Cloudflare or third-party storefronts might. Browserbase handles this; Playwright DIY needs care.
4. **Reproducibility.** Same store, two runs — how close should the scores be? Target ±1 point per dimension. Use temperature 0 + a deterministic rubric.
5. **What's the *one* metric** a merchant takes away? Probably an overall 0–100 *Storefront Readiness Score* with the dimension breakdown beneath. One headline number is what makes this shareable.

## What to build first (concrete first PR)

1. `server/audit.js` — `runStaticAudit(url)` that fetches HTML and runs the rubric prompt. Returns the score JSON.
2. New route `POST /api/audit` that streams `audit_started` and `final`.
3. Extend `createSearchPlan` to emit `intent: 'audit'` and an `auditUrl`.
4. In `answerFromCloudFiles` (or rename to `route()`), branch on `intent === 'audit'` and call the audit path instead of file search.
5. Frontend: when `intent === 'audit'` arrives, show a new loading state. When `final` arrives, render `visual.type: 'audit'` as a score card.

This phase 1 is shippable in a few hours and proves the report shape. Phase 2 (Playwright screenshot) is the next PR.
