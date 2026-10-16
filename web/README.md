# Aviation AI Atlas — web app

Plain HTML/CSS/JavaScript front end with a Cloudflare Pages Function reading D1. No LLM calls, paid AI API, framework build, external CDN, or Hyperagent runtime is needed to browse the deployed app. Hosting/database quotas still apply; this is not a promise of unlimited free hosting.

## Features
- Explore: name/alias/website/text search, country/category/status filters, sortable directory, sanitized CSV export.
- Review queue: all needs_review organizations, triage questions and owner's clarifications.
- Organization drawer: summary, active claims plus optional history, supporting quotations/source links, corroboration notes, products, deployments, contracts, capital/grants/ownership events.
- Landscape: accepted ATM organizations by category and cached AI-component deployment level; unknown column and unresearched segments explicitly shown.
- Insights: descriptive coverage, assessment gaps, active company-claim corroboration; no unsupported market totals or public-dependence ratios.
- Methods and uncertainty guidance.

## Runtime and safety
`public/` is the static output. `functions/api/snapshot.js` is the Pages Function.
D1 binding: DB → aviation-ai-landscape (98fc4415-1196-4b6e-be30-d242d4ecbe7d).
READ_API_ENABLED defaults to false. The API refuses all reads until explicitly enabled.
Only GET/HEAD accepted; no SQL input or write routes. Fixed SELECTs run via a D1 batch. The handler is application-level read-only; D1 binding itself is NOT a database-enforced read-only credential. Snapshot responses are no-store, no cross-origin access headers. Data is safely rendered as text, external links restricted to http(s), CSV formula injection neutralized.

## Deployment (not executed yet)
User must decide public vs private before data access is enabled.
- Pages Git deployment: repo root directory `web`; no build command; output directory `public`; production branch main. Functions are alongside public, not inside it. Alternatively deploy from web with `npx wrangler pages deploy public --project-name aviation-ai-atlas` in a securely authenticated environment.
- Configure D1 binding DB and leave READ_API_ENABLED=false initially.
- Private: configure Cloudflare Access to protect production AND preview hostnames, including /api/*. Test anonymous and authorized requests. Do not assume a preview hostname or private GitHub repository makes a Pages deployment private.
- Public: obtain explicit owner approval to expose the research dataset, including company claims and review notes.
- Only after the access policy is ready, set READ_API_ENABLED=true and redeploy. Test the live API, search, detail view, filters and CSV export.
- Never put a Cloudflare API token or D1 administrative credential in browser code.

## Tests
`npm test` and `npm run check` require only Node.
For the optional real-schema integration test: `ATLAS_TEST_DB=/path/to/export.sqlite npm test` (also requires Python 3).
The app is a pilot snapshot reader, not a paginated enterprise database client. Fixed caps prevent silent truncation (2,000 organizations, 20,000 claims, etc.); exceeding them returns an explicit error and requires pagination.

## Offline preview
`python3 tools/build-preview.py SNAPSHOT_JSON OUTPUT_HTML` creates a fully self-contained, portable file. It uses an explicit dated snapshot, not live D1. No network required for browsing; opening linked sources still needs the internet.
Input JSON arrays: organizations, taxonomy, organization_taxonomy, products, deployments, claims, sources, government_contracts, funding_rounds; plus generated_at timestamp.
Keep data exports outside public/ and out of git. The private preview was generated from a D1 export of those nine tables, not a complete database backup. D1 full export rejects FTS virtual tables; export explicit non-FTS tables when needed.

## QA performed 2026-10-16 UTC
- 8 Node tests passed, including fixed SQL queries against the real D1-exported SQLite schema/data.
- JavaScript syntax checks passed.
- Browser verified the 21-record review queue, ATAC drawer/evidence, back navigation and landscape.
- Published snapshot render check passed without console errors/network failures.
- Counts: 63 organizations; 36 accepted; 21 review; 4 rejected; 2 duplicate; 23 products; 29 deployments; 777 claim-history rows; 327 sources; 4 public contracts. These counts include history; do not compare total claim-history rows with active-only counts from prior reports.

## Open data issues
- FAA initial obligation disputed: retained with obligation_status=disputed, excluded from confirmed-obligation aggregation.
- Avinor Kongsberg prime/Indra partner explicitly modelled; Indra share unknown. Unproven Avinor–IRTOS product link removed.
- Thales SkyBridge product link, some date claims, ownership entity modelling and EASA roll-up ties still need review. No wholesale automatic classification changes were applied.
- The 47 pilot company claims marked not_assessed remain unassessed. Other company claims outside the pilot also remain unassessed.
- EASA and safety labels are research classifications, not approvals. No new EASA reference validation was undertaken in this build.
