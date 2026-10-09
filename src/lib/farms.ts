import "server-only";

import type { Role } from "./auth";
import { farmToday } from "./dates";
import { getDb, listBatches, transaction } from "./db";
import { totalsSince } from "./finances";
import { insertFarm, newJoinCode } from "./schema";

// Farms, memberships (who can access which farm, with what role) and team
// management. Owners and managers run a farm; workers log day-to-day records.

const db = getDb;

export type FarmCard = {
  id: number;
  name: string;
  location: string;
  type: string;
  established: string | null;
  role: Role;
  manager: string | null;
  livestock: number;
  batches: number;
  users: number;
  // This year; null on farms where this person is a worker (workers don't see money).
  revenue: number | null;
  expenses: number | null;
};

export function listUserFarms(userId: number): FarmCard[] {
  const rows = db()
    .prepare(
      `SELECT f.id, f.name, f.location, f.type, f.established, m.role,
              (SELECT u.name FROM memberships mm JOIN users u ON u.id = mm.user_id
                 WHERE mm.farm_id = f.id AND mm.role IN ('manager', 'owner')
                 ORDER BY mm.role = 'manager' DESC, mm.joined_at LIMIT 1) AS manager,
              (SELECT COUNT(*) FROM memberships mm WHERE mm.farm_id = f.id AND mm.status = 'active') AS users
       FROM farms f JOIN memberships m ON m.farm_id = f.id
       WHERE m.user_id = ? AND m.status = 'active' ORDER BY f.id`,
    )
    .all(userId) as Omit<FarmCard, "livestock" | "batches" | "revenue" | "expenses">[];
  const yearStart = `${farmToday().year}-01-01`;
  return rows.map((r) => {
    const batches = listBatches(r.id);
    const totals = r.role === "worker" ? null : totalsSince(r.id, yearStart);
    return {
      ...r,
      livestock: batches.reduce((s, b) => s + b.currentCount, 0),
      batches: batches.length,
      revenue: totals?.revenue ?? null,
      expenses: totals?.expenses ?? null,
    };
  });
}

export function userCanAccessFarm(userId: number, farmId: number) {
  return Boolean(
    db().prepare("SELECT 1 FROM memberships WHERE user_id = ? AND farm_id = ? AND status = 'active'").get(userId, farmId),
  );
}

export function createFarm(
  userId: number,
  farm: { name: string; location?: string; type?: string; established?: string | null },
) {
  return transaction(() => {
    const farmId = insertFarm(db(), farm);
    db().prepare("INSERT INTO memberships (user_id, farm_id, role, title) VALUES (?, ?, 'owner', 'Owner')").run(userId, farmId);
    return farmId;
  });
}

/**
 * Sign-up: the first account on this install claims farm 1 (the sample or
 * pre-existing data) and names it; later accounts get a new, empty farm.
 */
export function setUpFarmForNewUser(userId: number, farmName: string) {
  return transaction(() => {
    const unclaimed = db()
      .prepare("SELECT f.id FROM farms f WHERE NOT EXISTS (SELECT 1 FROM memberships m WHERE m.farm_id = f.id) ORDER BY f.id LIMIT 1")
      .get() as { id: number } | undefined;
    if (unclaimed) {
      db().prepare("UPDATE farms SET name = ? WHERE id = ?").run(farmName, unclaimed.id);
      db().prepare("INSERT INTO memberships (user_id, farm_id, role, title) VALUES (?, ?, 'owner', 'Owner')").run(userId, unclaimed.id);
      return unclaimed.id;
    }
    return createFarm(userId, { name: farmName });
  });
}

// ---------- Join codes ----------

export function farmByJoinCode(code: string) {
  return db()
    .prepare("SELECT id, name FROM farms WHERE join_code = ?")
    .get(code.trim().toUpperCase()) as { id: number; name: string } | undefined;
}

