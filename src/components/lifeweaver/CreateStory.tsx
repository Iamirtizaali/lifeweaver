"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { LIMITS, type Memory, type Story, type StoryLength, type StoryTone } from "@/lib/types";
import s from "./LifeWeaver.module.css";
import { api, describeError } from "./api";
import { chunkChat, parseChat, type DateOrder } from "./chat";
import { AlertIcon, CheckIcon, CloseIcon, ImagesIcon, QuoteIcon, RetryIcon, SparkIcon, Spinner } from "./icons";
import { cx } from "./utils";

export type StoryKind = "trip" | "friendship" | "family" | "custom";

const KINDS: { key: StoryKind; label: string; hint: string }[] = [
  { key: "trip", label: "A trip", hint: "Places, days on the road, the way back" },
  { key: "friendship", label: "A friendship", hint: "Inside jokes, long chats, moments together" },
  { key: "family", label: "Family moments", hint: "Gatherings, milestones, everyday warmth" },
  { key: "custom", label: "Something else", hint: "Describe it in your own words" },
];

const KIND_THEME: Record<StoryKind, string> = {
  trip: "A trip",
  friendship: "A friendship",
  family: "Family moments",
  custom: "A personal story",
};

interface PhotoItem {
  key: string;
  file: File;
  url: string;
  memoryId?: string;
}
interface ChatItem {
  key: string;
  file: File;
  raw: string;
  order: DateOrder;
  memoryIds?: string[];
}

type Phase = "idle" | "uploading" | "analyzing" | "writing";

export interface StorySettings {
  tone: StoryTone;
  length: StoryLength;
}

interface CreateStoryProps {
  online: boolean;
  aiReady: boolean | null;
  model: string | null;
  settings: StorySettings;
  onCreated: (story: Story) => void;
}

let seq = 0;
const nextKey = () => `k${++seq}`;

