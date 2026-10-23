"use client";

import { useActionState, useState } from "react";
import { confirmsDeletion } from "@/lib/customers/input";
import type { DeleteCustomerState } from "../../actions";
import { inputClass } from "../../customer-form";

type Props = {
  customerName: string;
  action: (state: DeleteCustomerState, formData: FormData) => Promise<DeleteCustomerState>;
};

export function DeleteCustomerForm({ customerName, action }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const [typed, setTyped] = useState("");
  const confirmed = confirmsDeletion(customerName, typed);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
        <span>
          Para confirmar, escribí <strong className="font-semibold">{customerName}</strong>
        </span>
        <input
          name="confirmation"
          autoComplete="off"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          className={inputClass}
        />
      </label>

      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={!confirmed || pending}
          className="rounded-md bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-600 disabled:opacity-50"
        >
          {pending ? "Borrando…" : "Borrar el cliente"}
        </button>
      </div>
    </form>
  );
}
