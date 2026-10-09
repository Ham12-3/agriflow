"use client";

import { Calculator, Download, Package, Plus, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { deleteTransactionAction } from "@/app/(main)/finances/actions";
import { Button } from "@/components/ui";
import { downloadFile, toCsv } from "@/lib/csv";
import { formatNairaFull } from "@/lib/farm-data";
import type { Transaction } from "@/lib/finances";
import { AddTransactionDialog, FinCalcDialog } from "./finance-dialogs";

type Summary = {
  revenue: number;
  expenses: number;
  net: number;
  margin: number | null;
};

const FILTERS = { all: "All", income: "Income", expense: "Expenses" } as const;

function transactionsCsv(rows: Transaction[]) {
  return toCsv(
    ["Date", "Type", "Category", "Description", "Amount (NGN)", "Batch"],
    rows.map((r) => [r.date, r.type, r.category, r.description, r.type === "expense" ? -r.amount : r.amount, r.batchId]),
  );
}

export function FinanceView({
  summary,
  transactions,
  truncated,
  batches,
}: {
  summary: Summary;
  transactions: Transaction[];
  truncated: boolean;
  batches: { id: string; label: string }[];
}) {
  const [dialog, setDialog] = useState<"add" | "calc" | null>(null);
  const [filter, setFilter] = useState<keyof typeof FILTERS>("all");

  const shown = useMemo(
    () => (filter === "all" ? transactions : transactions.filter((t) => t.type === filter)),
    [transactions, filter],
  );

  function exportCsv() {
    downloadFile("agriflow-transactions.csv", transactionsCsv(transactions), "text/csv");
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Financial Records</h2>
          <p className="mt-1 text-sm text-muted">
            Track ROI, categorize expenses, and monitor cash flow.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportCsv} disabled={!transactions.length}>
            <Download className="size-4" /> Export
          </Button>
          <Button variant="secondary" onClick={() => setDialog("calc")}>
            <Calculator className="size-4" /> Fin Calc.
          </Button>
          <Button onClick={() => setDialog("add")}>
            <Plus className="size-4" /> Add Transaction
          </Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Revenue" value={formatNairaFull(summary.revenue)} tone="text-good" />
        <Stat label="Expenses" value={formatNairaFull(summary.expenses)} tone="text-bad" />
        <Stat
          label="Net profit"
          value={formatNairaFull(summary.net)}
          tone={summary.net < 0 ? "text-bad" : "text-foreground"}
        />
        <Stat
          label="Profit margin"
          value={summary.margin === null ? "—" : `${Math.round(summary.margin).toString().replace("-", "−")}%`}
          tone={summary.margin !== null && summary.margin < 0 ? "text-bad" : "text-foreground"}
        />
      </div>

      <div>
        <section className="min-w-0 rounded-2xl border border-line bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h3 className="text-base font-semibold">Recent Transactions</h3>
            <div className="flex items-center gap-3">
              <div className="flex gap-1 rounded-lg bg-background p-0.5" role="tablist" aria-label="Filter">
                {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((f) => (
                  <button
                    key={f}
                    role="tab"
                    aria-selected={filter === f}
                    onClick={() => setFilter(f)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                      filter === f ? "bg-card text-foreground shadow-sm" : "text-muted"
                    }`}
                  >
                    {FILTERS[f]}
                  </button>
                ))}
              </div>
              <span className="text-xs text-muted">
                {shown.length} {shown.length === 1 ? "record" : "records"}
              </span>
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <p className="text-sm text-muted">No transactions yet.</p>
              <button
                onClick={() => setDialog("add")}
                className="mt-2 text-sm font-semibold underline underline-offset-4"
              >
                Add your first transaction
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {shown.map((t) => (
                <TransactionRow key={t.id} t={t} />
              ))}
            </ul>
          )}
          {truncated && (
            <p className="border-t border-line px-5 py-3 text-xs text-muted">
              Showing the latest 500 transactions. Export includes the same rows.
            </p>
          )}
        </section>

      </div>

      {dialog === "add" && <AddTransactionDialog batches={batches} onClose={() => setDialog(null)} />}
      {dialog === "calc" && <FinCalcDialog onClose={() => setDialog(null)} />}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className={`mt-2 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl ${tone}`}>{value}</p>
    </div>
  );
}

function TransactionRow({ t }: { t: Transaction }) {
  const [pending, startTransition] = useTransition();
  const income = t.type === "income";
  return (
    <li className={`flex items-center gap-4 px-5 py-3.5 ${pending ? "opacity-40" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{t.description}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <span className="font-mono">{t.date}</span>
          <span>·</span>
          <span>{t.category}</span>
          {t.batchId && (
            <>
              <span>·</span>
              <Link href={`/production/${t.batchId}`} className="underline-offset-2 hover:underline">
                {t.batchId}
              </Link>
            </>
          )}
          {t.source === "inventory" && (
            <span className="inline-flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600">
              <Package className="size-3" /> From inventory
            </span>
          )}
        </p>
      </div>
      <span className={`whitespace-nowrap text-sm font-semibold tabular-nums ${income ? "text-good" : "text-bad"}`}>
        {income ? "+" : "−"}
        {formatNairaFull(t.amount)}
      </span>
      <button
        disabled={pending}
        onClick={() => {
          if (!confirm(`Delete "${t.description}"?`)) return;
          startTransition(() => deleteTransactionAction(t.id));
        }}
        className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-bad-soft hover:text-bad"
        aria-label={`Delete ${t.description}`}
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}
