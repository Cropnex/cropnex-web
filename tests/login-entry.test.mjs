import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),root=new URL('../',import.meta.url);
function load(file,mocks={}){
 const source=fs.readFileSync(new URL(file,root),'utf8');
 const {outputText,diagnostics}=ts.transpileModule(source,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true},reportDiagnostics:true});
 assert.equal(diagnostics.length,0);
 const mod={exports:{}};
 vm.runInNewContext(outputText,{module:mod,exports:mod.exports,require:name=>{if(name==='@/lib/supabase')throw Error('Auth SDK is unavailable during initial page load');if(name==='@/lib/registration')return load('lib/registration.ts');if(name==='@/lib/trial-request')return load('lib/trial-request.ts');return Object.hasOwn(mocks,name)?mocks[name]:require(name);},setTimeout,clearTimeout,AbortController,console:{error(){}}},{filename:file});
 return mod.exports;
}
const {parseAuthEntry}=load('lib/auth-entry.ts');
const {default:Form}=load('components/auth/LoginForm.tsx',{
 'next/navigation':{useRouter:()=>({push(){},refresh(){}})},
 'next/link':{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)},
 '@/lib/app-meta':{LEGAL_VERSION:'2026-10-23'},
 '@/components/brand/CropNexLogo':{__esModule:true,default:()=>React.createElement('span',null,'CropNex')}
});
test('login HTML includes email/password form without browser JavaScript or the Auth SDK',()=>{
 const html=renderToStaticMarkup(React.createElement(Form,{initialMode:'login',preSubscribe:false}));
 assert.match(html,/id="auth-email"/);assert.match(html,/id="auth-password"/);assert.match(html,/>Login<\/button>/);assert.doesNotMatch(html,/Loading CropNex sign-in/);
});
test('registration link renders required fields and legal acceptance in initial HTML',()=>{
 const html=renderToStaticMarkup(React.createElement(Form,{initialMode:'register',preSubscribe:false}));
 for(const id of ['auth-email','auth-password','auth-confirm-password','auth-full-name'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/type="checkbox" required/);assert.match(html,/>Create account<\/button>/);
});
test('server query options retain registration and pre-subscription links',()=>{
 assert.equal(parseAuthEntry({mode:'register',presubscribe:'1'}).initialMode,'register');assert.equal(parseAuthEntry({mode:'register',presubscribe:'1'}).preSubscribe,true);
 assert.equal(parseAuthEntry({mode:['register','login']}).initialMode,'register');assert.equal(parseAuthEntry({mode:'unexpected'}).initialMode,'login');
});
test('server page resolves query parameters before returning the sign-in form',async()=>{
 const {default:Page}=load('app/login/page.tsx',{'@/components/auth/LoginForm':{__esModule:true,default:Form},'@/lib/auth-entry':{parseAuthEntry},'@/lib/app-meta':{CROPNEX_LAUNCHED:true}});
 const node=await Page({searchParams:Promise.resolve({mode:'register',presubscribe:'1'})});
 const html=renderToStaticMarkup(node);assert.match(html,/auth-confirm-password/);assert.doesNotMatch(html,/Loading CropNex sign-in|Pre-subscribe<\/button>/);assert.match(html,/<noscript>/);
});
test('auth navigation bypasses service worker cached pages while ordinary offline navigation remains',()=>{
 let handler,handled=false;
 vm.runInNewContext(fs.readFileSync(new URL('public/sw.js',root),'utf8'),{self:{location:{origin:'https://www.cropnex.com'},addEventListener:(event,fn)=>{if(event==='fetch')handler=fn;}},URL,fetch:()=>Promise.resolve({ok:false})});
 for(const pathname of ['/login','/login?mode=register','/auth/callback']){handled=false;handler({request:{url:'https://www.cropnex.com'+pathname,method:'GET',mode:'navigate'},respondWith(){handled=true;}});assert.equal(handled,false,pathname);}
 handler({request:{url:'https://www.cropnex.com/dashboard',method:'GET',mode:'navigate'},respondWith(){handled=true;}});assert.equal(handled,true);
});
