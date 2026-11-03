import { test, expect } from "@playwright/test";
import { installMocks, reachGate, proceedAnyway, deadlineIn, type MockVote } from "./fixtures/mock";

/**
 * Stadio 6 — card finale con summary mockata (4 yes, 1 tweak, 1 AI): headline
 * corretta, mix dichiarato ("pareri automatici"), permalink /c/[id] nel testo
 * condiviso.
 */

test.describe("stadio finale (mock)", () => {
  test("headline, mix dichiarato e permalink /c/[id] nel testo condiviso", async ({ page }) => {
    const votes: MockVote[] = [
      { id: "v1", verdict: "yes", note: "Il blu ti sta meglio.", is_ai: false },
      { id: "v2", verdict: "yes", note: null, is_ai: false },
      { id: "v3", verdict: "tweak", note: "Cambia le scarpe.", is_ai: false },
      { id: "v4", verdict: "yes", note: null, is_ai: false },
      { id: "v5", verdict: "yes", note: "Coerente.", is_ai: true },
    ];
    const summary = {
      yes: 4,
      tweak: 1,
      no: 0,
      human_votes: 4,
      ai_votes: 1,
      result: "yes" as const,
      top_tweak: "Cambia le scarpe.",
      quote: "Il blu ti sta meglio.",
      headline: "Sì. 4 su 5.",
    };
    await installMocks(page, {
      queueNext: { card: null, credit: 0, message: "Nessuno sta chiedendo in questo momento" },
      juryOpen: { status: 200, body: { requestId: "req-final-1", deadline: deadlineIn(2), durationSeconds: 2 } },
      votesRows: votes,
      requestRow: { status: "jury_closed", jury_summary: summary },
    });

    // navigator.share assente: il "Condividi" degrada sul path clipboard.
    await page.addInitScript(() => {
      try {
        Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
      } catch {
        // Il test degrada comunque sul path clipboard.
      }
    });
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

    await reachGate(page);
    await proceedAnyway(page);

    await expect(page.getByRole("heading", { name: "Ecco." })).toBeVisible({ timeout: 15_000 });

    // Headline e mix dichiarato (1 dei 5 pareri è AI, dichiarato). Scope #flow:
    // la landing ha una card-specimen statica con lo stesso headline.
    await expect(page.locator("#flow").getByText("Sì. 4 su 5.")).toBeVisible();
    await expect(page.locator("#flow").getByText("4 persone vere + 1 pareri automatici")).toBeVisible();
    await page.screenshot({ path: "e2e/screens/08-final-card.png" });

    // Permalink /c/[id] nel testo condiviso (path clipboard: "Copiato" flash).
    await page.getByRole("button", { name: "Condividi" }).click();
    await expect(page.getByRole("button", { name: "Copiato" })).toBeVisible();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("vado bene? — Colloquio");
    expect(clipboard).toContain("Sì. 4 su 5.");
    expect(clipboard).toContain("/c/req-final-1");
  });
});
