-- Beta AI usage: atomic server-only quota, reset daily in UTC.
-- This additive migration MUST be applied to the dedicated beta Supabase
-- project and verified before BETA_READY_CONFIRMED can become true.
-- No table is exposed to authenticated/anon clients.

create table if not exists public.beta_ai_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null,
  used integer not null default 0 check (used >= 0),
  primary key (user_id, usage_day)
);

alter table public.beta_ai_daily_usage enable row level security;
revoke all on table public.beta_ai_daily_usage from public, anon, authenticated;

create or replace function public.consume_beta_ai_daily_quota(
  p_user_id uuid, p_daily_limit integer
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_used integer;
begin
  -- No exposed anonymous/authenticated RPC access or user-supplied quotas.
  -- Only a service-role server call may debit the atomic usage ledger.
  if current_user <> 'service_role' then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_user_id is null or p_daily_limit < 1 or p_daily_limit > 10 then
    raise exception 'invalid quota' using errcode = '22023';
  end if;

  insert into public.beta_ai_daily_usage (user_id, usage_day, used)
  values (p_user_id, (now() at time zone 'UTC')::date, 1)
  on conflict (user_id, usage_day) do update
    set used = public.beta_ai_daily_usage.used + 1
    where public.beta_ai_daily_usage.used < p_daily_limit
  returning used into v_used;

  return v_used is not null;
end;
$$;

revoke all on function public.consume_beta_ai_daily_quota(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.consume_beta_ai_daily_quota(uuid, integer) to service_role;
