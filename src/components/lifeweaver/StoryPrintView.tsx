"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Memory, Story } from "@/lib/types";
import p from "./StoryPrint.module.css";
import { api, describeError } from "./api";
import { PrinterIcon } from "./icons";
import { formatDate, memoryAlt, memoryDate, memoryLabel, paragraphs, shownDescription } from "./utils";

export default function StoryPrintView({ storyId }: { storyId: string }) {
  const [data, setData] = useState<{ story: Story; sources: Memory[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.getStory(storyId));
    } catch (err) {
      setError(describeError(err));
    }
  }, [storyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; state is set after await
    void load();
  }, [load]);

  if (error)
    return (
      <main className={p.page}>
        <p role="alert">Couldn&apos;t load this story. {error}</p>
        <button type="button" className={p.button} onClick={load}>
          Try again
        </button>
      </main>
    );
  if (!data)
    return (
      <main className={p.page} aria-busy="true">
        <p>Preparing print layout…</p>
      </main>
    );

  const { story, sources } = data;
  const byId = new Map(sources.map((m) => [m.id, m]));

  return (
    <main className={p.page}>
      <div className={p.controls}>
        <Link href="/" className={p.link}>
          ← Back to LifeWeaver
        </Link>
        <button type="button" className={p.button} onClick={() => window.print()}>
          <PrinterIcon size={16} /> Print or save as PDF
        </button>
      </div>

      <article>
        <p className={p.kicker}>{story.theme}</p>
        <h1 className={p.title}>{story.title}</h1>
        {paragraphs(story.intro).map((t, i) => (
          <p key={i} className={p.intro}>
            {t}
          </p>
        ))}
        <p className={p.meta}>
          {formatDate(story.createdAt)} · AI-generated with {story.model || "Gemma 4"} from personal memories
        </p>

        {story.sections.map((sec, i) => {
          const images = sec.imageIds.map((x) => byId.get(x)).filter((m): m is Memory => !!m && !!(m.imageUrl || m.thumbUrl));
          return (
            <section key={i} className={p.section}>
              {sec.heading && <h2 className={p.heading}>{sec.heading}</h2>}
              {images.length > 0 && (
                <div className={images.length > 1 ? p.imagePair : undefined}>
                  {images.slice(0, 2).map((m) => (
                    <figure key={m.id} className={p.figure}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- user uploads served by our API */}
                      <img src={m.imageUrl ?? m.thumbUrl ?? ""} alt={memoryAlt(m)} />
                      <figcaption>{memoryDate(m)}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
              {paragraphs(sec.text).map((t, j) => (
                <p key={j} className={p.body}>
                  {t}
                </p>
              ))}
            </section>
          );
        })}

        <section className={p.sources}>
          <h2 className={p.heading}>Sources</h2>
          <ol>
            {story.sourceIds.map((sid) => {
              const m = byId.get(sid);
              return (
                <li key={sid}>
                  {m ? (
                    <>
                      <strong>{memoryLabel(m)}</strong> — {memoryDate(m)}
                      {shownDescription(m) && shownDescription(m) !== memoryLabel(m) ? `. ${shownDescription(m)}` : ""}
                      {m.note ? ` Note: “${m.note}”` : ""}
                    </>
                  ) : (
                    <em>Deleted memory</em>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </article>
    </main>
  );
}
