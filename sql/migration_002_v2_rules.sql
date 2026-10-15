-- Migration 002 (2026-10-15): spec v2 rules approved by the project owner.
-- 1. Separate "the system is operational" from "its AI component is operational".
-- 2. Product-level EASA level and safety criticality.
-- 3. Public money tracked separately from private funding (government_contracts).
-- 4. Corroboration status on every claim (independent source / technical documentation).

-- Products: AI flag and product-level classifications
ALTER TABLE products ADD COLUMN is_ai INTEGER;                -- 1 AI product, 0 non-AI context product, NULL unknown
ALTER TABLE products ADD COLUMN ai_component_level TEXT;      -- deployment ladder for the AI component itself
ALTER TABLE products ADD COLUMN easa_ai_level TEXT;           -- analytical mapping, not a regulator approval
ALTER TABLE products ADD COLUMN safety_criticality TEXT;

-- Deployments: deployment_level now means the SYSTEM; ai_component_level means the AI feature
ALTER TABLE deployments ADD COLUMN is_ai INTEGER;
ALTER TABLE deployments ADD COLUMN ai_component_level TEXT;

-- Claims: corroboration of what the claim asserts
ALTER TABLE claims ADD COLUMN corroboration TEXT;
-- independent_and_technical | independent_only | technical_only | none_found | not_applicable | not_assessed (NULL = not assessed)
ALTER TABLE claims ADD COLUMN corroboration_notes TEXT;

-- Public money: procurement contracts, R&D contracts, OTAs, frameworks (grants stay in funding_rounds as round_type='grant')
CREATE TABLE IF NOT EXISTS government_contracts (
  id TEXT PRIMARY KEY,                -- {org_id}:contract:{short}
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id),
  agency TEXT NOT NULL,               -- e.g. FAA, EUROCONTROL, CAAS, NATS, SESAR JU, NASA
  agency_country TEXT,                -- ISO alpha-2, or 'EU' / 'INT'
  agency_type TEXT,                   -- regulator_ansp | research_agency | defense | intergovernmental | airport_authority | other_public
  contract_type TEXT,                 -- procurement | rd_contract | ota | framework | service | other
  program_name TEXT,
  award_id TEXT,
  status TEXT NOT NULL,               -- bidding | shortlisted | selected | awarded | active | completed | cancelled
  ceiling_usd REAL,
  obligated_usd REAL,
  amount_is_estimate INTEGER NOT NULL DEFAULT 0,
  num_bidders INTEGER,
  award_date TEXT,
  period_end TEXT,
  claim_id TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_govcon_org ON government_contracts(org_id);

-- ---------- Rebuilt and new insight views ----------
DROP VIEW IF EXISTS v_funding_by_segment;
CREATE VIEW v_funding_by_segment AS
SELECT t.segment,
       COUNT(DISTINCT CASE WHEN f.round_type NOT IN ('grant','acquisition','ipo') THEN f.org_id END) AS privately_funded_orgs,
       SUM(CASE WHEN f.round_type NOT IN ('grant','acquisition','ipo') THEN f.amount_usd END) AS private_funding_usd,
       COUNT(DISTINCT CASE WHEN f.round_type = 'grant' THEN f.org_id END) AS grant_funded_orgs,
       SUM(CASE WHEN f.round_type = 'grant' THEN f.amount_usd END) AS grant_funding_usd
FROM funding_rounds f
JOIN organization_taxonomy ot ON ot.org_id = f.org_id AND ot.is_primary = 1
JOIN taxonomy t ON t.id = ot.taxonomy_id
GROUP BY t.segment;

CREATE VIEW IF NOT EXISTS v_public_contracts AS
SELECT t.segment, g.agency, g.agency_country, g.contract_type, g.status,
       COUNT(*) AS contracts, COUNT(DISTINCT g.org_id) AS orgs,
       SUM(g.ceiling_usd) AS total_ceiling_usd, SUM(g.obligated_usd) AS total_obligated_usd
FROM government_contracts g
JOIN organization_taxonomy ot ON ot.org_id = g.org_id AND ot.is_primary = 1
JOIN taxonomy t ON t.id = ot.taxonomy_id
GROUP BY t.segment, g.agency, g.agency_country, g.contract_type, g.status;

-- Public-money dependence: per org, private funding vs grants vs awarded public contracts
CREATE VIEW IF NOT EXISTS v_public_dependence AS
SELECT o.id, o.name, t.segment, o.org_type,
       COALESCE((SELECT SUM(amount_usd) FROM funding_rounds f WHERE f.org_id=o.id AND f.round_type NOT IN ('grant','acquisition','ipo')),0) AS private_funding_usd,
       COALESCE((SELECT SUM(amount_usd) FROM funding_rounds f WHERE f.org_id=o.id AND f.round_type='grant'),0) AS grant_funding_usd,
       COALESCE((SELECT SUM(COALESCE(obligated_usd, ceiling_usd)) FROM government_contracts g WHERE g.org_id=o.id AND g.status IN ('awarded','active','completed')),0) AS public_contract_usd,
       (SELECT COUNT(*) FROM government_contracts g WHERE g.org_id=o.id) AS public_contract_count
FROM organizations o
JOIN organization_taxonomy ot ON ot.org_id = o.id AND ot.is_primary = 1
JOIN taxonomy t ON t.id = ot.taxonomy_id
WHERE o.triage_status = 'accepted';

-- Corroboration: how much of each org's evidence is company-only with nothing to back it
CREATE VIEW IF NOT EXISTS v_claim_corroboration AS
SELECT c.subject_id AS org_id, o.name,
       COUNT(*) AS company_claims,
       SUM(CASE WHEN c.corroboration = 'none_found' THEN 1 ELSE 0 END) AS uncorroborated,
       SUM(CASE WHEN c.corroboration IN ('independent_and_technical','independent_only','technical_only') THEN 1 ELSE 0 END) AS corroborated,
       SUM(CASE WHEN c.corroboration IS NULL OR c.corroboration = 'not_assessed' THEN 1 ELSE 0 END) AS not_assessed
FROM claims c JOIN organizations o ON o.id = c.subject_id
WHERE c.subject_type = 'organization' AND c.evidence_type = 'company_claim' AND c.status = 'active'
GROUP BY c.subject_id;

-- AI-component deployment ladder (the honest version of v_deployment_ladder)
CREATE VIEW IF NOT EXISTS v_ai_deployment_ladder AS
SELECT t.segment, d.ai_component_level, COUNT(DISTINCT d.org_id) AS orgs, COUNT(*) AS deployments
FROM deployments d
JOIN organization_taxonomy ot ON ot.org_id = d.org_id AND ot.is_primary = 1
JOIN taxonomy t ON t.id = ot.taxonomy_id
WHERE d.is_ai = 1
GROUP BY t.segment, d.ai_component_level;
