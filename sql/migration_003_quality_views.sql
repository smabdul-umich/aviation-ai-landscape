-- Targeted cleanup 2026-10-16. Preserve original claims and ownership history.
-- The related org is not necessarily the prime contractor.
ALTER TABLE government_contracts ADD COLUMN recipient_role TEXT;
ALTER TABLE government_contracts ADD COLUMN prime_contractor_name TEXT;
ALTER TABLE government_contracts ADD COLUMN amount_scope TEXT;
ALTER TABLE government_contracts ADD COLUMN obligation_status TEXT;
UPDATE government_contracts SET recipient_role='prime', prime_contractor_name='Air Space Intelligence', amount_scope='whole_contract', obligation_status='disputed' WHERE id='air-space-intelligence:contract:faa-fmds-smart-2026';
UPDATE government_contracts SET recipient_role='prime', prime_contractor_name='Air Space Intelligence', amount_scope='whole_contract', obligation_status='not_found' WHERE id='air-space-intelligence:contract:army-ngc2-idiq-2026';
UPDATE government_contracts SET recipient_role='prime', prime_contractor_name='Thales', amount_scope='whole_contract', obligation_status='not_found' WHERE id='thales-air-traffic-management:contract:caas-nexgen-atms';
UPDATE government_contracts SET recipient_role='partner', prime_contractor_name='Kongsberg Defence Systems', amount_scope='prime_contract_not_partner_share', obligation_status='not_found' WHERE id='indra-air-traffic:contract:avinor-remote-towers-2015';
UPDATE deployments SET product_id=NULL, description=description || ' [Cleanup 2026-10-16: removed unsupported IRTOS link; independent material names InNOVA and GAREX, not an established AI module.]' WHERE id='indra-air-traffic:deploy:avinor-norway' AND product_id='indra-air-traffic:product:irtos';
INSERT INTO change_log(entity_type,entity_id,change_type,summary,agent) VALUES ('deployment','indra-air-traffic:deploy:avinor-norway','updated','Removed unsupported IRTOS product link; original claims retained.','orchestrator');
INSERT INTO change_log(entity_type,entity_id,change_type,summary,agent) VALUES ('government_contract','indra-air-traffic:contract:avinor-remote-towers-2015','updated','Kongsberg prime; Indra partner; prime contract value not attributable to Indra.','orchestrator');
-- Correct accepted-only category counts; empty categories remain visible.
DROP VIEW v_segment_counts;
CREATE VIEW v_segment_counts AS SELECT t.segment,t.id AS taxonomy_id,t.name,COUNT(DISTINCT o.id) AS org_count,
COUNT(DISTINCT CASE WHEN o.org_type IN ('startup','scaleup','spinout') THEN o.id END) AS startup_count,
COUNT(DISTINCT CASE WHEN o.org_type IN ('incumbent','corporate_unit') THEN o.id END) AS incumbent_count
FROM taxonomy t LEFT JOIN organization_taxonomy ot ON ot.taxonomy_id=t.id
LEFT JOIN organizations o ON o.id=ot.org_id AND o.triage_status='accepted' GROUP BY t.id;
-- Legacy name retained for compatibility; no dependence ratio and no blended money metric.
DROP VIEW v_public_dependence;
CREATE VIEW v_public_dependence AS SELECT o.id,o.name,t.segment,o.org_type,
(SELECT SUM(amount_usd) FROM funding_rounds f WHERE f.org_id=o.id AND f.round_type IN ('pre_seed','seed','series_a','series_b','series_c_plus')) AS private_funding_usd,
(SELECT SUM(amount_usd) FROM funding_rounds f WHERE f.org_id=o.id AND f.round_type='grant') AS grant_funding_usd,
(SELECT SUM(ceiling_usd) FROM government_contracts g WHERE g.org_id=o.id AND g.recipient_role='prime' AND g.status IN ('awarded','active','completed')) AS prime_contract_ceiling_usd,
(SELECT SUM(obligated_usd) FROM government_contracts g WHERE g.org_id=o.id AND g.recipient_role='prime' AND g.obligation_status='confirmed' AND g.status IN ('awarded','active','completed')) AS confirmed_obligations_usd,
(SELECT COUNT(*) FROM government_contracts g WHERE g.org_id=o.id) AS related_contract_count
FROM organizations o JOIN organization_taxonomy ot ON ot.org_id=o.id AND ot.is_primary=1 JOIN taxonomy t ON t.id=ot.taxonomy_id WHERE o.triage_status='accepted';
DROP VIEW v_public_contracts;
CREATE VIEW v_public_contracts AS SELECT t.segment,g.agency,g.agency_country,g.contract_type,g.status,
COUNT(*) AS contracts,COUNT(DISTINCT g.org_id) AS orgs,
SUM(CASE WHEN g.recipient_role='prime' THEN g.ceiling_usd END) AS total_ceiling_usd,
SUM(CASE WHEN g.recipient_role='prime' AND g.obligation_status='confirmed' THEN g.obligated_usd END) AS total_confirmed_obligations_usd
FROM government_contracts g JOIN organization_taxonomy ot ON ot.org_id=g.org_id AND ot.is_primary=1 JOIN taxonomy t ON t.id=ot.taxonomy_id GROUP BY t.segment,g.agency,g.agency_country,g.contract_type,g.status;
-- Legacy exploration view, not a numerical hype score. Unknown funding/ladder remain NULL.
DROP VIEW v_hype_index;
CREATE VIEW v_hype_index AS SELECT o.id,o.name,t.segment,
SUM(CASE WHEN f.round_type IN ('pre_seed','seed','series_a','series_b','series_c_plus') THEN f.amount_usd END) AS total_funding_usd,
o.deployment_level,CASE o.deployment_level WHEN 'concept' THEN 1 WHEN 'prototype' THEN 2 WHEN 'lab_demo' THEN 3 WHEN 'trial' THEN 4 WHEN 'shadow_mode' THEN 5 WHEN 'limited_ops' THEN 6 WHEN 'full_ops' THEN 7 ELSE NULL END AS ladder_step,o.ai_substance_score
FROM organizations o JOIN organization_taxonomy ot ON ot.org_id=o.id AND ot.is_primary=1 JOIN taxonomy t ON t.id=ot.taxonomy_id LEFT JOIN funding_rounds f ON f.org_id=o.id WHERE o.triage_status='accepted' GROUP BY o.id;
INSERT INTO change_log(entity_type,entity_id,change_type,summary,agent) VALUES ('schema','migration_003','updated','Separate contract ceiling/confirmed obligations, explicit recipient role and amount scope; accepted-only counts; no zero for unknown.','orchestrator');
