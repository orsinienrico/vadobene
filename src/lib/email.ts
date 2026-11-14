/**
 * Email via Resend — Fase 4. Solo server-side.
 * Magic link e chiusura giurì, in voce brand (BRAND.md §6: frasi corte,
 * verbi attivi, zero entusiasmo forzato).
 */

const FROM = process.env.RESEND_FROM ?? "vado bene? <ciao@vadobene.app>";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;",
  })[char]!);
}

function safeLink(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(process.env.NODE_ENV === "development" && url.origin === "http://localhost:3000")) {
    throw new Error("Email link must be HTTPS");
  }
  return escapeHtml(url.toString());
}

type ResendPayload = { from: string; to: string; subject: string; html: string };

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false; // non configurato: silenzioso in dev

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to, subject, html } satisfies ResendPayload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function magicLinkEmail(link: string): { subject: string; html: string } {
  return {
    subject: "Entra in vado bene?",
    html: `
<div style="font-family:Helvetica,Arial,sans-serif;background:#0E2A36;color:#F2E9D8;padding:40px 24px;text-align:center">
  <p style="font-size:34px;font-weight:800;letter-spacing:-0.045em;margin:0 0 8px">vado bene?</p>
  <p style="font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#8FA6AE;margin:0 0 32px">LO SPECCHIO CHE NON MENTE</p>
  <p style="font-size:16px;line-height:1.6;margin:0 0 28px">Tocca per entrare. Nessuna password, nessun profilo da riempire.</p>
  <a href="${safeLink(link)}" style="display:inline-block;background:#F2E9D8;color:#0E2A36;font-size:15px;font-weight:600;padding:14px 34px;border-radius:999px;text-decoration:none">Entra</a>
  <p style="font-size:12px;color:#8FA6AE;margin-top:28px">Se non hai chiesto tu questo link, ignora la mail.</p>
</div>`,
  };
}

export function juryClosedEmail(opts: {
  headline: string;
  cardUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `Ecco. ${opts.headline}`,
    html: `
<div style="font-family:Helvetica,Arial,sans-serif;background:#0E2A36;color:#F2E9D8;padding:40px 24px;text-align:center">
  <p style="font-size:34px;font-weight:800;letter-spacing:-0.045em;margin:0 0 8px">vado bene?</p>
  <p style="font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#8FA6AE;margin:0 0 32px">IL GIURÌ HA DETTO</p>
  <p style="font-size:28px;font-weight:600;margin:0 0 24px">${escapeHtml(opts.headline)}</p>
  <a href="${safeLink(opts.cardUrl)}" style="display:inline-block;background:#F2E9D8;color:#0E2A36;font-size:15px;font-weight:600;padding:14px 34px;border-radius:999px;text-decoration:none">Vedi la card</a>
  <p style="font-size:12px;color:#8FA6AE;margin-top:28px">Cinque persone vere, alla cieca. vadobene.app</p>
</div>`,
  };
}
