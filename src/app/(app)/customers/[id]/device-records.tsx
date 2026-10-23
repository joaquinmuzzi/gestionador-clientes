"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { collapseSpaces } from "@/lib/customers/input";
import { DEVICE_TEXT_MAX_LENGTH } from "@/lib/devices/input";
import type {
  DeviceSheet,
  SheetAgendaItem,
  SheetIncident,
  SheetVulnerability,
} from "@/lib/devices/queries";
import {
  RECORD_TITLE_MAX_LENGTH,
  SEVERITIES,
  SEVERITY_LABELS,
  formatDay,
  isOverdue,
  localDay,
  type DeviceAlerts,
  type RecordKind,
  type Severity,
} from "@/lib/devices/records";
import { useRecordEditor, type RecordEditor, type Save } from "./autosave";
import {
  deleteDeviceRecord,
  saveAgendaItem,
  saveIncident,
  saveVulnerability,
} from "./record-actions";

// The device's history on its sheet: incidents, known vulnerabilities and the
// agenda. Each record opens in place to be edited and is saved as a whole
// through the map's autosave queue. Open incidents and pending tasks are
// reported to the map, which flags the device.

const inputClass =
  "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 " +
  "focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";
const labelClass = "flex flex-col gap-1 text-xs font-medium text-neutral-700";

const noSubscription = () => () => {};

// Today in the technician's time zone. Unknown while rendering on the server,
// so nothing is flagged as overdue until the page runs in the browser.
export function useToday(): string | null {
  return useSyncExternalStore(
    noSubscription,
    () => localDay(new Date()),
    () => null,
  );
}

// One textarea row per line of text, so a long value doesn't hide behind a scrollbar.
function rowsFor(value: string, min = 2): number {
  return Math.min(Math.max(value.split("\n").length, min), 12);
}

type Entry<T> = T & { draft?: boolean };

function alertsOf(incidents: Entry<SheetIncident>[], agenda: Entry<SheetAgendaItem>[]): DeviceAlerts {
  const pending = agenda
    .filter((item) => !item.draft && !item.closed)
    .map((item) => item.dueAt)
    .sort();
  return {
    openIncidents: incidents.filter((incident) => !incident.draft && !incident.closed).length,
    nextDueAt: pending[0] ?? null,
  };
}

// A saved record replaces its draft or its previous version in the list.
function put<T extends { id: string }>(list: Entry<T>[], record: T): Entry<T>[] {
  return list.map((entry) => (entry.id === record.id ? record : entry));
}

