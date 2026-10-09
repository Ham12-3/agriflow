"use client";

import { useEffect, useState } from "react";
import { createBatchAction, previewBatchIdAction } from "@/app/(main)/production/actions";
import { Button, Field, FormError, Modal, SelectField } from "@/components/ui";
import { useDialogAction } from "@/components/use-dialog-action";

const SPECIES = ["Poultry", "Cattle", "Goat", "Sheep", "Pig", "Fish"];
const BREEDS: Record<string, string> = {
  Poultry: "Broiler",
  Cattle: "Friesian",
  Goat: "West African Dwarf",
  Sheep: "Yankasa",
  Pig: "Large White",
  Fish: "Catfish",
};
const CATEGORIES: Record<string, string[]> = {
  Poultry: ["Broiler", "Layer", "Cockerel", "Turkey"],
  Cattle: ["Dairy", "Beef"],
  Goat: ["Meat", "Dairy"],
  Sheep: ["Meat", "Wool"],
  Pig: ["Grower", "Finisher", "Breeder"],
  Fish: ["Fingerlings", "Juveniles", "Table size"],
};

export function NewBatchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, onSubmit, pending] = useDialogAction(createBatchAction, onClose);
  const [species, setSpecies] = useState("Poultry");
  const [batchId, setBatchId] = useState("");

  // Show the ID the batch will get (generated on the server when saved).
  useEffect(() => {
    let live = true;
    previewBatchIdAction(species)
      .then((id) => live && setBatchId(id))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [species]);

  return (
    <Modal open={open} onClose={onClose} title="New Batch" description="Register a livestock batch to start tracking production.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          label="Batch ID"
          value={batchId || "Generating…"}
          readOnly
          tabIndex={-1}
          hint="Generated automatically. Each batch has a unique ID."
          className="[&_input]:bg-background [&_input]:text-muted"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Species" name="species" value={species} onChange={(e) => setSpecies(e.target.value)}>
            {SPECIES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </SelectField>
          <Field key={`breed-${species}`} label="Breed" name="breed" required defaultValue={BREEDS[species]} />
          <SelectField key={`cat-${species}`} label="Category" name="category" defaultValue={CATEGORIES[species][0]}>
            {CATEGORIES[species].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectField>
          <Field label="Count (animals)" name="count" type="number" min={1} step={1} required placeholder="1000" />
          <Field label="Age (weeks)" name="ageWeeks" type="number" min={0} step={1} required defaultValue={0} />
          <Field
            label="Average weight (kg)"
            name="avgWeightKg"
            type="number"
            min={0}
            step="0.01"
            placeholder="0.72"
            hint="Optional — needed for weight trends."
          />
          <SelectField label="Status" name="status" defaultValue="healthy">
            <option value="healthy">Healthy</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </SelectField>
        </div>

        <FormError message={state.error} />

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create Batch"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
