import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
function render(access){
 let queries=0;
 const compiled=ts.transpileModule(read('app/master-data/page.tsx'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
 const loaded={exports:{}};
 new Function('require','module','exports','React',compiled)(name=>{
  if(name==='react')return React;
  if(name.includes('AccessProvider'))return {useAccess:()=>access};
  if(name.includes('supabase'))return {supabase:{from:()=>{queries++;throw new Error('Unexpected catalogue access')}}};
  if(name.includes('master-data-workbook'))return {};
  throw new Error(name);
 },loaded,loaded.exports,React);
 return {html:renderToStaticMarkup(React.createElement(loaded.exports.default)),queries};
}
test('farmers, advisers and organisation administrators cannot mount the Master Data workspace',()=>{
 for(const role of ['Farmer','Agronomist','Chemical Representative','Employee','Organisation Administrator']){
  const {html,queries}=render({loading:false,isAdmin:false,isOrganizationAdmin:role==='Organisation Administrator',roles:[role],modules:['master-data']});
  assert.match(html,/Administrator access required/);assert.equal(queries,0);assert.doesNotMatch(html,/Export master list/);
 }
});
test('pending access never loads catalogue records',()=>{const {html,queries}=render({loading:true,isAdmin:false});assert.match(html,/Checking administrator access/);assert.equal(queries,0)});
test('CropNex administrators retain master workbook controls',()=>{const {html}=render({loading:false,isAdmin:true});assert.match(html,/Export master list/);assert.match(html,/Import edited list/)});
test('navigation and route access require CropNex administration regardless of dashboard grants',()=>{
 assert.doesNotMatch(read('components/layout/navigation.ts'),/href:"\/master-data"|key:"master-data"/);
 assert.match(read('components/layout/Sidebar.tsx'),/access.isAdmin\?[^\n]*href:"\/master-data"/);
 assert.match(read('components/auth/AccessProvider.tsx'),/pathname==="\/master-data"&&!a.isAdmin/);
});
test('database permits approved catalogue reads but reserves shared product changes for admins',()=>{
 const sql=read('supabase/migrations/202609180004_master_product_catalogue.sql');
 assert.match(sql,/using\(status='Approved' or public.is_agcore_admin\(auth.uid\(\)\)\)/);
 assert.match(sql,/master_products_admin_insert[\s\S]*?with check\(public.is_agcore_admin\(auth.uid\(\)\)\)/);
 assert.match(sql,/master_products_admin_update[\s\S]*?using\(public.is_agcore_admin\(auth.uid\(\)\)\) with check\(public.is_agcore_admin\(auth.uid\(\)\)\)/);
 assert.match(read('supabase/migrations/202610200001_cropnex_master_seed_catalogue.sql'),/if not public.is_agcore_admin\(auth.uid\(\)\) then raise exception/);
});
