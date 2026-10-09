import "server-only";

import { todayISO } from "./dates";
import { getDb, transaction } from "./db";

// Farm meetings (Meeting & Schedule page). A meeting is "upcoming" within the
// next 7 days, "scheduled" further out, and "past" once its date has gone.

const db = getDb;
const UPCOMING_DAYS = 7;

export type MeetingStatus = "upcoming" | "scheduled" | "past";

export type Meeting = {
  id: number;
  title: string;
  date: string;
  time: string;
  agenda: string;
  status: MeetingStatus;
  attendees: { userId: number; name: string }[];
};

function statusOf(date: string, today: string, horizon: string): MeetingStatus {
  if (date < today) return "past";
  return date <= horizon ? "upcoming" : "scheduled";
}

export function listMeetings(farmId: number): Meeting[] {
  const rows = db()
    .prepare("SELECT id, title, date, time, agenda FROM meetings WHERE farm_id = ? ORDER BY date, time")
    .all(farmId) as Omit<Meeting, "status" | "attendees">[];
  const attendees = db()
    .prepare(
      `SELECT a.meeting_id AS meetingId, u.id AS userId, u.name FROM meeting_attendees a
       JOIN users u ON u.id = a.user_id JOIN meetings m ON m.id = a.meeting_id
       WHERE m.farm_id = ? ORDER BY u.name`,
    )
    .all(farmId) as { meetingId: number; userId: number; name: string }[];
  const today = todayISO();
  const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + UPCOMING_DAYS * 86_400_000).toISOString().slice(0, 10);
  return rows.map((m) => ({
    ...m,
    status: statusOf(m.date, today, horizon),
    attendees: attendees.filter((a) => a.meetingId === m.id).map(({ userId, name }) => ({ userId, name })),
  }));
}

export function createMeeting(
  farmId: number,
  createdBy: number,
  m: { title: string; date: string; time: string; agenda: string; attendeeIds: number[] },
) {
  transaction(() => {
    const result = db()
      .prepare("INSERT INTO meetings (farm_id, title, date, time, agenda, created_by) VALUES (?, ?, ?, ?, ?, ?)")
      .run(farmId, m.title, m.date, m.time, m.agenda, createdBy);
    const meetingId = Number(result.lastInsertRowid);
    // Only people who are members of this farm can be invited.
    const members = new Set(
      (db().prepare("SELECT user_id AS id FROM memberships WHERE farm_id = ?").all(farmId) as { id: number }[]).map((r) => r.id),
    );
    const add = db().prepare("INSERT OR IGNORE INTO meeting_attendees (meeting_id, user_id) VALUES (?, ?)");
    for (const id of m.attendeeIds) if (members.has(id)) add.run(meetingId, id);
  });
}

export function deleteMeeting(farmId: number, id: number) {
  db().prepare("DELETE FROM meetings WHERE farm_id = ? AND id = ?").run(farmId, id);
}
