"use server";

import { refresh } from "next/cache";
import { authorize, hasRole, type Role } from "@/lib/auth";
import { countOwners, getMember, regenerateJoinCode, removeMember, updateMember } from "@/lib/farms";
import { guarded, type FormResult } from "@/lib/guard";

// Owners can change anyone's role; managers can edit workers' titles, status
// and batch assignments. A farm always keeps at least one active owner.

const ROLES: Role[] = ["owner", "manager", "worker"];

export async function regenerateJoinCodeAction() {
  const ctx = await authorize("manager");
  regenerateJoinCode(ctx.farm.id);
  refresh();
}

export async function updateMemberAction(userId: number, _prev: FormResult, form: FormData): Promise<FormResult> {
  return guarded("manager", (ctx) => {
    const member = getMember(ctx.farm.id, userId);
    if (!member) return { ok: false, error: "That person isn't on this farm any more." };

    const role = String(form.get("role")) as Role;
    const status = form.get("status") === "suspended" ? "suspended" : "active";
    const title = String(form.get("title") ?? "").trim().slice(0, 40);
    const batchIds = form.getAll("batchIds").map(String);
    if (!ROLES.includes(role)) return { ok: false, error: "Pick a role." };

    const isOwner = hasRole(ctx, "owner");
    if (!isOwner && (member.role !== "worker" || role !== "worker")) {
      return { ok: false, error: "Only the farm owner can change managers or owners." };
    }
    const losesOwner = member.role === "owner" && (role !== "owner" || status !== "active");
    if (losesOwner && countOwners(ctx.farm.id) <= 1) {
      return { ok: false, error: "The farm needs at least one active owner. Make someone else owner first." };
    }

    updateMember(ctx.farm.id, userId, { role, title, status, batchIds });
    refresh();
    return { ok: true };
  });
}

export async function removeMemberAction(userId: number): Promise<FormResult> {
  return guarded("manager", (ctx) => {
    const member = getMember(ctx.farm.id, userId);
    if (!member) return { ok: true };
    if (!hasRole(ctx, "owner") && member.role !== "worker") {
      return { ok: false, error: "Only the farm owner can remove managers or owners." };
    }
    if (member.role === "owner" && countOwners(ctx.farm.id) <= 1) {
      return { ok: false, error: "You can't remove the farm's only owner." };
    }
    removeMember(ctx.farm.id, userId);
    refresh();
    return { ok: true };
  });
}
