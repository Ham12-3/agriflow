"use client";

import { CalendarClock, Plus, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { deleteMeetingAction, scheduleMeetingAction } from "@/app/(main)/meetings/actions";
import { Button, Field, FormError, Switch } from "@/components/ui";
import { useDialogAction } from "@/components/use-dialog-action";
import { formatDay } from "@/lib/dates";
import type { Meeting, MeetingStatus } from "@/lib/meetings";

type MemberOption = { userId: number; name: string };

const STATUS_PILL: Record<MeetingStatus, string> = {
  upcoming: "border-good/40 bg-good-soft text-good",
  scheduled: "border-line bg-background text-neutral-700",
  past: "border-line bg-background text-muted",
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function MeetingsView({
  meetings,
  members,
  canManage,
}: {
  meetings: Meeting[];
  members: MemberOption[];
  canManage: boolean;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [showPast, setShowPast] = useState(false);
  const upcoming = meetings.filter((m) => m.status === "upcoming").length;
  const scheduled = meetings.filter((m) => m.status === "scheduled").length;
  const current = meetings.filter((m) => m.status !== "past");
  const past = meetings.filter((m) => m.status === "past").reverse();

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Meeting &amp; Schedule</h2>
          <p className="mt-1 text-sm text-muted">View and edit upcoming and scheduled meetings.</p>
        </div>
        {canManage && (
          <Button onClick={() => titleRef.current?.focus()}>
            <Plus className="size-4" /> Schedule Meeting
          </Button>
        )}
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3 sm:gap-4 lg:max-w-3xl">
        {[
          ["Upcoming", upcoming],
          ["Scheduled", scheduled],
          ["Total", meetings.length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line bg-card p-4 sm:p-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{label}</p>
            <p className="mt-3 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {canManage ? (
          <QuickSchedule members={members} titleRef={titleRef} />
        ) : (
          <p className="h-fit rounded-2xl border border-line bg-card p-5 text-sm text-muted">
            Your farm manager schedules meetings. You&apos;ll see the ones you&apos;re invited to here.
          </p>
        )}

        <section className="min-w-0 space-y-3">
          {current.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line bg-card px-5 py-12 text-center">
              <CalendarClock className="mx-auto size-6 text-muted" />
              <p className="mt-2 text-sm font-medium">No meetings scheduled</p>
              <p className="text-xs text-muted">Use Quick Schedule to plan your next farm review.</p>
            </div>
          )}
          {current.map((m) => (
            <MeetingCard key={m.id} meeting={m} canManage={canManage} />
          ))}
          {past.length > 0 && (
            <div>
              <button onClick={() => setShowPast((s) => !s)} className="text-xs font-medium text-muted hover:text-foreground">
                {showPast ? "Hide" : "Show"} past meetings ({past.length})
              </button>
              {showPast && (
                <div className="mt-3 space-y-3">
                  {past.map((m) => (
                    <MeetingCard key={m.id} meeting={m} canManage={canManage} />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function MeetingCard({ meeting: m, canManage }: { meeting: Meeting; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <article className={`rounded-2xl border border-line bg-card p-5 ${pending ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{m.title}</h3>
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATUS_PILL[m.status]}`}>{m.status}</span>
        </div>
        {canManage && (
          <button
            onClick={() => {
              if (confirm(`Cancel "${m.title}"?`)) startTransition(() => deleteMeetingAction(m.id));
            }}
            className="grid size-7 place-items-center rounded-md text-muted hover:bg-bad-soft hover:text-bad"
            aria-label={`Cancel ${m.title}`}
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-sm">
        <CalendarClock className="size-4 text-muted" />
        {formatDay(m.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} at {m.time}
      </p>
      {m.agenda && <p className="mt-2 whitespace-pre-line text-sm text-muted">{m.agenda}</p>}
      <div className="mt-3 flex items-center gap-2 text-xs text-muted">
        Attendees:
        {m.attendees.length === 0 ? (
          <span>none yet</span>
        ) : (
          <span className="flex -space-x-1.5">
            {m.attendees.map((a) => (
              <span
                key={a.userId}
                title={a.name}
                className="grid size-7 place-items-center rounded-full border-2 border-card bg-neutral-200 text-[10px] font-semibold text-neutral-700"
              >
                {initials(a.name)}
              </span>
            ))}
          </span>
        )}
      </div>
    </article>
  );
}

function QuickSchedule({
  members,
  titleRef,
}: {
  members: MemberOption[];
  titleRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [invited, setInvited] = useState<Set<number>>(new Set());
  const [formKey, setFormKey] = useState(0);
  // Clear the form after a successful save.
  const [state, onSubmit, pending] = useDialogAction(scheduleMeetingAction, () => {
    setInvited(new Set());
    setFormKey((k) => k + 1);
  });
  const today = new Date().toLocaleDateString("en-CA");

  return (
    <form key={formKey} onSubmit={onSubmit} className="h-fit rounded-2xl border border-line bg-card p-5">
      <h3 className="mb-4 text-lg font-semibold">Quick Schedule</h3>
      <div className="space-y-4">
        <Field ref={titleRef} label="Title" name="title" required placeholder="Monthly Farm Review" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" name="date" type="date" required min={today} />
          <Field label="Time" name="time" type="time" required defaultValue="08:00" />
        </div>
        <fieldset>
          <legend className="text-xs font-medium text-neutral-700">Attendees</legend>
          <ul className="mt-1.5 space-y-2 rounded-xl bg-background p-2">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-3 rounded-lg bg-card px-3 py-2">
                <span className="flex items-center gap-2 text-sm">
                  <span className="grid size-6 place-items-center rounded-full bg-neutral-200 text-[10px] font-semibold">{initials(m.name)}</span>
                  {m.name}
                </span>
                <Switch
                  checked={invited.has(m.userId)}
                  label={`Invite ${m.name}`}
                  onChange={(on) =>
                    setInvited((prev) => {
                      const next = new Set(prev);
                      if (on) next.add(m.userId);
                      else next.delete(m.userId);
                      return next;
                    })
                  }
                />
                {invited.has(m.userId) && <input type="hidden" name="attendees" value={m.userId} />}
              </li>
            ))}
          </ul>
        </fieldset>
        <label className="block">
          <span className="text-xs font-medium text-neutral-700">Agenda</span>
          <textarea
            name="agenda"
            rows={3}
            placeholder="Meeting agenda…"
            className="mt-1.5 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none ring-foreground/10 placeholder:text-neutral-400 focus:ring-2"
          />
        </label>
        <FormError message={state.error} />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Scheduling…" : "Schedule meeting"}
        </Button>
      </div>
    </form>
  );
}
