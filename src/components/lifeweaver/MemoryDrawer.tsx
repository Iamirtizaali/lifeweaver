"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Memory, MemoryPatch } from "@/lib/types";
import s from "./LifeWeaver.module.css";
import { api, describeError } from "./api";
import { useDialog } from "./hooks";
import { AlertIcon, ArrowLeftIcon, ArrowRightIcon, CheckIcon, CloseIcon, RetryIcon, SaveIcon, SparkIcon, Spinner } from "./icons";
import { cx, memoryAlt, memoryDate, memoryLabel } from "./utils";

interface MemoryDrawerProps {
  memory: Memory;
  position: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  selected: boolean;
  onToggleSelect: () => void;
  analyzing: boolean;
  /** Starts the consent → analyze flow in the parent. */
  onAnalyze: () => void;
  aiUnavailableReason: string | null;
  onSaved: (m: Memory) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}

export default function MemoryDrawer(props: MemoryDrawerProps) {
  const { memory: m } = props;
  const dirtyRef = useRef(false);
  const close = () => {
    if (dirtyRef.current && !window.confirm("Discard your unsaved changes to this memory?")) return;
    props.onClose();
  };
  const ref = useDialog<HTMLDivElement>(close);
  const id = useId();
  const onDirty = useCallback((d: boolean) => {
    dirtyRef.current = d;
  }, []);

  const guarded = (fn: () => void) => () => {
    if (dirtyRef.current && !window.confirm("Discard your unsaved changes to this memory?")) return;
    dirtyRef.current = false;
    fn();
  };

  return (
    <>
      <div className={s.scrim} onClick={close} aria-hidden="true" />
      <div ref={ref} className={s.drawer} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1}>
        <div className={s.stage}>
          <div className={s.stageNav}>
            <div className={s.stageNavGroup}>
              <button type="button" className={s.iconBtn} onClick={guarded(props.onPrev)} disabled={props.total < 2} aria-label="Previous memory">
                <ArrowLeftIcon />
              </button>
              <span className={s.stageCounter} aria-live="polite">
                {props.position} of {props.total}
              </span>
              <button type="button" className={s.iconBtn} onClick={guarded(props.onNext)} disabled={props.total < 2} aria-label="Next memory">
                <ArrowRightIcon />
              </button>
            </div>
            <button type="button" className={s.iconBtn} onClick={close} aria-label="Close memory">
              <CloseIcon />
            </button>
          </div>
          {m.kind === "photo" && (m.imageUrl || m.thumbUrl) ? (
            // eslint-disable-next-line @next/next/no-img-element -- user uploads served by our API
            <img key={m.id} className={s.stageImg} src={m.imageUrl ?? m.thumbUrl ?? ""} alt={memoryAlt(m)} />
          ) : (
            <p className={s.stageText}>{m.note || "Empty note"}</p>
          )}
        </div>

        <MemoryForm
          key={`${m.id}:${m.updatedAt}`}
          {...props}
          titleId={`${id}-title`}
          onDirty={onDirty}
        />
      </div>
    </>
  );
}

