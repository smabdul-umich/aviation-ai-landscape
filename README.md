# Aviation AI Landscape

**Who is building AI for aviation?** An evidence-based, continuously updated database of organizations building AI for air traffic management, airlines, airports, new aviation (eVTOL / UAM / UTM / autonomy / drones) and aviation travel.

Every fact is stored as a **claim** with a source URL, date, evidence type (`verified`, `company_claim`, `third_party_report`, `analyst_inference`) and confidence, so profiles are traceable and contradictions stay visible.

## Layout

| Path | What it is |
|---|---|
| `sql/schema.sql` | Cloudflare D1 (SQLite) schema: 26 tables, 7 insight views |
| `sql/taxonomy_seed.sql` | 40 sub-categories across 5 segments |
| `agents/*.md` | Instructions for the Scout, Triage, Profiler and Verifier research agents. Model-agnostic: usable from Hyperagent, Claude Code, GitHub Copilot, or any LLM with web search and D1 access |
| `spec/` | Pipeline spec: evidence rules, deployment ladder, EASA AI levels, AI-substance rubric, triage criteria, profile modules |
| `web/` | Cloudflare Pages app reading D1 (planned) |
| `watcher/` | GitHub Actions job that keeps records current without paid agents (planned) |
| `backups/` | Periodic SQL/CSV exports of the database (planned) |

## Pipeline

1. **Scout** discovers candidates per taxonomy id and writes them with a source.
2. **Triage** accepts / rejects / merges duplicates, scores AI substance, assigns priority.
3. **Profiler** researches accepted organizations module by module (founding, funding, founders, product, technical approach, pricing, deployment, regulatory exposure, competitors, hiring, activity, traction, research) and writes sourced claims.
4. **Verifier** independently re-checks high-stakes claims, records contradictions, audits quality.
5. **Watcher** (free, scheduled) flags news, funding and hiring changes for re-research.

## Database

Cloudflare D1 database `aviation-ai-landscape`. Query it with Wrangler:

```bash
npx wrangler d1 execute aviation-ai-landscape --remote --command "SELECT * FROM v_segment_counts"
```

Insight views: `v_segment_counts`, `v_deployment_ladder`, `v_funding_by_segment`, `v_evidence_opacity`, `v_easa_levels`, `v_hype_index`, `v_founder_backgrounds`.

## Known limitations

Discovery favours English-language, venture-backed organizations that publicize themselves. Company-stated facts are labelled as such and are not treated as verified.
