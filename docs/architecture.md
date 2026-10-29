# Architecture

How the Copper State Labs app fits together. Each module adds a section at the
end (see [Adding a module](#adding-a-module)) when it changes how the app
works: new pages, tables or AI calls.

_Fictional — for educational use._

## The starter app (Module 0)

A Next.js app that builds, runs and deploys with **no environment variables**.
A Google AI Studio key is optional until a module needs one.

| Piece | Where | What it does |
|---|---|---|
| Pages | `app/` | `layout.tsx` sets the fonts and theme; `page.tsx` is the placeholder home page |
| Brand components | `components/copper/` | `Logo`, `SiteHeader`, `SiteFooter`, `ModeToggle` |
| UI kit | `components/ui/` (shadcn), `components/ai-elements/` (AI Elements) | The only UI libraries the app uses |
| Setup card | `components/setup-required.tsx` | `<SetupRequired service="ai" />`, shown instead of a page whose service isn't configured |
| Company catalog | `lib/copper/catalog.ts`, `lib/copper/data/catalog.json` | Product, plan and privacy facts from the Product Bible (Sections 3, 4, 8 and 10). Pages read prices and plan details from here instead of typing them (added in the Module 1 starter) |
| AI wrapper | `lib/ai/call.ts` | `callText` and `callObject`: every model call goes through these and is logged to the terminal |
| Models and prices | `lib/ai/models.ts`, `lib/ai/pricing.ts` | The approved Gemini models and their token prices |
| Module checks | `specs/module-N/`, `scripts/check.mjs` | Each module's spec, instructions, rubric and acceptance tests; `npm run check` runs them |

## Data flow

1. A user opens a page in `app/`.
2. Server code checks what's configured (`isAiConfigured()`). If the key is
   missing, the page renders `<SetupRequired />` instead of crashing.
3. Data comes from files under `lib/copper/data/`, except where a module has
   moved it to a database: Module 2 part 2 moves stock to a Supabase
   `inventory` table, read through `lib/copper/inventory.ts`. Facts that don't
   change daily (prices, colors) stay in the files.
4. AI requests go through `callText` / `callObject` in `lib/ai/call.ts`, which
   calls Google and then prints one `[ai_calls]` line: `module`, `feature`,
   `model`, tokens, `cost_usd`, `latency_ms`, `ok`.

```ts
const { text } = await callText(
  { module: 2, feature: "ask-copper" },
  { prompt },
);
```

## Two kinds of "AI tiers"

Don't mix these up:

- **Copper State Labs' product tiers** (On-device, Raw Ore, Refined, the
  Copper Cloud) are part of the fictional company. They are facts in the
  [Product Bible](copper-state-labs/product-bible.md) and rows in the `ai_tiers`
  table.
- **The models this app calls** are real Claude models listed in
  `lib/ai/models.ts`. Their cost is logged in `ai_calls`.

## Decisions

- **No environment variables required.** Every service is optional, so a fresh
  clone builds and deploys before any accounts are set up.
- **One AI wrapper.** Routing every call through `lib/ai/call.ts` gives one
  place to log cost and latency per module and feature.
- **No authentication or row-level security yet.** They arrive in a later
  module.

## Adding a module

When a module changes how the app fits together, add a section here:

```md
## Module N: <feature name>

**Summary:** one or two sentences: what this adds and why.

| Piece | Where | What it does |
|---|---|---|
| Page / route | `app/...` | |
| Components | `components/...` | |
| Data | `lib/copper/data/...` | Data files added |
| AI calls | `lib/ai/call.ts` (module, feature) | Model, prompt purpose, expected cost per call |

**Data flow:** user action → page → server code → database / model → response.

**Decisions and trade-offs:** what you chose, the alternatives, and why.

**Risks and open questions:** cost, privacy, accuracy or safety risks, and how
you handle them.
```

## Module 2: Ask Copper tools

**Summary:** Four read-only tools the Ask Copper chatbot calls instead of guessing prices, totals or stock. The streaming action and chat panel are added in later steps.

| Piece | Where | What it does |
|---|---|---|
| Tools | `lib/copper/assistant/tools.ts` | `get_products`, `get_prices`, `calculate_cost`, `check_availability`, each with a zod input contract |
| Data | `lib/copper/catalog.ts`, `lib/copper/inventory.ts` | Prices and colors from the catalog; stock read fresh from `readInventory()` on every call |
| Database | Supabase `inventory` table (`supabase/migrations/`, `supabase/seed.sql`) | One row per product color. Readable by anyone with the publishable key, writable by nobody through the app; stock is edited in the Supabase Table Editor |

**Data flow:** model picks a tool and sends input → zod contract validates it → tool reads catalog or stock → result goes back to the model.

**Decisions and trade-offs:** Colors are checked against the catalog before stock is read, so a color a product doesn't come in is always `not_a_color`, never "out of stock". Plus is charged once per household.

**Risks and open questions:** A model could ask for out-of-range input; the schemas reject it. Stock that can't be read returns `unavailable` rather than a guess.

### Module 2: Ask Copper chat

**Summary:** A floating chat panel on the landing page. It calls a streaming Server Action that lets the model use the four tools, and draws every step as it happens.

| Piece | Where | What it does |
|---|---|---|
| Page / route | `app/page.tsx` | Mounts the panel and passes `isAiConfigured()` as a prop. Still one page, no API route |
| Components | `components/copper/ask-copper.tsx`, `ask-copper-steps.tsx` | The launcher, the Sheet, the two chats (tools on and off), and the stations and tool cards |
| Server Action | `lib/copper/assistant/ask.ts` | `askCopper({ messages, useTools })` returns a live `Progress` straight away and reads the model stream in the background |
| Instructions | `lib/copper/assistant/instructions.ts` | Copper's instructions, sent only when tools are on |
| AI calls | `lib/ai/call.ts` (module 2, feature `ask-copper`) | `callStream` with thought summaries; the model is whatever `callStream` picks. Cost is logged per question as an `[ai_calls]` line |

**Data flow:** shopper question → panel → `askCopper` → `callStream` → model picks a tool → tool reads the catalog or stock → result goes back to the model → each step streams to the panel as a `Progress` update.

**Decisions and trade-offs:** Tools on and off are separate conversations so the tools-off model can't copy the tools' answer. Prices in the tool cards are read from each tool's result, never typed into the UI. With tools off the model gets no instructions at all, because "always use your tools" with no tools makes it return nothing.

**Risks and open questions:** Cost (one to five model steps per question, under a dollar for the report runs). Accuracy: tools-off answers can be made up, so the panel labels them. Stock that can't be read is reported as unavailable, not guessed. The background stream may be cut short on serverless hosts if a function stops right after returning.
