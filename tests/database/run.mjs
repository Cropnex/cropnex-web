import {fileURLToPath,pathToFileURL} from 'node:url';
const {PGlite}=await import(process.env.CROPNEX_PGLITE_MODULE?pathToFileURL(process.env.CROPNEX_PGLITE_MODULE).href:'@electric-sql/pglite');
import fs from 'node:fs';
import path from 'node:path';
export const root=fileURLToPath(new URL('../../',import.meta.url));
export const db=new PGlite();
await db.exec(`create role anon;create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}',created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key,bucket_id text,name text,owner uuid);
create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`);
for(const name of fs.readdirSync(path.join(root,'supabase/migrations')).filter(n=>n.endsWith('.sql')).sort()){
 let sql=fs.readFileSync(path.join(root,'supabase/migrations',name),'utf8').replace(/create extension if not exists pgcrypto;/gi,'');
 try{await db.exec(sql);}catch(e){console.error('MIGRATION FAILED',name,e.message);await db.close();process.exit(1);}
 console.log('PASS',name);
}
console.log('ALL MIGRATIONS EXECUTED');
try{
 if(process.argv.includes('--scenarios'))await (await import('./scenarios.mjs')).scenarios(db);
 if(process.argv.includes('--onboarding-scenarios'))await (await import('./onboarding-advisory.mjs')).onboardingAdvisoryScenarios(db);
 if(process.argv.includes('--quick-start-scenarios'))await (await import('./quick-farmer-start.mjs')).quickFarmerStartScenarios(db);
 if(process.argv.includes('--reapply-latest')){
  const counts=async()=>(await db.query('select (select count(*) from auth.users) users,(select count(*) from public.fields) fields,(select count(*) from public.farms) farms,(select count(*) from public.user_roles) roles')).rows[0];
  const before=await counts();
  for(const name of ['202611090001_farmer_onboarding_and_service_groups.sql','202611090002_quick_farmer_start.sql'])await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',name),'utf8'));
  if(JSON.stringify(before)!==JSON.stringify(await counts()))throw new Error('Reapplying latest migrations changed existing record counts');
  console.log('PASS combined v6.44/v6.45 migrations can be reapplied without duplicating accounts, roles, farms or fields');
 }
}catch(error){console.error('DATABASE SCENARIO FAILED',error.message,error.query||'',error.where||'');process.exitCode=1;}
await db.close();
