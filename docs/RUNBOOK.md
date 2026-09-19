# Runbook — vado bene?

Operazioni di routine, incident e rotazione chiavi. Ultimo aggiornamento: 2026-09-19.

## Variabili d'ambiente (Vercel → Settings → Environment Variables)

| Variabile | Dove si ottiene | Criticità |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | pubblica |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API | pubblica (RLS protegge) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API | **segreta**, bypassa RLS |
| `SUPABASE_DB_URL` | Supabase → Settings → Database | **segreta** |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | **segreta**, solo server |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys | **segreta** |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks | **segreta** |
| `STRIPE_PRICE_BOOST` / `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_PRO_YEARLY` | Stripe → Products | pubblica |
| `RESEND_API_KEY` | resend.com → API Keys | **segreta** |
| `RESEND_FROM` | — (dominio verificato su Resend) | pubblica |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | PostHog → Settings | pubblica |
| `CRON_SECRET` | genera con `openssl rand -hex 32` | **segreta** |
| `NEXT_PUBLIC_SITE_URL` | — | pubblica |

## Cron

| Route | Frequenza | Cosa fa | Come verificare |
|---|---|---|---|
| `/api/cron/close-juries` | ogni 30s (Vercel Hobby: minimo 1×/giorno — vedi sotto) | chiude giurì scaduti, riempi con AI, calcola summary, invia email | `curl "https://vadobene.app/api/cron/close-juries?secret=$CRON_SECRET"` → `{"closed":N}` |
| `/api/cron/expire-photos` | ogni ora | cancella foto >24h con `keep_photo=false`, `status='expired'` | stessa call; controlla bucket Supabase → Storage → outfits |

**Vercel Hobby:** i cron girano minimo una volta al giorno. Se il giurì a 3 minuti è una feature core, o passi a Pro, o chiami il cron da un servizio esterno (cron-job.org, Upstash QStash) ogni 30s con lo stesso secret.

## Moderazione manuale

Note con `note_status='flagged'` (segnalate dagli utenti via tabella `reports`):

```sql
-- Note segnalate da rivedere
select v.id, v.note, v.verdict, r.reason, v.created_at
from votes v
join reports r on r.vote_id = v.id
order by v.created_at desc;

-- Metti in quarantena una nota (scompare dal thread)
update votes set note_status = 'flagged' where id = '<vote_id>';

-- Perdonala
update votes set note_status = 'ok' where id = '<vote_id>';
```

Togliere il diritto di scrivere note a un giurato segnalato due volte (PRODUCT-SPEC §3):

```sql
update users set can_comment = false where id = '<juror_id>';
```

Il client deve leggere `users.can_comment` prima di mostrare il campo nota (check da aggiungere in VoteGate se i report vengono attivati).

## Rotazione chiavi

1. **Anthropic:** console → revoca → nuova chiave → aggiorna `ANTHROPIC_API_KEY` su Vercel → redeploy.
2. **Stripe secret:** Dashboard → API keys → roll secret key. Il webhook secret si rigenera da Webhooks → endpoint → "Rolling secret" (aggiorna in Vercel entro la finestra di transizione).
3. **Supabase service role:** Settings → API → "Rotate service_role key". Attenzione: invalida subito quella vecchia.
4. **CRON_SECRET:** nuova stringa → aggiorna Vercel + servizio cron esterno.

## Incident tipici

| Sintomo | Causa probabile | Azione |
|---|---|---|
| Il primo parere non arriva, `502` da `/api/verdict` | Anthropic giù / chiave invalida | controlla logs Vercel; il messaggio in UI è già in voce brand, riprova |
| Giurì non si chiude | cron non parte (Hobby) | chiama manualmente `/api/cron/close-juries` |
| Voti AI dichiarati anche con 5 umani | summary calcolata su voti parziali + fill AI | verificare `votes` count; non è un bug se deadline passata |
| Foto non cancellate | cron expire non parte o Storage error | logs Vercel; retry manuale idempotente |
| Webhook 400 | firma scaduta o payload modificato | controlla che Vercel non riscriva il body; raw body è requisito |

## Cancellazione GDPR

L'utente può auto-eliminarsi da `/me` → "Cancella tutto" (`POST /api/me/delete-all`): auth user via `auth.admin.deleteUser` (cascade su users/requests/votes/reports) + foto rimosse dal bucket. Se l'utente scrive a supporto invece: identificare da email → `select id from users where email = '...'` → stessa procedura lato admin.
