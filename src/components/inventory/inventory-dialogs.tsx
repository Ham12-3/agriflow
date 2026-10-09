"use client";

import { useState } from "react";
import { createItemAction, logDeliveryAction } from "@/app/(main)/inventory/actions";
import { Button, Field, FormError, Modal, SelectField } from "@/components/ui";
import { useDialogAction } from "@/components/use-dialog-action";
import { INVENTORY_CATEGORIES } from "@/lib/farm-data";
import type { InventoryItem } from "@/lib/inventory";

const UNITS: Record<string, string> = {
  Feed: "kg",
  Medication: "sachets",
  Livestock: "units",
  Supplies: "units",
};

function Actions({ pending, label, onClose }: { pending: boolean; label: string; onClose: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button type="button" variant="secondary" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : label}
      </Button>
    </div>
  );
}

export function AddItemDialog({ onClose }: { onClose: () => void }) {
  const [state, onSubmit, pending] = useDialogAction(createItemAction, onClose);
  const [category, setCategory] = useState("Feed");
  const [unit, setUnit] = useState(UNITS.Feed);

  return (
    <Modal open onClose={onClose} title="Add item" description="Track a new feed, medicine or supply.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" name="name" required placeholder="Grower Mash" className="sm:col-span-2" />
          <SelectField
            label="Category"
            name="category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setUnit(UNITS[e.target.value] ?? "units");
            }}
          >
            {INVENTORY_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectField>
          <Field
            label="Unit"
            name="unit"
            required
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            hint={category === "Feed" ? "Use kg so daily feed records deduct stock." : undefined}
          />
          <Field label="Current stock" name="quantity" type="number" min={0} step="any" required placeholder="0" />
          <Field label="Storage capacity" name="capacity" type="number" min={0} step="any" required placeholder="5000" />
          <Field
            label="Reorder level"
            name="reorderLevel"
            type="number"
            min={0}
            step="any"
            placeholder="0"
            hint="Flag the item when stock falls to this."
          />
          <Field label="Unit cost (₦)" name="unitCost" type="number" min={0} step="any" placeholder="560" />
        </div>
        <FormError message={state.error} />
        <Actions pending={pending} label="Add item" onClose={onClose} />
      </form>
    </Modal>
  );
}

export function LogDeliveryDialog({
  items,
  onClose,
}: {
  items: InventoryItem[];
  onClose: () => void;
}) {
  const [state, onSubmit, pending] = useDialogAction(logDeliveryAction, onClose);
  const [itemId, setItemId] = useState(String(items[0]?.id ?? ""));
  const item = items.find((i) => String(i.id) === itemId);
  const today = new Date().toLocaleDateString("en-CA");

  return (
    <Modal open onClose={onClose} title="Log delivery" description="Record stock that arrived on the farm.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Item"
            name="itemId"
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            className="sm:col-span-2"
          >
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </SelectField>
          <Field
            label={`Quantity (${item?.unit ?? "units"})`}
            name="quantity"
            type="number"
            min={0}
            step="any"
            required
          />
          <Field
            label="Total cost (₦)"
            name="totalCost"
            type="number"
            min={0}
            step="any"
            hint="Updates the item's unit cost."
          />
          <Field label="Date" name="date" type="date" required defaultValue={today} max={today} />
          <Field label="Supplier" name="supplier" placeholder="Optional" />
        </div>
        <FormError message={state.error} />
        <Actions pending={pending} label="Log delivery" onClose={onClose} />
      </form>
    </Modal>
  );
}
