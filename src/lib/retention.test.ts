import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeCutoff } from "./retention";

/**
 * Test accettazione Fase 4: "foto sparite dallo Storage dopo 24h
 * (test con clock mockato)".
 *
 * Il cutoff è importato dalla fonte reale (src/lib/retention.ts, usata dal
 * cron /api/cron/expire-photos): la logica di selezione è
 * created_at < now()-24h AND keep_photo=false.
 */

describe("retention foto 24h", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("il cutoff è esattamente 24 ore prima", () => {
    const now = Date.UTC(2026, 8, 19, 17, 0, 0); // 19 set 2026 17:00 UTC
    expect(computeCutoff(now)).toBe("2026-09-18T17:00:00.000Z");
  });

  it("una request creata 23h fa NON rientra nel cutoff", () => {
    const now = Date.UTC(2026, 8, 19, 17, 0, 0);
    const createdAt23h = Date.UTC(2026, 8, 18, 18, 0, 0);
    expect(new Date(computeCutoff(now)).getTime()).toBeLessThan(createdAt23h);
  });

  it("una request creata 25h fa rientra nel cutoff", () => {
    const now = Date.UTC(2026, 8, 19, 17, 0, 0);
    const createdAt25h = Date.UTC(2026, 8, 18, 16, 0, 0);
    expect(new Date(computeCutoff(now)).getTime()).toBeGreaterThan(createdAt25h);
  });

  it("con clock mockato la finestra si sposta col tempo finto", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
    const cutoff = computeCutoff(Date.now());
    expect(cutoff).toBe("2026-09-18T12:00:00.000Z");
  });
});
