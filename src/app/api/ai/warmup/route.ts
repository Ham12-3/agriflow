import { after } from "next/server";
import { getContext } from "@/lib/auth";
import { warmUpFor } from "@/lib/ai/prompt";

// Called when a chat opens: loads N-ATLaS and reads the farm data in the
// background, so the first answer starts quickly.
export async function POST() {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Please sign in again." }, { status: 401 });
  try {
    const warm = warmUpFor(ctx);
    if (warm) after(warm);
    return Response.json({ started: Boolean(warm) });
  } catch (err) {
    console.error("AI warm-up failed", err);
    return Response.json({ started: false });
  }
}
