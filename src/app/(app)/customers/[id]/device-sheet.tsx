"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { DeviceIcon } from "@/components/device-icon";
import { collapseSpaces } from "@/lib/customers/input";
import {
  DEVICE_TEXT_MAX_LENGTH,
  FIELD_NAME_MAX_LENGTH,
  FIELD_VALUE_MAX_LENGTH,
  remainingSuggestions,
  type FieldSuggestion,
} from "@/lib/devices/input";
import type { DeviceSheet as SheetData, SheetField } from "@/lib/devices/queries";
import type { DeviceAlerts } from "@/lib/devices/records";
import { DEVICE_TYPE_LABELS, type DeviceType } from "@/lib/map/input";
import {
  createField,
  deleteField,
  loadDeviceSheet,
  reorderFields,
  revealSecretField,
  updateDeviceTexts,
  updateField,
} from "./device-actions";
import { AttachmentGallery } from "./attachment-gallery";
import type { Save } from "./autosave";
import { DeviceRecords } from "./device-records";

// The device sheet, opened with a double click on the map. It lies over the
// right side of the map so the diagram stays in view, and saves every change
// through the map's autosave queue, in order.

// A revealed secret hides itself again after this long.
const REVEAL_MS = 30_000;
const COPIED_MS = 2_000;

const inputClass =
  "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 " +
  "focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";
const smallButtonClass =
  "rounded-md border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700 hover:bg-neutral-100 " +
  "disabled:opacity-40";

type Field = SheetField & {
  // Not on the server yet: a field without a name is not saved.
  draft?: boolean;
};

// One textarea row per line of text, so a long value doesn't hide behind a scrollbar.
function rowsFor(value: string, min = 1): number {
  return Math.min(Math.max(value.split("\n").length, min), 12);
}

export function DeviceSheet({
  customerId,
  device,
  save,
  status,
  onClose,
  onAlertsChange,
}: {
  customerId: string;
  device: { id: string; name: string; type: DeviceType };
  save: Save;
  status: ReactNode;
  onClose: () => void;
  onAlertsChange?: (alerts: DeviceAlerts) => void;
}) {
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const titleId = useId();

  useEffect(() => {
    let current = true;
    loadDeviceSheet(customerId, device.id).then(
      (result) => {
        if (!current) return;
        if (result.sheet) setSheet(result.sheet);
        else setLoadError(result.error ?? "No se pudo abrir la ficha.");
      },
      () => current && setLoadError("No se pudo abrir la ficha. Revisá la conexión."),
    );
    return () => {
      current = false;
    };
  }, [customerId, device.id]);

  // Escape closes the sheet wherever the focus is; the field being edited is
  // saved first (on blur).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <section
      role="dialog"
      aria-labelledby={titleId}
      className="absolute inset-y-0 right-0 z-10 flex w-full max-w-md flex-col border-l border-neutral-200 bg-white shadow-xl"
    >
      <header className="flex items-start gap-3 border-b border-neutral-200 p-4">
        <DeviceIcon type={device.type} className="mt-0.5 size-8 shrink-0 text-neutral-800" />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-lg leading-tight font-semibold break-words">
            {device.name}
          </h2>
          <p className="text-sm text-neutral-600">{DEVICE_TYPE_LABELS[device.type]}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {status}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ficha"
            className="rounded-md px-2 py-1 text-lg leading-none text-neutral-600 hover:bg-neutral-100"
          >
            ×
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loadError ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {loadError}
          </p>
        ) : !sheet ? (
          <p className="text-sm text-neutral-500">Cargando…</p>
        ) : (
          <SheetBody
            customerId={customerId}
            sheet={sheet}
            type={device.type}
            save={save}
            onAlertsChange={onAlertsChange}
          />
        )}
      </div>
    </section>
  );
}