export default function CreateStory(props: CreateStoryProps) {
  const id = useId();
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [pasted, setPasted] = useState("");
  const [written, setWritten] = useState("");
  const [textIds, setTextIds] = useState<{ pasted?: string; written?: string }>({});
  const [kind, setKind] = useState<StoryKind>("trip");
  const [customKind, setCustomKind] = useState("");
  const [title, setTitle] = useState("");
  const [instruction, setInstruction] = useState("");
  const [date, setDate] = useState("");
  const [names, setNames] = useState("");
  const [consent, setConsent] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [failedPhotos, setFailedPhotos] = useState<Memory[]>([]);
  const photosRef = useRef(photos);
  /** Photo memory ids Gemma has already analysed, so a retry doesn't redo them. */
  const readyRef = useRef(new Set<string>());

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  // Shared details apply to everything uploaded; changing them means re-uploading.
  function forgetUploads() {
    setPhotos((cur) => cur.map((p) => ({ ...p, memoryId: undefined })));
    setChats((cur) => cur.map((c) => ({ ...c, memoryIds: undefined })));
    setTextIds({});
  }

  const textSourceCount = (pasted.trim() ? 1 : 0) + (written.trim() ? 1 : 0);
  const chatBudget = LIMITS.maxStorySources - photos.length - textSourceCount;
  const perChatBudget = chats.length ? Math.floor(chatBudget / chats.length) : 0;

  const chatPlans = useMemo(
    () =>
      chats.map((c) => {
        const parsed = parseChat(c.raw, c.order);
        const chunks = chunkChat(parsed, c.file.name, Math.max(1, perChatBudget), LIMITS.maxNoteChars);
        return { item: c, parsed, chunks };
      }),
    [chats, perChatBudget],
  );

  const totalSources = photos.length + textSourceCount + chatPlans.reduce((n, p) => n + p.chunks.length, 0);
  const hasInput = photos.length > 0 || chats.length > 0 || textSourceCount > 0;
  const overBudget = totalSources > LIMITS.maxStorySources || (chats.length > 0 && perChatBudget < 1);
  const themeText = composeTheme(kind, customKind, instruction);
  const busy = phase !== "idle";

  const blocker = !hasInput
    ? "Add at least one photo, chat file or written memory."
    : overBudget
      ? `A story can draw on up to ${LIMITS.maxStorySources} sources. Remove a photo or chat file.`
      : kind === "custom" && customKind.trim().length < 3
        ? "Describe the kind of story you want."
        : !consent
          ? "Confirm that your files can be sent to the AI."
          : !props.online
            ? "You're offline. Generation needs an internet connection; your inputs are kept."
            : props.aiReady === false
              ? "AI isn't set up on the server yet (no Gemini API key)."
              : null;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const issues: string[] = [];
    const newPhotos: PhotoItem[] = [];
    const reads: Promise<ChatItem | null>[] = [];
    for (const file of Array.from(list)) {
      const isTxt = file.type === "text/plain" || /\.txt$/i.test(file.name);
      if ((LIMITS.acceptedTypes as readonly string[]).includes(file.type)) {
        if (file.size > LIMITS.maxPhotoBytes) issues.push(`${file.name} is over ${LIMITS.maxPhotoBytes / 1048576} MB.`);
        else newPhotos.push({ key: nextKey(), file, url: URL.createObjectURL(file) });
      } else if (isTxt) {
        if (file.size > 5 * 1048576) issues.push(`${file.name} is over 5 MB. Export a shorter chat.`);
        else
          reads.push(
            file.text().then(
              (raw) => ({ key: nextKey(), file, raw, order: "dmy" as DateOrder }),
              () => {
                issues.push(`${file.name} couldn't be read.`);
                return null;
              },
            ),
          );
      } else {
        issues.push(`${file.name}: only JPEG, PNG, WebP photos and .txt chat exports are supported.`);
      }
    }
    const room = LIMITS.maxPhotosPerBatch - photos.length;
    if (newPhotos.length > room) {
      issues.push(`Up to ${LIMITS.maxPhotosPerBatch} photos per story; extra photos were left out.`);
      newPhotos.splice(room).forEach((p) => URL.revokeObjectURL(p.url));
    }
    setPhotos((cur) => [...cur, ...newPhotos]);
    Promise.all(reads).then((items) => {
      const ok = items.filter((x): x is ChatItem => !!x);
      setChats((cur) => [...cur, ...ok]);
      setProblems(issues);
    });
    setProblems(issues);
  }

  async function generate(skipFailed = false) {
    if (blocker || busy) return;
    setError(null);
    const people = names;
    const shared = { title: "", date, people, location: "" };
    try {
      // 1. Upload whatever hasn't been stored yet (kept across retries).
      setPhase("uploading");
      let photoState = photos;
      const pending = photos.filter((p) => !p.memoryId);
      if (pending.length) {
        const created = await api.uploadMemories({ files: pending.map((p) => p.file), note: "", ...shared });
        const ids = new Map(pending.map((p, i) => [p.key, created[i]?.id]));
        photoState = photos.map((p) => (ids.get(p.key) ? { ...p, memoryId: ids.get(p.key) } : p));
        setPhotos(photoState);
      }
      const ids = { ...textIds };
      for (const [k, text, label] of [
        ["pasted", pasted, "Pasted conversation"],
        ["written", written, "Written memory"],
      ] as const) {
        if (text.trim() && !ids[k]) {
          const [m] = await api.uploadMemories({ files: [], note: text.trim().slice(0, LIMITS.maxNoteChars), ...shared, title: label });
          ids[k] = m.id;
          setTextIds({ ...ids });
        }
      }
      const chatIds: string[] = [];
      const nextChats = [...chats];
      for (const [i, plan] of chatPlans.entries()) {
        if (!plan.item.memoryIds) {
          const made: string[] = [];
          for (const chunk of plan.chunks) {
            const [m] = await api.uploadMemories({
              files: [],
              note: chunk.text,
              title: chunk.title.slice(0, 200),
              date: chunk.date ?? "",
              people,
              location: "",
            });
            made.push(m.id);
          }
          nextChats[i] = { ...plan.item, memoryIds: made };
          setChats([...nextChats]);
        }
        chatIds.push(...(nextChats[i].memoryIds ?? []));
      }

      // 2. Gemma looks at photos that aren't analysed yet.
      let photoIds = photoState.map((p) => p.memoryId!).filter(Boolean);
      const failedIds = new Set(failedPhotos.map((m) => m.id));
      if (skipFailed) photoIds = photoIds.filter((x) => !failedIds.has(x));
      const toAnalyze = photoIds.filter((x) => !readyRef.current.has(x));
      if (!skipFailed && toAnalyze.length) {
        setPhase("analyzing");
        const analysed = await api.analyze(toAnalyze);
        analysed.forEach((m) => m.status === "ready" && readyRef.current.add(m.id));
        const failed = analysed.filter((m) => toAnalyze.includes(m.id) && m.status === "failed");
        setFailedPhotos(failed);
        if (failed.length) {
          setError(
            `Gemma couldn't analyze ${failed.length} of ${photoIds.length} photos: ${failed[0].error ?? "unknown error"}`,
          );
          setPhase("idle");
          return;
        }
      }

      // 3. Gemma writes the story from all sources.
      setPhase("writing");
      const memoryIds = [...photoIds, ...(ids.pasted ? [ids.pasted] : []), ...(ids.written ? [ids.written] : []), ...chatIds];
      let story = await api.createStory({ memoryIds, theme: themeText, tone: props.settings.tone, length: props.settings.length });
      if (title.trim()) story = await api.updateStory(story.id, { title: title.trim() });
      setFailedPhotos([]);
      setPhase("idle");
      props.onCreated(story);
    } catch (err) {
      setError(
        !navigator.onLine
          ? "You appear to be offline. Generation needs an internet connection. Your inputs are kept; try again once you're back online."
          : describeError(err),
      );
      setPhase("idle");
    }
  }

  const phaseText: Record<Exclude<Phase, "idle">, string> = {
    uploading: "Saving your files…",
    analyzing: `Gemma is looking at ${photos.length} ${photos.length === 1 ? "photo" : "photos"}. This usually takes 5–20 seconds per photo.`,
    writing: "Gemma is writing your story and timeline…",
  };

  return (
    <form
      className={cx(s.panel, s.createPanel)}
      onSubmit={(e) => {
        e.preventDefault();
        void generate();
      }}
      aria-busy={busy}
      aria-describedby={`${id}-status`}
    >
      {/* 1. Memories */}
      <fieldset className={s.step} disabled={busy}>
        <legend className={s.stepLegend}>
          <span className={s.stepNum}>1</span> Add memories
        </legend>

        <label
          className={cx(s.drop, s.dropLarge, dragging && s.dropActive)}
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
          <strong>Drop photos and chat exports here, or browse</strong>
          <span className={s.hint}>
            Photos: JPEG, PNG or WebP, up to {LIMITS.maxPhotosPerBatch} at {LIMITS.maxPhotoBytes / 1048576} MB each. Chats: WhatsApp
            “Export chat” .txt files (without media).
          </span>
          <input
            className={s.srOnly}
            type="file"
            multiple
            accept={[...LIMITS.acceptedTypes, ".txt", "text/plain"].join(",")}
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

        {photos.length > 0 && (
          <ul className={s.previews} aria-label="Photos to include">
            {photos.map((p) => (
              <li key={p.key} className={s.preview}>
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the user's file */}
                <img src={p.url} alt={p.file.name} />
                <button
                  type="button"
                  className={s.previewRemove}
                  aria-label={`Remove ${p.file.name}`}
                  onClick={() => {
                    URL.revokeObjectURL(p.url);
                    setPhotos((cur) => cur.filter((x) => x.key !== p.key));
                  }}
                >
                  <CloseIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {chatPlans.length > 0 && (
          <ul className={s.chips} aria-label="Chat files to include">
            {chatPlans.map(({ item, parsed, chunks }) => {
              const truncated = chunks.some((c) => c.truncated);
              return (
                <li key={item.key} className={s.chip}>
                  <QuoteIcon size={16} />
                  <span className={s.chipText}>
                    <strong>{item.file.name}</strong>
                    <span className={s.hint}>
                      {parsed.messageCount > 0
                        ? `${parsed.messageCount} messages over ${parsed.days.length} ${parsed.days.length === 1 ? "day" : "days"} · ${chunks.length} ${chunks.length === 1 ? "source" : "sources"}`
                        : "No WhatsApp timestamps found; used as one undated note"}
                      {truncated && " · long chat, only the start of each part is used"}
                    </span>
                    {parsed.ambiguous && (
                      <span className={s.chipOrder}>
                        Dates look like{" "}
                        <select
                          className={s.selectInline}
                          value={item.order}
                          aria-label={`Date format in ${item.file.name}`}
                          onChange={(e) =>
                            setChats((cur) =>
                              cur.map((c) => (c.key === item.key ? { ...c, order: e.target.value as DateOrder, memoryIds: undefined } : c)),
                            )
                          }
                        >
                          <option value="dmy">day/month</option>
                          <option value="mdy">month/day</option>
                        </select>
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    className={s.chipRemove}
                    aria-label={`Remove ${item.file.name}`}
                    onClick={() => setChats((cur) => cur.filter((c) => c.key !== item.key))}
                  >
                    <CloseIcon size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <details className={s.more} open={textSourceCount > 0 || undefined}>
          <summary>Paste a conversation or write a memory instead</summary>
          <div className={s.row2}>
            <div className={s.field}>
              <label className={s.label} htmlFor={`${id}-paste`}>
                Pasted conversation <span className={s.hint}>{pasted.length}/{LIMITS.maxNoteChars}</span>
              </label>
              <textarea
                id={`${id}-paste`}
                className={s.textarea}
                rows={5}
                maxLength={LIMITS.maxNoteChars}
                value={pasted}
                onChange={(e) => {
                  setPasted(e.target.value);
                  setTextIds((t) => ({ ...t, pasted: undefined }));
                }}
                placeholder="Paste messages here"
              />
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor={`${id}-write`}>
                Written memory <span className={s.hint}>{written.length}/{LIMITS.maxNoteChars}</span>
              </label>
              <textarea
                id={`${id}-write`}
                className={s.textarea}
                rows={5}
                maxLength={LIMITS.maxNoteChars}
                value={written}
                onChange={(e) => {
                  setWritten(e.target.value);
                  setTextIds((t) => ({ ...t, written: undefined }));
                }}
                placeholder="What happened, who was there, why it matters"
              />
            </div>
          </div>
        </details>
      </fieldset>

      {/* 2. Story */}
      <fieldset className={s.step} disabled={busy}>
        <legend className={s.stepLegend}>
          <span className={s.stepNum}>2</span> Choose your story
        </legend>
        <div className={s.kinds} role="radiogroup" aria-label="Kind of story">
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              role="radio"
              aria-checked={kind === k.key}
              className={s.kind}
              onClick={() => setKind(k.key)}
            >
              <span className={s.kindCheck} aria-hidden="true">
                <CheckIcon size={14} strokeWidth={2.4} />
              </span>
              <strong>{k.label}</strong>
              <span className={s.hint}>{k.hint}</span>
            </button>
          ))}
        </div>
        {kind === "custom" && (
          <div className={s.field}>
            <label className={s.label} htmlFor={`${id}-custom`}>
              What kind of story?
            </label>
            <input
              id={`${id}-custom`}
              className={s.input}
              maxLength={80}
              value={customKind}
              onChange={(e) => setCustomKind(e.target.value)}
              placeholder="e.g. Our first year in the new house"
            />
          </div>
        )}
        <div className={s.row2}>
          <div className={s.field}>
            <label className={s.label} htmlFor={`${id}-title`}>
              Title <span className={s.hint}>optional</span>
            </label>
            <input id={`${id}-title`} className={s.input} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor={`${id}-instr`}>
              Short instruction <span className={s.hint}>optional</span>
            </label>
            <input
              id={`${id}-instr`}
              className={s.input}
              maxLength={100}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="e.g. Focus on the food we tried"
            />
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor={`${id}-date`}>
              When were the photos taken? <span className={s.hint}>optional</span>
            </label>
            <input
              id={`${id}-date`}
              type="date"
              className={s.input}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                forgetUploads();
              }}
            />
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor={`${id}-names`}>
              Names <span className={s.hint}>optional, comma-separated</span>
            </label>
            <input
              id={`${id}-names`}
              className={s.input}
              value={names}
              onChange={(e) => {
                setNames(e.target.value);
                forgetUploads();
              }}
              placeholder="e.g. Maya, Grandpa Joe"
            />
          </div>
        </div>
        <p className={s.hint}>Undated photos and notes are marked “Undated” on the timeline; the AI is told not to guess dates.</p>
      </fieldset>

      {/* 3. Generate */}
      <fieldset className={s.step} disabled={busy}>
        <legend className={s.stepLegend}>
          <span className={s.stepNum}>3</span> Relive it
        </legend>
        <label className={s.consent}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            I agree to send these photos and texts to Google&apos;s Gemini API to run {props.model ?? "Gemma 4"}. Chat text is
            treated as source material only, never as instructions.
          </span>
        </label>
      </fieldset>

      <div id={`${id}-status`} aria-live="polite" className={s.generateArea}>
        {busy && (
          <div className={s.notice} role="status">
            <Spinner />
            <span>{phaseText[phase as Exclude<Phase, "idle">]}</span>
          </div>
        )}
        {error && !busy && (
          <div className={cx(s.notice, s.noticeError)} role="alert">
            <AlertIcon />
            <div className={s.noticeBody}>
              <span>{error}</span>
              <span className={s.hint}>Everything you added is still here. Files already saved won&apos;t be uploaded twice.</span>
              <div className={s.noticeActions}>
                <button type="button" className={cx(s.btn, s.small)} onClick={() => generate()} disabled={!!blocker}>
                  <RetryIcon size={16} /> Try again
                </button>
                {failedPhotos.length > 0 && failedPhotos.length < photos.length + chats.length + textSourceCount && (
                  <button type="button" className={cx(s.btn, s.ghost, s.small)} onClick={() => generate(true)} disabled={!!blocker}>
                    Continue without {failedPhotos.length === 1 ? "that photo" : "those photos"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        <div className={s.generateRow}>
          <button type="submit" className={cx(s.btn, s.primary, s.uploadBtn)} disabled={!!blocker || busy} aria-busy={busy}>
            {busy ? <Spinner /> : <SparkIcon />}
            {busy ? "Creating…" : "Generate my story"}
          </button>
          <span className={s.hint}>
            {blocker ?? `${totalSources} ${totalSources === 1 ? "source" : "sources"} ready · ${props.settings.tone}, ${props.settings.length}`}
          </span>
        </div>
      </div>
    </form>
  );
}

function composeTheme(kind: StoryKind, custom: string, instruction: string): string {
  const base = kind === "custom" ? custom.trim() || KIND_THEME.custom : KIND_THEME[kind];
  const full = instruction.trim() ? `${base}. ${instruction.trim()}` : base;
  return full.slice(0, LIMITS.maxThemeChars);
}
