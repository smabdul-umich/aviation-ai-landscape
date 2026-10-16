// Fixed SELECT statements only. D1 bindings are not database-level read-only;
// this handler exposes no SQL input and no write operation. Denied by default.
export const QUERIES = Object.freeze({
  organizations: 'SELECT * FROM organizations ORDER BY name LIMIT 2001',
  taxonomy: 'SELECT * FROM taxonomy ORDER BY sort_order LIMIT 501',
  organization_taxonomy: 'SELECT * FROM organization_taxonomy LIMIT 10001',
  products: 'SELECT * FROM products LIMIT 5001',
  deployments: 'SELECT * FROM deployments LIMIT 5001',
  claims: 'SELECT * FROM claims ORDER BY created_at DESC LIMIT 20001',
  sources: 'SELECT * FROM sources LIMIT 10001',
  government_contracts: 'SELECT * FROM government_contracts LIMIT 5001',
  funding_rounds: 'SELECT * FROM funding_rounds LIMIT 5001'
});
const CAPS = {organizations:2000,taxonomy:500,organization_taxonomy:10000,products:5000,deployments:5000,claims:20000,sources:10000,government_contracts:5000,funding_rounds:5000};
function json(data, status=200, extra={}) {
  return new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...extra}});
}
export async function onRequest({request,env}) {
  if (!['GET','HEAD'].includes(request.method)) return json({error:'Read-only endpoint'},405,{'Allow':'GET, HEAD'});
  // Enable only after the owner approves public access or Cloudflare Access
  // protects BOTH production and preview hosts (including /api/*).
  if (env.READ_API_ENABLED !== 'true') return json({error:'Data access is disabled pending access-policy configuration.'},403);
  const url=new URL(request.url);
  if (url.search) return json({error:'Query parameters are not supported.'},400);
  if (request.method==='HEAD') return new Response(null,{status:200,headers:{'Cache-Control':'private, no-store'}});
  try {
    if (!env.DB) return json({error:'Database binding not configured.'},503);
    const names=Object.keys(QUERIES);
    const results=await env.DB.batch(names.map(n=>env.DB.prepare(QUERIES[n])));
    const data={generated_at:new Date().toISOString(),schema_version:3};
    for(let i=0;i<names.length;i++){
      if(results[i].success===false) throw new Error('Database query failed');
      const rows=results[i].results||[];
      if(rows.length>CAPS[names[i]]) return json({error:'Pilot snapshot limit reached. Implement pagination before expanding further.'},503);
      data[names[i]]=rows;
    }
    return json(data);
  } catch (_) { return json({error:'Snapshot temporarily unavailable.'},503); }
}