function SheetBody({
  customerId,
  sheet,
  type,
  save,
  onAlertsChange,
}: {
  customerId: string;
  sheet: SheetData;
  type: DeviceType;
  save: Save;
  onAlertsChange?: (alerts: DeviceAlerts) => void;
}) {
  const [fields, setFields] = useState<Field[]>(sheet.fields);
  // Which field takes the focus when it appears, and where.
  const [focus, setFocus] = useState<{ id: string; on: "name" | "value" } | null>(null);

  const replace = (id: string, changes: Partial<Field>) =>
    setFields((current) => current.map((field) => (field.id === id ? { ...field, ...changes } : field)));

  const addField = (suggestion?: FieldSuggestion) => {
    const id = crypto.randomUUID();
    if (!suggestion) {
      setFields((current) => [...current, { id, name: "", value: "", isSecret: false, draft: true }]);
      setFocus({ id, on: "name" });
      return;
    }
    const isSecret = suggestion.secret ?? false;
    setFields((current) => [...current, { id, name: suggestion.name, value: "", isSecret }]);
    setFocus({ id, on: "value" });
    save(() =>
      createField(customerId, { id, deviceId: sheet.id, name: suggestion.name, value: "", isSecret }),
    );
  };

  const move = (index: number, by: -1 | 1) => {
    const next = [...fields];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    setFields(next);
    const fieldIds = next.filter((field) => !field.draft).map((field) => field.id);
    if (fieldIds.length > 0) save(() => reorderFields(customerId, { deviceId: sheet.id, fieldIds }));
  };

  const remove = (field: Field) => {
    const hasContent = field.isSecret || field.value.trim() !== "";
    if (hasContent && !window.confirm(`¿Borrar el campo «${field.name}»?`)) return;
    setFields((current) => current.filter((other) => other.id !== field.id));
    if (!field.draft) save(() => deleteField(customerId, field.id));
  };

  const suggestions = remainingSuggestions(type, fields.map((field) => field.name));

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="sheet-fields" className="flex flex-col gap-3">
        <h3 id="sheet-fields" className="text-sm font-semibold text-neutral-800">
          Campos
        </h3>
        {fields.length === 0 && (
          <p className="text-sm text-neutral-500">
            Todavía no tiene campos. Agregá los que necesites: no hay ninguno obligatorio.
          </p>
        )}
        <ol className="flex flex-col gap-3">
          {fields.map((field, index) => (
            <FieldRow
              key={field.id}
              customerId={customerId}
              deviceId={sheet.id}
              field={field}
              autoFocus={focus?.id === field.id ? focus.on : undefined}
              save={save}
              onChange={(changes) => replace(field.id, changes)}
              onMoveUp={index > 0 ? () => move(index, -1) : undefined}
              onMoveDown={index < fields.length - 1 ? () => move(index, 1) : undefined}
              onDelete={() => remove(field)}
            />
          ))}
        </ol>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => addField()}
            className="rounded-md bg-neutral-900 px-3 py-1 text-sm text-white hover:bg-neutral-700"
          >
            Agregar campo
          </button>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.name}
              type="button"
              onClick={() => addField(suggestion)}
              aria-label={`Agregar campo ${suggestion.name}`}
              className="rounded-full border border-dashed border-neutral-400 px-2.5 py-0.5 text-xs text-neutral-700 hover:bg-neutral-100"
            >
              + {suggestion.name}
            </button>
          ))}
        </div>
      </section>

      <AttachmentGallery customerId={customerId} deviceId={sheet.id} initial={sheet.attachments} />

      <DeviceTexts customerId={customerId} sheet={sheet} save={save} />

      <DeviceRecords
        customerId={customerId}
        sheet={sheet}
        save={save}
        onAlertsChange={onAlertsChange}
      />
    </div>
  );
}

