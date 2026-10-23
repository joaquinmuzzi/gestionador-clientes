"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ClipboardEvent,
  type DragEvent,
} from "react";
import {
  ATTACHMENT_TITLE_MAX_LENGTH,
  ATTACHMENT_TYPES,
  precheckFile,
} from "@/lib/attachments/input";
import type { AttachmentItem } from "@/lib/attachments/queries";
import { collapseSpaces } from "@/lib/customers/input";
import { deleteAttachment, renameAttachment, uploadAttachment } from "./attachment-actions";

// Screenshots of a customer (on its page) or of a device (on its sheet).
// Images are added with the button, by dropping files on the gallery or by
// pasting with Ctrl+V while the gallery has the focus, which is the quickest
// way to keep a screenshot. Each image is fetched decrypted from the
// attachment route; nothing is cached by the browser.

function imageUrl(customerId: string, attachmentId: string, download = false): string {
  return `/customers/${customerId}/attachments/${attachmentId}${download ? "?download" : ""}`;
}

// False in the server HTML and until React takes over the page: a file chosen
// before that would be lost, so the button waits.
const noSubscription = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export function AttachmentGallery({
  customerId,
  deviceId = null,
  initial,
  heading = "Capturas",
}: {
  customerId: string;
  deviceId?: string | null;
  initial: AttachmentItem[];
  heading?: string;
}) {
  const [attachments, setAttachments] = useState(initial);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<AttachmentItem | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const hydrated = useHydrated();

  const upload = async (files: File[]) => {
    setError(null);
    for (const file of files) {
      const problem = precheckFile(file);
      if (problem) {
        setError(`${file.name || "Imagen"}: ${problem}`);
        continue;
      }
      const formData = new FormData();
      formData.set("file", file);
      if (deviceId) formData.set("deviceId", deviceId);
      setUploading((count) => count + 1);
      try {
        const result = await uploadAttachment(customerId, formData);
        const added = result.attachment;
        if (added) setAttachments((current) => [...current, added]);
        else setError(result.error ?? "No se pudo subir la imagen.");
      } catch {
        setError("No se pudo subir la imagen. Revisá la conexión.");
      } finally {
        setUploading((count) => count - 1);
      }
    }
  };

  const rename = async (attachment: AttachmentItem, title: string) => {
    setAttachments((current) =>
      current.map((other) => (other.id === attachment.id ? { ...other, title } : other)),
    );
    try {
      const result = await renameAttachment(customerId, { id: attachment.id, title });
      if (result.error) setError(result.error);
    } catch {
      setError("No se pudo guardar el título. Revisá la conexión.");
    }
  };

  const remove = async (attachment: AttachmentItem) => {
    const name = attachment.title || attachment.fileName;
    if (!window.confirm(`¿Borrar la imagen «${name}»? No se puede deshacer.`)) return;
    setOpen(null);
    setAttachments((current) => current.filter((other) => other.id !== attachment.id));
    try {
      const result = await deleteAttachment(customerId, attachment.id);
      if (result.error) setError(result.error);
    } catch {
      setError("No se pudo borrar la imagen. Revisá la conexión.");
    }
  };

  const onPaste = (event: ClipboardEvent) => {
    const files = Array.from(event.clipboardData.files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (files.length === 0) return;
    event.preventDefault();
    upload(files);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    upload(Array.from(event.dataTransfer.files));
  };

  return (
    <section
      aria-labelledby={headingId}
      // Focusable so Ctrl+V reaches it; the outline shows where a paste goes.
      tabIndex={0}
      onPaste={onPaste}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={
        "flex flex-col gap-3 rounded-lg p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 " +
        (dragging ? "bg-neutral-100 outline-2 outline-neutral-400 outline-dashed" : "")
      }
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={headingId} className="text-sm font-semibold text-neutral-800">
          {heading}
        </h3>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={!hydrated}
          className="rounded-md bg-neutral-900 px-3 py-1 text-sm text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          Agregar imagen
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ATTACHMENT_TYPES.join(",")}
          multiple
          hidden
          disabled={!hydrated}
          aria-label={`Subir imágenes a ${heading}`}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            upload(files);
          }}
        />
      </div>

      {attachments.length === 0 && uploading === 0 && (
        <p className="text-sm text-neutral-500">
          Sin imágenes. Arrastrá una captura acá, o hacé click en esta sección y pegala con Ctrl+V.
        </p>
      )}

      {attachments.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
          {attachments.map((attachment) => (
            <AttachmentCard
              key={attachment.id}
              customerId={customerId}
              attachment={attachment}
              onOpen={() => setOpen(attachment)}
              onRename={(title) => rename(attachment, title)}
              onDelete={() => remove(attachment)}
            />
          ))}
        </ul>
      )}

      {uploading > 0 && (
        <p role="status" className="text-sm text-neutral-600">
          Subiendo…
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {open && (
        <Lightbox
          customerId={customerId}
          attachment={open}
          onDelete={() => remove(open)}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}

function AttachmentCard({
  customerId,
  attachment,
  onOpen,
  onRename,
  onDelete,
}: {
  customerId: string;
  attachment: AttachmentItem;
  onOpen: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(attachment.title);
  const name = attachment.title || attachment.fileName;

  const commit = () => {
    const clean = collapseSpaces(title);
    setTitle(clean);
    if (clean !== attachment.title) onRename(clean);
  };

  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-neutral-200 p-1.5">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Ver ${name}`}
        className="flex h-24 items-center justify-center overflow-hidden rounded-md bg-neutral-100"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- served decrypted by our own route, never optimised or cached */}
        <img
          src={imageUrl(customerId, attachment.id)}
          alt={name}
          loading="lazy"
          className="max-h-full max-w-full object-contain"
        />
      </button>
      <input
        value={title}
        maxLength={ATTACHMENT_TITLE_MAX_LENGTH}
        placeholder={attachment.fileName}
        aria-label={`Título de ${name}`}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="w-full rounded border border-transparent px-1 py-0.5 text-xs text-neutral-800 hover:border-neutral-300 focus:border-neutral-900 focus:outline-none"
      />
      <div className="flex items-center justify-between px-1 text-xs text-neutral-500">
        <span>{formatSize(attachment.size)}</span>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Borrar ${name}`}
          className="rounded px-1 text-red-700 hover:bg-red-50"
        >
          Borrar
        </button>
      </div>
    </li>
  );
}

// The image at full size, over everything (the device sheet included).
function Lightbox({
  customerId,
  attachment,
  onDelete,
  onClose,
}: {
  customerId: string;
  attachment: AttachmentItem;
  onDelete: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const name = attachment.title || attachment.fileName;

  // Escape closes only the image, not the device sheet underneath: this runs
  // first (capture phase on window) and stops the event there.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col bg-black/80 p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="mx-auto flex w-full max-w-6xl items-center gap-3 pb-3 text-white"
      >
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-base font-medium">
          {name}
        </h2>
        <a
          href={imageUrl(customerId, attachment.id, true)}
          className="rounded-md border border-white/40 px-3 py-1 text-sm hover:bg-white/10"
        >
          Descargar
        </a>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md border border-red-300/60 px-3 py-1 text-sm text-red-200 hover:bg-red-500/20"
        >
          Borrar
        </button>
        <button
          type="button"
          onClick={onClose}
          autoFocus
          aria-label="Cerrar imagen"
          className="rounded-md px-2 py-1 text-lg leading-none hover:bg-white/10"
        >
          ×
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- see AttachmentCard */}
        <img
          src={imageUrl(customerId, attachment.id)}
          alt={name}
          onClick={(event) => event.stopPropagation()}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    </div>
  );
}
