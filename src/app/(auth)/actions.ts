"use server";

import { redirect } from "next/navigation";
import {
  createUser,
  endSession,
  findUserByEmail,
  getContext,
  passwordProblem,
  setActiveFarm,
  startSession,
  verifyPassword,
} from "@/lib/auth";
import { farmByJoinCode, joinFarm, setUpFarmForNewUser, userCanAccessFarm } from "@/lib/farms";
import type { FormResult } from "@/lib/guard";

const field = (form: FormData, key: string, max = 120) => String(form.get(key) ?? "").trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Only same-site paths, never "//evil.com".
function safeNext(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function signUpAction(_prev: FormResult, form: FormData): Promise<FormResult> {
  const name = field(form, "name", 80);
  const email = field(form, "email");
  const farmName = field(form, "farmName", 80);
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const fail = (error: string): FormResult => ({ ok: false, error, fields: { name, email, farmName } });

  if (!name || !farmName) return fail("Enter your name and your farm or business name.");
  if (!EMAIL.test(email)) return fail("Enter a valid email address.");
  const weak = passwordProblem(password);
  if (weak) return fail(weak);
  if (password !== confirm) return fail("The passwords don't match.");
  if (form.get("terms") !== "on") return fail("Please accept the Terms of Service and Privacy Policy.");
  if (findUserByEmail(email)) return fail("An account with this email already exists. Log in instead.");

  const userId = await createUser({ name, email, password });
  const farmId = setUpFarmForNewUser(userId, farmName);
  await startSession(userId, farmId, true);
  redirect("/");
}

export async function logInAction(_prev: FormResult, form: FormData): Promise<FormResult> {
  const email = field(form, "email");
  const password = String(form.get("password") ?? "");
  const user = email ? findUserByEmail(email) : undefined;
  // Same message either way, so the form doesn't reveal which emails exist.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, error: "That email and password don't match. Try again.", fields: { email } };
  }
  await startSession(user.id, null, form.get("remember") === "on");
  redirect(safeNext(field(form, "next", 200)));
}

export async function joinFarmAction(_prev: FormResult, form: FormData): Promise<FormResult> {
  const farm = farmByJoinCode(field(form, "code", 20));
  if (!farm) return { ok: false, error: "That farm code wasn't found. Check it with your farm owner." };

  const ctx = await getContext();
  if (ctx) {
    joinFarm(ctx.user.id, farm.id);
    await setActiveFarm(farm.id);
    redirect("/");
  }

  // New worker: create their account as part of joining.
  const name = field(form, "name", 80);
  const email = field(form, "email");
  const password = String(form.get("password") ?? "");
  const fail = (error: string): FormResult => ({ ok: false, error, fields: { name, email } });
  if (!name) return fail("Enter your name.");
  if (!EMAIL.test(email)) return fail("Enter a valid email address.");
  const weak = passwordProblem(password);
  if (weak) return fail(weak);
  if (findUserByEmail(email)) return fail("You already have an account — log in first, then open the join link again.");
  const userId = await createUser({ name, email, password });
  joinFarm(userId, farm.id);
  await startSession(userId, farm.id, true);
  redirect("/");
}

export async function signOutAction() {
  await endSession();
  redirect("/login");
}

export async function switchFarmAction(farmId: number) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (userCanAccessFarm(ctx.user.id, farmId)) await setActiveFarm(farmId);
  redirect("/");
}
