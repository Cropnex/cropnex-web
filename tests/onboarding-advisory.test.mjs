import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=new URL('../',import.meta.url),cache=new Map();
function load(file){if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);new Function('require','module','exports','React',ts.transpileModule(fs.readFileSync(new URL(file,root),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText)(name=>{if(name.startsWith('@/')){const p=name.slice(2);return load(p+(fs.existsSync(new URL(p+'.tsx',root))?'.tsx':'.ts'));}return require(name)},m,m.exports,React);return m.exports;}
const {validateRegistration:validate}=load('lib/registration.ts');
const complete={name:'Test Farmer',company:'Test Farm',phone:'+27 82 123 4567',email:'test@example.test',password:'test-only-123',confirmation:'test-only-123',role:'Farmer'};
test('registration accepts the simple Farmer form without VAT and rejects incomplete or unknown roles',()=>{
 assert.equal(validate(complete),'');for(const key of ['name','company','phone','email','password'])assert.ok(validate({...complete,[key]:''}));assert.ok(validate({...complete,role:'Admin'}));assert.ok(validate({...complete,confirmation:'other'}));
 for(const role of ['Buyer','Transporter','Agronomist','Chemical Representative'])assert.equal(validate({...complete,role}),'');
});
const {groupAdvisoryRequests:group}=load('lib/advisory-requests.ts');
const request={id:'one',group_id:'job',field_id:'f1',service_type:'Soil sampling',status:'Submitted',field_snapshot:{area_ha:10}};
test('multi-field service cards combine only visible fields and retain independent field progress',()=>{
 const rows=[request,{...request,id:'two',field_id:'f2',status:'Sampling',field_snapshot:{area_ha:20}}];const cards=group(rows);assert.equal(cards.length,1);assert.equal(cards[0].hectares,30);assert.equal(cards[0].status,'Mixed progress');assert.equal(cards[0].open,true);
 assert.equal(group([request])[0].hectares,10);assert.equal(group([request,request])[0].hectares,10);
 assert.equal(group([{...request,group_id:null},{...request,id:'legacy2',group_id:null}]).length,2);
 assert.equal(group(rows.map(r=>({...r,status:'Completed'})))[0].open,false);
});
test('multi-field form includes only editable same-client same-season fields, totals hectares and excludes ineligible assignments',()=>{
 const field={id:'f1',owner_id:'a',client_name:'Client A',field_name:'ONE',farm_name:'North',season:'2026/2027',area_ha:10,can_manage:true,boundary:[{lat:-28,lng:27},{lat:-28,lng:28},{lat:-29,lng:27}]};
 const fields=[field,{...field,id:'f2',field_name:'TWO'},{...field,id:'foreign',owner_id:'b',field_name:'FOREIGN'},{...field,id:'old',season:'2025/2026',field_name:'OLDSEASON'},{...field,id:'readonly',can_manage:false,field_name:'READONLY'},{...field,id:'no-boundary',field_name:'UNMAPPED',boundary:null}];
 const Form=load('components/advisory/MultiFieldRequestForm.tsx').default;const html=renderToStaticMarkup(React.createElement(Form,{field,fields,links:[],onClose(){},async onSave(){}}));
 assert.match(html,/ONE/);assert.match(html,/TWO/);assert.doesNotMatch(html,/FOREIGN|OLDSEASON|READONLY/);assert.match(html,/<input[^>]*disabled=""[^>]*value="no-boundary"/);assert.match(html,/10.00/);assert.match(html,/does not share additional fields automatically/);
});
test('weather body values and decision notice have readable contrast against their actual light surfaces',()=>{
 const lum=hex=>hex.match(/\w\w/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
 assert.ok(ratio('42545d','F2F0E8')>4.5);assert.ok(ratio('63420b','fff4d6')>7);
 const css=fs.readFileSync(new URL('app/globals.css',root),'utf8');assert.match(css,/\.ag-weather-workspace[\s\S]*\.text-gray-300/);assert.match(css,/\.ag-weather-notice\{background:#fff4d6;color:#63420b/);
});
