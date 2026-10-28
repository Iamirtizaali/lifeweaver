"use client";

import { useId, useState } from "react";
import { LIMITS, type Memory, type Story, type StoryLength, type StoryTone } from "@/lib/types";
import s from "./LifeWeaver.module.css";
import { api, describeError } from "./api";
import { AlertIcon, BookIcon, CloseIcon, ImagesIcon, RetryIcon, SparkIcon, Spinner } from "./icons";
import { cx, formatDate, memoryAlt, memoryLabel, truncate } from "./utils";

interface StoryStudioProps {
  memories: Memory[];
  /** Selected memories that can be used in a story (included, not failed). */
  selected: Memory[];
  onRemove: (id: string) => void;
  stories: Story[] | null;
  storiesError: string | null;
  onRetryStories: () => void;
  aiUnavailableReason: string | null;
  onPickMemories: () => void;
  onCreated: (story: Story) => void;
  onOpenStory: (id: string) => void;
}

const TONES: StoryTone[] = ["warm", "plain", "reflective"];
const LENGTHS: StoryLength[] = ["short", "medium"];

export default function StoryStudio(props: StoryStudioProps) {
  const { selected, stories, memories } = props;
  const [theme, setTheme] = useState("");
  const [tone, setTone] = useState<StoryTone>("warm");
  const [length, setLength] = useState<StoryLength>("short");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const tooMany = selected.length > LIMITS.maxStorySources;
  const canGenerate = selected.length > 0 && !tooMany && theme.trim().length > 0 && !busy && !props.aiUnavailableReason;
  const thumbFor = (story: Story) => {
    const imgId = story.sections.find((x) => x.imageIds.length)?.imageIds[0];
    return memories.find((m) => m.id === imgId)?.thumbUrl ?? null;
  };

  async function generate(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canGenerate) return;
    setBusy(true);
    setError(null);
    try {
      const story = await api.createStory({
        memoryIds: selected.map((m) => m.id),
        theme: theme.trim(),
        tone,
        length,
      });
      props.onCreated(story);
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  return (
    <div className={cx(s.view, s.studio)}>
      <section aria-labelledby={`${id}-h`}>
        <p className={s.kicker}>Story Studio</p>
        <h1 id={`${id}-h`} className={s.pageTitle}>
          Weave memories into a story.
        </h1>
        <p className={s.pageSub}>
          Choose a theme and Gemma writes an illustrated story from your descriptions, notes and answers. Every section
          links back to the memories it came from.
        </p>

        <form className={cx(s.panel, s.studioPanel)} onSubmit={generate} aria-busy={busy}>
          <div className={s.field}>
            <span className={s.label}>
              <span className={s.sectionLabel}>Memories</span>
              <span className={s.hint}>
                {selected.length}/{LIMITS.maxStorySources}
              </span>
            </span>
            {selected.length === 0 ? (
              <div className={s.notice}>
                <ImagesIcon />
                <div className={s.noticeBody}>
                  <span>No memories selected yet. Pick a few from your library to build the story from.</span>
                  <div className={s.noticeActions}>
                    <button type="button" className={cx(s.btn, s.small)} onClick={props.onPickMemories}>
                      Choose memories
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <ul className={s.pickRow} style={{ listStyle: "none", margin: 0 }} aria-label="Memories in this story">
                  {selected.map((m) => (
                    <li key={m.id} className={s.pick}>
                      {m.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- user uploads served by our API
                        <img src={m.thumbUrl} alt={memoryAlt(m)} />
                      ) : (
                        <p className={s.pickText}>{truncate(memoryLabel(m), 70)}</p>
                      )}
                      <button
                        type="button"
                        className={s.pickRemove}
                        onClick={() => props.onRemove(m.id)}
                        disabled={busy}
                        aria-label={`Remove ${truncate(memoryLabel(m), 50)} from story`}
                      >
                        <CloseIcon size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" className={cx(s.btn, s.ghost, s.small)} style={{ justifySelf: "start" }} onClick={props.onPickMemories}>
                  Add more from library
                </button>
              </>
            )}
            {tooMany && (
              <p className={s.hint} role="alert">
                Stories can use up to {LIMITS.maxStorySources} memories. Remove {selected.length - LIMITS.maxStorySources}.
              </p>
            )}
          </div>

          <div className={s.field}>
            <label className={s.label} htmlFor={`${id}-theme`}>
              <span className={s.sectionLabel}>Theme</span>
              <span className={s.hint}>
                {theme.length}/{LIMITS.maxThemeChars}
              </span>
            </label>
            <input
              id={`${id}-theme`}
              className={s.input}
              value={theme}
              maxLength={LIMITS.maxThemeChars}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="e.g. The summer we learned to sail"
              required
            />
          </div>

          <div className={s.optionRow}>
            <div className={s.field}>
              <span className={s.sectionLabel} id={`${id}-tone`}>
                Tone
              </span>
              <div className={s.segmented} role="radiogroup" aria-labelledby={`${id}-tone`}>
                {TONES.map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={tone === t} className={s.segment} onClick={() => setTone(t)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className={s.field}>
              <span className={s.sectionLabel} id={`${id}-len`}>
                Length
              </span>
              <div className={s.segmented} role="radiogroup" aria-labelledby={`${id}-len`}>
                {LENGTHS.map((l) => (
                  <button key={l} type="button" role="radio" aria-checked={length === l} className={s.segment} onClick={() => setLength(l)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {props.aiUnavailableReason && (
            <div className={cx(s.notice, s.noticeWarn)}>
              <AlertIcon />
              <span>{props.aiUnavailableReason}</span>
            </div>
          )}

          {busy && (
            <div className={s.notice} role="status">
              <Spinner />
              <span>Gemma is writing your story. This can take a little while; your choices stay as they are.</span>
            </div>
          )}

          {error && (
            <div className={cx(s.notice, s.noticeError)} role="alert">
              <AlertIcon />
              <div className={s.noticeBody}>
                <span>The story couldn&apos;t be written. {error}</span>
                <div className={s.noticeActions}>
                  <button type="button" className={cx(s.btn, s.small)} onClick={() => generate()} disabled={!canGenerate}>
                    <RetryIcon size={16} /> Try again
                  </button>
                </div>
              </div>
            </div>
          )}

          <div>
            <button type="submit" className={cx(s.btn, s.primary, s.uploadBtn)} disabled={!canGenerate} aria-busy={busy}>
              {busy ? <Spinner /> : <SparkIcon />}
              {busy ? "Writing story…" : "Generate story"}
            </button>
            <p className={s.hint} style={{ marginTop: 10 }}>
              Your descriptions and notes are sent to Google&apos;s Gemini API to run Gemma 4.
            </p>
          </div>
        </form>
      </section>

      <section aria-labelledby={`${id}-stories`} style={{ paddingTop: 8 }}>
        <h2 id={`${id}-stories`} className={s.sectionLabel} style={{ marginBottom: 14, fontWeight: 500 }}>
          Your stories
        </h2>
        {props.storiesError ? (
          <div className={cx(s.notice, s.noticeError)} role="alert">
            <AlertIcon />
            <div className={s.noticeBody}>
              <span>Couldn&apos;t load stories. {props.storiesError}</span>
              <div className={s.noticeActions}>
                <button type="button" className={cx(s.btn, s.small)} onClick={props.onRetryStories}>
                  <RetryIcon size={16} /> Try again
                </button>
              </div>
            </div>
          </div>
        ) : stories === null ? (
          <div className={s.storyList} aria-busy="true" aria-label="Loading stories">
            {[0, 1, 2].map((i) => (
              <div key={i} className={s.skeleton} style={{ height: 96 }} />
            ))}
          </div>
        ) : stories.length === 0 ? (
          <div className={s.notice}>
            <BookIcon />
            <span>Stories you generate appear here, ready to read, edit, print or export.</span>
          </div>
        ) : (
          <ul className={s.storyList} style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {stories.map((story) => {
              const thumb = thumbFor(story);
              return (
                <li key={story.id}>
                  <button type="button" className={s.storyItem} onClick={() => props.onOpenStory(story.id)}>
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element -- user uploads served by our API
                      <img className={s.storyThumb} src={thumb} alt="" />
                    ) : (
                      <span className={s.storyThumb} aria-hidden="true" />
                    )}
                    <span>
                      <span className={s.storyItemTitle}>{story.title}</span>
                      <span className={s.storyItemMeta} style={{ display: "block" }}>
                        {formatDate(story.createdAt)} · {story.sourceIds.length} memories
                        {story.status !== "current" && " · needs review"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
