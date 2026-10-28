"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LIMITS, type Memory } from "@/lib/types";
import s from "./LifeWeaver.module.css";
import { api, describeError } from "./api";
import { useDialog } from "./hooks";
import { AlertIcon, CloseIcon, ImagesIcon, Spinner, UploadIcon } from "./icons";
import { cx } from "./utils";

interface Picked {
  file: File;
  url: string;
}

export interface UploadDraft {
  note: string;
  title: string;
  date: string;
  people: string;
  location: string;
}

export const emptyDraft: UploadDraft = { note: "", title: "", date: "", people: "", location: "" };

interface UploadModalProps {
  /** Draft text lives in the parent so it survives closing the dialog or a failed upload. */
  draft: UploadDraft;
  onDraft: (d: UploadDraft) => void;
  onClose: () => void;
  onUploaded: (memories: Memory[]) => void;
}

function validate(file: File): string | null {
  if (!(LIMITS.acceptedTypes as readonly string[]).includes(file.type)) return `${file.name}: use JPEG, PNG, or WebP.`;
  if (file.size > LIMITS.maxPhotoBytes) return `${file.name}: larger than ${LIMITS.maxPhotoBytes / 1024 / 1024} MB.`;
  return null;
}

export default function UploadModal({ draft, onDraft, onClose, onUploaded }: UploadModalProps) {
  const [files, setFiles] = useState<Picked[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<Picked[]>([]);
  const dialogRef = useDialog<HTMLDivElement>(() => {
    if (!busy) onClose();
  });
  const id = useId();

  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  useEffect(() => () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.url)), []);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: Picked[] = [];
    const issues: string[] = [];
    for (const file of Array.from(list)) {
      const problem = validate(file);
      if (problem) issues.push(problem);
      else next.push({ file, url: URL.createObjectURL(file) });
    }
    const room = LIMITS.maxPhotosPerBatch - files.length;
    if (next.length > room) {
      issues.push(`Up to ${LIMITS.maxPhotosPerBatch} photos per upload; extra photos were left out.`);
      next.splice(room).forEach((p) => URL.revokeObjectURL(p.url));
    }
    setProblems(issues);
    setFiles((cur) => [...cur, ...next]);
  }

  function removeFile(index: number) {
    setFiles((cur) => {
      URL.revokeObjectURL(cur[index].url);
      return cur.filter((_, i) => i !== index);
    });
  }

  const canSubmit = (files.length > 0 || draft.note.trim().length > 0) && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.uploadMemories({ files: files.map((f) => f.file), ...draft });
      onUploaded(created);
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  const set = (key: keyof UploadDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onDraft({ ...draft, [key]: e.target.value });

  return (
    <>
      <div className={s.scrim} onClick={() => !busy && onClose()} aria-hidden="true" />
      <div
        ref={dialogRef}
        className={cx(s.panel, s.modal)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
      >
        <div className={s.modalHead}>
          <div>
            <h2 id={`${id}-title`} className={s.modalTitle}>
              Add memories
            </h2>
            <p className={s.modalSub}>Photos and an optional note. Details you add here apply to every photo in this batch.</p>
          </div>
          <button type="button" className={s.iconBtn} onClick={onClose} disabled={busy} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <form className={s.stack} onSubmit={submit}>
          <label
            className={cx(s.drop, dragging && s.dropActive)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
          >
            <span className={s.dropIcon}>
              <ImagesIcon size={22} />
            </span>
            <strong>Choose photos or drop them here</strong>
            <span className={s.hint}>
              JPEG, PNG or WebP · up to {LIMITS.maxPhotosPerBatch} photos · {LIMITS.maxPhotoBytes / 1024 / 1024} MB each
            </span>
            <input
              ref={inputRef}
              className={s.srOnly}
              type="file"
              accept={LIMITS.acceptedTypes.join(",")}
              multiple
              data-autofocus
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>

          {problems.length > 0 && (
            <div className={cx(s.notice, s.noticeWarn)} role="status">
              <AlertIcon />
              <div className={s.noticeBody}>
                {problems.map((p) => (
                  <span key={p}>{p}</span>
                ))}
              </div>
            </div>
          )}

          {files.length > 0 && (
            <ul className={s.previews} style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="Selected photos">
              {files.map((f, i) => (
                <li key={f.url} className={s.preview}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                  <img src={f.url} alt={f.file.name} />
                  <button
                    type="button"
                    className={s.previewRemove}
                    onClick={() => removeFile(i)}
                    disabled={busy}
                    aria-label={`Remove ${f.file.name}`}
                  >
                    <CloseIcon size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className={s.field}>
            <label className={s.label} htmlFor={`${id}-note`}>
              Note <span className={s.hint}>{draft.note.length}/{LIMITS.maxNoteChars}</span>
            </label>
            <textarea
              id={`${id}-note`}
              className={s.textarea}
              value={draft.note}
              maxLength={LIMITS.maxNoteChars}
              onChange={set("note")}
              placeholder="What was happening? Who was there? A note on its own is saved as a text memory."
            />
          </div>

          <div className={s.row2}>
            <div className={s.field}>
              <label className={s.label} htmlFor={`${id}-title-in`}>
                Title <span className={s.hint}>optional</span>
              </label>
              <input id={`${id}-title-in`} className={s.input} value={draft.title} onChange={set("title")} />
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor={`${id}-date`}>
                Date <span className={s.hint}>optional</span>
              </label>
              <input id={`${id}-date`} type="date" className={s.input} value={draft.date} onChange={set("date")} />
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor={`${id}-people`}>
                People <span className={s.hint}>comma-separated</span>
              </label>
              <input id={`${id}-people`} className={s.input} value={draft.people} onChange={set("people")} />
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor={`${id}-loc`}>
                Place <span className={s.hint}>optional</span>
              </label>
              <input id={`${id}-loc`} className={s.input} value={draft.location} onChange={set("location")} />
            </div>
          </div>

          {error && (
            <div className={cx(s.notice, s.noticeError)} role="alert">
              <AlertIcon />
              <div className={s.noticeBody}>
                <span>Upload failed. {error}</span>
                <span className={s.hint}>Your photos and text are still here, so you can try again.</span>
              </div>
            </div>
          )}

          <div className={s.modalFoot}>
            <button type="button" className={cx(s.btn, s.ghost)} onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className={cx(s.btn, s.primary)} disabled={!canSubmit} aria-busy={busy}>
              {busy ? <Spinner /> : <UploadIcon />}
              {busy
                ? "Uploading…"
                : files.length > 0
                  ? `Upload ${files.length} ${files.length === 1 ? "photo" : "photos"}`
                  : "Save note"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
