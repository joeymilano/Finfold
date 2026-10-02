-- Finfold Local Bridge — Supabase migration 122
-- 在 Supabase Dashboard → SQL Editor 整段执行即可(语句可重入,重复执行安全)。
-- 作用:本地设备(Finfold Local.app)与云端的任务下发/回传队列。

create extension if not exists pgcrypto;

-- ============ 设备表 ============
create table if not exists public.local_devices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  device_name text not null default '我的设备',
  device_key  text not null unique,              -- 48 hex,仅创建时返回一次
  capabilities jsonb not null default '{}'::jsonb,
  version     text,
  last_seen   timestamptz,
  created_at  timestamptz not null default now()
);

-- ============ 任务表 ============
create table if not exists public.local_tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  device_id   uuid references public.local_devices(id) on delete cascade,
  type        text not null check (type in ('collect','radar')),
  payload     jsonb not null,
  status      text not null default 'pending'
              check (status in ('pending','claimed','done','failed')),
  result      jsonb,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  finished_at timestamptz
);
create index if not exists idx_local_tasks_pull
  on public.local_tasks (device_id, status, created_at);
create index if not exists idx_local_tasks_user
  on public.local_tasks (user_id, created_at desc);

-- ============ RLS:用户只能访问自己的行;Edge Function 走 service role 不受限 ============
alter table public.local_devices enable row level security;
alter table public.local_tasks  enable row level security;

drop policy if exists "own devices all" on public.local_devices;
create policy "own devices all" on public.local_devices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own tasks all" on public.local_tasks;
create policy "own tasks all" on public.local_tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ RPC:注册设备(SaaS 前端按钮调用,device_key 只返回这一次) ============
create or replace function public.create_local_device(p_name text default '我的 Mac')
returns table(id uuid, device_name text, device_key text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  v_key := encode(gen_random_bytes(24), 'hex');
  insert into public.local_devices (user_id, device_name, device_key)
  values (v_uid, coalesce(nullif(trim(p_name), ''), '我的设备'), v_key)
  returning local_devices.id into v_id;

  return query
    select v_id,
           coalesce(nullif(trim(p_name), ''), '我的设备'),
           v_key,
           now();
end;
$$;

-- ============ RPC:下发任务(SaaS 前端调用;设备归属校验在此) ============
create or replace function public.create_local_task(
  p_device_id uuid,
  p_type      text,
  p_payload   jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_type not in ('collect', 'radar') then
    raise exception 'type must be collect or radar';
  end if;
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload must be a json object';
  end if;
  if not exists (
    select 1 from public.local_devices
    where id = p_device_id and user_id = v_uid
  ) then
    raise exception 'device not found for this user';
  end if;

  insert into public.local_tasks (user_id, device_id, type, payload)
  values (v_uid, p_device_id, p_type, p_payload)
  returning local_tasks.id into v_id;

  return v_id;
end;
$$;

-- 前端查看任务结果:直接 select local_tasks(RLS 已限制仅本人),无需额外 RPC。
