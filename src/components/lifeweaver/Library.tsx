"use client";

import type { Memory } from "@/lib/types";
import s from "./LifeWeaver.module.css";
import { AlertIcon, CheckIcon, QuoteIcon, RetryIcon, Spinner, UploadIcon } from "./icons";
import { cx, memoryAlt, memoryDate, memoryLabel, truncate } from "./utils";

export type LibraryFilter = "all" | "review" | "ready";

interface LibraryProps {
  memories: Memory[];
  loading: boolean;
  loadError: string | null;
  onRetryLoad: () => void;
  selected: Set<string>;
  analyzing: Set<string>;
  filter: LibraryFilter;
  onFilter: (f: LibraryFilter) => void;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onUpload: () => void;
}

/** Varied rhythm for the photo grid: a tall or wide tile every few items. */
function tileClass(index: number, m: Memory): string | undefined {
  if (m.kind === "text") return undefined;
  if (index % 7 === 0) return s.cardWide;
  if (index % 5 === 2) return s.cardTall;
  return undefined;
}

function StatusBadge({ m, analyzing }: { m: Memory; analyzing: boolean }) {
  if (analyzing || m.status === "processing")
    return (
      <span className={cx(s.badge, s.badgeMuted)}>
        <Spinner size={12} /> Analyzing
      </span>
    );
  if (!m.included) return <span className={cx(s.badge, s.badgeMuted)}>Excluded</span>;
  if (m.status === "failed")
    return (
      <span className={cx(s.badge, s.badgeFailed)}>
        <AlertIcon size={12} /> Analysis failed
      </span>
    );
  if (m.kind === "photo" && m.status === "uploaded") return <span className={cx(s.badge, s.badgeMuted)}>Not analyzed</span>;
  return null;
}

export function needsReview(m: Memory) {
  return m.kind === "photo" && (m.status === "uploaded" || m.status === "failed");
}

export default function Library(props: LibraryProps) {
  const { memories, loading, loadError, selected, analyzing, filter } = props;
  const reviewCount = memories.filter(needsReview).length;
  const visible = memories.filter((m) =>
    filter === "all" ? true : filter === "review" ? needsReview(m) : m.status === "ready" || m.kind === "text",
  );

  return (
    <div className={s.view}>
      <header className={s.hero}>
        <div>
          <p className={s.kicker}>Memory library</p>
          <h1 className={s.heroTitle}>
            Every photo holds a <em>story</em> worth keeping.
          </h1>
          <p className={s.heroSub}>
            Add photos and notes, check what the AI sees, add the context only you know, then weave a few memories
            into an illustrated story.
          </p>
        </div>
        <div className={s.heroActions}>
          <button type="button" className={cx(s.btn, s.primary, s.uploadBtn)} onClick={props.onUpload}>
            <UploadIcon /> Upload memories
          </button>
          {memories.length > 0 && (
            <span className={s.heroMeta}>
              {memories.length} {memories.length === 1 ? "memory" : "memories"}
              {reviewCount > 0 && ` · ${reviewCount} to review`}
            </span>
          )}
        </div>
      </header>

      {loadError ? (
        <div className={cx(s.notice, s.noticeError)} role="alert">
          <AlertIcon />
          <div className={s.noticeBody}>
            <span>Couldn&apos;t load your memories. {loadError}</span>
            <div className={s.noticeActions}>
              <button type="button" className={cx(s.btn, s.small)} onClick={props.onRetryLoad}>
                <RetryIcon size={16} /> Try again
              </button>
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className={s.grid} aria-busy="true" aria-label="Loading memories">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className={cx(s.skeleton, i % 7 === 0 ? s.cardWide : s.card)} style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      ) : memories.length === 0 ? (
        <section className={cx(s.panel, s.empty)} aria-labelledby="lw-empty-title">
          <div className={s.emptyArt} aria-hidden="true">
            <div className={s.emptyFrame} />
            <div className={s.emptyFrame} />
            <div className={s.emptyFrame} />
          </div>
          <div>
            <h2 id="lw-empty-title" className={s.emptyTitle}>
              Your library is waiting for its first memory.
            </h2>
            <ol className={s.emptyList}>
              <li>
                <span>1</span> Upload a few photos with a short note
              </li>
              <li>
                <span>2</span> Review what the AI sees and add your context
              </li>
              <li>
                <span>3</span> Pick memories and a theme to weave a story
              </li>
            </ol>
            <button type="button" className={cx(s.btn, s.primary, s.uploadBtn)} onClick={props.onUpload}>
              <UploadIcon /> Upload your first photos
            </button>
          </div>
        </section>
      ) : (
        <>
          <div className={s.toolbar}>
            <div className={s.segmented} role="radiogroup" aria-label="Filter memories">
              {(
                [
                  ["all", `All (${memories.length})`],
                  ["review", `To review (${reviewCount})`],
                  ["ready", "Ready"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={filter === key}
                  className={s.segment}
                  onClick={() => props.onFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className={s.heroMeta}>Select memories to analyze them or weave a story.</span>
          </div>

          {visible.length === 0 ? (
            <p className={s.centerState}>Nothing here right now.</p>
          ) : (
            <ul className={s.grid} style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {visible.map((m, i) => {
                const isSelected = selected.has(m.id);
                const label = memoryLabel(m);
                return (
                  <li
                    key={m.id}
                    className={cx(s.card, tileClass(i, m), isSelected && s.cardSelected)}
                    style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
                  >
                    <button
                      type="button"
                      className={s.cardOpen}
                      onClick={() => props.onOpen(m.id)}
                      aria-label={`Open memory: ${truncate(label, 80)}, ${memoryDate(m)}`}
                    >
                      {m.kind === "photo" && (m.thumbUrl || m.imageUrl) ? (
                        // eslint-disable-next-line @next/next/no-img-element -- user uploads served by our API
                        <img className={s.cardImg} src={m.thumbUrl ?? m.imageUrl ?? ""} alt={memoryAlt(m)} loading="lazy" />
                      ) : (
                        <div className={s.textCard}>
                          <QuoteIcon />
                          <p>{m.note || m.title || "Untitled note"}</p>
                        </div>
                      )}
                      <span className={s.cardShade}>
                        <span className={s.cardDate}>{memoryDate(m)}</span>
                        {m.kind === "photo" && <span className={s.cardTitle}>{label}</span>}
                      </span>
                    </button>
                    <StatusBadge m={m} analyzing={analyzing.has(m.id)} />
                    <button
                      type="button"
                      className={s.selectToggle}
                      aria-pressed={isSelected}
                      aria-label={`${isSelected ? "Deselect" : "Select"} ${truncate(label, 60)}`}
                      onClick={() => props.onToggleSelect(m.id)}
                    >
                      <span className={s.selectDot}>
                        <CheckIcon size={16} strokeWidth={2.4} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
