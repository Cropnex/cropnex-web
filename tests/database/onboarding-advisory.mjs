import assert from 'node:assert/strict';
export async function onboardingAdvisoryScenarios(db){
 const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
 const id=n=>'64400000-0000-0000-0000-'+String(n).padStart(12,'0');
 const actor=async n=>{await db.exec(`reset role;select set_config('request.jwt.claim.sub','${id(n)}',false);set role authenticated;`)};
 const create=async(n,role='Farmer',confirmed=false,details=true)=>q('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,$3,$4)',[id(n),`test${n}@example.test`,confirmed?'2026-11-09':null,JSON.stringify({account_type:role,...details?{full_name:'TEST ONLY Farmer',business_name:'TEST ONLY Company',phone:'+27821234567'}:{}})]);
 await db.exec('reset role;grant usage on schema public,auth to authenticated;grant select on all tables in schema public to authenticated;grant update on public.marketplace_profiles to authenticated;');
 await create(1);await actor(1);
 assert.equal((await q('select ensure_cropnex_registration() r'))[0].r.state,'verify_email');
 assert.equal((await q('select * from user_roles where user_id=$1',[id(1)])).length,0);
 await assert.rejects(q("select complete_farmer_registration('Test Farmer','0821234567','Test Farm',null)"),/Confirm your email/);
 await db.exec('reset role');await q('update auth.users set email_confirmed_at=now() where id=$1',[id(1)]);await actor(1);
 assert.equal((await q('select ensure_cropnex_registration() r'))[0].r.state,'active');
 assert.equal((await q('select role from user_roles where user_id=$1 and active',[id(1)]))[0].role,'Farmer');
 assert.equal((await q('select verification_status,roles from marketplace_profiles where user_id=$1',[id(1)]))[0].verification_status,'Verified');
 await q('select ensure_cropnex_registration()');assert.equal((await q('select * from user_roles where user_id=$1',[id(1)])).length,1);
 await assert.rejects(q("update marketplace_profiles set roles=array['Agronomist'] where user_id=$1",[id(1)]),/Only CropNex/);
 await assert.rejects(q('select activate_verified_farmer($1)',[id(1)]),/permission denied/);
 console.log('PASS farmer confirmation: no unverified access, automatic verified Farmer only, idempotent activation, no privileged role escalation');
 await db.exec('reset role');await create(2,'Farmer',true,false);await actor(2);
 assert.equal((await q('select ensure_cropnex_registration() r'))[0].r.state,'farmer_details');
 await assert.rejects(q("select complete_farmer_registration('Test','1','Farm',null)"),/Enter your name/);
 assert.equal((await q("select complete_farmer_registration('Test Farmer','0821234567','Legacy Farm',null) r"))[0].r.state,'active');
 for(const [n,role] of [[3,'Buyer'],[4,'Transporter'],[5,'Agronomist'],[6,'Chemical Representative']]){
  await db.exec('reset role');await create(n,role,true);await actor(n);
  assert.equal((await q('select ensure_cropnex_registration() r'))[0].r.state,'approval');
  assert.equal((await q('select status from role_applications where user_id=$1',[id(n)]))[0].status,'Pending');
  assert.equal((await q('select * from user_roles where user_id=$1',[id(n)])).length,0);
  await assert.rejects(q("select complete_farmer_registration('Test','0821234567','Farm',null)"),/administrator review/);
 }
 console.log('PASS legacy Farmer details completion; Buyer, Transporter, Adviser and Agent remain pending administrator review');
 await db.exec('reset role');await create(7,'Farmer',true);await q("update role_applications set status='Suspended' where user_id=$1",[id(7)]);await actor(7);assert.equal((await q('select ensure_cropnex_registration() r'))[0].r.state,'blocked');
 await db.exec('reset role');await create(8,'Farmer',true);await q("update user_roles set active=false where user_id=$1",[id(8)]);await actor(8);assert.equal((await q('select ensure_cropnex_registration() r'))[0].r.state,'blocked');
 console.log('PASS suspended and revoked Farmer access is not reactivated');
 await db.exec('reset role');
 await create(9,'Farmer',false);await q('insert into organizations(id,name,created_by) values($1,$2,$3)',[id(70),'TEST ONLY Organisation',id(1)]);
 await q("insert into organization_members(organization_id,user_id,role,added_by) values($1,$2,'Employee',$3)",[id(70),id(9),id(1)]);
 await q('update auth.users set email_confirmed_at=now() where id=$1',[id(9)]);await actor(9);
 assert.equal((await q('select ensure_cropnex_registration() r'))[0].r.state,'active');assert.equal((await q('select * from user_roles where user_id=$1',[id(9)])).length,0);
 await db.exec('reset role');console.log('PASS existing organisation Employee retains assigned access without receiving a Farmer role');
 // Only fixture setup uses the database owner. All service actions below use authenticated + RLS.
 await q("insert into user_roles(user_id,role,granted_by) values($1,'Agronomist',$1)",[id(5)]);await q("update role_applications set status='Approved' where user_id=$1",[id(5)]);
 const boundary=JSON.stringify([{lat:-28,lng:27},{lat:-28,lng:27.01},{lat:-28.01,lng:27}]);
 for(const n of [1,2]){await q('insert into farmers(id,user_id,name) values($1,$2,$3)',[id(90+n),id(n),'TEST ONLY Business']);await q('insert into farms(id,user_id,farmer_id,name) values($1,$2,$3,$4)',[id(80+n),id(n),id(90+n),'TEST Farm']);}
 const field=async(n,owner=1,season='2026/2027',shape=boundary)=>{await q('insert into fields(id,user_id,field_name,farm_name,season,area_ha,boundary) values($1,$2,$3,$4,$5,$6,$7)',[id(n),id(owner),`TEST ONLY Field ${n}`,'TEST Farm',season,n===101?10:20,shape]);};
 await field(101);await field(102);await field(103,2);await field(104,1,'2025/2026');await field(105,1,'2026/2027',null);await field(106,1,'2026/2027',JSON.stringify({type:'Polygon',coordinates:[]}));
 const args=[[id(101),id(102)],'Soil sampling',null,'2026-11-15','TEST ONLY request',id(201)];
 await actor(1);const group=(await q('select advisory_create_request_group($1,$2,$3,$4,$5,$6) id',args))[0].id;
 assert.equal((await q('select advisory_create_request_group($1,$2,$3,$4,$5,$6) id',args))[0].id,group);
 let rows=(await q('select get_advisory_client_requests($1,$2) r',[id(1),'2026/2027']))[0].r;
 assert.equal(rows.length,2);assert.equal(rows.reduce((n,r)=>n+Number(r.field_snapshot.area_ha),0),30);assert.ok(rows.every(r=>r.group_id===group&&r.field_snapshot.boundary.length===3));
 await assert.rejects(q('select advisory_create_request_group($1,$2,$3,$4,$5,$6)',[args[0],'Leaf analysis',...args.slice(2)]),/different service/);
 for(const n of [103,104,105,106])await assert.rejects(q('select advisory_create_request_group($1,$2,$3,$4,$5,$6)',[[id(101),id(n)],...args.slice(1,5),id(210+n)]),/permitted fields|boundary/);
 assert.equal((await q('select get_advisory_client_requests($1,$2) r',[id(1),'2026/2027']))[0].r.length,2);
 console.log('PASS one multi-field job: two snapshots / 30ha, safe duplicate retry, mixed-owner/season/missing/empty boundaries rejected atomically');
 await db.exec('reset role');await q("insert into advisory_links(field_id,owner_id,advisor_id,advisor_email,status,invited_by) values($1,$2,$3,'test5@example.test','Active',$2)",[id(101),id(1),id(5)]);
 await actor(1);await assert.rejects(q('select advisory_create_request_group($1,$2,$3,$4,$5,$6)',[args[0],args[1],id(5),...args.slice(3,5),id(220)]),/every selected field/);
 await actor(5);rows=(await q('select get_advisory_client_requests($1,$2) r',[id(1),'2026/2027']))[0].r;assert.equal(rows.length,1);assert.equal(rows[0].field_id,id(101));assert.equal(Number(rows[0].field_snapshot.area_ha),10);
 const clients=(await q('select get_advisory_clients() r'))[0].r;assert.equal(clients.length,1);assert.equal(clients[0].owner_id,id(1));assert.equal(clients[0].field_count,1);
 await assert.rejects(q('select advisory_create_request_group($1,$2,$3,$4,$5,$6)',[[id(101)],...args.slice(1,5),id(221)]),/permitted fields/);
 await db.exec('reset role');await q("update advisory_links set status='Revoked' where advisor_id=$1",[id(5)]);await actor(5);
 assert.equal((await q('select get_advisory_client_requests($1,null) r',[id(1)]))[0].r.length,0);assert.equal((await q('select get_advisory_clients() r'))[0].r.length,0);
 await db.exec('reset role');
 console.log('PASS adviser consent: partial request shows only shared fields/hectares; unlinked assignment denied; revoked access immediately disappears');
 console.log('ONBOARDING AND ADVISORY SCENARIOS PASSED');
}
