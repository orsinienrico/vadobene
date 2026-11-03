import { test, expect } from "@playwright/test";
import { installMocks, reachGate, deadlineIn } from "./fixtures/mock";

/**
 * Moderazione nota in UI (regola che non si discute: nessun giudizio sul
 * corpo, mai): una nota con riferimento al corpo NON compare mai nella UI;
 * il feedback "non verrà mostrata" è visibile e il voto resta registrato.
 */

test.describe("moderazione nota (mock)", () => {
  test("nota con riferimento al corpo → mai mostrata, feedback 'non verrà mostrata' visibile", async ({ page }) => {
    await installMocks(page, {
      queueNext: {
        card: {
          id: "req-mod-1",
          occasion: "Colloquio",
          photoUrl: null,
          votesSoFar: 0,
          deadline: deadlineIn(120),
        },
        credit: 0,
      },
      // Il server marca filtered: la nota non va mai in UI, il voto sì.
      vote: { status: 200, body: { credit: 1, noteStatus: "filtered" } },
    });

    await reachGate(page);

    await page
      .getByPlaceholder("Una riga, se vuoi. Sull'outfit, mai sulla persona.")
      .fill("Sei magra così, il vestito ci sta grande.");
    await page.getByRole("button", { name: "Funziona" }).click();

    // Feedback di moderazione visibile (non sovrascritto dallo swap della card).
    await expect(
      page.getByText("La riga parla della persona, non dell'outfit: non verrà mostrata. Il voto sì.")
    ).toBeVisible();

    // Il testo sul corpo non compare da nessuna parte nella UI (nessuna nota,
    // nessun feedback lo ripete).
    await expect(page.locator("p", { hasText: "magra" })).toHaveCount(0);
    await page.screenshot({ path: "e2e/screens/07-moderation-filtered.png" });
  });
});
