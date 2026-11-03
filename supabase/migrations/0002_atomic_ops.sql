-- vado bene? — operazioni atomiche e privilegi server-side (review 2026-09-26)
--
-- 1. users (P0-2): la policy "users update own" senza restrizione di colonna
--    permetteva update({plan:'pro', jury_credit:999999}) con la sola anon key.
--    Un grep su src/components/ e src/lib/supabase/client.ts conferma che NESSUN
--    codice client fa .from('users').update(...); l'unica scrittura client è
--    l'upsert di /api/verdict (.upsert({ id }) col client autenticato). Quindi:
--    DROP della policy libera + REVOKE UPDATE di tabella + grant colonna-specifico
--    su `id` (l'upsert PostgREST genera INSERT ... ON CONFLICT (id) DO UPDATE
--    SET id = excluded.id, che richiede UPDATE(id) a livello di grant anche in
--    assenza di conflitto). plan, jury_credit, juror_score, can_comment non sono
--    più scrivibili dal client: il server usa service_role, che bypassa.
-- 2. processed_events (P0-5): ledger idempotenza webhook Stripe. RLS attivo,
--    nessuna policy = solo service_role (bypassa RLS) può leggere/scrivere.
-- 3. RPC atomiche security definer (P1 race): spend_jury_credit / award_jury_credit
--    / bump_juror_score / claim_jury_close. EXECUTE revocato a public, anon e
--    authenticated e concesso solo a service_role: toccano credito e stato giurì
--    e devono essere raggiungibili solo da route handler server-side, mai dal
--    client (altrimenti un utente autenticato chiamerebbe award_jury_credit su
--    se stesso con un importo arbitrario).
-- 4. votes (P1 TOCTOU): anti self-vote anche a livello DB. Un CHECK non può
--    referenziare altre tabelle/righe (il requester è requests.user_id via join),
--    quindi l'invariante è un trigger BEFORE INSERT security definer + validazione
--    dei dati esistenti: se esistono self-vote, la migration fallisce e i dati
--    vanno ripuliti prima di rilanciarla.

-- ── 1. users: revoca scritture client (P0-2) ───────────────────────────
drop policy if exists "users update own" on public.users;
revoke update on public.users from authenticated;
revoke update on public.users from anon;

-- Colonna id: solo il proprio id, solo sulla propria riga. Serve all'upsert di
-- /api/verdict (ON CONFLICT (id) DO UPDATE SET id = excluded.id). Nessun'altra
-- colonna resta scrivibile via client.
grant update (id) on public.users to authenticated;
create policy "users update own id" on public.users
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- ── 2. ledger idempotenza webhook Stripe (P0-5) ────────────────────────
create table if not exists processed_events (
  id text primary key,
  created_at timestamptz not null default now()
);
alter table processed_events enable row level security;
-- RLS attivo, nessuna policy: solo service_role (bypassa RLS) accede.

-- ── 3. RPC atomiche (P1 race) ──────────────────────────────────────────

-- Scala il costo del giurì in una sola istruzione transazionale: il WHERE
-- jury_credit >= p_cost rende impossibile il credito negativo anche sotto
-- concorrenza. Ritorna true se il debito è avvenuto, false altrimenti.
create or replace function public.spend_jury_credit(p_user_id uuid, p_cost int default 5)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
     set jury_credit = jury_credit - p_cost
   where id = p_user_id
     and jury_credit >= p_cost;
  return found;
end;
$$;

-- Accredita credito (reciprocità voto, boost Stripe) in una sola istruzione.
-- Upsert-safe: se la riga users non esiste (utente OTP-only), la crea e riprova.
create or replace function public.award_jury_credit(p_user_id uuid, p_amount int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
     set jury_credit = jury_credit + p_amount
   where id = p_user_id;
  if not found then
    insert into public.users (id) values (p_user_id) on conflict (id) do nothing;
    update public.users
       set jury_credit = jury_credit + p_amount
     where id = p_user_id;
  end if;
end;
$$;

-- Punteggio giurato (§6.4: ogni voto valido juror_score += 1), stessa sicurezza
-- di award_jury_credit. Separato perché il boost Stripe non deve toccarlo.
create or replace function public.bump_juror_score(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
     set juror_score = juror_score + 1
   where id = p_user_id;
  if not found then
    insert into public.users (id) values (p_user_id) on conflict (id) do nothing;
    update public.users
       set juror_score = juror_score + 1
     where id = p_user_id;
  end if;
end;
$$;

-- Claim idempotente della chiusura giurì: il primo chiamante flippa
-- jury_open → jury_closed e riceve true; il secondo riceve false e NON
-- esegue fill AI, summary né email (P0-3: doppie invocazioni concorrenti).
create or replace function public.claim_jury_close(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.requests
     set status = 'jury_closed'
   where id = p_request_id
     and status = 'jury_open';
  return found;
end;
$$;

-- Le RPC toccano credito e stato giurì: raggiungibili solo dal server.
-- (Le create di Postgres concedono EXECUTE a public; Supabase inoltre concede
-- anon/authenticated per default-privileges: revoco esplicitamente entrambi.)
revoke execute on function public.spend_jury_credit(uuid, int) from public, anon, authenticated;
revoke execute on function public.award_jury_credit(uuid, int) from public, anon, authenticated;
revoke execute on function public.bump_juror_score(uuid) from public, anon, authenticated;
revoke execute on function public.claim_jury_close(uuid) from public, anon, authenticated;
grant execute on function public.spend_jury_credit(uuid, int) to service_role;
grant execute on function public.award_jury_credit(uuid, int) to service_role;
grant execute on function public.bump_juror_score(uuid) to service_role;
grant execute on function public.claim_jury_close(uuid) to service_role;

-- ── 4. votes: anti self-vote a livello DB (P1 TOCTOU) ──────────────────
-- CHECK con subquery non esiste in Postgres: il requester è requests.user_id,
-- quindi l'invariante è un trigger BEFORE INSERT. Security definer perché il
-- giurato non può leggere (RLS) la request altrui: senza definer il check
-- passerebbe sempre. I voti AI di fill hanno juror_id null: esenti per design.
create or replace function public.check_no_self_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  if new.juror_id is not null then
    select user_id into owner_id from public.requests where id = new.request_id;
    if owner_id = new.juror_id then
      raise exception 'self-vote non permesso: il requester non può votare la propria richiesta';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists votes_no_self_vote on public.votes;
create trigger votes_no_self_vote
  before insert on public.votes
  for each row execute function public.check_no_self_vote();

-- Validazione dati esistenti: se un self-vote è già in tabella, la migration
-- fallisce qui e i dati vanno ripuliti prima di rilanciarla.
do $$
declare
  self_votes int;
begin
  select count(*) into self_votes
  from public.votes v
  join public.requests r on r.id = v.request_id
  where v.juror_id is not null and v.juror_id = r.user_id;
  if self_votes > 0 then
    raise exception '% self-vote esistenti in votes: ripulire prima di applicare la migration', self_votes;
  end if;
end
$$;