export function DeviceRecords({
  customerId,
  sheet,
  save,
  onAlertsChange,
}: {
  customerId: string;
  sheet: DeviceSheet;
  save: Save;
  onAlertsChange?: (alerts: DeviceAlerts) => void;
}) {
  const [incidents, setIncidents] = useState<Entry<SheetIncident>[]>(sheet.incidents);
  const [vulnerabilities, setVulnerabilities] = useState<Entry<SheetVulnerability>[]>(
    sheet.vulnerabilities,
  );
  const [agenda, setAgenda] = useState<Entry<SheetAgendaItem>[]>(sheet.agendaItems);
  const today = useToday();

  const changeIncidents = (next: Entry<SheetIncident>[]) => {
    setIncidents(next);
    onAlertsChange?.(alertsOf(next, agenda));
  };
  const changeAgenda = (next: Entry<SheetAgendaItem>[]) => {
    setAgenda(next);
    onAlertsChange?.(alertsOf(incidents, next));
  };

  const remove = (kind: RecordKind, entry: Entry<{ id: string; title: string }>, noun: string) => {
    if (!entry.draft && !window.confirm(`¿Borrar ${noun} «${entry.title}»?`)) return false;
    if (!entry.draft) save(() => deleteDeviceRecord(customerId, { kind, id: entry.id }));
    return true;
  };

  // New records go first, open and ready to be typed.
  const newDay = () => today ?? localDay(new Date());

  return (
    <div className="flex flex-col gap-6">
      <p className="rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-600">
        Incidentes, vulnerabilidades y agenda se guardan sin cifrar, para que la búsqueda los
        encuentre: no pongas claves acá, usá un campo secreto.
      </p>

      <RecordSection
        heading="Incidentes"
        addLabel="Agregar incidente"
        empty="Sin incidentes registrados."
        onAdd={() =>
          setIncidents([
            {
              id: crypto.randomUUID(),
              occurredAt: newDay(),
              title: "",
              description: "",
              resolution: "",
              closed: false,
              draft: true,
            },
            ...incidents,
          ])
        }
      >
        {incidents.map((incident) => (
          <RecordRow
            key={incident.id}
            record={incident}
            closedLabel="Resuelto"
            openLabel="Abierto"
            dayOf={(value) => value.occurredAt}
            persist={(value) => {
              changeIncidents(put(incidents, value));
              save(() => saveIncident(customerId, { ...value, deviceId: sheet.id }));
            }}
            onDelete={() => {
              if (remove("incident", incident, "el incidente")) {
                changeIncidents(incidents.filter((other) => other.id !== incident.id));
              }
            }}
          >
            {(editor) => (
              <>
                <DayInput
                  label="Fecha"
                  value={editor.value.occurredAt}
                  onChange={(occurredAt) => editor.commitNow({ occurredAt })}
                />
                <TextArea
                  label="Qué pasó"
                  value={editor.value.description}
                  onChange={(description) => editor.change({ description })}
                  onBlur={editor.commit}
                />
                <TextArea
                  label="Cómo se resolvió"
                  value={editor.value.resolution}
                  onChange={(resolution) => editor.change({ resolution })}
                  onBlur={editor.commit}
                />
              </>
            )}
          </RecordRow>
        ))}
      </RecordSection>

      <RecordSection
        heading="Vulnerabilidades"
        addLabel="Agregar vulnerabilidad"
        empty="Sin vulnerabilidades conocidas."
        onAdd={() =>
          setVulnerabilities([
            {
              id: crypto.randomUUID(),
              title: "",
              severity: "MEDIUM",
              description: "",
              closed: false,
              draft: true,
            },
            ...vulnerabilities,
          ])
        }
      >
        {vulnerabilities.map((vulnerability) => (
          <RecordRow
            key={vulnerability.id}
            record={vulnerability}
            closedLabel="Resuelta"
            openLabel={`Gravedad ${SEVERITY_LABELS[vulnerability.severity].toLowerCase()}`}
            persist={(value) => {
              setVulnerabilities(put(vulnerabilities, value));
              save(() => saveVulnerability(customerId, { ...value, deviceId: sheet.id }));
            }}
            onDelete={() => {
              if (remove("vulnerability", vulnerability, "la vulnerabilidad")) {
                setVulnerabilities(vulnerabilities.filter((other) => other.id !== vulnerability.id));
              }
            }}
          >
            {(editor) => (
              <>
                <label className={labelClass}>
                  Gravedad
                  <select
                    value={editor.value.severity}
                    onChange={(event) =>
                      editor.commitNow({ severity: event.target.value as Severity })
                    }
                    className={inputClass}
                  >
                    {SEVERITIES.map((severity) => (
                      <option key={severity} value={severity}>
                        {SEVERITY_LABELS[severity]}
                      </option>
                    ))}
                  </select>
                </label>
                <TextArea
                  label="Detalle"
                  value={editor.value.description}
                  onChange={(description) => editor.change({ description })}
                  onBlur={editor.commit}
                />
              </>
            )}
          </RecordRow>
        ))}
      </RecordSection>

      <RecordSection
        heading="Agenda"
        addLabel="Agregar tarea"
        empty="Sin tareas agendadas."
        onAdd={() =>
          setAgenda([
            {
              id: crypto.randomUUID(),
              dueAt: newDay(),
              title: "",
              notes: "",
              closed: false,
              draft: true,
            },
            ...agenda,
          ])
        }
      >
        {agenda.map((item) => (
          <RecordRow
            key={item.id}
            record={item}
            closedLabel="Hecha"
            openLabel={
              today && isOverdue(item.dueAt, today) ? (
                <span className="font-medium text-red-700">Vencida</span>
              ) : (
                "Pendiente"
              )
            }
            dayOf={(value) => value.dueAt}
            persist={(value) => {
              changeAgenda(put(agenda, value));
              save(() => saveAgendaItem(customerId, { ...value, deviceId: sheet.id }));
            }}
            onDelete={() => {
              if (remove("agenda-item", item, "la tarea")) {
                changeAgenda(agenda.filter((other) => other.id !== item.id));
              }
            }}
          >
            {(editor) => (
              <>
                <DayInput
                  label="Fecha"
                  value={editor.value.dueAt}
                  onChange={(dueAt) => editor.commitNow({ dueAt })}
                />
                <TextArea
                  label="Notas"
                  value={editor.value.notes}
                  onChange={(notes) => editor.change({ notes })}
                  onBlur={editor.commit}
                />
              </>
            )}
          </RecordRow>
        ))}
      </RecordSection>
    </div>
  );
}