export function regenerateJoinCode(farmId: number) {
  for (;;) {
    const code = newJoinCode();
    if (!db().prepare("SELECT 1 FROM farms WHERE join_code = ?").get(code)) {
      db().prepare("UPDATE farms SET join_code = ? WHERE id = ?").run(code, farmId);
      return code;
    }
  }
}

/** Adds the user to the farm as a worker. Returns false if already a member. */
export function joinFarm(userId: number, farmId: number) {
  const existing = db().prepare("SELECT status FROM memberships WHERE user_id = ? AND farm_id = ?").get(userId, farmId) as
    | { status: string }
    | undefined;
  if (existing) return false;
  db().prepare("INSERT INTO memberships (user_id, farm_id, role, title) VALUES (?, ?, 'worker', 'Worker')").run(userId, farmId);
  return true;
}

// ---------- Team ----------

export type Member = {
  userId: number;
  name: string;
  email: string;
  role: Role;
  title: string;
  status: "active" | "suspended";
  joinedAt: string;
  lastActiveAt: string | null;
  online: boolean;
  batchIds: string[];
};

export function listMembers(farmId: number): Member[] {
  const rows = db()
    .prepare(
      `SELECT u.id AS userId, u.name, u.email, m.role, m.title, m.status,
              m.joined_at AS joinedAt, m.last_active_at AS lastActiveAt,
              (m.last_active_at > datetime('now', '-15 minutes')) AS online
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.farm_id = ?
       ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, u.name`,
    )
    .all(farmId) as (Omit<Member, "online" | "batchIds"> & { online: number })[];
  const assignments = db()
    .prepare(
      `SELECT a.user_id AS userId, a.batch_id AS batchId FROM batch_assignments a
       JOIN batches b ON b.id = a.batch_id WHERE b.farm_id = ?`,
    )
    .all(farmId) as { userId: number; batchId: string }[];
  return rows.map((r) => ({
    ...r,
    online: Boolean(r.online),
    batchIds: assignments.filter((a) => a.userId === r.userId).map((a) => a.batchId),
  }));
}

export function countOwners(farmId: number) {
  return (db().prepare("SELECT COUNT(*) AS n FROM memberships WHERE farm_id = ? AND role = 'owner' AND status = 'active'").get(farmId) as { n: number }).n;
}

export function getMember(farmId: number, userId: number) {
  return listMembers(farmId).find((m) => m.userId === userId) ?? null;
}

export function updateMember(
  farmId: number,
  userId: number,
  changes: { role: Role; title: string; status: "active" | "suspended"; batchIds: string[] },
) {
  transaction(() => {
    db()
      .prepare("UPDATE memberships SET role = ?, title = ?, status = ? WHERE farm_id = ? AND user_id = ?")
      .run(changes.role, changes.title, changes.status, farmId, userId);
    db()
      .prepare("DELETE FROM batch_assignments WHERE user_id = ? AND batch_id IN (SELECT id FROM batches WHERE farm_id = ?)")
      .run(userId, farmId);
    const valid = new Set(listBatches(farmId).map((b) => b.id));
    const add = db().prepare("INSERT INTO batch_assignments (batch_id, user_id) VALUES (?, ?)");
    for (const id of changes.batchIds) if (valid.has(id)) add.run(id, userId);
  });
}

export function removeMember(farmId: number, userId: number) {
  transaction(() => {
    db()
      .prepare("DELETE FROM batch_assignments WHERE user_id = ? AND batch_id IN (SELECT id FROM batches WHERE farm_id = ?)")
      .run(userId, farmId);
    db().prepare("DELETE FROM memberships WHERE farm_id = ? AND user_id = ?").run(farmId, userId);
  });
}

// Lightweight list for the farm switcher.
export function listFarmNames(userId: number) {
  return (
    db()
      .prepare(
        `SELECT f.id, f.name FROM farms f JOIN memberships m ON m.farm_id = f.id
         WHERE m.user_id = ? AND m.status = 'active' ORDER BY f.id`,
      )
      .all(userId) as { id: number; name: string }[]
  ).map((f) => ({ ...f }));
}
