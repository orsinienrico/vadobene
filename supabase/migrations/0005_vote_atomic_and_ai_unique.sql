-- 0005: correct AI-vote uniqueness and make voting/crediting transactional.
-- Apply after 0001, 0002, 0003, 0004, before enabling live users.
--
-- Prior 0003 created UNIQUE NULLS NOT DISTINCT (request_id, juror_id),
-- which incorrectly prevented the second AI fill vote (juror_id = NULL).
-- A partial unique index enforces one vote per HUMAN juror per request
-- while allowing multiple anonymous AI fill votes.

alter table public.votes
  drop constraint if exists votes_request_id_juror_id_unique;
alter table public.votes
  drop constraint if exists votes_request_id_juror_id_key;

create unique index if not exists votes_unique_human_juror
  on public.votes (request_id, juror_id)
  where juror_id is not null;

-- Do not permit clients to bypass the server-side vote award transaction by
-- inserting directly through the Supabase anon/authenticated API.
revoke insert on public.votes from anon, authenticated;

create or replace function public.record_jury_vote(
  p_request_id uuid,
  p_juror_id uuid,
  p_verdict text,
  p_note text,
  p_note_status text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_status text;
  v_deadline timestamptz;
  v_target integer;
  v_votes integer;
  v_credit integer;
begin
  if p_request_id is null or p_juror_id is null
     or p_verdict not in ('yes', 'tweak', 'no')
     or p_note_status not in ('ok', 'filtered')
     or p_verdict is null or p_note_status is null
     or length(coalesce(p_note, '')) > 280
     or (p_note_status = 'filtered' and p_note is not null)
  then
    raise exception 'Invalid vote' using errcode = '22023';
  end if;

  -- Serialize with claim_jury_close, which changes the SAME requests row.
  -- Lock and check status/deadline INSIDE the transaction, not in the API.
  select user_id, status, jury_deadline_at, votes_target
    into v_owner, v_status, v_deadline, v_target
    from public.requests
    where id = p_request_id
    for update;

  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if v_owner = p_juror_id then
    raise exception 'Self vote forbidden' using errcode = '42501';
  end if;
  if v_status <> 'jury_open' or v_deadline is null or v_deadline <= now() then
    raise exception 'Jury closed' using errcode = 'P0001';
  end if;

  select count(*) into v_votes
    from public.votes
    where request_id = p_request_id and is_ai = false;
  if v_votes >= coalesce(v_target, 5) then
    raise exception 'Jury full' using errcode = 'P0001';
  end if;

  insert into public.users (id) values (p_juror_id)
    on conflict (id) do nothing;
  insert into public.votes(request_id, juror_id, verdict, note, note_status, is_ai)
    values (p_request_id, p_juror_id, p_verdict, p_note, p_note_status, false);

  update public.users
     set jury_credit = jury_credit + 1,
         juror_score = juror_score + 1
   where id = p_juror_id
   returning jury_credit into v_credit;
  if not found then
    raise exception 'Juror profile not found' using errcode = 'P0002';
  end if;

  return v_credit;
end;
$$;

revoke execute on function public.record_jury_vote(uuid, uuid, text, text, text)
from public, anon, authenticated;
grant execute on function public.record_jury_vote(uuid, uuid, text, text, text)
to service_role;
