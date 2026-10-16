'use strict';
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const app = $('#app');
  const dialog = $('#org-dialog');
  const state = { data: null, filters: { search: '', status: 'accepted', country: '', category: '' }, sort: 'name', direction: 1, view: 'explore', focusReturn: null };
  const collections = ['organizations', 'taxonomy', 'organization_taxonomy', 'products', 'deployments', 'claims', 'sources', 'government_contracts', 'funding_rounds'];
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'class') node.className = v;
      else if (v !== undefined && v !== null) node.setAttribute(k, String(v));
    });
    children.flat(Infinity).forEach(c => { if (c !== undefined && c !== null) node.append(c instanceof Node ? c : document.createTextNode(String(c))); });
    return node;
  }
  const text = v => v === undefined || v === null || v === '' ? 'Unknown' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  const human = v => text(v).replace(/_/g, ' ');
  const same = (a, b) => a != null && b != null && String(a) === String(b);
  const known = v => v !== undefined && v !== null && v !== '' && !['unknown', 'not_assessed', 'not assessed'].includes(String(v).toLowerCase());
  const isAssessed = v => known(v);
  // D1 INTEGER classification: zero is explicit non-AI; NULL is unassessed.
  const aiClass = v => v === 1 ? 'AI' : v === 0 ? 'Not AI' : 'Not assessed';
  const corroboration = c => c.evidence_type !== 'company_claim' || c.corroboration === 'not_applicable' ? 'not_applicable' : c.corroboration == null || c.corroboration === '' ? 'not_assessed' : c.corroboration;
  function aliases(org) { try { const parsed = typeof org.aliases === 'string' ? JSON.parse(org.aliases) : org.aliases; return Array.isArray(parsed) ? parsed.join(', ') : text(parsed); } catch (_) { return text(org.aliases); } }
  function orgLink(org) { return el('a', { href: `#org/${encodeURIComponent(org.id)}`, class: 'org-name', onclick: e => { state.focusReturn = e.currentTarget; } }, text(org.name)); }
  function date(v) { if (!v) return 'Not recorded'; const d = new Date(v); return Number.isNaN(d.getTime()) ? text(v) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
  function money(v) { return v == null || v === '' || !Number.isFinite(Number(v)) ? 'Unknown' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(v)); }
  function badge(value, extra = '') { return el('span', { class: `badge ${['accepted', 'needs_review', 'rejected', 'duplicate', 'not_assessed'].includes(value) ? value : ''} ${extra}` }, human(value)); }
  function sourceLink(source) {
    if (!source) return el('span', { class: 'muted' }, 'Source not linked');
    let url; try { url = new URL(source.url); } catch (_) { return el('span', { class: 'muted' }, text(source.title), ' · URL unavailable'); }
    if (!['https:', 'http:'].includes(url.protocol)) return el('span', { class: 'muted' }, text(source.title), ' · Unsupported URL');
    return el('a', { href: url.href, target: '_blank', rel: 'noopener noreferrer', class: 'source-link' }, source.title || source.publisher || url.hostname, ' ↗');
  }
  function orgTags(org) { return state.data.organization_taxonomy.filter(x => same(x.org_id, org.id)).map(x => state.data.taxonomy.find(t => same(t.id, x.taxonomy_id))).filter(Boolean); }
  function related(type, id) { return state.data[type].filter(x => same(x.org_id, id)); }
  function orgClaims(org) {
    const ids = { organization: [org.id], organizations: [org.id], org: [org.id], product: related('products', org.id).map(x => x.id), deployment: related('deployments', org.id).map(x => x.id) };
    return state.data.claims.filter(c => (ids[String(c.subject_type).toLowerCase().replace(/s$/, '')] || ids[c.subject_type] || []).some(id => same(id, c.subject_id)));
  }
  function filtered() {
    const f = state.filters;
    return state.data.organizations.filter(o => (!f.status || o.triage_status === f.status) && (!f.country || o.hq_country === f.country) && (!f.category || orgTags(o).some(t => same(t.id, f.category))) && (!f.search || [o.name, aliases(o), o.website, o.one_liner, o.profile_summary, o.hq_country, ...orgTags(o).map(t => t.name)].join(' ').toLowerCase().includes(f.search.toLowerCase()))).sort((a, b) => {
      const av = a[state.sort], bv = b[state.sort];
      if (!known(av) && known(bv)) return 1; if (known(av) && !known(bv)) return -1;
      const result = state.sort === 'ai_substance_score' && Number.isFinite(Number(av)) && Number.isFinite(Number(bv)) ? Number(av) - Number(bv) : text(av).localeCompare(text(bv), undefined, { numeric: true });
      return result * state.direction || text(a.name).localeCompare(text(b.name));
    });
  }
  function header(kicker, title, description, actions) { return el('div', { class: 'page-header' }, el('div', {}, el('span', { class: 'eyebrow' }, kicker), el('h1', {}, title), el('p', {}, description)), actions || ''); }
  function stat(label, value, note) { return el('div', { class: 'stat' }, el('span', { class: 'eyebrow' }, label), el('strong', {}, value), el('small', {}, note)); }
  function render() {
    if (!state.data) return;
    const route = location.hash.slice(1);
    if (!route.startsWith('org/')) {
      state.view = ['landscape', 'insights', 'methods'].includes(route) ? route : 'explore';
      if (dialog.open) dialog.close();
    }
    document.querySelectorAll('[data-nav]').forEach(a => { if (a.dataset.nav === state.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    app.replaceChildren();
    if (state.view === 'landscape') renderLandscape(); else if (state.view === 'insights') renderInsights(); else if (state.view === 'methods') renderMethods(); else renderExplore();
    if (route.startsWith('org/')) {
      let id; try { id = decodeURIComponent(route.slice(4)); } catch (_) { id = ''; }
      showOrg(id);
    }
  }
  function selectFilter(label, key, options) {
    const select = el('select', { id: `filter-${key}`, onchange: e => { state.filters[key] = e.target.value; renderRows(); } }, options.map(([v, n]) => el('option', { value: v }, n)));
    select.value = state.filters[key];
    return el('label', { class: 'filter-label' }, el('span', {}, label), select);
  }
  function renderExplore() {
    const d = state.data;
    const accepted = d.organizations.filter(o => o.triage_status === 'accepted').length;
    const review = d.organizations.filter(o => o.triage_status === 'needs_review').length;
    const exportButton = el('button', { class: 'button', onclick: exportCSV }, '↓ Export filtered CSV');
    app.append(header('RESEARCH DIRECTORY', 'Explore the evidence.', 'A structured view of organizations, their AI claims, and the evidence behind them.', exportButton));
    app.append(el('div', { class: 'stats' }, stat('Organization records', d.organizations.length, 'All triage statuses'), stat('Accepted', accepted, 'Included after research triage'), stat('Needs review', review, 'Open questions, not rejected claims'), stat('Evidence claims', d.claims.length, `${d.sources.length} source records`)));
    const search = el('input', { type: 'search', id: 'search', placeholder: 'Search names, aliases, websites, descriptions, or categories…', value: state.filters.search, oninput: e => { state.filters.search = e.target.value; renderRows(); } });
    const countries = [...new Set(d.organizations.map(o => o.hq_country).filter(Boolean))].sort();
    const controls = el('section', { class: 'filter-panel', 'aria-label': 'Filter organizations' }, el('label', { class: 'search-label' }, el('span', {}, 'Search directory'), search), el('div', { class: 'filter-row' }, selectFilter('Triage status', 'status', [['', 'All statuses'], ['accepted', 'Accepted'], ['needs_review', 'Needs review'], ['rejected', 'Rejected'], ['duplicate', 'Duplicate']]), selectFilter('Headquarters country', 'country', [['', 'All countries'], ...countries.map(c => [c, c])]), selectFilter('Category', 'category', [['', 'All categories'], ...d.taxonomy.map(t => [t.id, `${t.segment ? human(t.segment) + ' · ' : ''}${text(t.name)}`])]), el('button', { class: 'text-button reset', onclick: () => { state.filters = { search: '', status: '', country: '', category: '' }; render(); } }, 'Reset filters')));
    app.append(controls, el('div', { class: 'results-top' }, el('p', { id: 'result-count', role: 'status' }), el('button', { class: 'text-button', onclick: () => { state.filters.status = 'needs_review'; render(); } }, `Review queue (${review}) →`)), el('div', { id: 'results' }));
    renderRows();
    app.append(el('div', { class: 'scope-note' }, el('strong', {}, 'Scope matters.'), ' The 63-record ATM pilot is not a whole-market census. Four other aviation segments have not been researched. Assessment gaps are shown explicitly; unknown is not zero.'));
  }
  function renderRows() {
    const target = $('#results'); if (!target) return;
    const rows = filtered();
    $('#result-count').replaceChildren(el('strong', {}, `${rows.length} organizations`), ` / ${state.data.organizations.length} total records`);
    if (!rows.length) { target.replaceChildren(el('div', { class: 'state empty' }, el('h2', {}, 'No matching organizations'), el('p', {}, 'Try another search or broaden your filters.'), el('button', { class: 'button', onclick: () => { state.filters = { search: '', status: '', country: '', category: '' }; render(); } }, 'Clear all filters'))); return; }
    const cols = [['name', 'Organization'], ['hq_country', 'HQ country'], ['triage_status', 'Triage status'], ['ai_substance_score', 'AI substance'], ['deployment_level', 'AI component deployment (cached)'], ['last_researched_at', 'Researched']];
    const table = el('table', {}, el('caption', { class: 'sr-only' }, 'Organization research directory. Activate a column heading to sort; activate an organization name to open its record.'), el('thead', {}, el('tr', {}, cols.map(([key, label]) => el('th', { scope: 'col', 'aria-sort': state.sort === key ? state.direction === 1 ? 'ascending' : 'descending' : 'none' }, el('button', { class: 'sort-button', onclick: () => { state.direction = state.sort === key ? -state.direction : 1; state.sort = key; renderRows(); } }, label, el('span', { 'aria-hidden': 'true' }, state.sort === key ? state.direction === 1 ? ' ↑' : ' ↓' : ' ↕')))))));
    table.append(el('tbody', {}, rows.map(o => el('tr', {}, el('td', {}, el('a', { href: `#org/${encodeURIComponent(o.id)}`, class: 'org-name', onclick: e => { state.focusReturn = e.currentTarget; } }, text(o.name)), el('p', { class: 'one-liner' }, text(o.one_liner)), el('div', { class: 'tags' }, orgTags(o).map(t => el('span', { class: 'tag' }, text(t.name))))), el('td', {}, text(o.hq_country)), el('td', {}, badge(o.triage_status)), el('td', {}, isAssessed(o.ai_substance_score) ? el('span', { class: 'score' }, text(o.ai_substance_score), el('small', {}, 'Assessed')) : el('span', { class: 'muted' }, 'Not assessed')), el('td', {}, human(o.deployment_level)), el('td', { class: 'date-cell' }, date(o.last_researched_at))))));
    target.replaceChildren(el('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Organization results; scroll horizontally for more columns' }, table));
  }
  function facts(items) { return el('dl', { class: 'facts' }, items.map(([k, v]) => el('div', {}, el('dt', {}, k), el('dd', {}, v instanceof Node ? v : text(v))))); }
  function section(title, content, count) { return el('section', { class: 'detail-section' }, el('h2', {}, title, count != null ? el('span', { class: 'section-count' }, count) : ''), content); }
  function empty(message) { return el('p', { class: 'empty-note' }, message); }
  function claimCard(c) {
    const src = state.data.sources.find(s => same(s.id, c.source_id));
    return el('details', { class: 'claim-card' }, el('summary', {}, el('span', { class: 'claim-top' }, el('span', { class: 'eyebrow' }, `${human(c.subject_type)} · ${human(c.field)}`), badge(c.status)), el('span', { class: 'claim-value' }, text(c.value))),
      facts([['Evidence type', human(c.evidence_type)], ['Corroboration', human(corroboration(c))], ['Confidence', human(c.confidence)], ['As of', date(c.as_of_date)]]),
      c.quote ? el('blockquote', {}, text(c.quote)) : null,
      c.corroboration_notes ? el('p', {}, el('strong', {}, 'Corroboration notes: '), text(c.corroboration_notes)) : null,
      c.verification_notes ? el('p', {}, el('strong', {}, 'Verification: '), text(c.verification_notes)) : null,
      el('div', { class: 'source-row' }, sourceLink(src), src && src.publisher ? el('small', {}, text(src.publisher)) : null));
  }
  function claimsSection(claims) {
    const active = claims.filter(c => c.status === 'active');
    const list = el('div', { class: 'claim-list' });
    function update(history) {
      const visible = history ? claims : active;
      list.replaceChildren(visible.length ? el('p', { class: 'muted' }, `${visible.length} claims · expand a row for quotations, sources and notes.`) : empty('No active linked claims. Check history for prior records; this does not establish the absence of AI.'), ...visible.map(claimCard));
    }
    update(false);
    return section('Evidence & claims', el('div', {}, el('label', { class: 'history-toggle' }, el('input', { type: 'checkbox', onchange: e => update(e.target.checked) }), ` Show history (${claims.length - active.length} superseded, disputed or retracted records) · default: active only`), list), claims.length);
  }
  function showOrg(id) {
    const org = state.data.organizations.find(o => same(o.id, id));
    const body = $('#org-content');
    if (!org) { body.replaceChildren(el('h1', { id: 'org-title' }, 'Record not found'), empty('This organization is not present in the current snapshot.')); }
    else {
      const claims = orgClaims(org), products = related('products', id), deployments = related('deployments', id), contracts = related('government_contracts', id), rounds = related('funding_rounds', id);
      body.replaceChildren(
        el('span', { class: 'eyebrow' }, 'ORGANIZATION / ', text(org.org_type)), el('h1', { id: 'org-title' }, text(org.name)),
        el('p', { class: 'detail-deck' }, text(org.one_liner)), el('div', { class: 'tags' }, badge(org.triage_status), ...orgTags(org).map(t => el('span', { class: 'tag' }, text(t.name)))),
        facts([['Headquarters', org.hq_country], ['Priority', human(org.priority)], ['AI substance', isAssessed(org.ai_substance_score) ? `${text(org.ai_substance_score)} · assessed` : 'Not assessed'], ['AI component deployment (cached)', human(org.deployment_level)], ['Last researched', date(org.last_researched_at)], ['Snapshot as of', date(state.data.generated_at)], ['Website', org.website ? sourceLink({ url: org.website, title: org.website }) : 'Not recorded'], ['Aliases', aliases(org)]]),
        el('div', { class: 'review-notes' }, section('Triage notes & review questions', el('p', { class: 'summary' }, text(org.triage_notes))), section('AI substance assessment notes', el('p', { class: 'summary' }, text(org.ai_substance_notes)))),
        section('Research summary', el('p', { class: 'summary' }, text(org.profile_summary))),
        claimsSection(claims),
        section('Products & AI components', products.length ? el('div', { class: 'record-grid' }, products.map(p => el('article', { class: 'record-card' }, el('h3', {}, text(p.name)), el('p', {}, text(p.description)), facts([['System deployment', human(p.deployment_level)], ['AI component deployment', human(p.ai_component_level)], ['AI classification', aiClass(p.is_ai)], ['EASA AI level', human(p.easa_ai_level)], ['Safety criticality', human(p.safety_criticality)]])))) : empty('No product records. Not an assessment of product availability.'), products.length),
        section('Deployments', deployments.length ? el('div', { class: 'record-grid' }, deployments.map(d => el('article', { class: 'record-card' }, el('h3', {}, text(d.customer_name)), el('p', {}, text(d.description)), facts([['Product', products.find(p => same(p.id, d.product_id))?.name || 'Not linked'], ['System deployment', human(d.deployment_level)], ['AI component deployment', human(d.ai_component_level)], ['AI classification', aiClass(d.is_ai)]])))) : empty('No deployment records. Commercial systems and AI components are assessed separately.'), deployments.length),
        section('Government contracts', contracts.length ? el('div', { class: 'record-grid' }, contracts.map(c => el('article', { class: `record-card ${c.obligation_status === 'disputed' ? 'disputed-contract' : ''}` }, el('h3', {}, text(c.program_name)), c.obligation_status === 'disputed' ? el('p', { class: 'obligation-warning', role: 'note' }, 'Disputed obligation — reported figure is unresolved, not a confirmed commitment or payment.') : null,
          facts([['Agency', c.agency], ['Status', human(c.status)], ['Recipient role', human(c.recipient_role)], ['Prime contractor', c.prime_contractor_name], ['Amount scope', human(c.amount_scope)], ['Contract ceiling (not money received)', money(c.ceiling_usd)], [c.obligation_status === 'disputed' ? 'Reported obligated amount — DISPUTED' : 'Recorded obligated amount', money(c.obligated_usd)], ['Obligation status', human(c.obligation_status)]]), el('p', { class: 'original-notes' }, text(c.notes))))) : empty('No contract records. Unknown is not zero.'), contracts.length),
        section('Capital, grants & ownership events', rounds.length ? el('div', { class: 'record-grid' }, rounds.map(r => el('article', { class: 'record-card' }, el('h3', {}, human(r.round_type)), facts([['Reported event amount (not necessarily investment)', money(r.amount_usd)], ['Announced', date(r.announced_date)]]), el('p', { class: 'original-notes' }, text(r.notes))))) : empty('No capital, grant or ownership-event records. Unknown is not zero.'), rounds.length),
        el('div', { class: 'scope-note' }, 'Financial amounts are shown per record. Contract ceilings, disputed or recorded obligations, grants, acquisitions and investment are distinct measures; no difference between them establishes dependence. Organization AI component deployment is a cached assessment, not system deployment. EASA labels are analytical, not certification findings.'));
    }
    if (!dialog.open) { dialog.showModal(); document.body.classList.add('dialog-open'); $('#close-dialog').focus(); }
  }
  function closeOrg() {
    if (dialog.open) dialog.close();
    history.replaceState(null, '', `#${state.view}`);
    document.body.classList.remove('dialog-open');
    const name = state.focusReturn?.textContent;
    const destination = [...document.querySelectorAll('.org-name')].find(a => a.textContent === name);
    (destination || $('[data-nav="explore"]')).focus();
  }
  $('#close-dialog').addEventListener('click', closeOrg); $('#close-x').addEventListener('click', closeOrg);
  dialog.addEventListener('cancel', e => { e.preventDefault(); closeOrg(); });
  dialog.addEventListener('close', () => document.body.classList.remove('dialog-open'));
  function renderLandscape() {
    const d = state.data;
    const accepted = d.organizations.filter(o => o.triage_status === 'accepted');
    const level = o => known(o.deployment_level) ? String(o.deployment_level) : 'unknown';
    const levels = [...new Set(['concept', 'prototype', 'lab_demo', 'trial', 'shadow_mode', 'limited_ops', 'full_ops', ...accepted.map(level).filter(v => v !== 'unknown'), 'unknown'])];
    const categories = d.taxonomy.filter(t => t.segment === 'atm').sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    app.append(header('RESEARCH LANDSCAPE', 'ATM categories × AI deployment.', 'Accepted organizations only. Columns use the cached organization AI component level, not system deployment. Expand a cell to open organization records.'));
    app.append(el('div', { class: 'scope-note' }, 'Multi-tag organizations appear in each applicable category, counted uniquely within each cell. Do not sum cells as unique market participants. Unknown includes missing or unassessed levels. Empty cells mean no accepted records in this snapshot, not an empty opportunity market.'));
    const rows = categories.map(t => [t.name, accepted.filter(o => orgTags(o).some(tag => same(tag.id, t.id)))]);
    const uncategorized = accepted.filter(o => !orgTags(o).some(t => t.segment === 'atm'));
    if (uncategorized.length) rows.push(['ATM category not assessed', uncategorized]);
    const table = el('table', { class: 'landscape-table' }, el('caption', { class: 'sr-only' }, 'Accepted ATM organizations by taxonomy category and cached AI component deployment level. Each cell contains a unique organization count and expandable links.'), el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'ATM category'), ...levels.map(l => el('th', { scope: 'col' }, l === 'unknown' ? 'Unknown / not assessed' : human(l))))), el('tbody', {}, rows.map(([name, organizations]) => el('tr', {}, el('th', { scope: 'row' }, name), ...levels.map(l => {
      const members = [...new Map(organizations.filter(o => level(o) === l).map(o => [String(o.id), o])).values()].sort((a, b) => text(a.name).localeCompare(text(b.name)));
      return el('td', {}, members.length ? el('details', { class: 'landscape-cell' }, el('summary', {}, `${members.length} ${members.length === 1 ? 'organization' : 'organizations'}`), el('ul', {}, members.map(o => el('li', {}, orgLink(o))))) : el('span', { class: 'muted', 'aria-label': 'No accepted records in snapshot' }, '0'));
    })))));
    app.append(el('div', { class: 'table-wrap landscape-wrap', tabindex: '0', role: 'region', 'aria-label': 'ATM landscape; scroll horizontally for all AI component levels' }, table));
    const segmentNames = { airlines: 'Airlines', airports: 'Airports', new_aviation: 'New aviation', travel: 'Travel' };
    app.append(section('Other aviation segments', el('div', { class: 'segment-grid' }, Object.entries(segmentNames).map(([key, name]) => el('article', { class: 'record-card' }, el('h3', {}, name), badge('Not researched'), el('p', {}, `${d.taxonomy.filter(t => t.segment === key).length} taxonomy categories defined; research coverage has not been established. Not an empty opportunity market.`))))));
  }
  function chart(title, values, note) {
    const total = values.reduce((n, x) => n + x[1], 0), max = Math.max(...values.map(x => x[1]), 1);
    return el('section', { class: 'chart-card' }, el('div', { class: 'chart-heading' }, el('h2', {}, title), el('span', { class: 'muted' }, `${total} records`)), el('p', { class: 'muted chart-note' }, note), total ? el('ul', { class: 'bar-chart' }, values.map(([label, count]) => el('li', {}, el('div', { class: 'bar-label' }, el('span', {}, human(label)), el('strong', {}, count)), el('div', { class: 'bar-track', 'aria-hidden': 'true' }, el('div', { class: 'bar', style: `width:${count / max * 100}%` }))))) : empty('No records available for this chart.'));
  }
  function group(items, key) { const counts = new Map(); items.forEach(x => { const v = known(x[key]) ? String(x[key]) : 'Unknown / not assessed'; counts.set(v, (counts.get(v) || 0) + 1); }); return [...counts].sort((a, b) => b[1] - a[1]); }
  function renderInsights() {
    const d = state.data;
    const companyClaims = d.claims.filter(c => c.status === 'active' && c.evidence_type === 'company_claim');
    const applicableClaims = companyClaims.filter(c => corroboration(c) !== 'not_applicable').map(c => ({ ...c, corroboration: corroboration(c) }));
    const assessed = d.organizations.filter(o => isAssessed(o.ai_substance_score)).length;
    const unlinked = d.claims.filter(c => !d.sources.some(s => same(s.id, c.source_id))).length;
    app.append(header('SNAPSHOT ANALYSIS', 'Coverage, not certainty.', 'Descriptive counts across all loaded records, including records awaiting review. These are not whole-market estimates.'));
    app.append(el('div', { class: 'stats' }, stat('Organizations', d.organizations.length, 'All statuses · not just Explore results'), stat('AI substance assessed', assessed, `${d.organizations.length - assessed} not assessed / unknown`), stat('Active company claims', companyClaims.length, `${applicableClaims.length} applicable to corroboration; ${companyClaims.length - applicableClaims.length} not applicable`), stat('Claims without linked source', unlinked, 'A research gap, not disproof')));
    app.append(el('div', { class: 'chart-grid' }, chart('Organization triage', group(d.organizations, 'triage_status'), 'Review status describes inclusion decisions, not the truth of every claim.'), chart('Active company-claim corroboration', group(applicableClaims, 'corroboration'), 'Active, exact company_claim evidence type only; not_applicable excluded. NULL means not_assessed. No other evidence types enter this denominator.'), chart('Organization AI component levels (cached)', group(d.organizations, 'deployment_level'), 'Cached organization-level AI component assessment, not the deployment level of the surrounding system.'), chart('AI component deployment', group(d.products.filter(p => p.is_ai === 1), 'ai_component_level'), 'AI products only (is_ai = 1); unknown AI-component levels retained. Non-AI and unclassified products excluded.')));
    const unknowns = [ ['Organization AI substance', d.organizations.filter(o => !isAssessed(o.ai_substance_score)).length, d.organizations.length], ['Organization AI component deployment (cached)', d.organizations.filter(o => !known(o.deployment_level)).length, d.organizations.length], ['Product AI component deployment', d.products.filter(p => !known(p.ai_component_level)).length, d.products.length], ['Product AI classification', d.products.filter(p => p.is_ai !== 1 && p.is_ai !== 0).length, d.products.length], ['Active company-claim corroboration (applicable only)', applicableClaims.filter(c => !known(c.corroboration)).length, applicableClaims.length] ];
    app.append(section('What remains unknown', el('div', { class: 'unknown-grid' }, unknowns.map(([label, count, total]) => el('div', { class: 'unknown-card' }, el('strong', {}, `${count} / ${total}`), el('span', {}, label), el('small', {}, 'unknown or not assessed'))))), el('div', { class: 'scope-note' }, el('strong', {}, 'Do not extrapolate.'), ' The 63-record ATM pilot is not the whole market. Four other segments have not been researched. Zero linked records indicates only the contents of this snapshot, not zero real-world activity.'));
  }
  function renderMethods() {
    app.append(header('RESEARCH PROTOCOL', 'Make the evidence visible.', 'An attributed research atlas, not a leaderboard of unqualified AI claims.'));
    const methods = [
      ['01', 'Scope & snapshot', 'The 63-record air traffic management (ATM) pilot is not a census of the aviation market. Four other aviation segments have not been researched. All views reflect the displayed snapshot date, not a live feed. Counts are computed from loaded records.'],
      ['02', 'Company claims stay on the record', 'Company statements are retained and attributed to their sources, even where independent corroboration has not been established. Lack of corroboration is not proof that a claim is false. Evidence type, status, corroboration, confidence, quotations, and verification notes remain distinct fields.'],
      ['03', 'Assessed is not the same as unknown', 'An explicit score, including zero, is an assessment. Missing, unknown, and not_assessed values are not zero. A missing source, contract, deployment, or funding record reflects a research gap; it does not establish absence. Accepted, needs review, rejected, and duplicate are triage statuses, not universal truth labels.'],
      ['04', 'Systems and AI are separate', 'Deployment of an operational aviation system does not establish deployment of its AI component. The organization deployment_level field is a cached AI component assessment, not system deployment. Product and customer deployment records retain system deployment and AI component levels separately. AI classification uses D1 INTEGER 1 (AI), 0 (not AI), and NULL (not assessed).'],
      ['05', 'EASA labels are analytical only', 'EASA AI levels and safety-criticality labels are research classifications. They do not imply certification, regulatory approval, or an official EASA determination. Consult the linked evidence and relevant authorities for certification questions.'],
      ['06', 'Financial measures are not interchangeable', 'Government contract ceilings are potential limits, not money received. Obligation status and disputes are retained; disputed figures are not confirmed commitments. Capital records may represent investment, grants, acquisitions or other ownership events. We do not combine them into a capital total or interpret differences as dependence. Unknown amounts are not zero.'],
      ['07', 'Transparent charts & review', 'Explore filters apply only to the directory and its CSV export. Insights states the denominator per chart. Corroboration covers active, exact company_claim rows only, excludes not_applicable, and treats NULL as not_assessed. Landscape covers accepted organizations only, using cached AI component levels; multi-tag organizations may appear in multiple category cells. Other segments are Not researched, not empty opportunity markets. Claim details default to active with history available. The review queue is the needs_review directory filter.'],
      ['08', 'Sources & portable research', 'Every claim links to its source when one is available. External source links accept HTTP and HTTPS only. CSV export includes the current filtered, sorted organization rows and neutralizes spreadsheet formula prefixes. It does not export the full claim or source corpus.']
    ];
    app.append(el('div', { class: 'methods-list' }, methods.map(([n, title, description]) => el('section', { class: 'method' }, el('span', { class: 'method-number' }, n), el('div', {}, el('h2', {}, title), el('p', {}, description))))), el('div', { class: 'scope-note' }, el('strong', {}, 'A starting point for diligence.'), ' Follow the evidence, preserve uncertainty, and review the original sources before making operational, procurement, or investment decisions.'));
  }
  function exportCSV() {
    const keys = ['id', 'name', 'one_liner', 'triage_status', 'priority', 'org_type', 'hq_country', 'ai_substance_score', 'deployment_level', 'last_researched_at'];
    const headers = [...keys.map(k => k === 'deployment_level' ? 'ai_component_deployment_level_cached' : k), 'categories', 'snapshot_generated_at'];
    function cell(v) { let s = v == null ? '' : String(v); if (/^[\s\u0000-\u001f]*[=+@-]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
    const rows = filtered().map(o => [...keys.map(k => o[k]), orgTags(o).map(t => t.name).join('; '), state.data.generated_at]);
    const blob = new Blob(['\uFEFF', [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), a = el('a', { href: url, download: 'aviation-ai-atlas-filtered.csv' }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function load() {
    app.replaceChildren(el('div', { class: 'state' }, el('span', { class: 'spinner', 'aria-hidden': 'true' }), el('h1', {}, 'Loading research snapshot'), el('p', {}, 'Preparing organizations, evidence, and source records.')));
    try {
      let raw;
      if (typeof window.__AVIATION_SNAPSHOT__ !== 'undefined') raw = window.__AVIATION_SNAPSHOT__;
      else { const response = await fetch('/api/snapshot', { headers: { Accept: 'application/json' } }); if (!response.ok) throw new Error(`Snapshot request failed (${response.status})`); raw = await response.json(); }
      if (!raw || typeof raw !== 'object' || !Array.isArray(raw.organizations)) throw new Error('Snapshot is missing its organizations array.');
      state.data = Object.fromEntries(collections.map(k => [k, Array.isArray(raw[k]) ? raw[k].filter(x => x && typeof x === 'object') : []]));
      state.data.generated_at = raw.generated_at;
      $('#as-of').textContent = date(raw.generated_at);
      $('#nav-count').textContent = state.data.organizations.length;
      render();
    } catch (error) {
      $('#as-of').textContent = 'Snapshot unavailable';
      app.replaceChildren(el('div', { class: 'state error', role: 'alert' }, el('span', { class: 'eyebrow' }, 'RESEARCH DATA UNAVAILABLE'), el('h1', {}, 'We couldn’t load this snapshot.'), el('p', {}, 'Check your connection and try again. No research data has been substituted.'), el('small', {}, error.message), el('button', { class: 'button primary', onclick: load }, 'Retry snapshot')));
    }
  }
  window.addEventListener('hashchange', render);
  load();
})();
