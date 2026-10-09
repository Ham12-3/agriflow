import "server-only";

import type { Context } from "@/lib/auth";
import { getDashboardData, summarizeForAI } from "@/lib/dashboard";
import { buildSystemPrompt, warmUp } from "./natlas";

// The system prompt for this person's farm. Built on the server so the client
// can't change the farm data the assistant sees.
export function farmSystemPrompt(ctx: Context) {
  return buildSystemPrompt(summarizeForAI(getDashboardData(ctx)));
}

// Warm-ups are skipped when the same prompt was warmed in the last few minutes.
const WARM_FOR_MS = 5 * 60_000;
const warmed = new Map<string, number>();

/** Returns the warm-up to run (after the response is sent), or null if it's recent. */
export function warmUpFor(ctx: Context): (() => Promise<void>) | null {
  const prompt = farmSystemPrompt(ctx);
  const last = warmed.get(prompt);
  if (last && Date.now() - last < WARM_FOR_MS) return null;
  warmed.set(prompt, Date.now());
  if (warmed.size > 50) warmed.delete(warmed.keys().next().value!);
  return async () => {
    const ok = await warmUp(prompt).catch((err) => {
      console.error("AI warm-up failed", err);
      return false;
    });
    if (!ok) warmed.delete(prompt);
  };
}
