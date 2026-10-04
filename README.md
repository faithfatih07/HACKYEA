# Agrunio — the farm's digital notebook

I built Agrunio as a mobile-first hackathon prototype for small and growing field farms. It connects fields, people, equipment, physical inventory, planned tasks and completed operations. The interface, fictional product documents and AI answers are English-only. There is no language selector; historical language preferences cannot restore Turkish.

The current design uses readable DM Sans text, cream backgrounds, dark text, olive green, brick red and wheat yellow. Touch targets are at least 48 px. I keep today's tasks, explained stock shortages and **What happened on the farm?** prominent. Status messages include text as well as colour.

## Install and run

Use Node.js 22.12+ or Node.js 20.19+.

```sh
npm ci
npm run demo
```

Open the frontend address printed in the terminal, normally `http://127.0.0.1:5173`. The demo command starts the local API on `127.0.0.1:3001` and Vite together. To run them in separate terminals:

```sh
npm run server
npm run dev
```

Without the backend, the frontend remains usable with its explicitly labelled local fallback. Verification commands:

```sh
npm test
npm run build
npm run preview
```

Build checks TypeScript and creates `dist/`. Preview serves the build locally; it does not deploy it. Tests use mock AI providers, not real Gemini requests or a physical camera. Fonts, icons and demo label graphics are local.

## Gemini setup

If `.env` does not exist, copy `.env.example` to `.env`. Do not overwrite an existing file. Edit the local file and replace the placeholder:

```dotenv
GEMINI_API_KEY=your_key_here
```

Only `server/index.ts` reads this key. Never use a `VITE_` variable for it or put it in browser code, localStorage, logs or Git. `.env` and other secret environment files are ignored; `.env.example` contains only the placeholder. Restart the API after changing the key.

I use the official `@google/genai` JavaScript SDK. The configured model is **`gemini-3.1-flash-lite`** in `server/provider.ts`; this version does not read a `GEMINI_MODEL` override. Real requests depend on the Google account's model access, quotas and billing. **Gemini-powered interpretation** identifies a verified real-provider response. A missing key, unavailable API or invalid response produces **Demo interpreter — no real AI connected**, which must not be counted as a successful live AI test.

AI returns validated JSON describing an operation draft or document references. English summaries and questions are requested even for historical clients with a Turkish locale. The frontend does not contact Google directly. The API filters the supplied farm context and validates returned IDs and document references. It never writes farm records. Model-generated arithmetic and unverified document claims are not trusted.

## First operation demo

1. On **Today**, enter `Ali used 12 bags of fertilizer in the North Field` and select **Review entry**. The verified fictional packaging record is 50 kg per bag, so application code converts the draft to **600 kg**. The same English example works in the narrow local fallback.
2. The editable draft references North, Fertilize North, Ali and Demo Fertilizer A. Preparing or cancelling it changes no physical stock.
3. The application-calculated preview shows **800 kg → 200 kg**. Fertilize East still needs 300 kg, so its shortage is **100 kg**. Open the evidence links to inspect the inventory and planned tasks.
4. Only **Confirm & save** completes the task and atomically records one consumption transaction, one completed operation and one activity entry. Repeated draft/completion IDs cannot consume stock twice.
5. Refreshing keeps the records. North sowing depends on North fertilizing; missing seed information stays unknown rather than being invented.
6. **My farm → Reset demo data** requires confirmation and restores the initial fictional records.

The local interpreter supports a deliberately limited grammar, including `I used 600 kg fertilizer in the North Field`, `I used 600 kg fertilizer`, and `I used fertilizer in the North Field`. Missing fields require a choice; unknown or negative statements are rejected instead of guessed. Historical input aliases remain for compatibility, but all app-generated output is English.

Planning a task never consumes physical inventory. Invalid, negative, zero or excessive consumption and mismatched task/field/material selections are blocked. Quantities accept a decimal point or comma with up to three decimal places; do not use thousands separators.

## Fictional farm

- Murat Demir: owner; Ali Kaya: worker; Ece Demir: inventory keeper.
- North: 30 dekar, wheat plan. South: 35 dekar, corn. East: 25 dekar, barley plan.
- Red tractor, fertilizer spreader, seed drill and trailer.
- Main warehouse and maintenance store; 800 kg of Demo Fertilizer A in the main warehouse.
- Fertilize North: 600 kg planned. Fertilize East: 300 kg planned. Both use Ali, the red tractor and spreader. Sow North depends on Fertilize North.

