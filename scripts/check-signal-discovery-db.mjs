// Run against an isolated PostgreSQL WASM instance; never touches Supabase.
// SIGNAL_SQL_RUNTIME can point to a temporary @electric-sql/pglite installation.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.SIGNAL_SQL_RUNTIME || '@electric-sql/pglite');
const db = new PGlite();
let checks = 0;
const check = (condition, name) => { assert.ok(condition, name); checks++; console.log(`PASS ${name}`); };
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
    CREATE TABLE public.operating_programs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users(id),status text,UNIQUE(id,user_id));
    CREATE TABLE public.topic_opportunities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, state text DEFAULT 'active', feedback text, feedback_at timestamptz, updated_at timestamptz);
    CREATE TABLE public.trend_signals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source text,CONSTRAINT trend_signals_source_check CHECK(source IN ('rss')));`);
  for (const migration of ['044_credits_ledger.sql','095_public_demand_signal_queue.sql','102_llm_monthly_budget.sql','103_signal_discovery.sql','109_signal_discovery_credits.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
  }
  check(true, 'new migration executes against existing credits, demand and budget contracts');
  const users = await query(`INSERT INTO auth.users SELECT gen_random_uuid() FROM generate_series(1,8) RETURNING id`);
  // Users 0-6 hold a 1000-credit grant batch; user 7 has an empty balance.
  await query(`INSERT INTO credit_balances(user_id,source,granted) SELECT id,'grant',1000 FROM auth.users WHERE id<>$1`, [users[7].id]);
  const createJob = async (user, window = new Date().toISOString()) => (await query(`INSERT INTO signal_discovery_jobs(user_id,profile_version,window_start,trigger_kind) VALUES($1,'v1',$2,'manual') RETURNING *`, [user, window]))[0];
  const claim = async () => (await query('SELECT * FROM claim_signal_discovery_job()'))[0];
  const reserve = async (job, kind = 'search', amount = kind === 'search' ? 1 : 2) => (await query('SELECT reserve_signal_discovery_call($1,$2,$3,$4,$5) AS allowed',
    [job.id, job.lease_token, kind, kind === 'search' ? 'signalDiscoverySearch' : 'signalDiscoveryAnalysis', amount]))[0].allowed;
  const spentCredits = async (user) => (await query(`SELECT COALESCE(SUM(-delta),0) AS spent FROM credit_transactions WHERE user_id=$1 AND source='agent'`, [user]))[0].spent;
  const overload = (await query(`
    SELECT count(*) OVER () AS overloads,
      (SELECT string_agg(format_type(u.t, null), ',' ORDER BY u.ord) FROM unnest(p.proargtypes) WITH ORDINALITY AS u(t, ord)) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='reserve_signal_discovery_call'`));
  check(overload.length === 1 && Number(overload[0].overloads) === 1 && overload[0].args === 'uuid,uuid,text,text,integer', 'the numeric-budget overload is fully replaced by the Credits signature');
  const first = await createJob(users[0].id);
  await assert.rejects(() => createJob(users[0].id, '2026-01-01'), /signal_discovery_one_active/);
  check(true, 'only one active job per tenant');
  let job = await claim();
  check(job.id === first.id && job.lease_token && job.status === 'running', 'claim assigns a lease');
  check(!await claim(), 'running job cannot be claimed twice');
  check(!await reserve({ ...job, lease_token: users[1].id }), 'wrong lease cannot spend quota');
  const attempts = await Promise.all(Array.from({length:12}, () => reserve(job)));
  check(attempts.filter(Boolean).length === 8, 'a burst of attempts stops at eight search calls');
  check((await query('SELECT search_calls FROM signal_discovery_daily_usage WHERE user_id=$1',[job.user_id]))[0].search_calls === 8, 'denied attempts do not increment daily usage');
  check(await spentCredits(job.user_id) === 8, 'each granted search call charges exactly one Credit');
  check(await reserve(job, 'analysis'), 'analysis allowance is separate from search allowance');
  const analysisBurst = await Promise.all(Array.from({length:12},()=>reserve(job,'analysis')));
  check(analysisBurst.filter(Boolean).length===11, 'planning plus assessments still stop at twelve total model calls');
  check((await query('SELECT analysis_calls FROM signal_discovery_jobs WHERE id=$1',[job.id]))[0].analysis_calls===12, 'denied thirteenth model call never increments usage');
  check(await spentCredits(job.user_id) === 32, 'the capped run billed 8 search plus 12 analysis Credits and nothing more');
  await query(`UPDATE signal_discovery_jobs SET status='completed' WHERE id=$1`, [job.id]);
  for (let n=1;n<=3;n++) {
    await createJob(users[0].id, `2026-01-0${n}`); job=await claim();
    const outcomes=await Promise.all(Array.from({length:8},()=>reserve(job)));
    check(outcomes.filter(Boolean).length === (n<3 ? 8 : 0), `daily cap remains shared across run ${n+1}`);
    await query(`UPDATE signal_discovery_jobs SET status='completed' WHERE id=$1`,[job.id]);
  }
  await createJob(users[1].id);job=await claim();
  check(await reserve(job), 'one tenant exhausting daily quota does not exhaust another tenant');
  const broke = await createJob(users[7].id); const brokeJob = await claim();
  check(brokeJob.id === broke.id, 'the empty-balance tenant is claimable');
  check(!await reserve(brokeJob), 'an empty Credits balance denies the call');
  check((await query('SELECT search_calls FROM signal_discovery_jobs WHERE id=$1',[brokeJob.id]))[0].search_calls === 0, 'a denied charge never burns quota counters');
  check(await spentCredits(users[7].id) === 0, 'a denied charge writes no Credit transaction');
  check(!await reserve(brokeJob, 'search', 0), 'a non-positive amount is rejected');
  await query(`UPDATE signal_discovery_jobs SET lease_until=now()-interval '1 second' WHERE id=$1`,[brokeJob.id]);
  check(!await reserve(brokeJob), 'expired lease cannot dispatch a paid request');
  await claim();
  let recovered=(await query(`SELECT status,retry_count,lease_token FROM signal_discovery_jobs WHERE id=$1`,[brokeJob.id]))[0];
  check(recovered.status==='queued' && recovered.retry_count===1 && recovered.lease_token===null, 'expired work returns to the queue with retry tracking');
  await query(`UPDATE signal_discovery_jobs SET status='running',retry_count=2,lease_until=now()-interval '1 second' WHERE id=$1`,[brokeJob.id]);
  await claim();
  check((await query(`SELECT status FROM signal_discovery_jobs WHERE id=$1`,[brokeJob.id]))[0].status==='failed', 'repeated expired work becomes terminal');
  await createJob(users[2].id);job=await claim();
  for(let n=0;n<11;n++) assert.ok(await reserve(job,'analysis'));
  await query(`UPDATE signal_discovery_jobs SET status='partial',lease_token=NULL,lease_until=NULL,state='{"readCount":11}' WHERE id=$1`,[job.id]);
  await query(`UPDATE signal_discovery_jobs SET status='queued',due_at=now() WHERE id=$1`,[job.id]);job=await claim();
  check(job.analysis_calls===11 && job.state.readCount===11, 'continuing a partial run preserves existing read and analysis counters');
  check(await reserve(job,'analysis') && !await reserve(job,'analysis'), 'continuation may use only the remaining twelfth model slot');
  await query(`UPDATE signal_discovery_jobs SET status='completed' WHERE id=$1`,[job.id]);
  await db.exec(`INSERT INTO operating_programs(user_id,status) SELECT id,'active' FROM auth.users`);
  const dueA=await query('SELECT * FROM due_signal_discovery_users()');
  const dueB=await query('SELECT * FROM due_signal_discovery_users()');
  check(dueA.length===5 && dueB.length===3 && new Set([...dueA,...dueB].map(r=>r.user_id)).size===8, 'scheduled batches rotate without repeatedly selecting the first accounts');
  const opportunity=(await query('INSERT INTO topic_opportunities(user_id) VALUES($1) RETURNING id',[users[0].id]))[0];
  const demand=(await query(`INSERT INTO public_demand_signals(user_id,source,source_item_id,title,discussion_url,first_seen_at,last_seen_at)
    VALUES($1,'business-discovery',$2,'Original request','https://example.com/request',now(),now()) RETURNING id`,[users[0].id,opportunity.id]))[0];
  await query(`UPDATE topic_opportunities SET state='dismissed',feedback='not_relevant' WHERE id=$1`,[opportunity.id]);
  check((await query('SELECT status FROM public_demand_signals WHERE id=$1',[demand.id]))[0].status==='dismissed', 'radar dismissal propagates to the demand queue');
  await query(`UPDATE public_demand_signals SET status='new',reviewed_at=NULL,title='Refetched request' WHERE id=$1`,[demand.id]);
  check((await query('SELECT status FROM public_demand_signals WHERE id=$1',[demand.id]))[0].status==='dismissed', 're-ingestion cannot reactivate a dismissed opportunity');
  await query(`UPDATE topic_opportunities SET state='active',feedback=NULL WHERE id=$1`,[opportunity.id]);
  await query(`UPDATE public_demand_signals SET status='dismissed',reviewed_at=now() WHERE id=$1`,[demand.id]);
  check((await query('SELECT state FROM topic_opportunities WHERE id=$1',[opportunity.id]))[0].state==='dismissed', 'demand dismissal propagates to the radar');
  await db.exec('SET ROLE authenticated');
  await assert.rejects(()=>query('SELECT * FROM signal_discovery_jobs'),/permission denied/);
  await assert.rejects(()=>query('SELECT * FROM claim_signal_discovery_job()'),/permission denied/);
  await db.exec('RESET ROLE');
  check(true, 'browser role cannot inspect other tenants or claim internal work');
  console.log(`${checks} isolated database checks passed.`);
} finally { await db.close(); }
