"use client";

import { useCallback, useEffect, useId, useState } from "react";
import type { Memory, Story, StorySection } from "@/lib/types";
import s from "./LifeWeaver.module.css";
import { api, describeError } from "./api";
import { useDialog } from "./hooks";
import { AlertIcon, BookIcon, CloseIcon, PencilIcon, PrinterIcon, QuoteIcon, RetryIcon, SaveIcon, SparkIcon, Spinner } from "./icons";
import { buildTimeline } from "./timeline";
import { cx, formatDate, memoryAlt, memoryDate, memoryLabel, paragraphs, shownDescription, truncate } from "./utils";

interface StoryResultProps {
  storyId: string;
  onNew: () => void;
}

type Draft = Pick<Story, "title" | "intro" | "sections">;

export default function StoryResult({ storyId, onNew }: StoryResultProps) {
  const [story, setStory] = useState<Story | null>(null);
  const [sources, setSources] = useState<Memory[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"story" | "timeline">("story");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const [inspect, setInspect] = useState<{ title: string; ids: string[] } | null>(null);
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
      setDraft(null);
      setSavedNote(true);
      setTimeout(() => setSavedNote(false), 3000);
    } catch (err) {
      setSaveError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  function updateSection(index: number, patch: Partial<StorySection>) {
    setDraft((d) => (d ? { ...d, sections: d.sections.map((sec, i) => (i === index ? { ...sec, ...patch } : sec)) } : d));
  }

  if (loadError) {
    return (
      <div className={cx(s.panel, s.centerState)} role="alert">
        <AlertIcon size={28} />
        <p>Your story was created but couldn&apos;t be loaded. {loadError}</p>
        <button type="button" className={cx(s.btn, s.primary)} onClick={load}>
          <RetryIcon size={16} /> Try again
        </button>
      </div>
    );
  }

  if (!story) {
    return (
      <div className={s.centerState} aria-busy="true" role="status">
        <Spinner size={24} />
        <p>Opening your story…</p>
      </div>
    );
  }

  const editing = draft !== null;
  const view = draft ?? story;
  const timeline = buildTimeline(story, byId);

  return (
    <div className={s.result}>
      <div className={s.resultBar}>
        <div className={s.segmented} role="tablist" aria-label="View">
          <button type="button" role="tab" aria-selected={mode === "story"} aria-controls={`${id}-panel`} className={s.segment} onClick={() => setMode("story")}>
            <BookIcon size={15} /> Story
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "timeline"}
            aria-controls={`${id}-panel`}
            className={s.segment}
            onClick={() => {
              setMode("timeline");
              setDraft(null);
            }}
            disabled={editing}
          >
            Timeline
          </button>
        </div>
        <div className={s.readerBarGroup}>
          {editing ? (
            <>
              <button type="button" className={cx(s.btn, s.ghost, s.small)} onClick={() => setDraft(null)} disabled={saving}>
                Cancel
              </button>
              <button type="button" className={cx(s.btn, s.primary, s.small)} onClick={save} disabled={saving} aria-busy={saving}>
                {saving ? <Spinner /> : <SaveIcon size={16} />} {saving ? "Saving…" : "Save changes"}
              </button>
            </>
          ) : (
            <>
              {savedNote && (
                <span className={s.hint} role="status">
                  Saved
                </span>
              )}
              {mode === "story" && (
                <button
                  type="button"
                  className={cx(s.btn, s.small)}
                  onClick={() => setDraft({ title: story.title, intro: story.intro, sections: story.sections })}
                >
                  <PencilIcon size={16} /> Edit text
                </button>
              )}
              <a className={cx(s.btn, s.small)} href={`/stories/${encodeURIComponent(story.id)}/print`} target="_blank" rel="noopener">
                <PrinterIcon size={16} /> Print / PDF
              </a>
              <button type="button" className={cx(s.btn, s.ghost, s.small)} onClick={onNew}>
                <SparkIcon size={16} /> New story
              </button>
            </>
          )}
        </div>
      </div>

      <div id={`${id}-panel`} role="tabpanel" className={cx(s.panel, s.paper)}>
        {story.status !== "current" && (
          <div className={cx(s.notice, s.noticeWarn)} style={{ marginBottom: 28 }} role="status">
            <AlertIcon />
            <span>A memory this story used was edited or removed after it was written. Check that the text still fits.</span>
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

        <article className={s.article} aria-labelledby={`${id}-title`}>
          <p className={s.storyKicker}>{story.theme}</p>
          {editing ? (
            <div className={s.stack}>
              <div className={s.field}>
                <label className={s.label} htmlFor={`${id}-t`}>
                  Title
                </label>
                <input id={`${id}-t`} className={cx(s.input, s.editTitle)} value={view.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </div>
              <div className={s.field}>
                <label className={s.label} htmlFor={`${id}-i`}>
                  Introduction
                </label>
                <textarea id={`${id}-i`} className={s.textarea} rows={4} value={view.intro} onChange={(e) => setDraft({ ...draft, intro: e.target.value })} />
              </div>
            </div>
          ) : (
            <>
              <h2 id={`${id}-title`} className={s.storyTitle}>
                {story.title}
              </h2>
              {paragraphs(story.intro).map((p, i) => (
                <p key={i} className={s.storyIntro}>
                  {p}
                </p>
              ))}
            </>
          )}

          <div className={s.byline}>
            <span className={s.aiTag}>
              <SparkIcon size={12} /> Written by {story.model} · AI-generated, edit freely
            </span>
            <span>{formatDate(story.createdAt)}</span>
            <button type="button" className={cx(s.btn, s.ghost, s.small)} onClick={() => setInspect({ title: "All sources", ids: story.sourceIds })}>
              <QuoteIcon size={15} /> {story.sourceIds.length} sources
            </button>
          </div>

          {mode === "story" ? (
            view.sections.map((sec, i) => {
              const images = sec.imageIds.map((x) => byId.get(x)).filter((m): m is Memory => !!m && !!(m.imageUrl || m.thumbUrl));
              return (
                <section key={i} className={s.section}>
                  {images.length === 1 && (
                    <figure className={i % 2 === 0 ? s.figure : s.figureOffset}>
                      <div className={s.figureImgWrap}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- user uploads served by our API */}
                        <img className={s.figureImg} src={images[0].imageUrl ?? images[0].thumbUrl ?? ""} alt={memoryAlt(images[0])} loading="lazy" />
                      </div>
                      <figcaption className={s.figcaption}>{memoryDate(images[0]) || "Undated"}</figcaption>
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
                        <textarea id={`${id}-b${i}`} className={s.textarea} rows={7} value={sec.text} onChange={(e) => updateSection(i, { text: e.target.value })} />
                      </div>
                    </div>
                  ) : (
                    <>
                      {sec.heading && <h3 className={s.sectionHeading}>{sec.heading}</h3>}
                      <div className={s.prose}>
                        {paragraphs(sec.text).map((p, j) => (
                          <p key={j}>{p}</p>
                        ))}
                      </div>
                    </>
                  )}

                  <div className={s.sectionFoot}>
                    {sec.sourceIds.map((sid, n) => {
                      const m = byId.get(sid);
                      return (
                        <button
                          key={sid}
                          type="button"
                          className={s.sourceRef}
                          onClick={() => setInspect({ title: sec.heading || `Section ${i + 1}`, ids: [sid] })}
                          aria-label={`Source ${n + 1}: ${m ? memoryLabel(m) : "deleted memory"}`}
                        >
                          <QuoteIcon size={13} /> {m ? truncate(memoryLabel(m), 32) : "Deleted"}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })
          ) : (
            <ol className={s.timeline}>
              {timeline.map((ev, i) => (
                <li key={ev.memory.id} className={s.tlItem} style={{ animationDelay: `${Math.min(i, 10) * 50}ms` }}>
                  <span className={cx(s.tlDot, !ev.date && s.tlDotUndated)} aria-hidden="true" />
                  <div className={s.tlDate}>{ev.date ? formatDate(ev.date) : "Undated"}</div>
                  <div className={s.tlCard}>
                    {ev.memory.kind === "photo" && ev.memory.thumbUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- user uploads served by our API
                      <img className={s.tlImg} src={ev.memory.thumbUrl} alt={memoryAlt(ev.memory)} loading="lazy" />
                    )}
                    <div className={s.tlBody}>
                      <strong>{ev.heading}</strong>
                      {ev.excerpt && <p className={s.tlExcerpt}>{ev.excerpt}</p>}
                      <div className={s.tlFoot}>
                        <button type="button" className={s.sourceRef} onClick={() => setInspect({ title: ev.heading, ids: [ev.memory.id] })}>
                          <QuoteIcon size={13} /> {ev.memory.kind === "photo" ? "Photo" : ev.memory.title?.startsWith("Chat:") ? "Chat" : "Note"} source
                        </button>
                        {ev.sections.length > 0 && (
                          <span className={s.hint}>In: {ev.sections.map((x) => x || "Untitled section").join(" · ")}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
              {timeline.length === 0 && <li className={s.hint}>No sources are available for this story.</li>}
            </ol>
          )}
        </article>
      </div>

      {inspect && <SourcesDrawer title={inspect.title} ids={inspect.ids} byId={byId} onClose={() => setInspect(null)} />}
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
                {props.ids.length === 1 ? "Source" : "Sources"}
              </h2>
              <div className={s.drawerMeta}>{props.title}</div>
            </div>
            <button type="button" className={s.iconBtn} onClick={props.onClose} aria-label="Close sources" data-autofocus>
              <CloseIcon />
            </button>
          </div>
          <ul className={s.drawerBody}>
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
                <li key={mid} className={cx(s.sourceCard, props.ids.length === 1 && s.sourceCardLarge)}>
                  {m.kind === "photo" && (m.imageUrl || m.thumbUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- user uploads served by our API
                    <img src={(props.ids.length === 1 ? m.imageUrl : m.thumbUrl) ?? m.thumbUrl ?? ""} alt={memoryAlt(m)} />
                  ) : (
                    <span className={s.sourceTextIcon} aria-hidden="true">
                      <QuoteIcon />
                    </span>
                  )}
                  <div className={s.sourceBody}>
                    <strong>{m.title || (m.kind === "photo" ? "Photo" : "Note")}</strong>
                    <span className={s.hint}>
                      {m.date ? formatDate(m.date) : "Undated"}
                      {m.people.length ? ` · ${m.people.join(", ")}` : ""}
                    </span>
                    {desc && (
                      <span>
                        <span className={s.aiTag}>AI description</span> {desc}
                      </span>
                    )}
                    {m.note && <span className={s.sourceNote}>{m.note}</span>}
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
