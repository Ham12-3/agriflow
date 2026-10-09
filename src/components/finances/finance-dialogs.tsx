"use client";

import { useState } from "react";
import { addTransactionAction } from "@/app/(main)/finances/actions";
import { Button, Field, FormError, Modal, SelectField } from "@/components/ui";
import { useDialogAction } from "@/components/use-dialog-action";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  formatNairaFull,
} from "@/lib/farm-data";

export function AddTransactionDialog({
  batches,
  onClose,
}: {
  batches: { id: string; label: string }[];
  onClose: () => void;
}) {
  const [state, onSubmit, pending] = useDialogAction(addTransactionAction, onClose);
  const [type, setType] = useState<"income" | "expense">("expense");
  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const today = new Date().toLocaleDateString("en-CA");

  return (
    <Modal open onClose={onClose} title="Add transaction" description="Record money in or out of the farm.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-background p-1" role="radiogroup" aria-label="Type">
          {(["expense", "income"] as const).map((t) => (
            <label
              key={t}
              className={`cursor-pointer rounded-md py-2 text-center text-sm font-medium capitalize ${
                type === t
                  ? t === "income"
                    ? "bg-card text-good shadow-sm"
                    : "bg-card text-bad shadow-sm"
                  : "text-muted"
              }`}
            >
              <input
                type="radio"
                name="type"
                value={t}
                checked={type === t}
                onChange={() => setType(t)}
                className="sr-only"
              />
              {t}
            </label>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Remount on type change so the first category is selected. */}
          <SelectField key={type} label="Category" name="category" defaultValue={categories[0]}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectField>
          <Field label="Amount (₦)" name="amount" type="number" min={1} step="any" required placeholder="50000" />
          <Field
            label="Description"
            name="description"
            required
            placeholder={type === "income" ? "Sold 200 broilers to Bodija market" : "Vet visit"}
            className="sm:col-span-2"
          />
          <Field label="Date" name="date" type="date" required defaultValue={today} max={today} />
          <SelectField label="Batch (optional)" name="batchId" defaultValue="">
            <option value="">Whole farm</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </SelectField>
        </div>

        <FormError message={state.error} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Add transaction"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Plans a batch: what it costs, what it should earn, and the break-even price.
export function FinCalcDialog({ onClose }: { onClose: () => void }) {
  const [v, setV] = useState({
    animals: "1000",
    costPerAnimal: "950",
    feedCost: "3500000",
    otherCosts: "400000",
    mortalityPct: "5",
    salePrice: "5500",
  });
  const n = (k: keyof typeof v) => Math.max(0, Number(v[k]) || 0);

  const totalCost = n("animals") * n("costPerAnimal") + n("feedCost") + n("otherCosts");
  const sold = Math.round(n("animals") * (1 - Math.min(100, n("mortalityPct")) / 100));
  const revenue = sold * n("salePrice");
  const profit = revenue - totalCost;
  const roi = totalCost > 0 ? (profit / totalCost) * 100 : null;
  const breakEven = sold > 0 ? totalCost / sold : null;

  const input = (k: keyof typeof v, label: string, hint?: string) => (
    <Field
      label={label}
      type="number"
      min={0}
      step="any"
      value={v[k]}
      onChange={(e) => setV({ ...v, [k]: e.target.value })}
      hint={hint}
    />
  );

  return (
    <Modal open onClose={onClose} title="Financial calculator" description="Plan a batch: costs, expected profit and break-even price.">
      <div className="grid gap-4 sm:grid-cols-2">
        {input("animals", "Number of animals")}
        {input("costPerAnimal", "Cost per animal (₦)", "Day-old chick, calf, piglet…")}
        {input("feedCost", "Total feed cost (₦)")}
        {input("otherCosts", "Other costs (₦)", "Vaccines, labour, transport")}
        {input("mortalityPct", "Expected mortality (%)")}
        {input("salePrice", "Sale price per animal (₦)")}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-background p-4 text-sm">
        <Result label="Total cost" value={formatNairaFull(totalCost)} />
        <Result label={`Revenue (${sold.toLocaleString("en-NG")} sold)`} value={formatNairaFull(revenue)} />
        <Result label="Profit" value={formatNairaFull(profit)} tone={profit >= 0 ? "text-good" : "text-bad"} />
        <Result
          label="Return on investment"
          value={roi === null ? "—" : `${roi.toFixed(1)}%`}
          tone={roi !== null && roi < 0 ? "text-bad" : undefined}
        />
        <Result
          label="Break-even price per animal"
          value={breakEven === null ? "—" : formatNairaFull(breakEven)}
          wide
        />
      </dl>

      <div className="mt-5 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  );
}

function Result({
  label,
  value,
  tone = "",
  wide = false,
}: {
  label: string;
  value: string;
  tone?: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 text-base font-semibold tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}
