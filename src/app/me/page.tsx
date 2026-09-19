"use client";

import { useEffect, useState } from "react";
import { Brand } from "@/components/Brand";

type Profile = {
  email: string | null;
  plan: string;
  jury_credit: number;
  juror_score: number;
};

/**
 * /me — Fase 4: credito, juror_score, piano, "Cancella tutto" (hard delete).
 */
export default function MePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("users")
        .select("email, plan, jury_credit, juror_score")
        .eq("id", userData.user.id)
        .single();
      setProfile(data);
      setLoading(false);
    })();
  }, []);

  const deleteAll = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/me/delete-all", { method: "POST" });
      if (res.ok) {
        window.location.href = "/";
      } else {
        const d = await res.json();
        setMessage(d.error ?? "Cancellazione non riuscita.");
        setDeleting(false);
      }
    } catch {
      setMessage("Cancellazione non riuscita.");
      setDeleting(false);
    }
  };

  return (
    <main className="mx-auto max-w-[430px] px-6 py-16">
      <Brand size={21} />
      <h1 className="mt-6 font-display text-3xl font-normal">Il tuo account</h1>

      {loading ? (
        <p className="mt-6 text-muted">…</p>
      ) : !profile ? (
        <p className="mt-6 text-muted">
          Non sei dentro. Torna alla home e chiedi il tuo primo parere.
        </p>
      ) : (
        <>
          <div className="mt-8 rounded-2xl border border-line bg-panel px-6 py-6">
            <dl className="flex flex-col gap-4 text-[15px]">
              <div className="flex justify-between">
                <dt className="text-muted">Piano</dt>
                <dd className="font-semibold">{profile.plan === "pro" ? "Pro" : "Free"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Credito giurì</dt>
                <dd className="font-semibold">{profile.jury_credit} / 5</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Voti dati</dt>
                <dd className="font-semibold">{profile.juror_score}</dd>
              </div>
              {profile.email && (
                <div className="flex justify-between">
                  <dt className="text-muted">Email</dt>
                  <dd className="truncate font-semibold">{profile.email}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="mt-8 rounded-2xl border border-bad/40 bg-panel px-6 py-6">
            <h2 className="font-display text-xl font-normal">Cancella tutto</h2>
            <p className="mt-2 text-sm text-muted">
              Elimina account, richieste, voti e foto. Subito, senza attesa. Non si torna indietro.
            </p>
            {!confirming ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="mt-4 rounded-xl border border-bad px-5 py-3 text-sm font-semibold text-bad hover:bg-bad/10"
              >
                Cancella tutto
              </button>
            ) : (
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={deleteAll}
                  className="rounded-xl bg-bad px-5 py-3 text-sm font-semibold text-ink disabled:opacity-50"
                >
                  {deleting ? "Sto cancellando…" : "Sì, cancella davvero"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-xl border border-line px-5 py-3 text-sm font-semibold"
                >
                  Annulla
                </button>
              </div>
            )}
            {message && <p className="mt-3 text-sm text-bad">{message}</p>}
          </div>
        </>
      )}
    </main>
  );
}