**All records and quantities are fictional demo data, not agricultural dose recommendations.** Units, internal IDs, barcode values and amounts are intentionally stable.

## Ask a document

Open an inventory/product detail, or scan a demo product, then use **Ask a document**. The shared entry also recognises document questions.

Try:

- `How many kilograms are in one bag of Demo Fertilizer A?` — 50 kg, with `doc-fertilizer-a / packaging` evidence.
- `How many kilograms of this fertilizer should I apply per decare?` — the verified document has no dose. The existing 600 kg plan is a fictional pre-entered plan, not a recommendation.
- `When can I harvest after applying Demo Pesticide B?` — the synthetic test label contains 10 × 24 hours. An application date/time is required before calculating a test harvest time. The result applies only to that fictional product.

Source cards open the exact original demo section. **Verified document**, **Information not found**, **AI interpreted** and **Calculated from app records** distinguish the origin of a result. A successful model response cannot invent a source, dose, composition, diagnosis, mixing instruction, PPE or re-entry interval.

I use a small, read-only document catalog with stable source/section/product IDs. Application code selects relevant sections and sends only those sections to the model. No embeddings or external vector database are involved. Document content is untrusted data and cannot override system instructions. The fertilizer identity card has only fictional identity, 50 kg packaging and explicit missing composition/dose/method. The pesticide document is explicitly not a real product label.

## QR/barcode → product → document

Open **Scan a product** from Today or My farm. **Scan** requests camera permission; leaving the screen stops its tracks, and the same scan is not processed repeatedly. Permission denial, unavailable cameras and insecure connections have explained messages. Manual code entry works without a camera.

Known codes open existing products, inventory links and documents. Unknown codes show **Product not found** and allow manual selection from the existing catalog. QR URLs are never automatically opened or downloaded. Scanning does not create products, documents or stock movements. Demo Pesticide B has no physical inventory balance: its amount is unknown, not zero.

Open **Demo labels** (`/#/demo-labels`) on another screen to scan, download or print the fixed SVG labels:

| Fictional product | QR payload                  | Fictional EAN-13 test code |
| ----------------- | --------------------------- | -------------------------- |
| Demo Fertilizer A | `AGRUNIO:DEMO:FERTILIZER-A` | `2000000000015`            |
| Demo Pesticide B  | `AGRUNIO:DEMO:PESTICIDE-B`  | `2000000000022`            |

These are not registered commercial barcodes or real product labels. A code identifies a catalog product; document information comes from its linked source. `npm run labels` regenerates the local graphics without a camera or API key.

### Phone camera over local HTTPS

Computer localhost is a secure context. A phone visiting the computer's `http://192.168...` address needs HTTPS with a certificate trusted by that phone before camera access will work. Manual input remains available. There is no automatic deployment or public tunnel.

