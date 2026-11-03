import { test, expect } from "@playwright/test";
import { installMocks, reachGate, proceedAnyway, deadlineIn, type MockVote } from "./fixtures/mock";

/**
 * Stadio 5 — giurì live, con route interception mockata (nessun servizio reale):
 * gate con credito < 5 → "Procedi comunque" → live con fill AI dichiarato;
 * voti che arrivano → chiusura → summary; doppio voto → "Hai già votato".
 * Deadline nei mock = now + 2s: timer istantaneo.
 */

test.describe("giurì live (mock)", () => {
  test("credito < 5 → 'Procedi comunque' → live view con pareri automatici dichiarati", async ({ page }) => {
    await installMocks(page, {
      queueNext: { card: null, credit: 0, message: "Nessuno sta chiedendo in questo momento" },
      juryOpen: { status: 200, body: { requestId: "req-jury-1", deadline: deadlineIn(2), durationSeconds: 2 } },
    });

    await reachGate(page);
    await expect(page.getByRole("heading", { name: "Prima rispondi tu" })).toBeVisible();

    await proceedAnyway(page);

    // Fill AI dichiarato in UI: il copy non promette giurati reali (spec §3).
    // Testi specifici: il copy compare sia nell'header sia nella live view.
    await expect(page.getByRole("heading", { name: "Il giurì è aperto" })).toBeVisible();
    await expect(
      page.getByText("Tre minuti, alla cieca. Alcuni pareri saranno automatici.")
    ).toBeVisible();
    await expect(page.getByText("Alcuni pareri saranno automatici e dichiarati.")).toBeVisible();
    await expect(page.getByText("Stiamo completando le tue risposte")).toBeVisible();
    await page.screenshot({ path: "e2e/screens/05-jury-ai-fill.png" });
  });

  test("i voti arrivano → chiusura → summary nello stadio finale", async ({ page }) => {
    const votes: MockVote[] = [
      { id: "v1", verdict: "yes", note: "Pulito, funziona.", is_ai: false },
      { id: "v2", verdict: "yes", note: null, is_ai: false },
      { id: "v3", verdict: "tweak", note: "Cambia le scarpe.", is_ai: false },
      { id: "v4", verdict: "yes", note: null, is_ai: false },
      { id: "v5", verdict: "no", note: null, is_ai: true },
    ];
    await installMocks(page, {
      queueNext: { card: null, credit: 0, message: "Nessuno sta chiedendo in questo momento" },
      juryOpen: { status: 200, body: { requestId: "req-jury-2", deadline: deadlineIn(2), durationSeconds: 2 } },
      votesRows: votes,
      requestRow: {
        status: "jury_closed",
        jury_summary: {
          yes: 3,
          tweak: 1,
          no: 1,
          human_votes: 4,
          ai_votes: 1,
          result: "yes",
          top_tweak: "Cambia le scarpe.",
          quote: "Pulito, funziona.",
          headline: "Sì. 3 su 5.",
        },
      },
    });

    await reachGate(page);
    await proceedAnyway(page);

    // I 5 voti (4 umani + 1 AI dichiarato) sono già nei mock: chiusura immediata.
    await expect(page.getByRole("heading", { name: "Ecco." })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Sì. 3 su 5.")).toBeVisible();
    await page.screenshot({ path: "e2e/screens/06-jury-closed.png" });
  });

  test("doppio voto → messaggio 'Hai già votato' e nessun avanzamento", async ({ page }) => {
    await installMocks(page, {
      queueNext: {
        card: {
          id: "req-dup-1",
          occasion: "Colloquio",
          photoUrl: null,
          votesSoFar: 0,
          deadline: deadlineIn(120),
        },
        credit: 0,
      },
      vote: { status: 409, body: { error: "Hai già votato questa richiesta." } },
    });

    await reachGate(page);

    await page.getByRole("button", { name: "Funziona" }).click();

    await expect(page.getByText("Hai già votato questa richiesta.")).toBeVisible();
    // Restiamo nella card: niente avanzamento di credito né cambio stadio.
    await expect(page.getByRole("button", { name: "Funziona" })).toBeVisible();
  });
});
