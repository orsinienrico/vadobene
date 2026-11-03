import type { Page } from "@playwright/test";

/**
 * Fixtures e2e mockate (review 2026-09-26, workstream testing): route
 * interception su "/api/**" con risposte deterministiche e stub Supabase.
 *
 * Come funziona:
 * - Le route Next (/api/occasions, /api/verdict, /api/queue/next,
 *   /api/jury/open, /api/vote) sono intercettate con page.route.
 * - Il client Supabase (JuryLive: fetch voti e summary) parla con
 *   https://mock.supabase.co/rest/v1/**: intercettato allo stesso modo.
 *   L'URL finto arriva da playwright.config.ts (webServer.env, solo quando
 *   manca l'env reale): così il bundle client ha un supabase-js funzionante
 *   anche in CI senza secrets. Il canale realtime fallisce (DNS) e il client
 *   degrada sul fetch iniziale — che è intercettato.
 */

export type MockVote = {
  id: string;
  verdict: "yes" | "tweak" | "no";
  note: string | null;
  is_ai: boolean;
};

export type MockJurySummary = {
  yes: number;
  tweak: number;
  no: number;
  human_votes: number;
  ai_votes: number;
  result: "yes" | "tweak" | "no";
  top_tweak: string | null;
  quote: string | null;
  headline: string;
};

export type MockQueueCard = {
  id: string;
  occasion: string;
  photoUrl: string | null;
  votesSoFar: number;
  deadline: string | null;
};

export type MockState = {
  occasions: { slug: string; label_it: string }[];
  verdict: Record<string, unknown>;
  queueNext: Record<string, unknown>;
  juryOpen: { status: number; body: Record<string, unknown> };
  vote: { status: number; body: Record<string, unknown> };
  votesRows: MockVote[];
  requestRow: { status: string; jury_summary: MockJurySummary | null };
};

/** PNG 1×1 rosso come foto d'ingresso (il resize client regge). */
export const OUTFIT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

/** Deadline istantanea: now + 2s, per non aspettare il timer dei 3 minuti. */
export function deadlineIn(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function defaultState(): MockState {
  return {
    occasions: [{ slug: "colloquio", label_it: "Colloquio" }],
    verdict: {
      verdict: "yes",
      tweak: null,
      one_liner: "Coerente e pulito, va bene così.",
      confidence: "high",
      unsafe_content: false,
    },
    queueNext: { card: null, credit: 0, message: "Nessuno sta chiedendo in questo momento" },
    juryOpen: {
      status: 200,
      // deadline è ricalcolata a ogni richiesta dall'handler qui sotto.
      body: { requestId: "req-mock-1", deadline: deadlineIn(2), durationSeconds: 2 },
    },
    vote: { status: 200, body: { credit: 1, noteStatus: "ok" } },
    votesRows: [],
    requestRow: { status: "jury_closed", jury_summary: null },
  };
}

/** Installa tutte le intercettazioni sul page corrente. */
export async function installMocks(page: Page, overrides: Partial<MockState> = {}) {
  const state: MockState = { ...defaultState(), ...overrides };

  await page.route("**/api/occasions", (route) =>
    route.fulfill({ json: { occasions: state.occasions } })
  );
  await page.route("**/api/verdict", (route) =>
    route.fulfill({ json: { verdict: state.verdict } })
  );
  await page.route("**/api/queue/next", (route) => route.fulfill({ json: state.queueNext }));
  await page.route("**/api/jury/open", (route) => {
    // Deadline SEMPRE fresca al momento della richiesta (now + 2s, timer
    // istantaneo): se fosse calcolata a setup time sarebbe già scaduta al
    // mount del giurì (il goto + reachGate durano più di 2s) e l'effetto
    // chiusura partirebbe al mount, bloccando il retry (closedRef + StrictMode).
    const body = { ...state.juryOpen.body, deadline: deadlineIn(2) };
    return route.fulfill({ status: state.juryOpen.status, json: body });
  });
  await page.route("**/api/vote", (route) =>
    route.fulfill({ status: state.vote.status, json: state.vote.body })
  );

  // Supabase-js (client bundle): fetch voti e summary del giurì.
  await page.route("**/rest/v1/votes**", (route) => route.fulfill({ json: state.votesRows }));
  await page.route("**/rest/v1/requests**", (route) => route.fulfill({ json: state.requestRow }));

  return state;
}

/** Carica la foto nello state del flusso (input file, come il reale). */
export async function addPhoto(page: Page) {
  await page.setInputFiles('input[type="file"]', {
    name: "outfit.png",
    mimeType: "image/png",
    buffer: OUTFIT_PNG,
  });
}

/** Percorso input → scan → primo parere → gate ("Prima rispondi tu"). */
export async function reachGate(page: Page) {
  await page.goto("/");
  await addPhoto(page);
  await page.getByRole("button", { name: "Colloquio" }).click();
  await page.getByRole("button", { name: "Vado bene?" }).click();
  const nextButton = page.getByRole("button", { name: "Chiedi a cinque persone vere" });
  await nextButton.waitFor({ state: "visible" });
  await nextButton.click();
}

/** Percorso gate → live view ("Procedi comunque", fill AI dichiarato). */
export async function proceedAnyway(page: Page) {
  await page.getByRole("button", { name: "Procedi comunque" }).click();
}