For a local test, follow the [mkcert mobile instructions](https://github.com/FiloSottile/mkcert#mobile-devices). Example for a Mac with Homebrew:

```sh
brew install mkcert
mkcert -install
mkdir -p .certs
# Replace the example address with the computer's Wi-Fi IP.
mkcert -cert-file .certs/agrunio-cert.pem -key-file .certs/agrunio-key.pem localhost 127.0.0.1 192.168.1.20
```

Install and trust `rootCA.pem` from `mkcert -CAROOT` on your test phone. Never share `rootCA-key.pem`. Stop existing development servers on 5173/3001, then run:

```sh
AGRUNIO_LOCAL_HTTPS=1 AGRUNIO_PHONE_ORIGIN=https://192.168.1.20:5173 npm run demo
```

On the same Wi-Fi, open `https://192.168.1.20:5173/#/scan` on the phone and `/#/demo-labels` on another screen. `.certs/` is ignored. Vite proxies API requests; the API and Gemini key remain on the development computer. The explicit phone origin controls API access. Each browser/origin stores separate demo data; records are not synchronised across devices. Physical phone/camera verification is still required.

## Architecture and persistence

`src/domain/` contains typed Farm, Field, StorageLocation, Product, InventoryBalance, InventoryTransaction, Asset, Person, Task, OperationRecord, DocumentSource, ActivityLogEntry, Impact and ActionDraft records. Links use IDs. Planned and actual quantities are separate; unknown values remain null.

The shared pipeline is **ActionDraft → validation → impact preview → explicit confirmation → atomic repository commit**. Cancelling or missing information does not commit. The small effect engine calculates stock, planned demand, shortages, resource overlaps, dependencies, unavailable equipment, schedule changes and recorded cost/service impacts. It labels effects confirmed, warning or unknown and exposes evidence. AI, scanners and presentation components do not replace this engine.

`src/domain/repository.ts` centralises writes and reset. The storage adapter validates saved data; writes are queued and Web Locks serialise supported same-origin tabs. Confirmation re-reads current data and checks revision/idempotency. A single persisted state includes all transaction, operation and audit changes. Corrupt data remains a read-only demo until an explicit reset instead of being silently overwritten. The older v1 key remains a recovery copy.

The English migration is ID-scoped and exact-match only: it replaces recognised historical built-in demo names/descriptions, never arbitrary user text. It runs safely and idempotently through the existing repository lock. Completed operations, audit history, custom task names, free notes, quantities, schedules, IDs and the existing `fieldnote.demo.v2` key remain intact. Old language preferences are ignored without deleting storage. Static document sections are English and retain their original identifiers.

`src/ai/` handles strict schemas, filtered context, draft adaptation, local retrieval and grounded answers. `server/` isolates the real Gemini provider. Future AI providers can return the same draft schema without access to repository writers.

`src/presentation/impactScene.ts` and `ImpactStory` present existing effects with linked records and brief CSS/SVG movement. They do not calculate alternate business results. Before/after values are recorded or previewed values; replay never commits. Approval/cancel controls remain fixed outside the scrolling review. Reduced-motion preferences keep the same text and links without animation. A later farm map, building or character screen can open the same central records using optional presentation metadata; no game map is included now.

## Scanner licenses

I use these existing open-source packages; license copies are in `public/licenses/`.

| Package                                               | Purpose                | License                                                                 |
| ----------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------- |
| [@zxing/browser](https://github.com/zxing-js/browser) | Camera frames          | [MIT](https://github.com/zxing-js/browser/blob/master/LICENSE)          |
| [@zxing/library](https://github.com/zxing-js/library) | QR/EAN-13 decoding     | [Apache-2.0](https://github.com/zxing-js/library/blob/master/LICENSE)   |
| [qrcode](https://github.com/soldair/node-qrcode)      | Demo QR generation     | [MIT](https://github.com/soldair/node-qrcode/blob/master/license)       |
| [JsBarcode](https://github.com/lindell/JsBarcode)     | Demo EAN-13 generation | [MIT](https://github.com/lindell/JsBarcode/blob/master/MIT-LICENSE.txt) |

## Limits and verification

This is a single-farm, single-demo-user local prototype, without real login, role enforcement, cloud synchronisation, sensors, OCR, PDF/photo uploads, real commercial product data or a game map. Independent maintenance work orders are not modelled. Real agricultural safety advice is outside the demo.

Automated checks cover confirmation, non-mutating previews, stock arithmetic, idempotency, audit history, reset, English migration, document grounding, missing-dose handling, mocked AI failures and scanner mapping/cleanup. Real Gemini checks must be reported separately from fallback and offline tests. A physical camera or an operating-system reduced-motion visual check must not be claimed unless actually performed.

Some Turkish strings intentionally remain only as historical migration/input compatibility evidence and preservation-test fixtures. They are not generated interface content. User-authored historical notes remain in their original language.

Current English-only verification: all **164 tests pass**, including the original 157 scenarios and seven added English/migration checks. The production build passes. Real Gemini independently produced the English 12-bag draft and source-grounded packaging/missing-dose results; no drafts were confirmed during those checks. Mobile list/detail screens were checked at 320 px, and the operation review at 320/390/430 px, with no horizontal overflow. Existing saved demo data retained its completed task and 200 kg balance. Manual known/unknown scan codes, source cards and effect replay were checked in the browser. Physical-camera and operating-system reduced-motion visual tests have not been performed.
