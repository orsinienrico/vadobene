-- vado bene? — voti AI con juror_id nullable (phase-5 hardening)
--
-- I voti AI di fill (is_ai=true) non hanno un juror_id umano. Lo schema 0001
-- definisce juror_id NOT NULL con un unique (request_id, juror_id) che impedisce
-- duplicati umani. Per i voti AI è necessario juror_id nullable: il trigger
-- check_no_self_vote (0002) già skippa il check quando juror_id IS NULL.
--
-- Questa migration:
-- 1. Rende juror_id nullable
-- 2. Aggiorna l'unique constraint per ignorare le righe con juror_id IS NULL
--    (due AI vote sulla stessa request è lecito; due umani no)
-- 3. Aggiorna la FK per ON DELETE SET NULL (se un utente cancella account,
--    il voto umano rimane orfano; il voto AI rimane com'è)

alter table public.votes
  alter column juror_id drop not null;

-- Constraint unique che esclude i NULL: due AI vote sulla stessa request_id
-- sono permesse (entrambe hanno juror_id = NULL), ma due voti umani sulla
-- stessa request_id restano proibiti.
alter table public.votes
  drop constraint votes_request_id_juror_id_key;

alter table public.votes
  add constraint votes_request_id_juror_id_unique unique nulls not distinct (request_id, juror_id);

-- FK: se l'utente cancella account, il suo voto diventa orfano (juror_id NULL).
-- I voti AI restano immutati (già hanno juror_id NULL).
alter table public.votes
  drop constraint votes_juror_id_fkey;

alter table public.votes
  add constraint votes_juror_id_fkey
  foreign key (juror_id) references public.users (id) on delete set null;
