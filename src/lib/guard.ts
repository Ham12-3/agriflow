import "server-only";

import { authorize, ForbiddenError, type Context, type Role } from "./auth";

export type FormResult = {
  ok: boolean;
  error?: string;
  savedAt?: number;
  // Non-secret values to put back in the form after an error (never passwords).
  fields?: Record<string, string>;
};

/**
 * Runs a form Server Action for the signed-in user's active farm. Permission
 * problems come back as a form error instead of an exception.
 */
export async function guarded<T extends FormResult>(
  min: Role,
  fn: (ctx: Context) => T | Promise<T>,
): Promise<T | FormResult> {
  let ctx: Context;
  try {
    ctx = await authorize(min);
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    throw err; // redirects to /login
  }
  return fn(ctx);
}
