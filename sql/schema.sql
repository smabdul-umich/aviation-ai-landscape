-- Aviation AI Landscape — D1 (SQLite) schema v1
-- Design rule: facts live in `claims` with a source and evidence type.
-- Entity tables hold canonical identity plus a cached summary derived from claims.

PRAGMA foreign_keys = ON;

-- ---------- Taxonomy ----------
CREATE TABLE IF NOT EXISTS taxonomy (
  id TEXT PRIMARY KEY,            -- e.g. 'atm.trajectory_prediction'
  segment TEXT NOT NULL,          -- atm | airlines | airports | new_aviation | travel
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0
);

-- ---------- Entities ----------
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,            -- slug, e.g. 'frequentis'
  name TEXT NOT NULL,
  aliases TEXT,                   -- JSON array of alternate names
  website TEXT,
  org_type TEXT NOT NULL DEFAULT 'startup',  -- startup | scaleup | incumbent | corporate_unit | research_lab | government | spinout
  hq_country TEXT,                -- ISO-3166 alpha-2
  hq_city TEXT,
  founded_year INTEGER,
  status TEXT NOT NULL DEFAULT 'active',     -- active | acquired | defunct | pivoted | unknown
  one_liner TEXT,                 -- what they do, one sentence
  ai_substance_score INTEGER,     -- 0-5: evidence of real AI/ML behind the claims
  ai_substance_notes TEXT,
  easa_ai_level TEXT,             -- 1A | 1B | 2A | 2B | 3A | 3B | n/a | unknown
  safety_criticality TEXT,        -- safety_critical | safety_related | supporting | n/a
  deployment_level TEXT,          -- concept | prototype | lab_demo | trial | shadow_mode | limited_ops | full_ops | unknown
  technical_approach TEXT,        -- JSON array: llm | classical_ml | optimization_or | reinforcement_learning | computer_vision | simulation | rules | unknown
  data_dependencies TEXT,         -- JSON array: ads_b | swim | acars | weather | schedules | surveillance_radar | video | pnr | other
  research_tier INTEGER NOT NULL DEFAULT 1,  -- 1 = card only, 2 = deep profile
  priority INTEGER NOT NULL DEFAULT 3,       -- 1 high .. 5 low
  triage_status TEXT NOT NULL DEFAULT 'candidate', -- candidate | accepted | rejected | duplicate | needs_review
  triage_notes TEXT,
  profile_status TEXT NOT NULL DEFAULT 'none',     -- none | partial | complete | verified
  profile_summary TEXT,           -- markdown summary, regenerated from claims
  last_researched_at TEXT,
  last_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS organization_taxonomy (
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  taxonomy_id TEXT NOT NULL REFERENCES taxonomy(id),
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, taxonomy_id)
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  taxonomy_id TEXT REFERENCES taxonomy(id),
  deployment_level TEXT,
  pricing_model TEXT,             -- saas | license | per_transaction | services | unknown
  pricing_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  linkedin_url TEXT,
  background_tags TEXT,           -- JSON array: former_controller | former_pilot | nasa_faa | ansp | airline_ops | airport_ops | academia | big_tech | defense | consulting | other
  notes TEXT
);

CREATE TABLE IF NOT EXISTS employment (
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT,                      -- founder | ceo | cto | chief_scientist | advisor | other
  is_founder INTEGER NOT NULL DEFAULT 0,
  start_year INTEGER,
  end_year INTEGER,
  PRIMARY KEY (person_id, org_id, role)
);

CREATE TABLE IF NOT EXISTS investors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  investor_type TEXT,             -- vc | corporate_vc | government_grant | accelerator | angel | strategic | unknown
  parent_org_id TEXT REFERENCES organizations(id)
);

CREATE TABLE IF NOT EXISTS funding_rounds (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  round_type TEXT,                -- pre_seed | seed | series_a | series_b | series_c_plus | grant | debt | acquisition | ipo | unknown
  amount_usd REAL,
  amount_is_estimate INTEGER NOT NULL DEFAULT 0,
  announced_date TEXT,            -- ISO date
  lead_investor_id TEXT REFERENCES investors(id),
  claim_id TEXT,                  -- backing claim
  notes TEXT
);

CREATE TABLE IF NOT EXISTS funding_round_investors (
  round_id TEXT NOT NULL REFERENCES funding_rounds(id) ON DELETE CASCADE,
  investor_id TEXT NOT NULL REFERENCES investors(id),
  PRIMARY KEY (round_id, investor_id)
);

