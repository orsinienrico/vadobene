-- 0008: least-privilege API grants for new Supabase projects (2026).
-- Access to the Data API must be explicit even when RLS is enabled.
-- Every client-accessible public table retains RLS; privileged writes use
-- service_role server-side only.
--
-- The jury queue and voting routes now use the authenticated server to read
-- candidates. Browser clients must NEVER see all jury request metadata,
-- including user_id, photo_path, and raw ai_verdict.

drop policy if exists "requests select open jury" on public.requests;
drop policy if exists "requests select jurors voted" on public.requests;

-- The RLS helper introduced by 0007 no longer has callers; it was a
-- SECURITY DEFINER function in an exposed schema.
drop function if exists public.current_user_has_voted(uuid);

-- Explicitly revoke inherited/default client privileges before regranting.
revoke all privileges on table public.users from PUBLIC, anon, authenticated;
revoke all privileges on table public.requests from PUBLIC, anon, authenticated;
revoke all privileges on table public.votes from PUBLIC, anon, authenticated;
revoke all privileges on table public.reports from PUBLIC, anon, authenticated;
revoke all privileges on table public.occasions from PUBLIC, anon, authenticated;
revoke all privileges on table public.processed_events from PUBLIC, anon, authenticated;

-- Required for Data API access; RLS is the row-level enforcement layer.
grant usage on schema public to anon, authenticated;
grant select on table public.occasions to anon, authenticated;
grant select on table public.users to authenticated;
grant select on table public.requests to authenticated;
grant select on table public.votes to authenticated;
grant select, insert on table public.reports to authenticated;

-- Trigger function need not be directly invokable by API clients.
revoke execute on function public.check_no_self_vote() from PUBLIC, anon, authenticated;
