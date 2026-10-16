// Optional integration smoke test against a real D1 SQL export restored as SQLite.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {onRequest} from '../functions/api/snapshot.js';
const path=process.env.ATLAS_TEST_DB;
test('fixed API queries execute against exported D1 schema and data',{skip:!path},async()=>{
 const DB={prepare(sql){return sql;},async batch(sqls){const p='import sqlite3,json,sys\nc=sqlite3.connect(sys.argv[1]);c.row_factory=sqlite3.Row\nprint(json.dumps([{"success":True,"results":[dict(r) for r in c.execute(s)]} for s in json.loads(sys.argv[2])]))';return JSON.parse(execFileSync('python3',['-c',p,path,JSON.stringify(sqls)],{maxBuffer:10000000}).toString());}};
 const r=await onRequest({request:new Request('https://example.test/api/snapshot'),env:{DB,READ_API_ENABLED:'true'}});
 assert.equal(r.status,200);const d=await r.json();assert.ok(d.organizations.length>0);assert.ok(d.claims.length>0);
 assert.equal(d.government_contracts.find(x=>x.agency==='Avinor').recipient_role,'partner');
 assert.equal(d.government_contracts.find(x=>x.agency==='FAA').obligation_status,'disputed');
 assert.equal(d.deployments.find(x=>x.id==='indra-air-traffic:deploy:avinor-norway').product_id,null);
});
