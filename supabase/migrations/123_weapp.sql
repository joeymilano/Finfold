-- Finfold WeApp（微信小程序「增长搭子」）— Supabase migration 123
-- 在 Supabase Dashboard → SQL Editor 整段执行即可（语句可重入，重复执行安全）。
-- 作用：小程序 openid 身份、Bearer 会话、成稿任务表，以及注册赠额 RPC。

create extension if not exists pgcrypto;

-- ============ 身份表：openid → finfold 用户（自动开户） ============
create table if not exists public.weapp_identities (
  id           uuid primary key default gen_random_uuid(),
  openid       text not null unique,
  unionid      text,
  user_id      uuid not null references auth.users(id) on delete cascade,
  nickname     text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz
);
create index if not exists idx_weapp_identities_user
  on public.weapp_identities(user_id);

-- ============ 会话表：不透明 token，只存 SHA-256 哈希 ============
create table if not exists public.weapp_tokens (
  id           uuid primary key default gen_random_uuid(),
  identity_id  uuid not null references public.weapp_identities(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  token_hash   text not null unique,
  issued_at    timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index if not exists idx_weapp_tokens_user
  on public.weapp_tokens(user_id);

-- ============ 成稿表：机会/自由选题 → 单平台草稿 ============
create table if not exists public.weapp_drafts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  source          text not null check (source in ('opportunity','free')),
  opportunity_id  text,
  topic           jsonb not null,        -- {title, fact, angle?, keywords[]}
  platform        text not null check (platform in ('wechat','xiaohongshu','moments')),
  status          text not null default 'pending'
                  check (status in ('pending','ready','failed')),
  content         text,
  error           text,
  credits_charged integer not null default 0,
  created_at      timestamptz not null default now(),
  finished_at     timestamptz
);
create index if not exists idx_weapp_drafts_user
  on public.weapp_drafts(user_id, created_at desc);

-- ============ RLS：三张表只允许 service role 访问（无策略 = 全拒绝） ============
alter table public.weapp_identities enable row level security;
alter table public.weapp_tokens enable row level security;
alter table public.weapp_drafts enable row level security;

-- ============ 注册赠额：幂等发放 200 credits（period_key 作标记位） ============
create unique index if not exists idx_credit_balances_weapp_signup
  on public.credit_balances(user_id)
  where source = 'grant' and period_key = 'weapp-signup';

create or replace function public.grant_weapp_signup_credits(
  p_user_id uuid,
  p_amount  integer default 200
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_granted integer;
begin
  insert into public.credit_balances (user_id, source, period_key, granted)
  values (p_user_id, 'grant', 'weapp-signup', p_amount)
  on conflict (user_id) where source = 'grant' and period_key = 'weapp-signup'
    do nothing
  returning granted into v_granted;

  if v_granted is not null then
    insert into public.credit_transactions (user_id, delta, action, source, detail)
    values (p_user_id, p_amount, 'grant', 'system',
            jsonb_build_object('note', '微信小程序注册赠礼'));
  end if;

  return coalesce(v_granted, 0);
end;
$$;

-- 前端/API 读取会话与画像：全部走 service role（API route 内），无需额外策略。
