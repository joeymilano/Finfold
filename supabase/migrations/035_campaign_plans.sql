-- 035_campaign_plans.sql
-- P2-5: 持久化本周内容计划，支持"执行今天"与完成态追踪。
-- buildCampaignPlan 生成的计划原本只在前端内存里，刷新即丢；这里落库让
-- 计划在一周内稳定可见，并可逐天标记完成。

create table if not exists public.campaign_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 整个 CampaignPlan JSON（含 days[].rationale）。
  plan jsonb not null,
  -- 已标记完成的 day 序号，如 [1,3]。前端逐天 toggle。
  completed_days jsonb not null default '[]'::jsonb,
  week_start date not null default date_trunc('week', now())::date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 一个用户每周只有一条活跃计划。
  unique (user_id, week_start)
);

-- RLS: 用户只能读写自己的计划。
alter table public.campaign_plans enable row level security;

drop policy if exists "users select own campaign plans" on public.campaign_plans;
create policy "users select own campaign plans"
  on public.campaign_plans for select
  using (auth.uid() = user_id);

drop policy if exists "users insert own campaign plans" on public.campaign_plans;
create policy "users insert own campaign plans"
  on public.campaign_plans for insert
  with check (auth.uid() = user_id);

drop policy if exists "users update own campaign plans" on public.campaign_plans;
create policy "users update own campaign plans"
  on public.campaign_plans for update
  using (auth.uid() = user_id);

-- 方便按用户查最近一条。
create index if not exists idx_campaign_plans_user_week
  on public.campaign_plans (user_id, week_start desc);
