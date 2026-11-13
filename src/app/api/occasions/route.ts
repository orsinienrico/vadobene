import { requireLiveInteractions } from "@/lib/launch-control";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Lista occasioni dal DB (seed della migrazione). */
export async function GET() {
  const unavailable = requireLiveInteractions();
  if (unavailable) return unavailable;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("occasions")
    .select("slug, label_it")
    .order("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ occasions: data });
}
