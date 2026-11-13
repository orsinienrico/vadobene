-- 0006: prevent direct Supabase anon/authenticated users from bypassing
-- the server's moderation, jury status changes, retention, credit spending
-- and privacy checks. Apply AFTER deploying server-side write support,
-- and BEFORE setting LAUNCH_ENABLED=true.

revoke insert, update, delete on public.requests from anon, authenticated;

drop policy if exists "requests insert own" on public.requests;
drop policy if exists "requests update own" on public.requests;
drop policy if exists "requests delete own" on public.requests;

-- Do NOT revoke INSERT on all of storage.objects: a shared Supabase project
-- may have other buckets. Remove only write policies for the private outfit
-- bucket. Trusted service_role upload and delete bypass its RLS policies.
drop policy if exists "outfits insert own" on storage.objects;
drop policy if exists "outfits delete own" on storage.objects;

-- The "outfits select own" policy is deliberately retained so a legitimate
-- owner may inspect their own upload; juror access uses server-created short
-- signed URLs.