-- Customers / operators: airlines, ANSPs, airports, OEMs, governments
CREATE TABLE IF NOT EXISTS deployments (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id),
  customer_name TEXT NOT NULL,
  customer_type TEXT,             -- ansp | airline | airport | oem | military | government | ground_handler | travel_seller | other
  customer_country TEXT,
  deployment_level TEXT NOT NULL, -- same ladder as organizations.deployment_level
  start_date TEXT,
  end_date TEXT,
  description TEXT,
  claim_id TEXT
);

CREATE TABLE IF NOT EXISTS partnerships (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  partner_name TEXT NOT NULL,
  partner_org_id TEXT REFERENCES organizations(id),
  partnership_type TEXT,          -- integration | reseller | research | joint_venture | acquisition | other
  announced_date TEXT,
  description TEXT,
  claim_id TEXT
);

CREATE TABLE IF NOT EXISTS research_outputs (
  id TEXT PRIMARY KEY,
  org_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  output_type TEXT NOT NULL,      -- paper | patent | sesar_project | nasa_project | faa_project | thesis | dataset | other
  title TEXT NOT NULL,
  url TEXT,
  venue TEXT,
  published_date TEXT,
  taxonomy_id TEXT REFERENCES taxonomy(id),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS job_postings (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_ml_role INTEGER NOT NULL DEFAULT 0,
  location TEXT,
  url TEXT,
  observed_date TEXT NOT NULL
);

-- ---------- Evidence layer ----------
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  title TEXT,
  publisher TEXT,
  source_type TEXT,               -- company_site | press_release | news | regulator | academic | database (crunchbase etc) | job_board | linkedin | conference | other
  published_date TEXT,
  retrieved_at TEXT NOT NULL DEFAULT (datetime('now')),
  reliability INTEGER             -- 1 low .. 5 high (publisher-level prior)
);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL,     -- organization | product | person | funding_round | deployment | partnership
  subject_id TEXT NOT NULL,
  field TEXT NOT NULL,            -- e.g. 'founded_year', 'funding.total_usd', 'deployment_level', 'customer', 'technical_approach'
  value TEXT NOT NULL,            -- string or JSON
  value_numeric REAL,
  as_of_date TEXT,                -- when the fact was true / reported
  evidence_type TEXT NOT NULL,    -- verified | company_claim | third_party_report | analyst_inference
  confidence INTEGER NOT NULL DEFAULT 3,  -- 1..5
  source_id TEXT REFERENCES sources(id),
  quote TEXT,                     -- short supporting excerpt
  status TEXT NOT NULL DEFAULT 'active',  -- active | superseded | disputed | retracted
  supersedes_claim_id TEXT,
  created_by TEXT NOT NULL,       -- agent name or 'human'
  run_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  verified_by TEXT,
  verified_at TEXT,
  verification_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_claims_subject ON claims(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_claims_field ON claims(field);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);

