-- vado bene? — schema iniziale (PRODUCT-SPEC.md §6.1)
-- RLS attivo su tutte le tabelle. Nessuna eccezione.

create extension if not exists "pgcrypto";

-- ── users ──────────────────────────────────────────────────────────────
create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  created_at timestamptz not null default now(),
  plan text not null default 'free' check (plan in ('free','pro')),
  jury_credit int not null default 0,
  juror_score int not null default 0,
  can_comment bool not null default true
);

alter table users enable row level security;

-- Ognuno vede solo se stesso. Email altrui mai (CLAUDE.md).
create policy "users select own" on users
  for select using (auth.uid() = id);
create policy "users insert own" on users
  for insert with check (auth.uid() = id);
create policy "users update own" on users
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- ── occasions ──────────────────────────────────────────────────────────
create table if not exists occasions (
  id serial primary key,
  slug text unique not null,
  label_it text not null,
  label_en text not null,
  is_custom bool not null default false
);

alter table occasions enable row level security;

-- Lista fissa, pubblica in lettura, scrivibile da nessuno via client.
create policy "occasions select all" on occasions
  for select using (true);

-- ── requests ───────────────────────────────────────────────────────────
create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  occasion_id int references occasions(id),
  custom_occasion text,
  photo_path text,
  status text not null default 'ai_done'
    check (status in ('ai_done','jury_open','jury_closed','expired')),
  ai_verdict jsonb,
  jury_summary jsonb,
  created_at timestamptz not null default now(),
  jury_deadline_at timestamptz,
  votes_target int not null default 5,
  keep_photo bool not null default false
);

create index if not exists requests_queue_idx
  on requests (status, jury_deadline_at)
  where status = 'jury_open';

alter table requests enable row level security;

create policy "requests select own" on requests
  for select using (auth.uid() = user_id);
create policy "requests insert own" on requests
  for insert with check (auth.uid() = user_id);
create policy "requests update own" on requests
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "requests delete own" on requests
  for delete using (auth.uid() = user_id);

-- ── votes ──────────────────────────────────────────────────────────────
create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  juror_id uuid not null references users(id) on delete cascade,
  verdict text not null check (verdict in ('yes','tweak','no')),
  note text,
  note_status text not null default 'ok'
    check (note_status in ('ok','filtered','flagged')),
  is_ai bool not null default false,
  created_at timestamptz not null default now(),
  unique (request_id, juror_id)
);

create index if not exists votes_request_idx on votes (request_id);

alter table votes enable row level security;

-- Scrive solo il giurato, per sé stesso (INSERT; l'update non è previsto).
create policy "votes insert own" on votes
  for insert with check (auth.uid() = juror_id and is_ai = false);

-- Legge il proprietario della request (per costruire il thread) e il giurato
-- (per sapere a chi ha già votato). Mai il voto degli altri.
create policy "votes select requester" on votes
  for select using (
    exists (
      select 1 from requests r
      where r.id = votes.request_id and r.user_id = auth.uid()
    ) or auth.uid() = juror_id
  );

-- Policies that refer to votes must be declared AFTER votes exists.
-- Il giurato deve leggere la richiesta che sta per votare (foto firmata,
-- occasione). Il proprietario vede le proprie. Scrittura solo via service role.
-- 1. Lettura di richieste in cui ha già votato (visione recap voto).
create policy "requests select jurors voted" on requests
  for select using (
    exists (
      select 1 from votes v
      where v.request_id = requests.id and v.juror_id = auth.uid()
    )
  );
-- 2. Lettura di richieste aperte (jury_open) senza averle ancora votate
--    (needed for /api/queue/next a mostrare le richieste disponibili).
create policy "requests select open jury" on requests
  for select using (
    status = 'jury_open' and
    not exists (
      select 1 from votes v
      where v.request_id = requests.id and v.juror_id = auth.uid()
    )
  );


-- ── reports ────────────────────────────────────────────────────────────
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  vote_id uuid not null references votes(id) on delete cascade,
  reporter_id uuid not null references users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now()
);

alter table reports enable row level security;

create policy "reports insert own" on reports
  for insert with check (auth.uid() = reporter_id);
create policy "reports select own" on reports
  for select using (auth.uid() = reporter_id);

-- ── seed occasions (PRODUCT-SPEC Fase 0) ───────────────────────────────
insert into occasions (slug, label_it, label_en) values
  ('colloquio',           'Colloquio',            'Job interview'),
  ('matrimonio',          'Matrimonio',           'Wedding'),
  ('primo-appuntamento',  'Primo appuntamento',   'First date'),
  ('ufficio',             'Ufficio',              'Office'),
  ('aperitivo',           'Aperitivo',            'Aperitivo'),
  ('cena-suoceri',        'Cena con i suoceri',   'Dinner with in-laws'),
  ('laurea',              'Laurea',               'Graduation')
on conflict (slug) do nothing;

-- ── storage: bucket privato outfits ────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('outfits', 'outfits', false)
on conflict (id) do nothing;

-- Policy storage: l'utente accede solo ai propri file. I path sono
-- "{user_id}/{request_id}.jpg".
create policy "outfits select own" on storage.objects
  for select using (
    bucket_id = 'outfits' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "outfits insert own" on storage.objects
  for insert with check (
    bucket_id = 'outfits' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "outfits delete own" on storage.objects
  for delete using (
    bucket_id = 'outfits' and (storage.foldername(name))[1] = auth.uid()::text
  );
