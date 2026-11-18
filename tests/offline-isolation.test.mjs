import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('offline shed responses stay with their original account and session', async () => {
  const rows = new Map();
  const asyncRequest = result => {
    const request = {result};
    queueMicrotask(() => request.onsuccess?.());
    return request;
  };
  const db = {
    close() {},
    transaction() {
      return {objectStore: () => ({
        put: row => { rows.set(row.key,row); return asyncRequest(row.key); },
        get: key => asyncRequest(rows.get(key))
      })};
    }
  };
  const indexedDB = {open: () => asyncRequest(db)};
  const navigator = {onLine:true};
  const exports = {};
  const file = fs.readFileSync(new URL('../lib/offline-platform.ts',import.meta.url),'utf8');
  vm.runInNewContext(ts.transpileModule(file,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
    {exports, window:{indexedDB}, indexedDB, navigator, URL, Request, Response, atob});
  const origin = 'https://privacy-test.supabase.co';
  const read = exports.createOfflineFetch(origin, async () => {
    if (!navigator.onLine) throw new Error('offline');
    return new Response('[{"name":"Farm A Shed"}]');
  });
  const request = (sub, session_id) => {
    const payload = Buffer.from(JSON.stringify({sub,session_id,role:'authenticated',exp:Date.now()/1000+600})).toString('base64url');
    return read(origin+'/rest/v1/inventory_locations?select=*',{headers:{authorization:'Bearer header.'+payload+'.signature'}});
  };
  await request('farm-a','session-a');
  navigator.onLine=false;
  assert.equal((await request('farm-a','session-a')).headers.get('x-agcore-cache'),'offline');
  await assert.rejects(request('farm-b','session-b'),/offline/);
  await assert.rejects(request('farm-a','new-session'),/offline/);
  await assert.rejects(read(origin+'/rest/v1/inventory_locations?select=*'),/offline/);
});
