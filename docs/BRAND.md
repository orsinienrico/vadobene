# vado bene? — Brand Book (v1.0, ufficiale)

*Deciso il 13 settembre 2026. Questo documento è la fonte di verità: ogni file in `03-prototype/` e ogni schermata futura deve essere coerente con quanto scritto qui.*

---

## 1. Nome e scrittura

**vado bene?** — tutto minuscolo, due parole, punto interrogativo sempre presente.

- Nel logotipo e nei titoli: `vado bene` + marchio "?" (mai il carattere "?" tipografico).
- Nel testo corrente: "vado bene?" minuscolo. Mai "VadoBene", mai "Vado Bene", mai senza "?".
- Dominio e handle: `vadobene.app`, `@vadobene` (unica eccezione in cui si scrive attaccato, per necessità tecnica).
- Il nome è la frase esatta che ogni italiano dice sulla porta di casa. È anche il bottone principale del prodotto: l'utente *dice* il nome del brand per usarlo.

**Payoff:** Lo specchio che non mente.

---

## 2. Posizionamento

**In una riga:** non un'app di moda, un'app di decisioni — che risponde con persone vere invece che con un algoritmo.

**La verità del brand:** "vado bene?" è una domanda che si fa *a qualcuno* — alla sorella, al partner, al gruppo WhatsApp — mezzo fuori dalla porta. Il prodotto sostituisce quella persona con cinque sconosciuti che rispondono in tre minuti, alla cieca, senza doverti essere gentili.

**Modello mentale per l'utente:** il messaggio nel gruppo. Non un verdetto, non un certificato, non un tribunale.

**Cosa NON è:** un giudice, un contest di bellezza, un social network. Non ha follower, like, profili pubblici, classifiche di bellezza.

---

## 3. Il marchio

### 3.1 Costruzione
Il punto interrogativo è il brand: è il dubbio, è il momento. Il suo *punto* diventa **cinque cerchi a quinquonce** (la disposizione del 5 sul dado): una domanda, cinque risposte. Chiunque legge "cinque" senza contare.

Specifiche del marchio (`mark.svg`, viewBox 100×140):
- **Gancio:** path `M15 42 C15 12 85 12 85 42 C85 66 50 62 50 90`, stroke 21, linecap round. Il tratto è spesso quanto le aste di Bricolage Grotesque 800, così marchio e logotipo sono un'unica cosa.
- **Cinque punti:** centro (50,118) r 8.5; quattro attorno (32,105) (68,105) (32,131) (68,131) r 8.
- **Un solo colore per volta.** Il file usa `currentColor`.

### 3.2 Logotipo
`vado bene` in **Bricolage Grotesque 800**, letter-spacing −0.045em, seguito dal marchio. Il marchio è largo 0.72em e alto 1.01em rispetto al corpo del testo, allineato al baseline con offset −0.03em, distanza 0.05em dalla "e". Supera di poco l'altezza della "b": è lui il protagonista.

### 3.3 Varianti
| Uso | File / regola |
|---|---|
| Orizzontale, standard | `vado bene` + marchio, crema su blu profondo |
| Icona app | Solo il marchio, crema, su gradiente blu (`app-icon.svg`, raggio angoli 120/512) |
| Verticale con payoff | marchio sopra, `vado bene` sotto, payoff in mono maiuscolo spaziato |
| Su chiaro | Inchiostro `#1D2530` su crema `#F2E9D8` — card condivise, stampa |
| Menta | Marchio in `#8FD3B3`. **Un solo uso:** il momento in cui le cinque risposte dicono sì |
| Animato | I cinque punti arrivano uno alla volta (0.27s l'uno), poi il gancio si disegna (0.9s), poi un respiro di luce. Solo splash screen, video di lancio, social. In-app il marchio è sempre fermo. |

Riferimento visivo completo: `logo-system.html`.

---

## 4. Colore

| Ruolo | Hex | Note |
|---|---|---|
| Sfondo | `#0E2A36` | Blu profondo. **Mai nero puro, mai `#000`.** |
| Pannello | `#143543` | Card, superfici |
| Pannello chiaro | `#1B4353` | Gradiente card: `linear-gradient(160deg, #1B4353, #143543)` |
| Crema | `#F2E9D8` | Testo, bottoni primari, marchio, bordi delle citazioni. Fa il ruolo dell'oro nella v1. |
| Muted | `#8FA6AE` | Testo secondario, etichette mono |
| Linea | `rgba(242,233,216,.20)` | Bordi |
| Sì | `#8FD3B3` (menta) | **Solo** dentro le risposte |
| Con una modifica | `#F0C674` (ambra) | **Solo** dentro le risposte |
| No | `#F19A88` (corallo) | **Solo** dentro le risposte |
| Bagliore hero | `rgba(127,200,192,.14)` | Radial gradient dietro la card-specimen |

**Regola d'oro:** verde, ambra e rosso esistono solo come *risposte*. Mai come decorazione, mai in un gradiente, mai in un bottone che non sia un voto.

**Vietati:** nero+oro (era Fitwise), crema+terracotta, qualsiasi accento acido/neon.

---

## 5. Tipografia

| Ruolo | Font | Peso | Uso |
|---|---|---|---|
| Logotipo | Bricolage Grotesque | 800 | Solo il logotipo, nient'altro |
| Display | Fraunces | 300 (h1), 400, 600 (numeri/verdetti), 400 italic (citazioni) | Headline, verdetti, citazioni dei giurati |
| Testo | Inter | 400/500/600 | Tutto il testo funzionale |
| Etichette | IBM Plex Mono | 400/500 | Eyebrow, occasione, timer, etichette in maiuscolo spaziato (.14–.22em) |

Google Fonts, `display=swap`. Nessun altro font.

---

## 6. Voce

- Diretta, mai crudele. "Non funziona", non "sei brutto vestito così".
- **Parla di outfit e occasioni, mai del corpo.** Vale per ogni riga scritta dal team e per ogni riga scritta dagli utenti (moderazione).
- Frasi corte, verbi attivi, seconda persona singolare. "Chiedi", "Vota". Mai "Sottometti".
- L'AI si presenta sempre come AI: "Parere automatico · quello che conta arriva dalle persone".
- Zero superlativi, zero entusiasmo forzato. La credibilità viene dal fatto che il verdetto può anche essere "no".
- Il bottone principale dice **"Vado bene?"**, mai "Analizza".
- La parola "verdetto" è ammessa nel copy interno; nel prodotto preferire "risposta", "parere", "ecco".

---

## 7. La card condivisibile

È l'asset che gira fuori dall'app. Formato fisso:

```
[marchio] vado bene?                    COLLOQUIO
Sì. 4 su 5.
● ● ● ● ●   (cinque punti colorati dalle risposte)
Funziona così com'è. Modifica più votata: le scarpe.
"Sembri già assunto. Tranne ai piedi."
CINQUE PERSONE VERE · ALLA CIECA · 112 SECONDI
```

Foto dell'utente inclusa solo se lui lo sceglie. Sfondo: gradiente pannello, bordo linea, ombra `0 30px 80px rgba(0,0,0,.45)`.

---

## 8. Registrazioni da fare
- Dominio: vadobene.app, vadobene.it
- Handle: @vadobene su Instagram, TikTok
- Marchio: EUIPO classi 9 (software) e 42 (SaaS) — verifica manuale prima del deposito. Il nome è descrittivo (frase comune): la tutela forte sta nel marchio "?" a cinque punti e nel payoff.
