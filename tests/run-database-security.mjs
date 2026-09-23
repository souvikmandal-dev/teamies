// Uses a disposable local PostgreSQL cluster. Never connects to remote Supabase.
// Install test tooling outside the repo; see SECURITY_REVIEW.md.
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const toolRoot = process.env.TEAMIES_TEST_TOOLS;
if (!toolRoot) throw new Error('Set TEAMIES_TEST_TOOLS to the temporary tooling install directory.');
const { default: EmbeddedPostgres } = await import(pathToFileURL(join(toolRoot, 'node_modules/embedded-postgres/dist/index.js')));
const cluster = new EmbeddedPostgres({
  databaseDir: await mkdtemp(join(tmpdir(), 'teamies-security-pg-')),
  user: 'postgres', password: randomUUID(), port: 55439, persistent: false,
  postgresFlags: ['-c', 'listen_addresses=127.0.0.1', '-c', 'unix_socket_directories=/tmp'],
  onLog: () => {}, onError: () => {},
});
let db;
try {
  await cluster.initialise(); await cluster.start();
  db = cluster.getPgClient('postgres', '127.0.0.1'); await db.connect();
  await db.query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;`);
  for (const f of (await readdir('supabase/migrations')).sort()) {
    await db.query(await readFile(join('supabase/migrations', f), 'utf8'));
    console.log('PASS migration', f);
  }
  await db.query(await readFile('tests/security.sql', 'utf8'));
  console.log('PASS RLS, authorization, validation, replay, rate, deletion and privacy attacks');

  async function asUser(user, sql, args = []) {
    const c = cluster.getPgClient('postgres', '127.0.0.1'); await c.connect();
    try {
      await c.query('SET ROLE authenticated');
      await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);
      return await c.query(sql,args);
    } finally { await c.end(); }
  }
  async function fixtures({ team = 3, positions = 1, separateRoles = false } = {}) {
    const owner=randomUUID(), a=randomUUID(), b=randomUUID(), project=randomUUID(), role=randomUUID(), other=randomUUID(), ra=randomUUID(), rb=randomUUID();
    await db.query('INSERT INTO auth.users(id) VALUES ($1),($2),($3)', [owner,a,b]);
    await asUser(owner, `INSERT INTO public.projects(id,owner_id,name,slug,short_description,category,project_type,max_team_size)
      VALUES ($1,$2,'Race project',$3,'Race test description','Software','startup',$4)`,[project,owner,project,team]);
    await asUser(owner, `INSERT INTO public.project_roles(id,project_id,title,positions) VALUES ($1,$2,'Engineer',$3),($4,$2,'Designer',1)`,[role,project,positions,other]);
    await asUser(a, 'INSERT INTO public.join_requests(id,project_id,applicant_id,project_role_id) VALUES ($1,$2,$3,$4)', [ra,project,a,role]);
    await asUser(b, 'INSERT INTO public.join_requests(id,project_id,applicant_id,project_role_id) VALUES ($1,$2,$3,$4)', [rb,project,b,separateRoles?other:role]);
    return {owner,a,b,project,role,other,ra,rb};
  }
  const accept = (f,id) => asUser(f.owner, "UPDATE public.join_requests SET status='accepted' WHERE id=$1",[id]);
  for (const [label,options] of [['final role seat',{}],['final project seat',{team:2,separateRoles:true}]]) {
    const f=await fixtures(options);
    const results=await Promise.allSettled([accept(f,f.ra),accept(f,f.rb)]);
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1,label);
    const {rows}=await db.query("SELECT count(*)::integer AS n FROM public.project_members WHERE project_id=$1 AND membership_status='active'",[f.project]);
    assert.equal(rows[0].n,1,label); console.log('PASS concurrent',label);
  }
  const f=await fixtures({positions:2});
  await accept(f,f.ra);
  await Promise.allSettled([accept(f,f.rb),asUser(f.owner,'UPDATE public.project_roles SET positions=1 WHERE id=$1',[f.role])]);
  const {rows: roleRows}=await db.query(`SELECT r.positions, count(m.id)::integer n FROM public.project_roles r
    LEFT JOIN public.project_members m ON m.project_role_id=r.id AND m.membership_status='active' WHERE r.id=$1 GROUP BY r.id`,[f.role]);
  assert.ok(roleRows[0].n<=roleRows[0].positions); console.log('PASS concurrent role reduction vs acceptance');
  const g=await fixtures({team:3,positions:2});
  await accept(g,g.ra);
  await Promise.allSettled([accept(g,g.rb),asUser(g.owner,'UPDATE public.projects SET max_team_size=2 WHERE id=$1',[g.project])]);
  const {rows: teamRows}=await db.query(`SELECT p.max_team_size, count(m.id)::integer n FROM public.projects p
    LEFT JOIN public.project_members m ON m.project_id=p.id AND m.membership_status='active' WHERE p.id=$1 GROUP BY p.id`,[g.project]);
  assert.ok(teamRows[0].n+1<=teamRows[0].max_team_size); console.log('PASS concurrent team reduction vs acceptance');
  const h=await fixtures({separateRoles:true}); await accept(h,h.ra);
  const {rows: members}=await db.query('SELECT id FROM public.project_members WHERE project_id=$1',[h.project]);
  await Promise.allSettled([accept(h,h.rb), asUser(h.owner,'SELECT public.change_project_member_role($1,$2,$3)',[h.project,members[0].id,h.other])]);
  const {rows: counts}=await db.query("SELECT count(*)::integer n FROM public.project_members WHERE project_role_id=$1 AND membership_status='active'",[h.other]);
  assert.equal(counts[0].n,1); console.log('PASS concurrent transfer vs acceptance');
  const user=randomUUID(); await db.query('INSERT INTO auth.users(id) VALUES ($1)',[user]);
  const updates=await Promise.allSettled(Array.from({length:21},()=>asUser(user,"UPDATE public.profiles SET bio='rate race' WHERE id=auth.uid()")));
  assert.equal(updates.filter(x=>x.status==='fulfilled').length,20); console.log('PASS concurrent mutation rate limit');
} finally {
  if (db) await db.end();
  await cluster.stop();
}
