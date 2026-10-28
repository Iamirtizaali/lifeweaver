"use client";

import { useCallback, useEffect, useId, useState } from "react";
import type { Memory, Story, StorySection } from "@/lib/types";
import s from "./LifeWeaver.module.css";
import { api, describeError } from "./api";
import { useDialog } from "./hooks";
import {
  AlertIcon,
  ArrowLeftIcon,
  CloseIcon,
  DownloadIcon,
  PencilIcon,
  PrinterIcon,
  QuoteIcon,
  RetryIcon,
  SaveIcon,
  SparkIcon,
  Spinner,
} from "./icons";
import { cx, formatDate, memoryAlt, memoryDate, memoryLabel, paragraphs, shownDescription } from "./utils";

interface StoryReaderProps {
  storyId: string;
  onBack: () => void;
  onChanged: (story: Story) => void;
  onDeleted: (id: string) => void;
}

type Draft = Pick<Story, "title" | "intro" | "sections">;

export default function StoryReader({ storyId, onBack, onChanged, onDeleted }: StoryReaderProps) {
  const [story, setStory] = useState<Story | null>(null);
  const [sources, setSources] = useState<Memory[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const [drawer, setDrawer] = useState<{ title: string; ids: string[] } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const id = useId();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await api.getStory(storyId);
      setStory(res.story);
      setSources(res.sources);
    } catch (err) {
      setLoadError(describeError(err));
    }
  }, [storyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; state is set after await
    void load();
  }, [load]);

  const byId = new Map(sources.map((m) => [m.id, m]));

  async function save() {
    if (!story || !draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await api.updateStory(story.id, draft);
      setStory(updated);
      onChanged(updated);
      setDraft(null);
      setSavedNote(true);
      setTimeout(() => setSavedNote(false), 3000);
    } catch (err) {
      setSaveError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!story) return;
    setDeleting(true);
    try {
      await api.deleteStory(story.id);
      onDeleted(story.id);
    } catch (err) {
      setSaveError(describeError(err));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  function updateSection(index: number, patch: Partial<StorySection>) {
    setDraft((d) => (d ? { ...d, sections: d.sections.map((sec, i) => (i === index ? { ...sec, ...patch } : sec)) } : d));
  }

  if (loadError) {
    return (
      <div className={cx(s.view, s.centerState)} role="alert">
        <AlertIcon size={28} />
        <p>Couldn&apos;t open this story. {loadError}</p>
        <div className={s.noticeActions}>
          <button type="button" className={s.btn} onClick={onBack}>
            <ArrowLeftIcon size={16} /> Back to studio
          </button>
          <button type="button" className={cx(s.btn, s.primary)} onClick={load}>
            <RetryIcon size={16} /> Try again
          </button>
        </div>
      </div>
    );
  }

  if (!story) {
    return (
      <div className={s.centerState} aria-busy="true" role="status">
        <Spinner size={24} />
        <p>Opening story…</p>
      </div>
    );
  }

  const editing = draft !== null;
  const view = draft ?? story;

  return (
    <div className={s.view}>
      <div className={s.readerBar}>
        <div className={s.readerBarGroup}>
          <button type="button" className={cx(s.btn, s.ghost, s.small)} onClick={onBack}>
            <ArrowLeftIcon size={16} /> Stories
          </button>
        </div>
        <div className={s.readerBarGroup}>
          {editing ? (
            <>
              <button type="button" className={cx(s.btn, s.ghost, s.small)} onClick={() => setDraft(null)} disabled={saving}>
                Cancel
              </button>
              <button type="button" className={cx(s.btn, s.primary, s.small)} onClick={save} disabled={saving} aria-busy={saving}>
                {saving ? <Spinner /> : <SaveIcon size={16} />} {saving ? "Saving…" : "Save story"}
              </button>
            </>
          ) : (
            <>
              {savedNote && (
                <span className={s.hint} role="status">
                  Saved
                </span>
              )}
              <button
                type="button"
                className={cx(s.btn, s.small)}
                onClick={() => setDraft({ title: story.title, intro: story.intro, sections: story.sections })}
              >
                <PencilIcon size={16} /> Edit
              </button>
              <a className={cx(s.btn, s.small)} href={`/stories/${encodeURIComponent(story.id)}/print`} target="_blank" rel="noopener">
                <PrinterIcon size={16} /> Print
              </a>
              <a className={cx(s.btn, s.small)} href={api.exportUrl(story.id, "md")} download>
                <DownloadIcon size={16} /> Markdown
              </a>
              <a className={cx(s.btn, s.ghost, s.small)} href={api.exportUrl(story.id, "json")} download>
                JSON
              </a>
              {confirmDelete ? (
                <>
                  <button type="button" className={cx(s.btn, s.danger, s.small)} onClick={remove} disabled={deleting}>
                    {deleting ? <Spinner /> : null} Delete story
                  </button>
                  <button type="button" className={cx(s.btn, s.ghost, s.small)} onClick={() => setConfirmDelete(false)} disabled={deleting}>
                    Keep
                  </button>
                </>
              ) : (
                <button type="button" className={cx(s.btn, s.ghost, s.small, s.danger)} onClick={() => setConfirmDelete(true)}>
                  Delete
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <article className={s.article} aria-labelledby={`${id}-title`}>
        {story.status !== "current" && (
          <div className={cx(s.notice, s.noticeWarn)} style={{ marginBottom: 28 }} role="status">
            <AlertIcon />
            <span>
              {story.status === "needs_review"
                ? "A memory this story used has been deleted. Review the sections and their sources."
                : "A memory this story used has been edited since it was written. Review whether the text still fits."}
            </span>
          </div>
        )}

        {saveError && (
          <div className={cx(s.notice, s.noticeError)} style={{ marginBottom: 28 }} role="alert">
            <AlertIcon />
            <div className={s.noticeBody}>
              <span>{saveError}</span>
              {editing && <span className={s.hint}>Your edits are still here.</span>}
            </div>
          </div>
        )}

        <p className={s.storyKicker}>
          {story.theme} · {story.tone}
        </p>

        {editing ? (
          <div className={s.stack}>
            <div className={s.field}>
              <label className={s.label} htmlFor={`${id}-t`}>
                Title
              </label>
              <input
                id={`${id}-t`}
                className={cx(s.input, s.editTitle)}
                value={view.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor={`${id}-i`}>
                Introduction
              </label>
              <textarea
                id={`${id}-i`}
                className={s.textarea}
                rows={4}
                value={view.intro}
                onChange={(e) => setDraft({ ...draft, intro: e.target.value })}
              />
            </div>
          </div>
        ) : (
          <>
            <h1 id={`${id}-title`} className={s.storyTitle}>
              {story.title}
            </h1>
            {paragraphs(story.intro).map((p, i) => (
              <p key={i} className={s.storyIntro}>
                {p}
              </p>
            ))}
          </>
        )}

        <div className={s.byline}>
          <span className={s.aiTag}>
            <SparkIcon size={12} /> Written with {story.model || "Gemma 4"} · AI-generated, edit freely
          </span>
          <span>{formatDate(story.createdAt)}</span>
          <button type="button" className={cx(s.btn, s.ghost, s.small)} onClick={() => setDrawer({ title: "All sources", ids: story.sourceIds })}>
            {story.sourceIds.length} sources
          </button>
        </div>

        {view.sections.map((sec, i) => {
          const images = sec.imageIds.map((x) => byId.get(x)).filter((m): m is Memory => !!m && !!(m.imageUrl || m.thumbUrl));
          return (
            <section key={i} className={s.section} aria-labelledby={editing ? undefined : `${id}-s${i}`}>
              {images.length === 1 && (
                <figure className={i % 2 === 0 ? s.figure : s.figureOffset}>
                  <div className={s.figureImgWrap}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- user uploads served by our API */}
                    <img className={s.figureImg} src={images[0].imageUrl ?? images[0].thumbUrl ?? ""} alt={memoryAlt(images[0])} loading="lazy" />
                  </div>
                  <figcaption className={s.figcaption}>
                    {memoryDate(images[0])}
                    {images[0].title ? ` · ${images[0].title}` : ""}
                  </figcaption>
                </figure>
              )}
              {images.length > 1 && (
                <div className={s.figurePair}>
                  {images.slice(0, 4).map((m) => (
                    <figure key={m.id} style={{ margin: 0 }}>
                      <div className={s.figureImgWrap}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- user uploads served by our API */}
                        <img className={s.figureImg} style={{ aspectRatio: "4 / 5" }} src={m.thumbUrl ?? m.imageUrl ?? ""} alt={memoryAlt(m)} loading="lazy" />
                      </div>
                      <figcaption className={s.figcaption}>{memoryDate(m)}</figcaption>
                    </figure>
                  ))}
                </div>
              )}

              {editing ? (
                <div className={s.stack}>
                  <div className={s.field}>
                    <label className={s.label} htmlFor={`${id}-h${i}`}>
                      Section {i + 1} heading
                    </label>
                    <input id={`${id}-h${i}`} className={s.input} value={sec.heading} onChange={(e) => updateSection(i, { heading: e.target.value })} />
                  </div>
                  <div className={s.field}>
                    <label className={s.label} htmlFor={`${id}-b${i}`}>
                      Section {i + 1} text
                    </label>
                    <textarea id={`${id}-b${i}`} className={s.textarea} rows={8} value={sec.text} onChange={(e) => updateSection(i, { text: e.target.value })} />
                  </div>
                </div>
              ) : (
                <>
                  {sec.heading && (
                    <h2 id={`${id}-s${i}`} className={s.sectionHeading}>
                      {sec.heading}
                    </h2>
                  )}
                  <div className={s.prose}>
                    {paragraphs(sec.text).map((p, j) => (
                      <p key={j}>{p}</p>
                    ))}
                  </div>
                </>
              )}

              <div className={s.sectionFoot}>
                <button
                  type="button"
                  className={cx(s.btn, s.ghost, s.small)}
                  onClick={() => setDrawer({ title: sec.heading || `Section ${i + 1}`, ids: sec.sourceIds })}
                  disabled={sec.sourceIds.length === 0}
                >
                  <QuoteIcon size={16} /> View sources ({sec.sourceIds.length})
                </button>
              </div>
            </section>
          );
        })}
      </article>

      {drawer && <SourcesDrawer title={drawer.title} ids={drawer.ids} byId={byId} onClose={() => setDrawer(null)} />}
    </div>
  );
}

function SourcesDrawer(props: { title: string; ids: string[]; byId: Map<string, Memory>; onClose: () => void }) {
  const ref = useDialog<HTMLDivElement>(props.onClose);
  return (
    <>
      <div className={s.scrim} onClick={props.onClose} aria-hidden="true" />
      <div ref={ref} className={cx(s.drawer, s.drawerNarrow)} role="dialog" aria-modal="true" aria-labelledby="lw-sources-title" tabIndex={-1}>
        <div className={s.drawerPanel} style={{ borderLeft: 0 }}>
          <div className={s.drawerHead}>
            <div>
              <h2 id="lw-sources-title" className={s.drawerTitle}>
                Sources
              </h2>
              <div className={s.drawerMeta}>{props.title}</div>
            </div>
            <button type="button" className={s.iconBtn} onClick={props.onClose} aria-label="Close sources" data-autofocus>
              <CloseIcon />
            </button>
          </div>
          <ul className={s.drawerBody} style={{ listStyle: "none", margin: 0 }}>
            {props.ids.map((mid) => {
              const m = props.byId.get(mid);
              if (!m)
                return (
                  <li key={mid} className={cx(s.sourceCard, s.sourceMissing)} style={{ gridTemplateColumns: "1fr" }}>
                    This memory has been deleted.
                  </li>
                );
              const desc = shownDescription(m);
              return (
                <li key={mid} className={s.sourceCard}>
                  {m.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- user uploads served by our API
                    <img src={m.thumbUrl} alt={memoryAlt(m)} />
                  ) : (
                    <span className={s.sourceTextIcon} aria-hidden="true">
                      <QuoteIcon />
                    </span>
                  )}
                  <div className={s.sourceBody}>
                    <strong>{memoryLabel(m)}</strong>
                    <span className={s.hint}>
                      {memoryDate(m)}
                      {m.location ? ` · ${m.location}` : ""}
                      {m.people.length ? ` · ${m.people.join(", ")}` : ""}
                    </span>
                    {desc && desc !== memoryLabel(m) && <span>{desc}</span>}
                    {m.note && <span>“{m.note}”</span>}
                    {m.question && m.answer && (
                      <span>
                        <em>{m.question}</em> {m.answer}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </>
  );
}
