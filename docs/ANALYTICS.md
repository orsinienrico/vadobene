# Analytics — funnel vado bene?

PostHog (eu.i.posthog.com). Eventi definiti in `src/lib/analytics.ts`.

## Eventi

| Evento | Quando | Proprietà |
|---|---|---|
| `photo_added` | foto scelta e ridimensionata | — |
| `occasion_selected` | chip occasione toccata | `slug` |
| `verdict_ai` | primo parere ricevuto | `verdict` (yes/tweak/no), `unsafe` (bool) |
| `jury_requested` | giurì richiesta (credito pieno, ricarica ≥ 5, "Procedi comunque") | `credit_before` |
| `jury_ai_fill` | giurì aperta con fill AI dichiarato | — |
| `vote_cast` | voto registrato | `verdict`, `has_note`, `note_filtered` |
| `jury_closed` | card finale vista | `result`, `human_votes`, `ai_votes`, `seconds` |
| `card_shared` | Condividi usato | `method` (native/clipboard) |
| `boost_started` | checkout Boost iniziato (redirect a Stripe) | — |
| `boost_purchased` | webhook checkout boost completato | — |
| `pro_subscribed` | webhook checkout pro completato | `cycle` (monthly/yearly) |
| `jury_open_failed` | apertura giurì fallita in modo irreversibile | `status`, `message` |

## Funnel di attivazione

```
photo_added → occasion_selected → verdict_ai → jury_requested → jury_closed
```

**Metriche chiave:**
- **Conversione scan→giurì:** `verdict_ai → jury_requested` (il momento dell'ansia)
- **Reciprocità:** `jury_requested` con `credit_before < 5` → quota che vota davvero
- **Tempo a 5 risposte:** `jury_requested → jury_closed` (target < 20 min, kill criterion)
- **Viralità:** `card_shared / jury_closed`

## Dove gli eventi sono emessi

- `photo_added`, `occasion_selected`, `verdict_ai`, `jury_requested` (in `onCreditFull`), `jury_ai_fill`, `jury_open_failed`: `src/components/Flow.tsx`
- `vote_cast`: `src/components/VoteGate.tsx`
- `jury_closed`: `src/components/Flow.tsx` (onClosed)
- `card_shared`: `src/components/VerdictCard.tsx`
- `boost_started`: `src/components/JuryLive.tsx` (CTA Boost)
- `boost_purchased`, `pro_subscribed`: `src/app/api/stripe/webhook/route.ts` (server-side via PostHog API)
