"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Health, Story } from "@/lib/types";
import s from "./LifeWeaver.module.css";
import { api } from "./api";
import CreateStory, { type StorySettings } from "./CreateStory";
import { useDialog } from "./hooks";
import { AlertIcon, ArrowRightIcon, BookIcon, CloseIcon, ImagesIcon, SparkIcon } from "./icons";
import StoryResult from "./StoryResult";
import { cx } from "./utils";

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export default function LifeWeaverApp() {
  const online = useOnline();
  const [health, setHealth] = useState<Health | null>(null);
  const [storyId, setStoryId] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const [settings, setSettings] = useState<StorySettings>({ tone: "warm", length: "short" });
  const [reduceMotion, setReduceMotion] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const resultRef = useRef<HTMLElement>(null);
  const createRef = useRef<HTMLElement>(null);

  useEffect(() => {
    api.health().then(setHealth, () => setHealth(null));
  }, []);

  function goCreate() {
    const el = createRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    el.querySelector<HTMLElement>("input[type=file]")?.focus({ preventScroll: true });
  }

  function onCreated(story: Story) {
    setStoryId(story.id);
    requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      resultRef.current?.focus({ preventScroll: true });
    });
  }

  function onNew() {
    setStoryId(null);
    setResetToken((n) => n + 1);
    requestAnimationFrame(goCreate);
  }

  return (
    <div className={s.root} data-motion={reduceMotion ? "reduce" : undefined}>
      <a href="#create" className={s.skip}>
        Skip to story creation
      </a>

      <header className={s.nav}>
        <span className={s.brand}>
          <span className={s.brandMark} aria-hidden="true">
            <SparkIcon size={16} />
          </span>
          LifeWeaver
        </span>
        <nav className={s.navLinks} aria-label="Page">
          <a href="#how">How it works</a>
          <a href="#create">Create</a>
          {storyId && <a href="#result">Your story</a>}
        </nav>
        <button type="button" className={cx(s.btn, s.ghost, s.small)} onClick={() => setSettingsOpen(true)} aria-haspopup="dialog">
          Settings
        </button>
      </header>

      {!online && (
        <div className={s.offline} role="status">
          <AlertIcon size={16} /> You&apos;re offline. Your inputs and any loaded story stay here; generating needs a connection.
        </div>
      )}

      <main>
        <section className={s.hero} aria-labelledby="lw-hero-title">
          <div className={s.heroCopy}>
            <p className={s.kicker}>Photos + chats → a story with a timeline</p>
            <h1 id="lw-hero-title" className={s.heroTitle}>
              Your moments. <em>One beautiful story.</em>
            </h1>
            <p className={s.heroSub}>
              Drop in photos and a chat export, choose the story you want, and Gemma 4 writes an illustrated story and a
              timeline where every part links back to the memories it came from.
            </p>
            <div className={s.heroCtas}>
              <button type="button" className={cx(s.btn, s.primary, s.ctaBtn)} onClick={goCreate}>
                Create your story <ArrowRightIcon size={18} />
              </button>
              <a href="#how" className={cx(s.btn, s.ghost)}>
                How it works
              </a>
            </div>
          </div>
          <ExamplePreview />
        </section>

        <section id="how" className={s.steps} aria-labelledby="lw-how">
          <h2 id="lw-how" className={s.srOnly}>
            How it works
          </h2>
          <ol className={s.stepList}>
            <li className={s.stepCard}>
              <span className={s.stepIcon} aria-hidden="true">
                <ImagesIcon size={20} />
              </span>
              <span className={s.stepIndex}>01</span>
              <h3>Add memories</h3>
              <p>Photos, WhatsApp chat exports, or a few lines you write yourself.</p>
            </li>
            <li className={s.stepCard}>
              <span className={s.stepIcon} aria-hidden="true">
                <SparkIcon size={20} />
              </span>
              <span className={s.stepIndex}>02</span>
              <h3>Choose your story</h3>
              <p>A trip, a friendship, family moments, or your own idea, with an optional title and dates.</p>
            </li>
            <li className={s.stepCard}>
              <span className={s.stepIcon} aria-hidden="true">
                <BookIcon size={20} />
              </span>
              <span className={s.stepIndex}>03</span>
              <h3>Relive it</h3>
              <p>Read the story, switch to the timeline, check every source, edit, and print or save as PDF.</p>
            </li>
          </ol>
        </section>

        <section id="create" ref={createRef} className={s.createSection} aria-labelledby="lw-create" tabIndex={-1}>
          <div className={s.sectionIntro}>
            <p className={s.kicker}>Create</p>
            <h2 id="lw-create" className={s.pageTitle}>
              Make your story
            </h2>
            <p className={s.pageSub}>Nothing is sent anywhere until you agree and press Generate.</p>
          </div>
          <CreateStory
            key={resetToken}
            online={online}
            aiReady={health ? health.gemmaConfigured : null}
            model={health?.model ?? null}
            settings={settings}
            onCreated={onCreated}
          />
        </section>

        {storyId && (
          <section id="result" ref={resultRef} className={s.resultSection} aria-label="Your story" tabIndex={-1}>
            <StoryResult key={storyId} storyId={storyId} onNew={onNew} />
          </section>
        )}
      </main>

      <footer className={s.footer}>
        <span>LifeWeaver · Stories are written by {health?.model ?? "Gemma 4"} through Google&apos;s Gemini API, so creating one needs an internet connection.</span>
      </footer>

      {settingsOpen && (
        <SettingsDrawer
          settings={settings}
          onSettings={setSettings}
          reduceMotion={reduceMotion}
          onReduceMotion={setReduceMotion}
          online={online}
          health={health}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function ExamplePreview() {
  return (
    <figure className={s.example} aria-label="Example of a finished story and timeline (illustration, not generated from your files)">
      <span className={s.exampleLabel}>Example</span>
      <div className={s.exampleStory}>
        <div className={s.examplePhoto} aria-hidden="true" />
        <p className={s.exampleKicker}>A trip</p>
        <p className={s.exampleTitle}>Three days by the sea</p>
        <p className={s.exampleText}>The ferry was late, the rain was later, and nobody minded…</p>
      </div>
      <ol className={s.exampleTimeline} aria-hidden="true">
        <li>
          <span className={s.exampleDot} />
          <span className={s.exampleDate}>12 Aug</span>
          <span className={s.exampleEvent}>Arrival · 3 photos, 14 messages</span>
        </li>
        <li>
          <span className={s.exampleDot} />
          <span className={s.exampleDate}>13 Aug</span>
          <span className={s.exampleEvent}>The lighthouse walk · 2 photos</span>
        </li>
        <li>
          <span className={cx(s.exampleDot, s.tlDotUndated)} />
          <span className={s.exampleDate}>Undated</span>
          <span className={s.exampleEvent}>A note about the drive home</span>
        </li>
      </ol>
      <figcaption className={s.srOnly}>Illustration only.</figcaption>
    </figure>
  );
}

function SettingsDrawer(props: {
  settings: StorySettings;
  onSettings: (s: StorySettings) => void;
  reduceMotion: boolean;
  onReduceMotion: (v: boolean) => void;
  online: boolean;
  health: Health | null;
  onClose: () => void;
}) {
  const ref = useDialog<HTMLDivElement>(props.onClose);
  const id = useId();
  const { settings } = props;
  return (
    <>
      <div className={s.scrim} onClick={props.onClose} aria-hidden="true" />
      <div ref={ref} className={cx(s.drawer, s.drawerNarrow)} role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} tabIndex={-1}>
        <div className={s.drawerPanel} style={{ borderLeft: 0 }}>
          <div className={s.drawerHead}>
            <div>
              <h2 id={`${id}-t`} className={s.drawerTitle}>
                Settings
              </h2>
              <div className={s.drawerMeta}>Optional. The defaults work fine.</div>
            </div>
            <button type="button" className={s.iconBtn} onClick={props.onClose} aria-label="Close settings" data-autofocus>
              <CloseIcon />
            </button>
          </div>
          <div className={s.drawerBody}>
            <div className={s.field}>
              <span className={s.sectionLabel} id={`${id}-tone`}>
                Writing tone
              </span>
              <div className={s.segmented} role="radiogroup" aria-labelledby={`${id}-tone`}>
                {(["warm", "plain", "reflective"] as const).map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={settings.tone === t} className={s.segment} onClick={() => props.onSettings({ ...settings, tone: t })}>
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
                {(["short", "medium"] as const).map((l) => (
                  <button key={l} type="button" role="radio" aria-checked={settings.length === l} className={s.segment} onClick={() => props.onSettings({ ...settings, length: l })}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <label className={s.switchRow}>
              <span className={s.switchText}>
                <strong>Reduce motion</strong>
                <span className={s.hint}>Turns off page animations. Your system setting is respected either way.</span>
              </span>
              <input type="checkbox" checked={props.reduceMotion} onChange={(e) => props.onReduceMotion(e.target.checked)} />
            </label>
            <hr className={s.divider} />
            <dl className={s.statusList}>
              <div>
                <dt>Connection</dt>
                <dd>{props.online ? "Online" : "Offline: generation is paused, your inputs are kept"}</dd>
              </div>
              <div>
                <dt>AI model</dt>
                <dd>
                  {props.health === null
                    ? "Unknown (server not reachable)"
                    : props.health.gemmaConfigured
                      ? `${props.health.model} via Google's Gemini API`
                      : "Not configured on the server"}
                </dd>
              </div>
            </dl>
            <p className={s.hint}>
              Generating a story needs an internet connection because Gemma runs through Google&apos;s Gemini API. LifeWeaver
              doesn&apos;t run AI offline.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
