import "server-only";

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { getDb } from "./db";

// Accounts and sessions. Sessions are random tokens in an httpOnly cookie;
// only a SHA-256 hash of the token is stored, so a leaked database can't be
// used to sign in. This is the Data Access Layer: pages, actions and API
// routes all get the signed-in user and active farm through getContext().

export const SESSION_COOKIE = "agriflow_session";
const REMEMBER_DAYS = 30;
const SESSION_HOURS = 24;

export type Role = "owner" | "manager" | "worker";
const RANK: Record<Role, number> = { worker: 0, manager: 1, owner: 2 };

export type Context = {
  user: { id: number; name: string; email: string };
  farm: {
    id: number;
    name: string;
    location: string;
    type: string;
    established: string | null;
    code: string;
    joinCode: string;
  };
  role: Role;
  title: string;
  farmCount: number;
};

// ---------- Passwords ----------

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scryptAsync(password, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

export function passwordProblem(password: string) {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/\d/.test(password)) return "Password must include a number.";
  return null;
}

// ---------- Users ----------

export function findUserByEmail(email: string) {
  return getDb()
    .prepare("SELECT id, name, email, password_hash AS passwordHash FROM users WHERE email = ?")
    .get(email.trim()) as { id: number; name: string; email: string; passwordHash: string } | undefined;
}

export async function createUser(input: { name: string; email: string; password: string }) {
  const result = getDb()
    .prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)")
    .run(input.name.trim(), input.email.trim(), await hashPassword(input.password));
  return Number(result.lastInsertRowid);
}

// ---------- Sessions ----------

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function sqlTime(date: Date) {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

export async function startSession(userId: number, farmId: number | null, remember: boolean) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + (remember ? REMEMBER_DAYS * 86_400_000 : SESSION_HOURS * 3_600_000));
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
  db.prepare("INSERT INTO sessions (token_hash, user_id, farm_id, expires_at) VALUES (?, ?, ?, ?)").run(
    hashToken(token),
    userId,
    farmId,
    sqlTime(expires),
  );
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Without "remember me" the cookie ends with the browser session.
    ...(remember ? { expires } : {}),
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  store.delete(SESSION_COOKIE);
}

async function sessionTokenHash() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

export async function setActiveFarm(farmId: number) {
  const tokenHash = await sessionTokenHash();
  if (tokenHash) getDb().prepare("UPDATE sessions SET farm_id = ? WHERE token_hash = ?").run(farmId, tokenHash);
}

// ---------- Context (Data Access Layer) ----------

type SessionRow = { userId: number; farmId: number | null; name: string; email: string };
type FarmRow = Context["farm"] & { role: Role; title: string; status: string };

const FARM_SELECT = `
  SELECT f.id, f.name, f.location, f.type, f.established, f.code, f.join_code AS joinCode,
         m.role, m.title, m.status
  FROM farms f JOIN memberships m ON m.farm_id = f.id`;

/** The signed-in user and their active farm, or null. Cached per request. */
export const getContext = cache(async (): Promise<Context | null> => {
  // Everything that follows is request-time work (clock, database).
  await connection();
  const tokenHash = await sessionTokenHash();
  if (!tokenHash) return null;
  const db = getDb();
  const session = db
    .prepare(
      `SELECT s.user_id AS userId, s.farm_id AS farmId, u.name, u.email
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
    )
    .get(tokenHash) as SessionRow | undefined;
  if (!session) return null;

  let farm = session.farmId
    ? (db.prepare(`${FARM_SELECT} WHERE m.user_id = ? AND f.id = ? AND m.status = 'active'`).get(session.userId, session.farmId) as FarmRow | undefined)
    : undefined;
  // Active farm missing (never set, or access removed): fall back to their first farm.
  farm ??= db
    .prepare(`${FARM_SELECT} WHERE m.user_id = ? AND m.status = 'active' ORDER BY f.id LIMIT 1`)
    .get(session.userId) as FarmRow | undefined;
  if (!farm) return null;

  const { n: farmCount } = db
    .prepare("SELECT COUNT(*) AS n FROM memberships WHERE user_id = ? AND status = 'active'")
    .get(session.userId) as { n: number };

  // "Last active" for the Team page, throttled to one write per 5 minutes.
  db.prepare(
    `UPDATE memberships SET last_active_at = datetime('now')
     WHERE user_id = ? AND farm_id = ?
       AND (last_active_at IS NULL OR last_active_at < datetime('now', '-5 minutes'))`,
  ).run(session.userId, farm.id);

  return {
    user: { id: session.userId, name: session.name, email: session.email },
    farm: {
      id: farm.id,
      name: farm.name,
      location: farm.location,
      type: farm.type,
      established: farm.established,
      code: farm.code,
      joinCode: farm.joinCode,
    },
    role: farm.role,
    title: farm.title,
    farmCount,
  };
});

/** For pages: the context, or a redirect to the login page. */
export async function requireContext(): Promise<Context> {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  return ctx;
}

export function hasRole(ctx: Context, min: Role) {
  return RANK[ctx.role] >= RANK[min];
}

export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to do that on this farm.") {
    super(message);
  }
}

/** For Server Actions: the context with at least `min` role, or throws. */
export async function authorize(min: Role = "worker"): Promise<Context> {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (!hasRole(ctx, min)) throw new ForbiddenError();
  return ctx;
}
