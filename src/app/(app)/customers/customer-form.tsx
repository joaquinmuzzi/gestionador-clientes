"use client";

import Link from "next/link";
import { useActionState } from "react";
import { NAME_MAX_LENGTH, NOTES_MAX_LENGTH, type CustomerFormState } from "@/lib/customers/input";

export const inputClass =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900 " +
  "focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

type Props = {
  action: (state: CustomerFormState, formData: FormData) => Promise<CustomerFormState>;
  initial?: { name: string; notes: string };
  submitLabel: string;
  cancelHref: string;
};

// Used to create and to edit a customer.
export function CustomerForm({ action, initial, submitLabel, cancelHref }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? initial;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
        Nombre
        <input
          name="name"
          required
          maxLength={NAME_MAX_LENGTH}
          autoComplete="off"
          defaultValue={values?.name}
          aria-invalid={state.fieldErrors?.name ? true : undefined}
          aria-describedby={state.fieldErrors?.name ? "name-error" : undefined}
          className={inputClass}
        />
        {state.fieldErrors?.name && (
          <span id="name-error" role="alert" className="text-sm font-normal text-red-700">
            {state.fieldErrors.name}
          </span>
        )}
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
        Notas
        <textarea
          name="notes"
          rows={6}
          maxLength={NOTES_MAX_LENGTH}
          defaultValue={values?.notes}
          placeholder="Dirección, horarios, cómo se trabaja con ellos…"
          aria-invalid={state.fieldErrors?.notes ? true : undefined}
          aria-describedby={state.fieldErrors?.notes ? "notes-error" : undefined}
          className={inputClass}
        />
        {state.fieldErrors?.notes && (
          <span id="notes-error" role="alert" className="text-sm font-normal text-red-700">
            {state.fieldErrors.notes}
          </span>
        )}
      </label>

      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 font-medium text-white hover:bg-accent-strong disabled:opacity-60"
        >
          {pending ? "Guardando…" : submitLabel}
        </button>
        <Link href={cancelHref} className="text-sm text-neutral-600 hover:text-neutral-900">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
