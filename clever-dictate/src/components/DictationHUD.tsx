"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ScreenContext } from "@/lib/ai/types";
import { captureScreenContext } from "@/lib/capture";
import { createRecognizer, type Recognizer } from "@/lib/speech";

type Phase = "idle" | "context" | "recording" | "review" | "saving";

// Offline demo aid: when screen capture is unavailable/denied we let the user
// pick the target app so the VLM->LLM routing still has something to key on.
const APP_CHOICES = ["VS Code", "Gmail", "Slack", "Jira", "Linear", "Notion"];

export function DictationHUD({
  sessionId,
  sessionTitle,
}: {
  sessionId?: string;
  sessionTitle?: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [flash, setFlash] = useState(false);
  const [context, setContext] = useState<ScreenContext | null>(null);
  const [appHint, setAppHint] = useState<string>("");
  const [raw, setRaw] = useState("");
  const [clean, setClean] = useState("");
  const [profileName, setProfileName] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const recognizerRef = useRef<Recognizer | null>(null);

  const reset = useCallback(() => {
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    setPhase("idle");
    setContext(null);
    setRaw("");
    setClean("");
    setProfileName(null);
    setSuggestions([]);
    setError(null);
    setCopied(false);
  }, []);

  // Stage 1–3: capture screen -> VLM context.
  const start = useCallback(async () => {
    setError(null);
    setPhase("context");
    setFlash(true);
    try {
      const ctx = await captureScreenContext(appHint || undefined);
      setContext(ctx);
    } catch {
      // Non-fatal: proceed without visual context.
      setContext(null);
    } finally {
      setTimeout(() => setFlash(false), 600);
    }

    // Stage 4: start live STT.
    setPhase("recording");
    const rec = createRecognizer({
      onResult: (text) => setRaw(text),
      onError: (msg) => setError(msg),
    });
    recognizerRef.current = rec;
    rec.start();
  }, [appHint]);

  // Stage 5: stop STT -> LLM cleanup preview.
  const stop = useCallback(async () => {
    recognizerRef.current?.stop();
    const finalRaw = recognizerRef.current?.finalText() ?? raw;
    recognizerRef.current = null;
    setRaw(finalRaw);
    setPhase("review");
    if (!finalRaw.trim()) return;
    try {
      const res = await fetch("/api/cleanup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rawText: finalRaw, context }),
      });
      const data = await res.json();
      setClean(data.cleanText ?? finalRaw);
      setProfileName(data.profileName ?? null);
    } catch {
      setClean(finalRaw);
    }
  }, [raw, context]);

  const loadSuggestions = useCallback(async () => {
    const res = await fetch("/api/suggest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rawText: raw, context }),
    });
    const data = await res.json();
    setSuggestions(data.suggestions ?? []);
  }, [raw, context]);

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(clean || raw).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [clean, raw]);

  const save = useCallback(async () => {
    setPhase("saving");
    try {
      const res = await fetch("/api/dictations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, sessionTitle, rawText: raw, context }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "save failed");
      reset();
      if (!sessionId && data.sessionId) {
        router.push(`/app/sessions/${data.sessionId}`);
      } else {
        router.refresh();
      }
    } catch (e) {
      setError((e as Error).message);
      setPhase("review");
    }
  }, [sessionId, sessionTitle, raw, context, reset, router]);

  const recording = phase === "recording";
  const active = phase !== "idle";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div
        className={`pointer-events-auto w-full max-w-2xl rounded-lg bg-surface/95 backdrop-blur transition-all ${
          flash ? "ring-2 ring-vision" : "glass-edge"
        }`}
      >
        {/* Collapsed pill */}
        {!active && (
          <div className="flex items-center gap-3 p-2.5">
            <button
              onClick={start}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-core text-white transition-transform hover:scale-105"
              aria-label="Start dictation"
              title="Hold-to-talk / click to start"
            >
              🎤
            </button>
            <div className="flex-1 text-sm text-secondary">
              Click the mic to capture screen context and dictate…
            </div>
            <select
              value={appHint}
              onChange={(e) => setAppHint(e.target.value)}
              className="field w-auto py-1 text-xs"
              title="Target app (used when screen capture is unavailable)"
            >
              <option value="">Auto-detect</option>
              {APP_CHOICES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Expanded */}
        {active && (
          <div className="p-3">
            {/* Header row: waveform + context tag */}
            <div className="mb-2 flex items-center gap-3">
              <Waveform active={recording} />
              <div className="h-5 w-px bg-hairline" />
              {context ? (
                <span className="chip-vision font-mono">
                  📷 {context.appContext}
                  <span className="text-vision/60"> · {context.summary}</span>
                </span>
              ) : (
                <span className="font-mono text-xs text-secondary">
                  {phase === "context" ? "Capturing screen…" : "No visual context"}
                </span>
              )}
              {profileName && (
                <span className="chip-success font-mono">profile: {profileName}</span>
              )}
              <button onClick={reset} className="ml-auto btn-tool" title="Cancel">
                ✕
              </button>
            </div>

            {/* Raw / clean text */}
            <div className="rounded bg-base glass-edge p-3">
              {phase === "review" && clean ? (
                <div className="space-y-2">
                  <div>
                    <div className="label">Raw (Whisper)</div>
                    <p className="text-sm italic text-secondary">{raw}</p>
                  </div>
                  <div className="h-px bg-hairline" />
                  <div>
                    <div className="label text-core">Cleaned (LLM)</div>
                    <p className="whitespace-pre-wrap text-sm text-dominant">{clean}</p>
                  </div>
                </div>
              ) : (
                <p className="min-h-[2.5rem] whitespace-pre-wrap text-sm text-dominant">
                  {raw || (
                    <span className="text-secondary/60">
                      {recording ? "Listening…" : ""}
                    </span>
                  )}
                </p>
              )}
            </div>

            {error && (
              <p className="mt-2 text-xs text-destructive">{error}</p>
            )}

            {/* Controls */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {recording && (
                <button onClick={stop} className="btn-primary">
                  ■ Stop &amp; clean
                </button>
              )}
              {phase === "review" && (
                <>
                  <button onClick={save} className="btn-primary">
                    Save turn
                  </button>
                  <button onClick={copy} className="btn-tool">
                    {copied ? "✓ Copied" : "⧉ Copy to clipboard"}
                  </button>
                  <button onClick={loadSuggestions} className="btn-ghost">
                    ✦ AI suggestions
                  </button>
                </>
              )}
              {phase === "saving" && (
                <span className="text-sm text-secondary">Saving…</span>
              )}
            </div>

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="label text-vision">Suggested next actions</div>
                {suggestions.map((s, i) => (
                  <div
                    key={i}
                    className="rounded border border-vision/20 bg-vision/5 px-3 py-1.5 text-sm text-dominant"
                  >
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Waveform({ active }: { active: boolean }) {
  const bars = [0, 1, 2, 3, 4, 5, 6];
  return (
    <div className="flex h-6 items-center gap-[3px]" aria-hidden>
      {bars.map((b) => (
        <span
          key={b}
          className={`w-[3px] rounded-full ${
            active
              ? "animate-waveform bg-gradient-to-b from-core to-vision"
              : "bg-secondary/40"
          }`}
          style={{ height: active ? undefined : "8px", animationDelay: `${b * 0.12}s` }}
        />
      ))}
    </div>
  );
}
