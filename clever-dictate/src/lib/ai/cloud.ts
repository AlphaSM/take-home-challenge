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
// Cloud adapters. Thin, dependency-free `fetch` wrappers so we don't pull in
// heavy SDKs. Each throws if its key is missing; the registry only constructs
// them when the matching provider is selected, and falls back to mock on error.
// ---------------------------------------------------------------------------

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"; // fast + cheap for cleanup
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const OPENAI_WHISPER_MODEL = "whisper-1";
const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";

// --- Gemini (Google Generative Language API) -------------------------------
// Model IDs verified against https://ai.google.dev/gemini-api/docs (2026-07).
// All three stages run on Gemini via `generateContent`; each model is
// env-overridable so ops can pin/upgrade without a code change.
//
// Defaults are gemini-3.5-flash, verified live against the target project for
// text (cleanup), vision (screen context) AND audio (transcription). Two
// originally-requested models could not be the default because they don't work
// through this interface / plan:
//   - LLM: gemini-3.1-pro-preview → free-tier quota is 0 (paid billing only).
//     Set GEMINI_LLM_MODEL=gemini-3.1-pro-preview once billing is enabled.
//   - STT: gemini-3.1-flash-live-preview → Live API is a bidirectional
//     WebSocket surface (bidiGenerateContent); it 404s on generateContent and
//     cannot service this one-shot buffer->text interface. Real-time streaming
//     would be a separate integration (see WRITEUP notes).
const GEMINI_VLM_MODEL = process.env.GEMINI_VLM_MODEL ?? "gemini-3.5-flash";
const GEMINI_LLM_MODEL = process.env.GEMINI_LLM_MODEL ?? "gemini-3.5-flash";
const GEMINI_STT_MODEL = process.env.GEMINI_STT_MODEL ?? "gemini-3.5-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function stripCodeFence(s: string): string {
  return s.replace(/^```[a-z]*\n?/i, "").replace(/```$/i, "").trim();
}

/**
 * Auth header for the Google Generative Language API.
 * API keys — both classic ("AIza...") and the newer AI Studio ("AQ.Ab8...")
 * form — authenticate via `x-goog-api-key`. Only true OAuth2 access tokens
 * ("ya29...") use Bearer auth.
 */
function geminiAuthHeaders(key: string): Record<string, string> {
  return key.startsWith("ya29.")
    ? { authorization: `Bearer ${key}` }
    : { "x-goog-api-key": key };
}

/**
 * Minimal Gemini `generateContent` client. `parts` follows the REST contract:
 * `{text}` for prompts, `{inline_data:{mime_type,data}}` for image/audio bytes.
 * Returns the concatenated text of the first candidate. Throws on non-2xx so
 * the registry can degrade to the mock.
 */
async function geminiGenerate(
  model: string,
  parts: Array<Record<string, unknown>>,
  opts: { systemInstruction?: string; responseMimeType?: string } = {},
): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const body: Record<string, unknown> = { contents: [{ parts }] };
  if (opts.systemInstruction) {
    body.systemInstruction = { parts: [{ text: opts.systemInstruction }] };
  }
  if (opts.responseMimeType) {
    body.generationConfig = { responseMimeType: opts.responseMimeType };
  }

  const res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", ...geminiAuthHeaders(key) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${model} ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const outParts = data.candidates?.[0]?.content?.parts ?? [];
  return outParts.map((p: { text?: string }) => p.text ?? "").join("").trim();
}

/** Shared prompt construction for the cleanup stage. */
function cleanupSystemPrompt(input: CleanupInput): string {
  const ctx = input.context
    ? `The user is currently in: ${input.context.appContext} — ${input.context.summary}.`
    : "";
  const dict = input.dictionary?.length
    ? `Enforce these exact spellings: ${input.dictionary
        .map((d) => `"${d.term}"→"${d.replacement}"`)
        .join(", ")}.`
    : "";
  return [
    "You clean up raw dictation transcripts.",
    "Fix grammar, punctuation and capitalisation. Remove filler words.",
    "Match the tone and formatting expected by the target application.",
    input.profilePrompt ?? "",
    ctx,
    dict,
    "Output ONLY the cleaned text. No preamble, no explanation.",
  ]
    .filter(Boolean)
    .join(" ");
}

// --- Anthropic (Claude) as an LLM cleanup provider -------------------------

