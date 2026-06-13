-- ============================================================
-- Finfold / Finfold — Supabase Schema
-- Paste into: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- ── 1. profiles ─────────────────────────────────────────────
create table if not exists public.profiles (
  id             uuid        primary key references auth.users(id) on delete cascade,
  email          text,
  plan           text        not null default 'free'
                             check (plan in ('free','starter','creator','pro','team')),
  monthly_limit  integer     not null default 3,
  locale         text        not null default 'zh' check (locale in ('zh','en')),
  creem_subscription_id text,
  subscription_status   text default 'active',
  renewed_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── 2. content_kits ─────────────────────────────────────────
create table if not exists public.content_kits (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  idea_text    text        not null,
  goal         text        not null,
  persona      text        not null,
  platforms    text[]      not null default '{}',
  media_assets jsonb       not null default '[]',
  status       text        not null default 'saved'
                           check (status in ('preview','saved','published','analyzed')),
  created_at   timestamptz not null default now()
);

-- ── 3. kit_outputs ──────────────────────────────────────────
create table if not exists public.kit_outputs (
  id             uuid        primary key default gen_random_uuid(),
  kit_id         uuid        not null references public.content_kits(id) on delete cascade,
  user_id        uuid        not null references auth.users(id) on delete cascade,
  platform       text        not null,
  title          text        not null default '',
  body           text        not null default '',
  cta            text        not null default '',
  notes          text        not null default '',
  strategy       text        not null default '',
  locked         boolean     not null default false,
  publish_status text        not null default 'draft'
                             check (publish_status in ('draft','planned','posted','measured','iterated')),
  created_at     timestamptz not null default now()
);

-- ── 4. usage_events ─────────────────────────────────────────
create table if not exists public.usage_events (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  event_name text        not null,
  metadata   jsonb       not null default '{}',
  created_at timestamptz not null default now()
);

-- ── 5. subscriptions ─────────────────────────────────────────
create table if not exists public.subscriptions (
  id                       uuid        primary key default gen_random_uuid(),
  user_id                  uuid        not null references auth.users(id) on delete cascade,
  payment_provider         text        not null default 'creem',
  provider_customer_id     text,
  provider_subscription_id text        unique,
  stripe_customer_id       text,       -- legacy column, kept for migration
  stripe_subscription_id   text,       -- legacy column, kept for migration
  status                   text        not null default 'incomplete',
  current_period_end       timestamptz,
  cancel_at                timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ── 6. performance_metrics ──────────────────────────────────
create table if not exists public.performance_metrics (
  id           uuid        primary key default gen_random_uuid(),
  kit_id       uuid        not null references public.content_kits(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  platform     text        not null,
  impressions  integer     not null default 0,
  clicks       integer     not null default 0,
  likes        integer     not null default 0,
  comments     integer     not null default 0,
  saves        integer     not null default 0,
  shares       integer     not null default 0,
  leads        integer     not null default 0,
  signups      integer     not null default 0,
  revenue      numeric     not null default 0,
  published_url text,
  measured_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (kit_id, platform)
);

-- ── 7. brand_brains ──────────────────────────────────────────
create table if not exists public.brand_brains (
  user_id                uuid        primary key references auth.users(id) on delete cascade,
  brand_name             text        not null default '',
  product_description    text        not null default '',
  target_audience        text        not null default '',
  tone_keywords          text[]      not null default '{}',
  banned_phrases         text[]      not null default '{}',
  approved_examples      text[]      not null default '{}',
  competitors            text[]      not null default '{}',
  positioning_statement  text        not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ── 8. Indexes ───────────────────────────────────────────────
create index if not exists idx_content_kits_user_created
  on public.content_kits(user_id, created_at desc);
create index if not exists idx_kit_outputs_kit_id
  on public.kit_outputs(kit_id);
create index if not exists idx_kit_outputs_user_id
  on public.kit_outputs(user_id);
create index if not exists idx_usage_events_user_created
  on public.usage_events(user_id, created_at desc);
create index if not exists idx_subscriptions_user_id
  on public.subscriptions(user_id);
create unique index if not exists idx_subscriptions_user_provider
  on public.subscriptions(user_id, payment_provider);
create index if not exists idx_subscriptions_provider_customer
  on public.subscriptions(payment_provider, provider_customer_id);
create index if not exists idx_performance_metrics_kit_id
  on public.performance_metrics(kit_id);

-- ── 9. Enable RLS on all tables ──────────────────────────────
alter table public.profiles            enable row level security;
alter table public.content_kits        enable row level security;
alter table public.kit_outputs         enable row level security;
alter table public.usage_events        enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.performance_metrics enable row level security;
alter table public.brand_brains        enable row level security;

-- ── 10. RLS Policies (full CRUD, own data only) ──────────────
-- profiles
create policy "profiles: select own"  on public.profiles for select  using (auth.uid() = id);
create policy "profiles: insert own"  on public.profiles for insert  with check (auth.uid() = id);
create policy "profiles: update own"  on public.profiles for update  using (auth.uid() = id);
create policy "profiles: delete own"  on public.profiles for delete  using (auth.uid() = id);

-- content_kits
create policy "kits: select own"  on public.content_kits for select  using (auth.uid() = user_id);
create policy "kits: insert own"  on public.content_kits for insert  with check (auth.uid() = user_id);
create policy "kits: update own"  on public.content_kits for update  using (auth.uid() = user_id);
create policy "kits: delete own"  on public.content_kits for delete  using (auth.uid() = user_id);

-- kit_outputs
create policy "outputs: select own"  on public.kit_outputs for select  using (auth.uid() = user_id);
create policy "outputs: insert own"  on public.kit_outputs for insert  with check (auth.uid() = user_id);
create policy "outputs: update own"  on public.kit_outputs for update  using (auth.uid() = user_id);
create policy "outputs: delete own"  on public.kit_outputs for delete  using (auth.uid() = user_id);

-- usage_events (insert only from service role; users can read own)
create policy "events: select own"  on public.usage_events for select  using (auth.uid() = user_id);
create policy "events: insert own"  on public.usage_events for insert  with check (auth.uid() = user_id);

-- subscriptions
create policy "subs: select own"  on public.subscriptions for select  using (auth.uid() = user_id);

-- performance_metrics
create policy "perf: select own"  on public.performance_metrics for select  using (auth.uid() = user_id);
create policy "perf: insert own"  on public.performance_metrics for insert  with check (auth.uid() = user_id);
create policy "perf: update own"  on public.performance_metrics for update  using (auth.uid() = user_id);

-- brand_brains
create policy "brand brains: select own" on public.brand_brains for select using (auth.uid() = user_id);
create policy "brand brains: insert own" on public.brand_brains for insert with check (auth.uid() = user_id);
create policy "brand brains: update own" on public.brand_brains for update using (auth.uid() = user_id);

-- ── 11. Auto-create profile on signup ────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
