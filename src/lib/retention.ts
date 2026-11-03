/**
 * Retention foto — Fase 4: le foto con keep_photo=false si cancellano a 24h.
 * Cutoff estratto dal cron expire-photos (comportamento invariato) per essere
 * testato con clock mockato in src/lib/retention.test.ts.
 */

/** Cutoff retention: now - 24h (default), come ISO string. */
export function computeCutoff(nowMs: number, hours = 24): string {
  return new Date(nowMs - hours * 60 * 60 * 1000).toISOString();
}
