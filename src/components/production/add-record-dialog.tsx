"use client";

import { useState } from "react";
import { addRecordAction, type ActionState } from "@/app/(main)/production/actions";
import { Button, Field, FormError, Modal } from "@/components/ui";
import { useDialogAction } from "@/components/use-dialog-action";

const FEED_TYPES = [
  "Starter Mash",
  "Grower Mash",
  "Finisher Mash",
  "Layer Mash",
  "Dairy Pellets",
  "Hay",
  "Silage",
  "Fish Feed",
];

export function AddRecordDialog({
  batchId,
  defaultStock,
  lastFeedType,
  feedOptions,
  onClose,
}: {
  batchId: string;
  defaultStock: number;
  lastFeedType?: string;
  // Feed items from inventory; matching names deduct stock automatically.
  feedOptions: string[];
  onClose: () => void;
}) {
  const [state, onSubmit, pending] = useDialogAction(
    (prev: ActionState, form: FormData) => addRecordAction(batchId, prev, form),
    onClose,
  );
  // Stock follows "previous stock − mortality" until the user types their own count.
  const [mortality, setMortality] = useState(0);
  const [stockOverride, setStockOverride] = useState<string | null>(null);
  const stock = stockOverride ?? String(Math.max(0, defaultStock - mortality));
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time

  return (
    <Modal
      open
      onClose={onClose}
      title="Add daily record"
      description={`Log today's numbers for batch ${batchId}.`}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" name="date" type="date" required defaultValue={today} max={today} />
          <Field
            label="Mortality"
            name="mortality"
            type="number"
            min={0}
            step={1}
            value={mortality}
            onChange={(e) => setMortality(Math.max(0, Number(e.target.value) || 0))}
          />
          <Field
            label="Stock level"
            name="stockLevel"
            type="number"
            min={0}
            step={1}
            required
            value={stock}
            onChange={(e) => setStockOverride(e.target.value)}
            hint={`Previous: ${defaultStock.toLocaleString("en-NG")}`}
          />
          <Field
            label="Feed type"
            name="feedType"
            list="feed-options"
            required
            defaultValue={lastFeedType}
            placeholder="Starter Mash"
          />
          <Field label="Feed intake (kg)" name="feedIntakeKg" type="number" min={0} step="0.1" required />
          <Field
            label="Daily weight gain (kg)"
            name="weightGainKg"
            type="number"
            step="0.001"
            required
            hint="Average gain per animal."
          />
          <Field label="Medication" name="medication" placeholder="None" />
          <Field label="Recorded by" name="recordedBy" placeholder="You (leave blank)" hint="Leave blank to use your name." />
          <Field label="Notes" name="notes" className="sm:col-span-2" placeholder="Healthy, normal behaviour" />
        </div>
        <datalist id="feed-options">
          {[...new Set([...feedOptions, ...FEED_TYPES])].map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>

        <FormError message={state.error} />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save record"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