-- Contradictions found by the Verifier
CREATE TABLE IF NOT EXISTS contradictions (
  id TEXT PRIMARY KEY,
  claim_a_id TEXT NOT NULL REFERENCES claims(id),
  claim_b_id TEXT NOT NULL REFERENCES claims(id),
  description TEXT,
  resolution TEXT,                -- open | resolved_a | resolved_b | both_wrong | unresolvable
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Pipeline bookkeeping ----------
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  agent TEXT NOT NULL,            -- scout | triage | profiler | verifier | watcher | human
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  scope TEXT,                     -- e.g. taxonomy id or org id
  orgs_touched INTEGER DEFAULT 0,
  claims_written INTEGER DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS change_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  change_type TEXT NOT NULL,      -- created | updated | status_change | new_claim | verified | flagged
  summary TEXT,
  agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Watch items for the (free) GitHub Actions watcher
CREATE TABLE IF NOT EXISTS watch_feeds (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feed_type TEXT NOT NULL,        -- rss | news_search | careers_page | github | other
  url TEXT NOT NULL,
  last_checked_at TEXT,
  last_hash TEXT
);

-- ---------- Full-text search ----------
CREATE VIRTUAL TABLE IF NOT EXISTS org_fts USING fts5(
  id UNINDEXED, name, aliases, one_liner, profile_summary, content=''
);

-- ---------- Insight views (free to query, no AI needed) ----------
CREATE VIEW IF NOT EXISTS v_segment_counts AS
SELECT t.segment, t.id AS taxonomy_id, t.name,
       COUNT(DISTINCT ot.org_id) AS org_count,
       SUM(CASE WHEN o.org_type IN ('startup','scaleup','spinout') THEN 1 ELSE 0 END) AS startup_count,
       SUM(CASE WHEN o.org_type IN ('incumbent','corporate_unit') THEN 1 ELSE 0 END) AS incumbent_count
FROM taxonomy t
LEFT JOIN organization_taxonomy ot ON ot.taxonomy_id = t.id
LEFT JOIN organizations o ON o.id = ot.org_id AND o.triage_status = 'accepted'
GROUP BY t.id;

CREATE VIEW IF NOT EXISTS v_deployment_ladder AS
SELECT t.segment, o.deployment_level, COUNT(*) AS org_count
FROM organizations o
JOIN organization_taxonomy ot ON ot.org_id = o.id AND ot.is_primary = 1
JOIN taxonomy t ON t.id = ot.taxonomy_id
WHERE o.triage_status = 'accepted'
GROUP BY t.segment, o.deployment_level;

CREATE VIEW IF NOT EXISTS v_funding_by_segment AS
SELECT t.segment,
       COUNT(DISTINCT f.org_id) AS funded_orgs,
       SUM(f.amount_usd) AS total_usd,
       AVG(f.amount_usd) AS avg_round_usd
FROM funding_rounds f
JOIN organization_taxonomy ot ON ot.org_id = f.org_id AND ot.is_primary = 1
JOIN taxonomy t ON t.id = ot.taxonomy_id
GROUP BY t.segment;

CREATE VIEW IF NOT EXISTS v_evidence_opacity AS
SELECT t.segment,
       COUNT(*) AS claims,
       ROUND(100.0 * SUM(CASE WHEN c.evidence_type = 'verified' THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct_verified,
       ROUND(100.0 * SUM(CASE WHEN c.evidence_type = 'company_claim' THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct_company_claim,
       ROUND(100.0 * SUM(CASE WHEN c.evidence_type = 'third_party_report' THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct_third_party,
       ROUND(100.0 * SUM(CASE WHEN c.evidence_type = 'analyst_inference' THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct_inference
FROM claims c
JOIN organization_taxonomy ot ON ot.org_id = c.subject_id AND ot.is_primary = 1 AND c.subject_type = 'organization'
JOIN taxonomy t ON t.id = ot.taxonomy_id
WHERE c.status = 'active'
GROUP BY t.segment;

CREATE VIEW IF NOT EXISTS v_easa_levels AS
SELECT t.segment, o.easa_ai_level, o.safety_criticality, COUNT(*) AS org_count
FROM organizations o
JOIN organization_taxonomy ot ON ot.org_id = o.id AND ot.is_primary = 1
JOIN taxonomy t ON t.id = ot.taxonomy_id
WHERE o.triage_status = 'accepted'
GROUP BY t.segment, o.easa_ai_level, o.safety_criticality;

CREATE VIEW IF NOT EXISTS v_hype_index AS
SELECT o.id, o.name, t.segment,
       COALESCE(SUM(f.amount_usd),0) AS total_funding_usd,
       o.deployment_level,
       CASE o.deployment_level
         WHEN 'concept' THEN 1 WHEN 'prototype' THEN 2 WHEN 'lab_demo' THEN 3 WHEN 'trial' THEN 4
         WHEN 'shadow_mode' THEN 5 WHEN 'limited_ops' THEN 6 WHEN 'full_ops' THEN 7 ELSE 0 END AS ladder_step,
       o.ai_substance_score
FROM organizations o
JOIN organization_taxonomy ot ON ot.org_id = o.id AND ot.is_primary = 1
JOIN taxonomy t ON t.id = ot.taxonomy_id
LEFT JOIN funding_rounds f ON f.org_id = o.id
WHERE o.triage_status = 'accepted'
GROUP BY o.id;

CREATE VIEW IF NOT EXISTS v_founder_backgrounds AS
SELECT t.segment, p.background_tags, o.deployment_level, COUNT(DISTINCT p.id) AS founders
FROM people p
JOIN employment e ON e.person_id = p.id AND e.is_founder = 1
JOIN organizations o ON o.id = e.org_id AND o.triage_status = 'accepted'
JOIN organization_taxonomy ot ON ot.org_id = o.id AND ot.is_primary = 1
JOIN taxonomy t ON t.id = ot.taxonomy_id
GROUP BY t.segment, p.background_tags, o.deployment_level;
