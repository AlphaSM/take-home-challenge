import type {
  VlmProvider,
  LlmProvider,
  ScreenContext,
  CleanupInput,
  CleanupResult,
  SttProvider,
  SttResult,
} from "./types";

// ---------------------------------------------------------------------------
// Deterministic offline providers.
//
// These are NOT throwaway stubs — they implement real, useful heuristics so the
// product is fully demonstrable without a GPU or API key, and so tests are
// reproducible. The cleanup mock does genuine text normalisation + dictionary
// enforcement, which is most of what the "clean this text" LLM prompt is for.
// ---------------------------------------------------------------------------

/** Keyword → app heuristics for the mock VLM. */
const APP_HINTS: Array<{ needles: string[]; app: string; summary: string }> = [
  { needles: ["vs code", "vscode", "// ", "def ", "function ", ".ts", ".py"], app: "VS Code", summary: "IDE editing source code" },
  { needles: ["gmail", "compose", "subject:", "to:", "cc:"], app: "Gmail", summary: "Drafting an email" },
  { needles: ["slack", "#general", "thread", "huddle"], app: "Slack", summary: "Writing a Slack message" },
  { needles: ["jira", "sprint", "backlog", "story point"], app: "Jira", summary: "Editing a Jira ticket" },
  { needles: ["linear", "issue", "cycle"], app: "Linear", summary: "Editing a Linear issue" },
  { needles: ["notion", "doc", "page"], app: "Notion", summary: "Writing a Notion doc" },
];

export const mockVlm: VlmProvider = {
  name: "mock-vlm",
  async describe(imageBase64): Promise<ScreenContext> {
    // With no real vision, fall back to a neutral-but-honest context.
    // A caller may pass a hint string in place of an image (see /api/vlm).
    const hint = (imageBase64 ?? "").toLowerCase();
    const match = APP_HINTS.find((h) => h.needles.some((n) => hint.includes(n)));
    const app = match?.app ?? "Unknown Application";
    const summary = match?.summary ?? "Active window (context unavailable offline)";
    return {
      appContext: app,
      summary,
      primitives: [
        { label: `foreground: ${app}`, bbox: [0.02, 0.02, 0.5, 0.06] },
        { label: "primary text region", bbox: [0.1, 0.2, 0.8, 0.6] },
      ],
      provider: "mock-vlm",
    };
  },
};

/** Simple, safe text cleanup: whitespace, capitalisation, filler removal. */
function normalise(raw: string): string {
  let t = raw.trim().replace(/\s+/g, " ");
  // Strip common spoken filler.
  t = t.replace(/\b(um+|uh+|erm+|like|you know)\b[,\s]*/gi, "");
  // Convert spoken punctuation.
  t = t
    .replace(/\s*\bnew line\b\s*/gi, "\n")
    .replace(/\s*\bnew paragraph\b\s*/gi, "\n\n")
    .replace(/\bperiod\b\.?/gi, ".")
    .replace(/\bcomma\b/gi, ",")
    .replace(/\s+([.,!?;:])/g, "$1");
  // Capitalise sentence starts.
  t = t.replace(/(^\s*|[.!?]\s+)([a-z])/g, (_m, p, c) => p + c.toUpperCase());
  // Ensure terminal punctuation (trim first so it never lands after a space).
  t = t.trim();
  if (t && !/[.!?]$/.test(t)) t += ".";
  return t.replace(/[ \t]+\n/g, "\n").trim();
}

function applyDictionary(text: string, dict?: CleanupInput["dictionary"]): string {
  if (!dict?.length) return text;
  let out = text;
  for (const { term, replacement } of dict) {
    if (!term) continue;
    // Use lookaround "boundaries" instead of \b: \b only fires at a
    // word/non-word transition, so it silently fails to match terms that
    // start or end with a non-word character (e.g. "c++", "c#").
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, "gi");
    out = out.replace(re, replacement);
  }
  return out;
}