function MemoryForm(
  props: MemoryDrawerProps & { titleId: string; onDirty: (dirty: boolean) => void },
) {
  const { memory: m } = props;
  const aiText = m.description ?? "";
  const [description, setDescription] = useState(m.userDescription ?? aiText);
  const [answer, setAnswer] = useState(m.answer ?? "");
  const [note, setNote] = useState(m.note ?? "");
  const [title, setTitle] = useState(m.title ?? "");
  const [date, setDate] = useState(m.date ?? "");
  const [people, setPeople] = useState(m.people.join(", "));
  const [location, setLocation] = useState(m.location ?? "");
  const [included, setIncluded] = useState(m.included);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fid = useId();

  const patch: MemoryPatch = {};
  const desc = description.trim();
  if (m.kind === "photo" && desc !== (m.userDescription ?? aiText).trim()) {
    patch.userDescription = desc === aiText.trim() ? null : desc;
  }
  if (answer.trim() !== (m.answer ?? "")) patch.answer = answer.trim() || null;
  if (note !== (m.note ?? "")) patch.note = note || null;
  if (title.trim() !== (m.title ?? "")) patch.title = title.trim() || null;
  if (date !== (m.date ?? "")) patch.date = date || null;
  const peopleList = people.split(",").map((p) => p.trim()).filter(Boolean);
  if (peopleList.join("|") !== m.people.join("|")) patch.people = peopleList;
  if (location.trim() !== (m.location ?? "")) patch.location = location.trim() || null;
  if (included !== m.included) patch.included = included;
  const dirty = Object.keys(patch).length > 0;
  const { onDirty } = props;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  async function save(extra?: MemoryPatch) {
    const body = { ...patch, ...extra };
    if (Object.keys(body).length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateMemory(m.id, body);
      props.onDirty(false);
      props.onSaved(updated);
    } catch (err) {
      setError(describeError(err));
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteMemory(m.id);
      props.onDirty(false);
      props.onDeleted(m.id);
    } catch (err) {
      setError(describeError(err));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const isAnalyzing = props.analyzing || m.status === "processing";
  const canAnalyze = m.kind === "photo" && m.included && (m.status === "uploaded" || m.status === "failed");
  const busy = saving || deleting;

  return (
    <div className={s.drawerPanel}>
      <div className={s.drawerHead}>
        <div>
          <h2 id={props.titleId} className={s.drawerTitle}>
            {m.kind === "text" ? "Note" : "Review memory"}
          </h2>
          <div className={s.drawerMeta}>
            <span>{memoryDate(m)}</span>
            {m.kind === "photo" && (
              <span>
                ·{" "}
                {isAnalyzing
                  ? "Analyzing…"
                  : m.status === "ready"
                    ? "Analyzed"
                    : m.status === "failed"
                      ? "Analysis failed"
                      : "Not analyzed yet"}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          className={cx(s.btn, s.small, props.selected && s.primary)}
          aria-pressed={props.selected}
          onClick={props.onToggleSelect}
        >
          {props.selected ? <CheckIcon size={16} /> : null}
          {props.selected ? "Selected" : "Select for story"}
        </button>
      </div>

      <div className={s.drawerBody}>
        {m.kind === "photo" && isAnalyzing && (
          <div className={s.notice} role="status">
            <Spinner />
            <span>Gemma is looking at this photo. This usually takes 5–20 seconds; you can keep editing other details.</span>
          </div>
        )}

        {m.kind === "photo" && !isAnalyzing && m.status === "failed" && (
          <div className={cx(s.notice, s.noticeError)} role="alert">
            <AlertIcon />
            <div className={s.noticeBody}>
              <span>Analysis failed{m.error ? `: ${m.error}` : "."}</span>
              <div className={s.noticeActions}>
                <button type="button" className={cx(s.btn, s.small)} onClick={props.onAnalyze} disabled={!!props.aiUnavailableReason}>
                  <RetryIcon size={16} /> Retry analysis
                </button>
              </div>
            </div>
          </div>
        )}

        {m.kind === "photo" && !isAnalyzing && m.status === "uploaded" && (
          <div className={s.notice}>
            <SparkIcon />
            <div className={s.noticeBody}>
              <span>
                {props.aiUnavailableReason ??
                  "Ask Gemma to describe this photo. You can correct anything it says."}
              </span>
              {canAnalyze && !props.aiUnavailableReason && (
                <div className={s.noticeActions}>
                  <button type="button" className={cx(s.btn, s.small, s.primary)} onClick={props.onAnalyze}>
                    <SparkIcon size={16} /> Analyze photo
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {m.kind === "photo" && (m.description !== null || m.userDescription !== null) && (
          <div className={s.field}>
            <label className={s.label} htmlFor={`${fid}-desc`}>
              <span>
                Description{" "}
                {m.userDescription === null || desc === aiText.trim() ? (
                  <span className={s.aiTag}>
                    <SparkIcon size={12} /> AI-generated · editable
                  </span>
                ) : (
                  <span className={s.aiTag}>Edited by you</span>
                )}
              </span>
              {m.description && desc !== aiText.trim() && (
                <button type="button" className={cx(s.btn, s.ghost, s.small)} onClick={() => setDescription(aiText)}>
                  Use AI version
                </button>
              )}
            </label>
            <textarea id={`${fid}-desc`} className={s.textarea} rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        )}

        {m.tags.length > 0 && (
          <ul className={s.tags} aria-label="Tags" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {m.tags.map((t) => (
              <li key={t} className={s.tag}>
                {t}
              </li>
            ))}
          </ul>
        )}

        {m.question && !m.questionSkipped && (
          <div className={s.questionBox}>
            <span className={s.aiTag} style={{ justifySelf: "start" }}>
              <SparkIcon size={12} /> Gemma asks
            </span>
            <label className={s.questionText} htmlFor={`${fid}-answer`}>
              {m.question}
            </label>
            <textarea
              id={`${fid}-answer`}
              className={s.textarea}
              rows={3}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Add the context only you know"
            />
            {!m.answer && (
              <button
                type="button"
                className={cx(s.btn, s.ghost, s.small)}
                style={{ justifySelf: "start" }}
                onClick={() => save({ questionSkipped: true })}
                disabled={busy}
              >
                Skip this question
              </button>
            )}
          </div>
        )}

        <div className={s.field}>
          <label className={s.label} htmlFor={`${fid}-note`}>
            {m.kind === "text" ? "Note" : "Your note & personal context"}
          </label>
          <textarea
            id={`${fid}-note`}
            className={s.textarea}
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why this moment matters, what happened just before or after…"
          />
        </div>

        <div className={s.row2}>
          <div className={s.field}>
            <label className={s.label} htmlFor={`${fid}-title`}>Title</label>
            <input id={`${fid}-title`} className={s.input} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor={`${fid}-date`}>Date</label>
            <input id={`${fid}-date`} type="date" className={s.input} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor={`${fid}-people`}>
              People <span className={s.hint}>comma-separated</span>
            </label>
            <input id={`${fid}-people`} className={s.input} value={people} onChange={(e) => setPeople(e.target.value)} />
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor={`${fid}-loc`}>Place</label>
            <input id={`${fid}-loc`} className={s.input} value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
        </div>

        <label className={s.switchRow}>
          <span className={s.switchText}>
            <strong>Include in AI and stories</strong>
            <span className={s.hint}>Turn off to keep this memory private to your library.</span>
          </span>
          <input type="checkbox" checked={included} onChange={(e) => setIncluded(e.target.checked)} />
        </label>

        {error && (
          <div className={cx(s.notice, s.noticeError)} role="alert">
            <AlertIcon />
            <div className={s.noticeBody}>
              <span>{error}</span>
              <span className={s.hint}>Your edits are still here.</span>
            </div>
          </div>
        )}
      </div>

      <div className={s.drawerFoot}>
        {confirmDelete ? (
          <div className={s.noticeActions} role="group" aria-label="Confirm delete">
            <button type="button" className={cx(s.btn, s.danger, s.small)} onClick={remove} disabled={deleting} data-autofocus>
              {deleting ? <Spinner /> : null} Delete permanently
            </button>
            <button type="button" className={cx(s.btn, s.ghost, s.small)} onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Keep
            </button>
          </div>
        ) : (
          <button type="button" className={cx(s.btn, s.ghost, s.small, s.danger)} onClick={() => setConfirmDelete(true)} disabled={busy}>
            Delete
          </button>
        )}
        <div className={s.drawerFootEnd}>
          <button type="button" className={cx(s.btn, s.primary)} onClick={() => save()} disabled={!dirty || busy} aria-busy={saving}>
            {saving ? <Spinner /> : <SaveIcon />}
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </div>
      <span className={s.srOnly}>{memoryLabel(m)}</span>
    </div>
  );
}
