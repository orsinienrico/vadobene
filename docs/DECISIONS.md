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
| 2026-09-19 | Playwright usa il Chrome di sistema (`channel: "chrome"`) con device emulation iPhone 14 | Il download CDN dei browser Playwright è bloccato nella rete aziendale (timeout); viewport/DPR identici a `devices["iPhone 14"]` |
| 2026-09-19 | Verdetto AI via Anthropic tool-use forzato (`tool_choice`) invece di output testuale da parse | Struttura garantita alla fonte; Zod valida comunque dopo (difesa in profondità) |
| 2026-09-19 | Resize doppio: client (canvas, max 1280px, JPEG q0.85) + server (sharp, se ancora >1280px) | Requisito CLAUDE.md su entrambi i lati; il server protegge da upload non passati dal client |
| 2026-09-19 | `POST /api/verdict` salva la foto in Storage **solo dopo** il verdetto AI: se `unsafe_content` la foto non tocca il bucket | Requisito esplicito Fase 1: "non salvare la foto" |
| 2026-09-19 | CTA "Chiedi a cinque persone vere" emette evento `vb:request-jury`; il gate di voto arriva in Fase 2 | La Fase 1 copre solo gli stadi 1→3; il punto di aggancio è già predisposto |
| 2026-09-19 | Moderazione note a due livelli: euristica locale (`body-reference.ts`) + Anthropic Haiku temp 0, fail-closed | La rete di sicurezza locale filtra match certi senza latenza AI; se l'AI non risponde la nota viene filtrata, mai pubblicata senza moderazione |
| 2026-09-19 | Contatore "max 20 voti per sessione" in cookie httpOnly server-side | Spec §6.4 chiede tracciamento server-side; localStorage è vietato da CLAUDE.md per stato critico |
| 2026-09-19 | Richieste Pro identificate in coda da `votes_target > 5` | Il piano Pro imposta `votes_target=10`; evita una join su `users.plan` nella query coda |
| 2026-09-19 | URL foto giurato firmato a 60 secondi | Scadenza breve: la foto esiste solo per il tempo del voto (minimo necessario) |
