"use client";

import { useRef, useState } from "react";
import { resizePhoto } from "@/lib/resize";

/**
 * Zona foto (prototipo #stage-input .drop).
 * iOS Safari: div role=button che chiama input.click() in JS. MAI <label for>.
 */
export function PhotoDrop({
  photo,
  onPhoto,
  disabled,
}: {
  photo: string | null;
  onPhoto: (dataUrl: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    try {
      onPhoto(await resizePhoto(f));
    } catch {
      setError("Non riesco a leggere la foto. Riprova.");
    }
    // reset per permettere la stessa foto due volte
    e.target.value = "";
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label="Aggiungi il tuo outfit"
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        className="w-full cursor-pointer rounded-2xl border-[1.5px] border-line bg-panel px-6 py-12 text-center transition-colors hover:border-gold hover:bg-panel-2"
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="Anteprima outfit" className="mx-auto block max-h-[340px] max-w-full rounded-[10px]" />
        ) : (
          <div>
            <div className="mb-2.5 text-3xl" aria-hidden="true">◈</div>
            <h3 className="font-display text-[21px] font-normal">Manda la foto</h3>
            <p className="mt-1.5 text-sm text-muted">Scatta o scegli dalla galleria</p>
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
      {error && <p className="mt-3 text-center text-sm text-bad">{error}</p>}
    </>
  );
}
