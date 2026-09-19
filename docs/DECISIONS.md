# Decisioni

Registro delle scelte non coperte da spec/brand (CLAUDE.md: scegli l'opzione più semplice, documentala, vai avanti).

| Data | Decisione | Motivo |
|---|---|---|
| 2026-09-19 | Tailwind CSS v4 (config via `@theme` in `globals.css`, niente `tailwind.config.ts`) | Next 15 + Tailwind 4 è l'installazione di default; i token di BRAND.md §4 mappano 1:1 su `@theme` |
| 2026-09-19 | Font caricati con `next/font` in `src/app/layout.tsx`, variabili CSS (`--font-display/logo/body/mono`) collegate ai token Tailwind | Requisito Fase 0; `display=swap` come da BRAND.md §5 |
| 2026-09-19 | Icone PWA pre-generate in `public/icons/` da `docs/brand/app-icon.svg` via `scripts/generate-icons.mjs` (sharp); rigenerabili a mano | Evita dipendenza di build da sharp; le icone sono asset statici |
| 2026-09-19 | Versione maskable: sfondo pieno `#143543` con marchio ridotto al 80% (area sicura) | Best practice PWA maskable; gradiente sostituito da tinta piatta piena |
| 2026-09-19 | Policy RLS `votes select requester`: il proprietario della request legge i voti della propria request, il giurato legge i propri | Serve per costruire il thread a stadio 5/6 e per sapere a chi ha già votato; nessun altro accesso |
| 2026-09-19 | Policy RLS `requests select jurors`: chi ha già votato una request può leggerla (serve per la coda di voto) | Lettura in sola lettura, mai scrittura |
| 2026-09-19 | Storage `outfits`: path `{user_id}/{request_id}.jpg`, policy su primo segmento del path | RLS Storage più semplice possibile, allineata al requisito "solo i propri file" |
