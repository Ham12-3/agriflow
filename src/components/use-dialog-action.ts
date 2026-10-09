"use client";

import { startTransition, useActionState, type FormEvent } from "react";

type State = { ok: boolean; error?: string; savedAt?: number };

// Runs a Server Action from a dialog form and closes the dialog on success.
// Submits through onSubmit rather than <form action> because React resets
// form fields after an action, which would wipe the user's input whenever the
// server returns a validation error.
export function useDialogAction(
  action: (prev: State, form: FormData) => Promise<State>,
  onClose: () => void,
) {
  const [state, dispatch, pending] = useActionState(
    async (prev: State, form: FormData) => {
      const result = await action(prev, form);
      if (result.ok) onClose();
      return result;
    },
    { ok: false },
  );

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(() => dispatch(form));
  }

  return [state, onSubmit, pending] as const;
}
