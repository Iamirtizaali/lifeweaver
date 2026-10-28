"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Health, Memory, Story } from "@/lib/types";
import { LIMITS } from "@/lib/types";
import s from "./LifeWeaver.module.css";
import { api, describeError } from "./api";
import { useDialog } from "./hooks";
import { AlertIcon, BookIcon, CloseIcon, SparkIcon, Spinner, UploadIcon } from "./icons";
import Library, { needsReview, type LibraryFilter } from "./Library";
import MemoryDrawer from "./MemoryDrawer";
import StoryReader from "./StoryReader";
import StoryStudio from "./StoryStudio";
import UploadModal, { emptyDraft, type UploadDraft } from "./UploadModal";
import { cx } from "./utils";

type View = { name: "library" } | { name: "studio" } | { name: "reader"; storyId: string };

const CONSENT_TEXT = "Selected photos are sent to Google's Gemini API to run Gemma 4.";

export default function LifeWeaverApp() {
  const [view, setView] = useState<View>({ name: "library" });
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stories, setStories] = useState<Story[] | null>(null);
  const [storiesError, setStoriesError] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState<Set<string>>(new Set());
  const [analysisError, setAnalysisError] = useState<{ message: string; ids: string[] } | null>(null);
  const [consentFor, setConsentFor] = useState<string[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadDraft, setUploadDraft] = useState<UploadDraft>(emptyDraft);
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [toast, setToast] = useState<string | null>(null);

  const loadMemories = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setMemories(await api.listMemories());
    } catch (err) {
      setLoadError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStories = useCallback(async () => {
    setStoriesError(null);
    try {
      setStories(await api.listStories());
    } catch (err) {
      setStoriesError(describeError(err));
    }
  }, []);

  useEffect(() => {
    // Initial data load; state updates happen after the awaited fetches resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMemories();
    void loadStories();
    api.health().then(setHealth, () => setHealth(null));
  }, [loadMemories, loadStories]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const byId = useMemo(() => new Map(memories.map((m) => [m.id, m])), [memories]);
  const selectedMemories = useMemo(
    () => [...selected].map((id) => byId.get(id)).filter((m): m is Memory => !!m),
    [selected, byId],
  );
  const toAnalyze = selectedMemories.filter((m) => needsReview(m) && m.included && !analyzing.has(m.id));
  const storyEligible = selectedMemories.filter((m) => m.included && m.status !== "failed");

  const aiUnavailableReason =
    health && !health.gemmaConfigured
      ? "AI isn't set up on this server yet (no Gemini API key). Uploading and editing still work."
      : null;

  const mergeMemories = useCallback((updated: Memory[]) => {
    const map = new Map(updated.map((m) => [m.id, m]));
    setMemories((cur) => cur.map((m) => map.get(m.id) ?? m));
  }, []);

  function toggleSelect(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runAnalysis(ids: string[]) {
    setConsentFor(null);
    setAnalysisError(null);
    setAnalyzing((cur) => new Set([...cur, ...ids]));
    try {
      const result = await api.analyze(ids);
      mergeMemories(result);
      const failed = result.filter((m) => ids.includes(m.id) && m.status === "failed").length;
      const ready = result.filter((m) => ids.includes(m.id) && m.status === "ready").length;
      setToast(
        failed
          ? `${ready} analyzed, ${failed} failed. Open a failed photo to retry.`
          : `${ready} ${ready === 1 ? "photo" : "photos"} analyzed. Review the descriptions when you're ready.`,
      );
    } catch (err) {
      setAnalysisError({ message: describeError(err), ids });
    } finally {
      setAnalyzing((cur) => {
        const next = new Set(cur);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  }

  function requestAnalysis(ids: string[]) {
    if (aiUnavailableReason || ids.length === 0) return;
    setConsentFor(ids);
  }

  function onUploaded(created: Memory[]) {
    setMemories((cur) => [...created, ...cur]);
    setUploadOpen(false);
    setUploadDraft(emptyDraft);
    setFilter("all");
    const photos = created.filter((m) => m.kind === "photo");
    // Pre-select new photos so the tray offers analysis right away.
    if (photos.length) setSelected(new Set(photos.map((m) => m.id)));
    setToast(`${created.length} ${created.length === 1 ? "memory" : "memories"} added.`);
  }

  function onStoryCreated(story: Story) {
    setStories((cur) => [story, ...(cur ?? []).filter((x) => x.id !== story.id)]);
    setSelected(new Set());
    setView({ name: "reader", storyId: story.id });
  }

  function onStoryChanged(story: Story) {
    setStories((cur) => (cur ?? []).map((x) => (x.id === story.id ? story : x)));
  }

  function onStoryDeleted(id: string) {
    setStories((cur) => (cur ?? []).filter((x) => x.id !== id));
    setView({ name: "studio" });
    setToast("Story deleted.");
  }

  function go(next: View) {
    setView(next);
    window.scrollTo({ top: 0 });
  }

  const visibleOrder = memories;
  const openIndex = openId ? visibleOrder.findIndex((m) => m.id === openId) : -1;
  const openMemory = openIndex >= 0 ? visibleOrder[openIndex] : null;
  const step = (delta: number) => {
    if (openIndex < 0) return;
    const n = visibleOrder.length;
    setOpenId(visibleOrder[(openIndex + delta + n) % n].id);
  };

  return (
    <div className={s.root}>
      <a href="#lw-main" className={s.skip}>
        Skip to content
      </a>
      <nav className={s.nav} aria-label="LifeWeaver">
        <span className={s.brand}>
          <span className={s.brandMark} aria-hidden="true">
            <SparkIcon size={16} />
          </span>
          <span className={s.brandText}>LifeWeaver</span>
        </span>
        <div className={s.tabs}>
          <button
            type="button"
            className={s.tab}
            aria-current={view.name === "library" ? "page" : undefined}
            onClick={() => go({ name: "library" })}
          >
            Library
          </button>
          <button
            type="button"
            className={s.tab}
            aria-current={view.name !== "library" ? "page" : undefined}
            onClick={() => go({ name: "studio" })}
          >
            Story Studio
          </button>
        </div>
        {view.name !== "library" && (
          <button type="button" className={cx(s.btn, s.small)} onClick={() => setUploadOpen(true)}>
            <UploadIcon size={16} /> Upload
          </button>
        )}
      </nav>

      <main id="lw-main" className={s.main} tabIndex={-1}>
        {aiUnavailableReason && (
          <div className={cx(s.notice, s.noticeWarn)} style={{ marginTop: 20 }} role="status">
            <AlertIcon />
            <span>{aiUnavailableReason}</span>
          </div>
        )}

        {view.name === "library" && (
          <Library
            memories={memories}
            loading={loading}
            loadError={loadError}
            onRetryLoad={loadMemories}
            selected={selected}
            analyzing={analyzing}
            filter={filter}
            onFilter={setFilter}
            onToggleSelect={toggleSelect}
            onOpen={setOpenId}
            onUpload={() => setUploadOpen(true)}
          />
        )}

        {view.name === "studio" && (
          <StoryStudio
            key="studio"
            memories={memories}
            selected={storyEligible}
            onRemove={toggleSelect}
            stories={stories}
            storiesError={storiesError}
            onRetryStories={loadStories}
            aiUnavailableReason={aiUnavailableReason}
            onPickMemories={() => go({ name: "library" })}
            onCreated={onStoryCreated}
            onOpenStory={(id) => go({ name: "reader", storyId: id })}
          />
        )}

        {view.name === "reader" && (
          <StoryReader
            key={view.storyId}
            storyId={view.storyId}
            onBack={() => go({ name: "studio" })}
            onChanged={onStoryChanged}
            onDeleted={onStoryDeleted}
          />
        )}
      </main>

      {view.name === "library" && selected.size > 0 && !openId && (
        <div className={s.tray} role="region" aria-label="Selected memories">
          <div className={s.trayThumbs} aria-hidden="true">
            {selectedMemories.slice(0, 4).map((m) =>
              m.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- user uploads served by our API
                <img key={m.id} className={s.trayThumb} src={m.thumbUrl} alt="" />
              ) : (
                <span key={m.id} className={s.trayThumb} />
              ),
            )}
          </div>
          <div className={s.trayText} aria-live="polite">
            <span className={s.trayCount}>{selected.size} selected</span>
            <span className={s.traySub}>
              {analyzing.size > 0
                ? `Analyzing ${analyzing.size} ${analyzing.size === 1 ? "photo" : "photos"}… about 5–20 s each`
                : analysisError
                  ? `Analysis failed: ${analysisError.message}`
                  : toAnalyze.length > 0
                    ? `${toAnalyze.length} not analyzed yet`
                    : storyEligible.length > LIMITS.maxStorySources
                      ? `Stories use up to ${LIMITS.maxStorySources} memories`
                      : "Ready to weave into a story"}
            </span>
          </div>
          <div className={s.trayActions}>
            <button type="button" className={cx(s.btn, s.ghost, s.small)} onClick={() => setSelected(new Set())}>
              <CloseIcon size={16} /> Clear
            </button>
            {analysisError && analyzing.size === 0 ? (
              <button type="button" className={cx(s.btn, s.small)} onClick={() => requestAnalysis(analysisError.ids)}>
                Retry analysis
              </button>
            ) : toAnalyze.length > 0 ? (
              <button
                type="button"
                className={cx(s.btn, s.small)}
                onClick={() => requestAnalysis(toAnalyze.map((m) => m.id))}
                disabled={!!aiUnavailableReason}
                title={aiUnavailableReason ?? undefined}
              >
                <SparkIcon size={16} /> Analyze {toAnalyze.length}
              </button>
            ) : null}
            {analyzing.size > 0 && (
              <span className={cx(s.btn, s.ghost, s.small)} aria-hidden="true">
                <Spinner />
              </span>
            )}
            <button
              type="button"
              className={cx(s.btn, s.primary, s.small)}
              onClick={() => go({ name: "studio" })}
              disabled={storyEligible.length === 0 || storyEligible.length > LIMITS.maxStorySources}
            >
              <BookIcon size={16} /> Create story
            </button>
          </div>
        </div>
      )}

      {openMemory && (
        <MemoryDrawer
          memory={openMemory}
          position={openIndex + 1}
          total={visibleOrder.length}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          selected={selected.has(openMemory.id)}
          onToggleSelect={() => toggleSelect(openMemory.id)}
          analyzing={analyzing.has(openMemory.id)}
          onAnalyze={() => requestAnalysis([openMemory.id])}
          aiUnavailableReason={aiUnavailableReason}
          onSaved={(m) => {
            mergeMemories([m]);
            setToast("Memory saved.");
          }}
          onDeleted={(id) => {
            setMemories((cur) => cur.filter((m) => m.id !== id));
            setSelected((cur) => {
              const next = new Set(cur);
              next.delete(id);
              return next;
            });
            setOpenId(null);
            setToast("Memory deleted. Stories that used it are flagged for review.");
          }}
          onClose={() => setOpenId(null)}
        />
      )}

      {uploadOpen && (
        <UploadModal draft={uploadDraft} onDraft={setUploadDraft} onClose={() => setUploadOpen(false)} onUploaded={onUploaded} />
      )}

      {consentFor && (
        <ConsentDialog
          count={consentFor.length}
          names={consentFor.map((id) => byId.get(id)).filter((m): m is Memory => !!m)}
          onCancel={() => setConsentFor(null)}
          onConfirm={() => runAnalysis(consentFor)}
        />
      )}

      <div aria-live="polite" role="status">
        {toast && <div className={s.toast}>{toast}</div>}
      </div>
    </div>
  );
}

function ConsentDialog(props: { count: number; names: Memory[]; onCancel: () => void; onConfirm: () => void }) {
  const ref = useDialog<HTMLDivElement>(props.onCancel);
  return (
    <>
      <div className={s.scrim} onClick={props.onCancel} aria-hidden="true" />
      <div
        ref={ref}
        className={cx(s.panel, s.modal)}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="lw-consent-title"
        aria-describedby="lw-consent-text"
        tabIndex={-1}
      >
        <div className={s.modalHead}>
          <div>
            <h2 id="lw-consent-title" className={s.modalTitle}>
              Analyze {props.count} {props.count === 1 ? "photo" : "photos"} with AI?
            </h2>
            <p id="lw-consent-text" className={s.modalSub}>
              {CONSENT_TEXT} The descriptions it writes are suggestions you can edit.
            </p>
          </div>
        </div>
        <div className={s.trayThumbs} aria-hidden="true" style={{ marginBottom: 16 }}>
          {props.names.slice(0, 8).map((m) =>
            m.thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- user uploads served by our API
              <img key={m.id} className={s.trayThumb} src={m.thumbUrl} alt="" />
            ) : null,
          )}
        </div>
        <p className={s.hint}>Analysis usually takes 5–20 seconds per photo. You can keep browsing while it runs.</p>
        <div className={s.modalFoot}>
          <button type="button" className={cx(s.btn, s.ghost)} onClick={props.onCancel}>
            Not now
          </button>
          <button type="button" className={cx(s.btn, s.primary)} onClick={props.onConfirm} data-autofocus>
            <SparkIcon size={16} /> Send and analyze
          </button>
        </div>
      </div>
    </>
  );
}