export function anthropicLlm(): LlmProvider {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");

  async function call(system: string, user: string): Promise<string> {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return (data.content?.[0]?.text ?? "").trim();
  }

  return {
    name: "anthropic",
    async cleanup(input: CleanupInput): Promise<CleanupResult> {
      const text = stripCodeFence(await call(cleanupSystemPrompt(input), input.rawText));
      return { cleanText: text, provider: "anthropic" };
    },
    async suggest(input: CleanupInput): Promise<string[]> {
      const system =
        "Given a cleaned dictation and its app context, suggest 3 short next actions the user might want. Output one per line, no numbering.";
      const user = `App: ${input.context?.appContext ?? "unknown"}\nText: ${input.rawText}`;
      const out = await call(system, user);
      return out
        .split("\n")
        .map((l) => l.replace(/^[-*\d.\s]+/, "").trim())
        .filter(Boolean)
        .slice(0, 3);
    },
  };
}

// --- Gemini as the LLM cleanup provider ------------------------------------

export function geminiLlm(): LlmProvider {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
  return {
    name: "gemini",
    async cleanup(input: CleanupInput): Promise<CleanupResult> {
      const text = stripCodeFence(
        await geminiGenerate(GEMINI_LLM_MODEL, [{ text: input.rawText }], {
          systemInstruction: cleanupSystemPrompt(input),
        }),
      );
      return { cleanText: text, provider: "gemini" };
    },
    async suggest(input: CleanupInput): Promise<string[]> {
      const system =
        "Given a cleaned dictation and its app context, suggest 3 short next actions the user might want. Output one per line, no numbering.";
      const user = `App: ${input.context?.appContext ?? "unknown"}\nText: ${input.rawText}`;
      const out = await geminiGenerate(GEMINI_LLM_MODEL, [{ text: user }], {
        systemInstruction: system,
      });
      return out
        .split("\n")
        .map((l) => l.replace(/^[-*\d.\s]+/, "").trim())
        .filter(Boolean)
        .slice(0, 3);
    },
  };
}

// --- Gemini Flash as the VLM provider --------------------------------------

export function geminiVlm(): VlmProvider {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  return {
    name: "gemini",
    async describe(imageBase64): Promise<ScreenContext> {
      if (!imageBase64) throw new Error("gemini VLM requires an image");
      const b64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const instruction =
        "Identify the foreground application and what the user is doing. " +
        'Respond with strict JSON: {"appContext": string, "summary": string, ' +
        '"primitives": [{"label": string, "bbox": [x,y,w,h] in 0..1}]}. No prose.';
      const raw = stripCodeFence(
        await geminiGenerate(
          GEMINI_VLM_MODEL,
          [
            { text: instruction },
            { inline_data: { mime_type: "image/png", data: b64 } },
          ],
          { responseMimeType: "application/json" },
        ) || "{}",
      );
      const parsed = JSON.parse(raw || "{}");
      return {
        appContext: parsed.appContext ?? "Unknown Application",
        summary: parsed.summary ?? "",
        primitives: Array.isArray(parsed.primitives) ? parsed.primitives : [],
        provider: "gemini",
      };
    },
  };
}

// --- Gemini as the STT provider (one-shot audio-file transcription) --------

export function geminiStt(): SttProvider {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  return {
    name: "gemini",
    async transcribe(audio: Buffer, mimeType: string): Promise<SttResult> {
      const b64 = Buffer.from(audio).toString("base64");
      const text = await geminiGenerate(GEMINI_STT_MODEL, [
        {
          text:
            "Transcribe the following audio to text verbatim. " +
            "Output ONLY the transcript, with no preamble, speaker labels, timestamps, or commentary.",
        },
        { inline_data: { mime_type: mimeType || "audio/wav", data: b64 } },
      ]);
      return { text: stripCodeFence(text), provider: "gemini" };
    },
  };
}

// --- OpenAI Whisper as an STT provider -------------------------------------

function extFromMime(mimeType: string): string {
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("m4a") || mimeType.includes("mp4")) return "m4a";
  return "bin";
}

export function openaiWhisperStt(): SttProvider {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");

  return {
    name: "openai-whisper",
    async transcribe(audio: Buffer, mimeType: string): Promise<SttResult> {
      const form = new FormData();
      const blob = new Blob([new Uint8Array(audio)], { type: mimeType || "audio/wav" });
      form.append("file", blob, `audio.${extFromMime(mimeType)}`);
      form.append("model", OPENAI_WHISPER_MODEL);

      const res = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${key}` },
        body: form,
      });
      if (!res.ok) throw new Error(`OpenAI Whisper ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return { text: (data.text ?? "").trim(), provider: "openai-whisper" };
    },
  };
}
