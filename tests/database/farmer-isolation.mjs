import assert from 'node:assert/strict';

export async function farmerIsolationScenarios(db) {
  const farmerA = '64600000-0000-4000-8000-000000000001';
  const farmerB = '64600000-0000-4000-8000-000000000002';
  const employee = '64600000-0000-4000-8000-000000000003';
  const organization = '64600000-0000-4000-8000-000000000004';
  const query = async (sql, params = []) => (await db.query(sql, params)).rows;
  const signIn = async user => {
    await db.exec('reset role');
    await query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    await db.exec('set role authenticated');
  };

  await db.exec('reset role');
  await query('insert into auth.users(id,email) values ($1,$1::uuid::text),($2,$2::uuid::text),($3,$3::uuid::text)', [farmerA,farmerB,employee]);
  await query("insert into public.user_roles(user_id,role,granted_by) values ($1,'Farmer',$1),($2,'Farmer',$2)", [farmerA,farmerB]);
  await query("insert into public.organizations(id,name,created_by) values ($1,'TEST ONLY Shared Organisation',$2)", [organization,farmerA]);
  await query("insert into public.organization_members(organization_id,user_id,role,added_by) values ($1,$2,'Farmer',$2),($1,$3,'Farmer',$2),($1,$4,'Employee',$2)", [organization,farmerA,farmerB,employee]);
  await query("insert into public.organization_farmers(organization_id,farmer_user_id,linked_by) values ($1,$2,$2),($1,$3,$2)", [organization,farmerA,farmerB]);
  await query("insert into public.organization_member_dashboard_access(organization_id,user_id,module_key,enabled,can_edit,granted_by) values ($1,$2,'inventory',true,true,$2),($1,$3,'inventory',true,true,$2),($1,$4,'inventory',true,false,$2)", [organization,farmerA,farmerB,employee]);
  await query("insert into public.organization_farmer_assignments(organization_id,farmer_user_id,manager_user_id,assigned_by) values ($1,$2,$3,$2)", [organization,farmerA,farmerB]);
  const records = new Map();
  for (const owner of [farmerA, farmerB]) {
    const [shed] = await query("insert into public.inventory_locations(user_id,name) values ($1,'TEST ONLY Shed') returning id", [owner]);
    const [stock] = await query("insert into public.inventory_items(user_id,name,category,unit,quantity,location_id,season) values ($1,'TEST ONLY Stock','Chemical','L',12,$2,'2026/2027') returning id", [owner,shed.id]);
    await query("insert into public.farm_seasons(user_id,name) values ($1,'2026/2027')", [owner]);
    await query("insert into public.marketplace_profiles(user_id,business_name,phone) values ($1,'TEST ONLY Farm','0000000000')", [owner]);
    records.set(owner,{shed:shed.id,stock:stock.id});
  }
  await db.exec(`
    grant usage on schema public,auth to authenticated;
    grant select,insert,update,delete on public.inventory_locations,public.inventory_items to authenticated;
    grant select on public.farm_seasons,public.marketplace_profiles to authenticated;
    create policy test_legacy_shed_policy on public.inventory_locations for all to authenticated using(true) with check(true);
    create policy test_legacy_stock_policy on public.inventory_items for all to authenticated using(true) with check(true);
  `);

  for (const [owner, other] of [[farmerA,farmerB],[farmerB,farmerA]]) {
    await signIn(owner);
    for (const table of ['inventory_locations','inventory_items','inventory_location_summary','farm_seasons','marketplace_profiles']) {
      const rows = await query('select distinct user_id from public.'+table+' where user_id in ($1,$2)', [farmerA,farmerB]);
      assert.deepEqual(rows, [{user_id:owner}], table);
    }
    const foreign = records.get(other);
    assert.deepEqual(await query("update public.inventory_items set quantity=0 where id=$1 returning id", [foreign.stock]), []);
    assert.deepEqual(await query('delete from public.inventory_locations where id=$1 returning id', [foreign.shed]), []);
    await assert.rejects(query("insert into public.inventory_locations(user_id,name) values ($1,'Unauthorized Shed')", [other]), /row-level security/);
    await assert.rejects(query("insert into public.inventory_items(user_id,name,category,unit,location_id) values ($1,'Invalid stock','Chemical','L',$2)", [owner,foreign.shed]), /inventory_item_shed_owner_fk/);
    assert.equal((await query("select public.can_access_farmer($1,'inventory',$1) allowed", [other]))[0].allowed,false);
    assert.equal((await query("update public.inventory_items set quantity=13 where id=$1 returning quantity", [records.get(owner).stock])).length,1);
  }
  await assert.rejects(query('select public.claim_first_super_admin()'), /pre-authorized|already/);
  await signIn(employee);
  assert.equal((await query('select count(*)::int total from public.inventory_locations where user_id in ($1,$2)', [farmerA,farmerB]))[0].total,2);
  assert.deepEqual(await query("update public.inventory_items set quantity=0 where id=$1 returning id", [records.get(farmerA).stock]), []);
  await db.exec('reset role; drop policy test_legacy_shed_policy on public.inventory_locations; drop policy test_legacy_stock_policy on public.inventory_items;');
  console.log('PASS separate farmers in one organisation see only their own sheds, stock, summaries, seasons and profiles. Guessed IDs, cross-account writes and administrator bootstrap are denied. Granted staff retain read access.');
}

