import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url),root=new URL('../',import.meta.url),cache=new Map();
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
function load(file){if(cache.has(file))return cache.get(file).exports;const loadedModule={exports:{}};cache.set(file,loadedModule);new Function('require','module','exports',ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name.startsWith('@/')?load(name.slice(2)+'.ts'):require(name),loadedModule,loadedModule.exports);return loadedModule.exports}
const {parseAdvisoryGridCsv:parse,sampleInsideBoundary:inside,gridSeries,recommendationEstimate:estimate}=load('lib/advisory.ts');
const header='sample_id,latitude,longitude,parameter,value,unit,depth_cm,sample_date\n';
const row='S1,-28,27,Phosphorus,12,mg/kg,20,2026-11-02';
test('grid CSV handles BOM, quoted labels, CRLF and numeric zero',()=>{const results=parse('\uFEFF'+header+'"North, gate",-28,27,"P, extractable",0,mg/kg,0,2026-11-02\r\n');assert.equal(results[0].sample_id,'North, gate');assert.equal(results[0].value,0);assert.equal(results[0].depth_cm,0)});
test('grid CSV rejects missing values, duplicate headings, bad dates, units and coordinates',()=>{
 for(const source of [header+row.replace('-28','91'),header+row.replace('2026-11-02','2026-02-30'),header+row.replace('mg/kg',''),header+row.replace(',20,',',-1,'),header+row.replace(',12,',',NaN,'),header+row.replace(',12,',',,'),header.replace('unit','value')+row,header+'"unclosed'])assert.throws(()=>parse(source));
});
test('different dates, units and depths remain separate grid layers',()=>{const p=parse(header+row)[0];assert.notEqual(gridSeries(p),gridSeries({...p,unit:'ppm'}));assert.notEqual(gridSeries(p),gridSeries({...p,depth_cm:40}));assert.notEqual(gridSeries(p),gridSeries({...p,sample_date:'2026-11-03'}))});
const square=[[[26,-29],[28,-29],[28,-27],[26,-27],[26,-29]]];
test('sample checks honor polygon holes and separate polygon islands',()=>{const p=parse(header+row)[0];assert.equal(inside(p,{type:'Polygon',coordinates:square}),true);assert.equal(inside({...p,longitude:30},{type:'Polygon',coordinates:square}),false);assert.equal(inside(p,{type:'Polygon',coordinates:[...square,[[26.5,-28.5],[27.5,-28.5],[27.5,-27.5],[26.5,-27.5],[26.5,-28.5]]]}),false);assert.equal(inside({...p,longitude:31},{type:'MultiPolygon',coordinates:[square,[[[30,-29],[32,-29],[32,-27],[30,-27],[30,-29]]]]}),true);assert.equal(inside(p,null),null)});
test('recommendations allocate per-hectare cost and quantity to the chosen field',()=>{const lines=estimate([{kind:'Product',name:'P',unit:'L',rate:2,price:150},{kind:'Operation',name:'Spraying',unit:'ha',rate:1,price:80}],10);assert.equal(lines[0].quantity,20);assert.equal(lines[0].costPerHa,300);assert.equal(lines.reduce((s,l)=>s+l.total,0),3800);assert.equal(estimate([lines[0]],5)[0].total,1500)});
const sql=read('supabase/migrations/202610300001_agronomy_advisory.sql');
test('migration has one transaction, unique routines and complete dollar delimiters',()=>{
 assert.equal((sql.match(/^begin;/gm)||[]).length,1);assert.equal((sql.match(/^commit;/gm)||[]).length,1);
 const routines=[...sql.matchAll(/create or replace function public\.(\w+)/g)].map(m=>m[1]);assert.equal(new Set(routines).size,routines.length);
 assert.doesNotMatch(sql,/as \$(?!\$)/);assert.equal((sql.match(/\$\$/g)||[]).length%2,0);assert.match(sql,/left\(p.proname,12\)='get_advisory_'/);
});
test('migration explicitly enables RLS and restricts direct record mutation',()=>{for(const table of ['links','requests','visits','documents','recommendations','events'])assert.ok(sql.includes(`alter table public.advisory_${table} enable row level security;`));assert.match(sql,/revoke insert,update,delete[\s\S]*?from authenticated,anon/);assert.match(sql,/revoke all on function[\s\S]*from public,anon/i)});
test('field reads and writes depend on approved adviser plus active field consent',()=>{const start=sql.indexOf('function public.advisory_read_field'),end=sql.indexOf('function public.advisory_field_snapshot');const checks=sql.slice(start,end);assert.match(checks,/advisory_is_advisor\(\)/);assert.match(checks,/l.field_id=p_field and l.advisor_id=auth.uid\(\) and l.status='Active'/);assert.match(sql,/bucket_id='advisory-files'/)});
test('approval is locked, idempotent, permission checked and writes only planned work',()=>{const approval=sql.slice(sql.indexOf('function public.advisory_review_recommendation'),sql.indexOf('function public.get_advisory_field_context'));assert.match(approval,/for update/);assert.match(approval,/r.status='Approved'.*return r.plan_id/);assert.match(approval,/can_edit_farmer\(f.user_id,'planning'\)/);assert.match(approval,/insert into public.activity_plan_products/);assert.match(approval,/insert into public.activity_plan_operations/);assert.doesNotMatch(approval,/(insert into|update) public.(inventory|stock|activities\b)/)});
test('new route has the app shell, field drawer entry and no season dependency',()=>{assert.match(read('app/advisory/layout.tsx'),/<AppShell>/);assert.match(read('app/advisory/page.tsx'),/await searchParams/);assert.doesNotMatch(read('components/advisory/AdvisoryWorkspace.tsx'),/useSearchParams/);assert.match(read('components/map/FieldDrawer.tsx'),/advisory\?field=/);assert.doesNotMatch(read('components/advisory/AdvisoryWorkspace.tsx'),/useSeason|currentSeason/);assert.match(read('components/auth/AccessProvider.tsx'),/\["\/advisory","advisory"\]/)});
