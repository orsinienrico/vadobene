/**
 * Il messaggio inviato nel thread (prototipo .thread .sent):
 * foto + "Vado bene? {occasione}."
 */
export function ThreadSent({ photo, occasion }: { photo: string; occasion: string }) {
  return (
    <div className="max-w-[80%] self-end rounded-[18px_18px_4px_18px] border border-line bg-panel-2 p-2.5 text-[15px]">
      <div className="mb-2 aspect-[3/4] w-full overflow-hidden rounded-xl bg-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt="Il tuo outfit" className="block h-full w-full object-cover" />
      </div>
      <b className="font-semibold">Vado bene?</b> {occasion}.
    </div>
  );
}
