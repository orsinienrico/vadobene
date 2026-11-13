-- 0007: remove recursive RLS dependency between requests and votes.
--
-- Migration 0001 has:
--   requests SELECT policy -> EXISTS / NOT EXISTS (SELECT votes...)
--   votes SELECT policy -> EXISTS (SELECT requests...)
-- This policy cycle can produce PostgreSQL 42P17 infinite recursion.
-- Read-only helper is SECURITY DEFINER and queries only the current JWT user's
-- vote, never accepts an arbitrary juror id. It bypasses votes RLS only within
-- this constrained existence check.
create or replace function public.current_user_has_voted(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.votes v
    where v.request_id = p_request_id
      and v.juror_id = auth.uid()
      and v.is_ai = false
  );
$$;

revoke execute on function public.current_user_has_voted(uuid)
  from public;
grant execute on function public.current_user_has_voted(uuid)
  to anon, authenticated;

drop policy if exists "requests select jurors voted" on public.requests;
create policy "requests select jurors voted" on public.requests
  for select
  using (
    auth.uid() is not null
    and public.current_user_has_voted(id)
  );

drop policy if exists "requests select open jury" on public.requests;
create policy "requests select open jury" on public.requests
  for select
  using (
    auth.uid() is not null
    and status = 'jury_open'
    and not public.current_user_has_voted(id)
  );
