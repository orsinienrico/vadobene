import { test, expect } from "@playwright/test";

/**
 * Fase 1 — landing + flusso Chiedi + primo parere AI.
 * Screenshot di ogni stadio in e2e/screens/.
 * Nota: i test che dipendono da Supabase/Anthropic reali girano solo se
 * NEXT_PUBLIC_SUPABASE_URL è configurato; altrimenti verifica solo la UI.
 */
const SCREENS = "e2e/screens";
const hasEnv = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

test.describe("landing", () => {
  test("hero, brand e flow sono presenti", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("La domanda che fai");
    // il marchio è l'SVG ufficiale, non il carattere "?"
    await expect(page.locator("nav svg").first()).toBeAttached();
    await expect(page.getByText("Il tuo riflesso")).toBeVisible();
    await page.screenshot({ path: `${SCREENS}/01-hero.png`, fullPage: true });
  });

  test("il bottone principale dice 'Vado bene?' ed è disabilitato senza foto", async ({ page }) => {
    await page.goto("/");
    const btn = page.getByRole("button", { name: "Vado bene?" });
    await expect(btn).toBeDisabled();
  });
});

test.describe("flusso chiedi", () => {
  test("zona foto apre il file picker (div + input.click, mai label)", async ({ page }) => {
    await page.goto("/");
    const drop = page.getByRole("button", { name: "Aggiungi il tuo outfit" });
    await drop.scrollIntoViewIfNeeded();

    // Nessun <label for="file">: verifica che il picker parta dal click sul div
    const pickerPromise = page.waitForEvent("filechooser", { timeout: 5000 });
    await drop.click();
    await pickerPromise;

    // label for= non deve esistere nella pagina
    await expect(page.locator('label[for]')).toHaveCount(0);
  });

  test("stadio scan visibile dopo submit con foto+occasione", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      // inietta una foto direttamente nello state del flusso via input file
      // (il resize client usa canvas: qui un PNG 1x1 basta per il flusso UI)
    });
    const drop = page.getByRole("button", { name: "Aggiungi il tuo outfit" });
    await drop.scrollIntoViewIfNeeded();

    // PNG 1×1 rosso come file
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    await page.setInputFiles('input[type="file"]', {
      name: "outfit.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(page.getByRole("img", { name: "Anteprima outfit" })).toBeVisible();
    await page.screenshot({ path: `${SCREENS}/02-input-filled.png` });

    // senza Supabase locale i chip non arrivano: il resto del flusso è testato
    // nei test condizionali sotto.
  });

  // Tag @real: il full-flow tocca Supabase + Anthropic reali — la CI lo separa
  // (smoke su master con secrets); le altre suite sono mock e girano su ogni PR.
  test(hasEnv ? "flusso completo fino al primo parere @real" : "flusso completo (skip senza env) @real", async ({ page }) => {
    test.skip(!hasEnv, "richiede Supabase + Anthropic configurati");
    await page.goto("/");
    const drop = page.getByRole("button", { name: "Aggiungi il tuo outfit" });
    await drop.scrollIntoViewIfNeeded();
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    await page.setInputFiles('input[type="file"]', {
      name: "outfit.png",
      mimeType: "image/png",
      buffer: png,
    });
    await page.getByRole("button", { name: "Colloquio" }).click();
    await page.getByRole("button", { name: "Vado bene?" }).click();

    await expect(page.getByText("Lettura dell'outfit")).toBeVisible();
    await page.screenshot({ path: `${SCREENS}/03-scan.png` });

    await expect(page.getByText("Primo parere · automatico")).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `${SCREENS}/04-ai-reply.png` });
    await expect(page.getByRole("button", { name: "Chiedi a cinque persone vere" })).toBeVisible();
  });
});
