"use client";

import { useState } from "react";
import { collapseSpaces } from "@/lib/customers/input";
import {
  END_USER_NAME_MAX_LENGTH,
  END_USER_SHORT_MAX_LENGTH,
  END_USER_TEXT_MAX_LENGTH,
  TECHNICAL_LEVELS,
} from "@/lib/end-users/input";
import type { EndUser } from "@/lib/end-users/queries";
import { SaveStatus, useAutosave, useRecordEditor } from "./autosave";
import { deleteEndUser, saveEndUser } from "./end-user-actions";

// The people at the customer, below the map: who they are, how much they know,
// what they may touch and how to deal with them. Every profile opens in place
// and is saved as a whole when a change is committed.

const inputClass =
  "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 " +
  "focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";
const labelClass = "flex flex-col gap-1 text-xs font-medium text-neutral-700";

type Entry = EndUser & { draft?: boolean };

// One textarea row per line of text, so a long value doesn't hide behind a scrollbar.
function rowsFor(value: string, min = 2): number {
  return Math.min(Math.max(value.split("\n").length, min), 12);
}

export function EndUsers({ customerId, initial }: { customerId: string; initial: EndUser[] }) {
  const [endUsers, setEndUsers] = useState<Entry[]>(initial);
  const { save, saving, error } = useAutosave();

  const add = () =>
    setEndUsers([
      {
        id: crypto.randomUUID(),
        name: "",
        role: "",
        contact: "",
        technicalLevel: "",
        canTouch: "",
        notes: "",
        isMainContact: false,
        draft: true,
      },
      ...endUsers,
    ]);

  const remove = (entry: Entry) => {
    if (!entry.draft && !window.confirm(`¿Borrar a «${entry.name}»?`)) return;
    setEndUsers(endUsers.filter((other) => other.id !== entry.id));
    if (!entry.draft) save(() => deleteEndUser(customerId, entry.id));
  };

  return (
    <section aria-labelledby="end-users" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="end-users" className="text-lg font-semibold">
          Usuarios finales
        </h2>
        <div className="flex items-center gap-2">
          {(saving || error || endUsers.some((entry) => !entry.draft)) && (
            <SaveStatus saving={saving} error={error} />
          )}
          <button
            type="button"
            onClick={add}
            className="rounded-md bg-neutral-900 px-3 py-1 text-sm text-white hover:bg-neutral-700"
          >
            Agregar persona
          </button>
        </div>
      </div>
      {endUsers.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Todavía no cargaste a nadie. Anotá quién es quién en la empresa, cuánto sabe y qué puede
          tocar.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {endUsers.map((entry) => (
            <EndUserCard
              key={entry.id}
              entry={entry}
              persist={(value) => {
                setEndUsers(endUsers.map((other) => (other.id === value.id ? value : other)));
                save(() => saveEndUser(customerId, value));
              }}
              onDelete={() => remove(entry)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function EndUserCard({
  entry,
  persist,
  onDelete,
}: {
  entry: Entry;
  persist: (value: EndUser) => void;
  onDelete: () => void;
}) {
  const { draft, ...initial } = entry;
  const editor = useRecordEditor<EndUser>(initial, {
    draft: draft ?? false,
    tidy: (value) => ({
      ...value,
      name: collapseSpaces(value.name),
      role: collapseSpaces(value.role),
      technicalLevel: collapseSpaces(value.technicalLevel),
    }),
    isComplete: (value) => value.name !== "",
    persist,
  });
  const [open, setOpen] = useState(draft ?? false);
  const { value, change, commit } = editor;
  const listId = `levels-${entry.id}`;

  const text = (key: "contact" | "canTouch" | "notes", label: string, placeholder: string) => (
    <label className={labelClass}>
      {label}
      <textarea
        value={value[key]}
        maxLength={END_USER_TEXT_MAX_LENGTH}
        rows={rowsFor(value[key])}
        placeholder={placeholder}
        onChange={(event) => change({ [key]: event.target.value })}
        onBlur={commit}
        className={inputClass + " font-normal"}
      />
    </label>
  );

  return (
    <li className="rounded-xl border border-neutral-200 bg-white">
      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-2 px-3 py-2">
          <span className="font-medium break-words text-neutral-900">
            {value.name || <span className="text-neutral-500">Sin nombre</span>}
          </span>
          {value.role && <span className="text-sm text-neutral-600">{value.role}</span>}
          {value.technicalLevel && (
            <span className="text-xs text-neutral-500">Nivel: {value.technicalLevel}</span>
          )}
          {value.isMainContact && (
            <span className="rounded-full bg-neutral-100 px-2 text-xs text-neutral-700">
              Contacto principal
            </span>
          )}
        </summary>
        <div className="flex flex-col gap-2 border-t border-neutral-200 p-3">
          <label className={labelClass}>
            Nombre
            <input
              value={value.name}
              maxLength={END_USER_NAME_MAX_LENGTH}
              autoComplete="off"
              autoFocus={draft}
              onChange={(event) => change({ name: event.target.value })}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Enter") commit();
              }}
              className={inputClass + " font-medium"}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={labelClass}>
              Puesto
              <input
                value={value.role}
                maxLength={END_USER_SHORT_MAX_LENGTH}
                autoComplete="off"
                placeholder="Ej.: Administración"
                onChange={(event) => change({ role: event.target.value })}
                onBlur={commit}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Nivel técnico
              <input
                value={value.technicalLevel}
                maxLength={END_USER_SHORT_MAX_LENGTH}
                autoComplete="off"
                list={listId}
                placeholder="Bajo, medio, alto…"
                onChange={(event) => change({ technicalLevel: event.target.value })}
                onBlur={commit}
                className={inputClass}
              />
              <datalist id={listId}>
                {TECHNICAL_LEVELS.map((level) => (
                  <option key={level} value={level} />
                ))}
              </datalist>
            </label>
          </div>
          {text("contact", "Contacto", "Teléfono, email, horarios…")}
          {text("canTouch", "Qué puede y qué no puede tocar", "Ej.: reinicia el router; no toca el servidor.")}
          {text("notes", "Cómo tratarlo", "")}
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-xs text-neutral-700">
              <input
                type="checkbox"
                checked={value.isMainContact}
                onChange={(event) => editor.commitNow({ isMainContact: event.target.checked })}
              />
              Contacto principal
            </label>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50"
            >
              Borrar
            </button>
          </div>
          {editor.isDraft && !collapseSpaces(value.name) && (
            <p className="text-xs text-neutral-500">Poné el nombre para guardarlo.</p>
          )}
        </div>
      </details>
    </li>
  );
}