export const mockLlm: LlmProvider = {
  name: "mock-llm",
  async cleanup(input: CleanupInput): Promise<CleanupResult> {
    let text = normalise(input.rawText);
    text = applyDictionary(text, input.dictionary);
    // Context-aware light formatting: bullet-ify list-like dictation for docs/IDE.
    const app = input.context?.appContext ?? "";
    if (/Jira|Linear|Notion/i.test(app) && /(,|\band\b).+(,|\band\b)/.test(input.rawText)) {
      const items = input.rawText
        .split(/,|\band\b/gi)
        .map((s) => normalise(s))
        .filter((s) => s.length > 1);
      if (items.length >= 2) text = items.map((i) => `- ${i}`).join("\n");
    }
    return { cleanText: text, provider: "mock-llm" };
  },
  async suggest(input: CleanupInput): Promise<string[]> {
    const app = input.context?.appContext ?? "your app";
    return [
      `Rephrase for ${app} in a more concise, professional tone`,
      "Turn this into a bulleted action list",
      "Draft a follow-up reply based on this",
    ];
  },
};

/**
 * Parse a canonical PCM WAV (RIFF/WAVE) header to compute clip duration.
 *
 * Layout (little-endian): bytes 0-3 "RIFF", 8-11 "WAVE", then a sequence of
 * chunks, each `[4-byte id][4-byte size][size bytes]`. We scan chunks looking
 * for "fmt " (sample rate + block align) and "data" (byte length), then
 * durationSec = dataBytes / byteRate. Returns null for anything malformed —
 * callers must treat that as "unknown duration", not throw.
 */
export function parseWavDurationSec(buf: Buffer): number | null {
  try {
    if (buf.length < 44) return null;
    if (buf.toString("ascii", 0, 4) !== "RIFF") return null;
    if (buf.toString("ascii", 8, 12) !== "WAVE") return null;

    let offset = 12;
    let byteRate: number | null = null;
    let dataBytes: number | null = null;

    while (offset + 8 <= buf.length) {
      const chunkId = buf.toString("ascii", offset, offset + 4);
      const chunkSize = buf.readUInt32LE(offset + 4);
      const bodyStart = offset + 8;

      if (chunkId === "fmt " && bodyStart + 16 <= buf.length) {
        const sampleRate = buf.readUInt32LE(bodyStart + 4);
        byteRate = buf.readUInt32LE(bodyStart + 8);
        if (!byteRate && sampleRate) {
          // Some encoders omit byteRate; derive from sampleRate/channels/bitsPerSample.
          const channels = buf.readUInt16LE(bodyStart + 2);
          const bitsPerSample = buf.readUInt16LE(bodyStart + 14);
          byteRate = sampleRate * channels * (bitsPerSample / 8);
        }
      } else if (chunkId === "data") {
        dataBytes = Math.min(chunkSize, buf.length - bodyStart);
      }

      offset = bodyStart + chunkSize + (chunkSize % 2); // chunks are word-aligned
      if (chunkSize < 0 || !Number.isFinite(offset)) return null;
    }

    if (!byteRate || dataBytes == null || byteRate <= 0) return null;
    return dataBytes / byteRate;
  } catch {
    return null;
  }
}

export const mockStt: SttProvider = {
  name: "mock-stt",
  async transcribe(audio: Buffer, mimeType: string, hintText?: string): Promise<SttResult> {
    const durationSec =
      mimeType === "audio/wav" || mimeType === "audio/x-wav" || mimeType === "audio/wave"
        ? parseWavDurationSec(audio) ?? undefined
        : undefined;

    // Ground-truth injection: when a caller (typically a test) supplies
    // `hintText`, we treat it as "what was actually said" and echo it back
    // verbatim as the transcript. This is what lets scripts/test-stt.mjs
    // exercise the full audio -> stt -> cleanup pipeline deterministically,
    // without needing a real speech model to understand the sample audio.
    if (hintText && hintText.trim()) {
      return { text: hintText.trim(), provider: "mock-stt", durationSec };
    }

    const durationLabel = durationSec != null ? durationSec.toFixed(2) : "?";
    return {
      text: `[offline stt] audio received (${audio.length} bytes, ${durationLabel}s)`,
      provider: "mock-stt",
      durationSec,
    };
  },
};