function FieldRow({
  customerId,
  deviceId,
  field,
  autoFocus,
  save,
  onChange,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  customerId: string;
  deviceId: string;
  field: Field;
  autoFocus?: "name" | "value";
  save: Save;
  onChange: (changes: Partial<Field>) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDelete: () => void;
}) {
  const saved = useRef({ name: field.name, value: field.value });
  const [name, setName] = useState(field.name);
  const [value, setValue] = useState(field.value);
  const label = field.name || "nuevo";

  // Saves the name and, for a plain field, the value. A draft is created on
  // the server as soon as it has a name.
  const commit = () => {
    const clean = collapseSpaces(name);
    if (!clean) {
      if (!field.draft) setName(saved.current.name);
      return;
    }
    setName(clean);
    const fieldValue = field.isSecret ? undefined : value;
    if (field.draft) {
      saved.current = { name: clean, value };
      onChange({ name: clean, value, draft: false });
      save(() =>
        createField(customerId, {
          id: field.id,
          deviceId,
          name: clean,
          value: field.isSecret ? "" : value,
          isSecret: field.isSecret,
        }),
      );
      return;
    }
    if (clean === saved.current.name && (field.isSecret || value === saved.current.value)) return;
    saved.current = { name: clean, value };
    onChange({ name: clean, value });
    save(() =>
      updateField(customerId, {
        id: field.id,
        name: clean,
        value: fieldValue,
        isSecret: field.isSecret,
      }),
    );
  };

  const toggleSecret = async (isSecret: boolean) => {
    const clean = collapseSpaces(name) || saved.current.name;
    if (field.draft) {
      onChange({ isSecret });
      return;
    }
    if (isSecret) {
      // The value typed so far is encrypted and leaves the page.
      setValue("");
      saved.current = { name: clean, value: "" };
      onChange({ isSecret: true, value: "", name: clean });
      save(() => updateField(customerId, { id: field.id, name: clean, value, isSecret: true }));
      return;
    }
    if (!window.confirm(`¿Sacarle la protección a «${clean}»? El valor se va a guardar sin cifrar.`)) {
      return;
    }
    const result = await save(() =>
      updateField(customerId, { id: field.id, name: clean, isSecret: false }),
    );
    if (!result || result.error) return;
    const plain = result.value ?? "";
    setValue(plain);
    saved.current = { name: clean, value: plain };
    onChange({ isSecret: false, value: plain, name: clean });
  };

  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-neutral-200 p-2.5">
      <div className="flex items-center gap-1.5">
        <input
          value={name}
          maxLength={FIELD_NAME_MAX_LENGTH}
          autoComplete="off"
          autoFocus={autoFocus === "name"}
          placeholder="Nombre del campo"
          aria-label={`Nombre del campo ${label}`}
          onChange={(event) => setName(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
          }}
          className={inputClass + " font-medium"}
        />
        <button
          type="button"
          onClick={onMoveUp}
          disabled={!onMoveUp}
          aria-label={`Subir ${label}`}
          className={smallButtonClass}
        >
          ↑
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={!onMoveDown}
          aria-label={`Bajar ${label}`}
          className={smallButtonClass}
        >
          ↓
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Borrar ${label}`}
          className={smallButtonClass + " border-red-300 text-red-700 hover:bg-red-50"}
        >
          ×
        </button>
      </div>

      {field.isSecret ? (
        <SecretValue
          customerId={customerId}
          field={field}
          name={field.name}
          label={label}
          autoFocus={autoFocus === "value"}
          save={save}
        />
      ) : (
        <textarea
          value={value}
          maxLength={FIELD_VALUE_MAX_LENGTH}
          rows={rowsFor(value)}
          autoFocus={autoFocus === "value"}
          placeholder="Valor"
          aria-label={`Valor de ${label}`}
          onChange={(event) => setValue(event.target.value)}
          onBlur={commit}
          className={inputClass + " font-mono"}
        />
      )}

      <label className="flex items-center gap-1.5 self-start text-xs text-neutral-700">
        <input
          type="checkbox"
          checked={field.isSecret}
          onChange={(event) => toggleSecret(event.target.checked)}
        />
        Secreto (se guarda cifrado)
      </label>
      {field.draft && !collapseSpaces(name) && (
        <p className="text-xs text-neutral-500">Poné un nombre para guardarlo.</p>
      )}
    </li>
  );
}

// A secret is shown as dots. Its value comes from the server only when asked
// for (and is logged there), and hides itself again after a while.
function SecretValue({
  customerId,
  field,
  name,
  label,
  autoFocus,
  save,
}: {
  customerId: string;
  field: Field;
  name: string;
  label: string;
  autoFocus: boolean;
  save: Save;
}) {
  const [shown, setShown] = useState<string | null>(null);
  // Starts in edit mode when the field was just added, so it can be typed.
  const [editing, setEditing] = useState(autoFocus);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (shown === null) return;
    const timer = setTimeout(() => setShown(null), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), COPIED_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const reveal = async (purpose: "view" | "copy") => {
    if (field.draft) return null;
    const result = await save(() => revealSecretField(customerId, { id: field.id, purpose }));
    return result?.value ?? null;
  };

  const view = async () => {
    if (shown !== null) {
      setShown(null);
      return;
    }
    setShown(await reveal("view"));
  };

  const copy = async () => {
    const value = await reveal("copy");
    if (value === null) return;
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copiado");
    } catch {
      setNotice("No se pudo copiar");
    }
  };

  const store = () => {
    setEditing(false);
    setShown(null);
    if (field.draft) return;
    const value = draft;
    setDraft("");
    save(() => updateField(customerId, { id: field.id, name, value, isSecret: true }));
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5">
        <textarea
          value={draft}
          maxLength={FIELD_VALUE_MAX_LENGTH}
          rows={rowsFor(draft)}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder="Nuevo valor"
          aria-label={`Nuevo valor de ${label}`}
          onChange={(event) => setDraft(event.target.value)}
          className={inputClass + " font-mono"}
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={store}
            disabled={field.draft}
            className="rounded-md bg-neutral-900 px-2.5 py-0.5 text-xs text-white hover:bg-neutral-700 disabled:opacity-40"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDraft("");
            }}
            className={smallButtonClass}
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown === null ? (
        <span aria-label={`Valor de ${label} oculto`} className="flex-1 font-mono text-sm text-neutral-500">
          ••••••••
        </span>
      ) : (
        <pre
          aria-label={`Valor de ${label}`}
          className="w-full flex-1 overflow-x-auto rounded-md bg-amber-50 px-2 py-1.5 font-mono text-sm whitespace-pre-wrap break-all text-neutral-900"
        >
          {shown}
        </pre>
      )}
      <button type="button" onClick={view} disabled={field.draft} className={smallButtonClass}>
        {shown === null ? "Ver" : "Ocultar"}
      </button>
      <button type="button" onClick={copy} disabled={field.draft} className={smallButtonClass}>
        Copiar
      </button>
      <button type="button" onClick={() => setEditing(true)} className={smallButtonClass}>
        Cambiar
      </button>
      {notice && (
        <span role="status" className="text-xs text-neutral-600">
          {notice}
        </span>
      )}
    </div>
  );
}

// Who does what with the device, and anything else worth noting, as free text.
function DeviceTexts({
  customerId,
  sheet,
  save,
}: {
  customerId: string;
  sheet: SheetData;
  save: Save;
}) {
  const saved = useRef({ roles: sheet.roles, notes: sheet.notes });
  const [roles, setRoles] = useState(sheet.roles);
  const [notes, setNotes] = useState(sheet.notes);

  const commit = () => {
    const next = { roles: roles.trim(), notes: notes.trim() };
    if (next.roles === saved.current.roles && next.notes === saved.current.notes) return;
    saved.current = next;
    save(() => updateDeviceTexts(customerId, { deviceId: sheet.id, ...next }));
  };

  return (
    <section className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-semibold text-neutral-800">
        Funciones (quién hace qué)
        <textarea
          value={roles}
          maxLength={DEVICE_TEXT_MAX_LENGTH}
          rows={rowsFor(roles, 3)}
          placeholder="Ej.: DHCP y DNS de la oficina. Lo administra el proveedor de internet."
          onChange={(event) => setRoles(event.target.value)}
          onBlur={commit}
          className={inputClass + " font-normal"}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-neutral-800">
        Notas
        <textarea
          value={notes}
          maxLength={DEVICE_TEXT_MAX_LENGTH}
          rows={rowsFor(notes, 3)}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={commit}
          className={inputClass + " font-normal"}
        />
      </label>
    </section>
  );
}