function RecordSection({
  heading,
  addLabel,
  empty,
  onAdd,
  children,
}: {
  heading: string;
  addLabel: string;
  empty: string;
  onAdd: () => void;
  children: ReactNode[];
}) {
  return (
    <section aria-label={heading} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-neutral-800">{heading}</h3>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700 hover:bg-neutral-100"
        >
          {addLabel}
        </button>
      </div>
      {children.length === 0 ? (
        <p className="text-sm text-neutral-500">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">{children}</ul>
      )}
    </section>
  );
}

type RecordBase = { id: string; title: string; closed: boolean };

// A record folded into one line (date, title, state) that opens to be edited.
// The title and the closed checkbox are common to every kind; `children`
// draws the rest.
function RecordRow<T extends RecordBase>({
  record,
  closedLabel,
  openLabel,
  dayOf,
  persist,
  onDelete,
  children,
}: {
  record: Entry<T>;
  closedLabel: string;
  openLabel: ReactNode;
  dayOf?: (value: T) => string;
  persist: (value: T) => void;
  onDelete: () => void;
  children: (editor: RecordEditor<T>) => ReactNode;
}) {
  const { draft, ...initial } = record;
  const editor = useRecordEditor<T>(initial as unknown as T, {
    draft: draft ?? false,
    tidy: (value) => ({ ...value, title: collapseSpaces(value.title) }),
    isComplete: (value) => value.title !== "" && (!dayOf || dayOf(value) !== ""),
    persist,
  });
  const [open, setOpen] = useState(draft ?? false);
  const { value } = editor;

  return (
    <li className="rounded-lg border border-neutral-200">
      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="flex cursor-pointer items-baseline gap-2 px-2.5 py-1.5 text-sm">
          {dayOf && <span className="shrink-0 text-xs text-neutral-500">{formatDay(dayOf(value))}</span>}
          <span className="min-w-0 flex-1 break-words text-neutral-900">
            {value.title || <span className="text-neutral-500">Sin título</span>}
          </span>
          <span className="shrink-0 text-xs text-neutral-600">
            {value.closed ? closedLabel : openLabel}
          </span>
        </summary>
        <div className="flex flex-col gap-2 border-t border-neutral-200 p-2.5">
          <label className={labelClass}>
            Título
            <input
              value={value.title}
              maxLength={RECORD_TITLE_MAX_LENGTH}
              autoComplete="off"
              autoFocus={draft}
              onChange={(event) => editor.change({ title: event.target.value } as Partial<T>)}
              onBlur={editor.commit}
              onKeyDown={(event) => {
                if (event.key === "Enter") editor.commit();
              }}
              className={inputClass + " font-medium"}
            />
          </label>
          {children(editor)}
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-xs text-neutral-700">
              <input
                type="checkbox"
                checked={value.closed}
                onChange={(event) => editor.commitNow({ closed: event.target.checked } as Partial<T>)}
              />
              {closedLabel}
            </label>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50"
            >
              Borrar
            </button>
          </div>
          {editor.isDraft && !collapseSpaces(value.title) && (
            <p className="text-xs text-neutral-500">Poné un título para guardarlo.</p>
          )}
        </div>
      </details>
    </li>
  );
}

function DayInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={labelClass}>
      {label}
      <input
        type="date"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <label className={labelClass}>
      {label}
      <textarea
        value={value}
        maxLength={DEVICE_TEXT_MAX_LENGTH}
        rows={rowsFor(value)}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className={inputClass + " font-normal"}
      />
    </label>
  );
}
