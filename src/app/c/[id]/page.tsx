import { liveInteractionsEnabled } from "@/lib/launch-control";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { Brand } from "@/components/Brand";
import type { JurySummary } from "@/lib/contracts";

export const dynamic = "force-dynamic";

/**
 * Titolo e descrizione dalla summary (headline + riga pubblica della card).
 * Solo dati già visibili nella card condivisibile: niente foto, niente nome.
 * ogg/twitter sono coperti da opengraph-image.tsx.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!liveInteractionsEnabled()) return { title: "vado bene?" };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { title: "vado bene?" };

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("requests")
    .select("jury_summary")
    .eq("id", id)
    .eq("status", "jury_closed")
    .single();
  const summary = data?.jury_summary as JurySummary | null;
  if (!summary) return { title: "vado bene?" };

  const description = summary.quote
    ? summary.quote
    : summary.top_tweak
      ? `Modifica più votata: ${summary.top_tweak}`
      : "Cinque persone vere, alla cieca.";
  return { title: `vado bene? — ${summary.headline}`, description };
}

/**
 * Permalink pubblico della card — Fase 3.
 * Mostra solo la card. MAI la foto se keep_photo = false.
 *
 * Lettura con service role: RLS blocca i visitatori non owner/giurati e la
 * card deve essere raggiungibile da chi riceve il link (WhatsApp, ecc.).
 * La select copre SOLO i campi pubblici della card — mai votes, note o
 * dati dell'utente.
 */
export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!liveInteractionsEnabled()) notFound();

  // UUID valido altrimenti notFound.
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = createAdminClient();
  const { data: request } = await supabase
    .from("requests")
    .select("jury_summary, keep_photo, photo_path, occasion_id, custom_occasion")
    .eq("id", id)
    .eq("status", "jury_closed")
    .single();

  if (!request?.jury_summary) notFound();

  const summary = request.jury_summary as JurySummary;

  let occasionLabel = request.custom_occasion ?? "";
  if (request.occasion_id) {
    const { data: occ } = await supabase
      .from("occasions")
      .select("label_it")
      .eq("id", request.occasion_id)
      .single();
    occasionLabel = occ?.label_it ?? occasionLabel;
  }

  // Foto SOLO se keep_photo. Bucket privato: URL firmato a lunga scadenza.
  let photoUrl: string | null = null;
  if (request.keep_photo && request.photo_path) {
    const { data: signed } = await supabase.storage
      .from("outfits")
      .createSignedUrl(request.photo_path, 60 * 60 * 24);
    photoUrl = signed?.signedUrl ?? null;
  }

  const resultColor =
    summary.result === "yes" ? "text-ok" : summary.result === "tweak" ? "text-warn" : "text-bad";
  const order: ("yes" | "tweak" | "no")[] = [
    ...Array(summary.yes).fill("yes"),
    ...Array(summary.tweak).fill("tweak"),
    ...Array(summary.no).fill("no"),
  ];

  return (
    <main className="flex min-h-svh items-center justify-center px-6 py-12">
      <div className="w-full max-w-[430px] rounded-[20px] border border-line bg-gradient-to-br from-panel-2 to-panel px-7 py-[30px] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-baseline justify-between border-b border-line pb-4">
          <Brand size={16} />
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
            {occasionLabel}
          </span>
        </div>

        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="L'outfit" className="mt-5 w-full rounded-xl" />
        )}

        <div className={`mb-2.5 mt-6 font-display text-[44px] font-semibold leading-none ${resultColor}`}>
          {summary.headline}
        </div>
        <div className="mb-3.5 flex gap-1.5">
          {order.slice(0, 5).map((v, i) => (
            <span
              key={i}
              className={`h-2.5 w-2.5 rounded-full ${v === "yes" ? "bg-ok" : v === "tweak" ? "bg-warn" : "bg-bad"}`}
            />
          ))}
        </div>
        {summary.top_tweak && (
          <p className="text-[14.5px] text-gold">
            Modifica più votata: <b className="font-semibold">{summary.top_tweak}</b>
          </p>
        )}
        {summary.quote && (
          <div className="mt-[18px] border-l-2 border-gold bg-gold/5 px-[18px] py-4 font-display text-base italic leading-[1.5]">
            &ldquo;{summary.quote}&rdquo;
          </div>
        )}

        <p className="mt-4 text-center font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">
          {summary.ai_votes > 0
            ? `${summary.human_votes} persone vere + ${summary.ai_votes} pareri automatici`
            : "Cinque persone vere · alla cieca"}
        </p>

        <Link
          href="/"
          className="mt-6 block rounded-xl bg-gold py-[15px] text-center text-sm font-semibold text-ink hover:bg-gold-bright"
        >
          Chiedilo anche tu
        </Link>
      </div>
    </main>
  );
}
