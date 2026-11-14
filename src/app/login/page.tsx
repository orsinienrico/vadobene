"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { createClient } from "@/lib/supabase/client";

/**
 * Invite-only beta login: email OTP, no password and no public account creation.
 * Supabase Auth must be configured to email {{ .Token }} with custom SMTP.
 * The server independently enforces BETA_ALLOWED_EMAILS on protected APIs.
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user && data.user.is_anonymous !== true && data.user.email) setSignedIn(true);
    });
  }, []);

  const requestCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: false },
      });
      if (error) {
        setMessage("Non riesco a inviare il codice. Verifica il tuo invito o riprova.");
      } else {
        setStep("code");
        setMessage("Controlla la mail. Il codice è monouso.");
      }
    } catch {
      setMessage("Servizio temporaneamente non disponibile.");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !/^[0-9]{6,8}$/.test(code.trim())) {
      setMessage("Inserisci il codice ricevuto via email.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: "email",
      });
      if (error) {
        setMessage("Codice non valido o scaduto. Riprova.");
      } else {
        window.location.assign("/");
      }
    } catch {
      setMessage("Verifica non riuscita. Riprova.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    await createClient().auth.signOut();
    setSignedIn(false);
    setStep("email");
    setCode("");
    setBusy(false);
  };

  return (
    <main className="mx-auto max-w-[440px] px-6 pb-24 pt-16">
      <Link href="/" aria-label="Torna alla home"><Brand size={22} /></Link>
      <h1 className="mt-10 font-display text-[clamp(30px,5vw,42px)] font-normal">
        Benvenuto nel Giurì.
      </h1>
      <p className="mt-4 text-[15px] leading-7 text-muted">
        La beta è su invito. Niente password: entra con il codice che ricevi via email.
      </p>

      {signedIn ? (
        <div className="mt-8 flex flex-col gap-3">
          <Link href="/" className="rounded-xl bg-gold px-5 py-3 text-center font-semibold text-ink">
            Torna a VadoBene
          </Link>
          <button type="button" onClick={signOut} disabled={busy}
            className="rounded-xl border border-line px-5 py-3 text-sm text-gold disabled:opacity-50">
            Esci dall&apos;account
          </button>
        </div>
      ) : (
        <form onSubmit={step === "email" ? requestCode : verifyCode} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm text-muted">
            La tua email
            <input type="email" autoComplete="email" required disabled={busy || step === "code"}
              value={email} onChange={(event) => setEmail(event.target.value)}
              placeholder="nome@esempio.it"
              className="w-full rounded-xl border border-line bg-panel px-4 py-3 text-gold outline-none focus:border-gold disabled:opacity-70" />
          </label>
          {step === "code" && (
            <label className="flex flex-col gap-2 text-sm text-muted">
              Codice ricevuto
              <input type="text" inputMode="numeric" autoComplete="one-time-code"
                required maxLength={8} value={code} onChange={(event) => setCode(event.target.value)}
                placeholder="000000"
                className="w-full rounded-xl border border-line bg-panel px-4 py-3 text-gold outline-none focus:border-gold" />
            </label>
          )}
          <button type="submit" disabled={busy} className="rounded-xl bg-gold px-5 py-3 font-semibold text-ink disabled:opacity-50">
            {busy ? "Un momento…" : step === "email" ? "Ricevi il codice" : "Entra"}
          </button>
          {step === "code" && (
            <button type="button" onClick={() => { setStep("email"); setCode(""); setMessage(""); }}
              className="rounded-xl border border-line px-5 py-3 text-sm text-muted">Cambia email</button>
          )}
          {message && <p role="status" className="text-sm leading-6 text-muted">{message}</p>}
        </form>
      )}
      <p className="mt-8 text-[13px] text-muted">
        Solo chi ha ricevuto un invito può partecipare. <Link className="underline" href="/privacy">Privacy</Link>
      </p>
    </main>
  );
}
