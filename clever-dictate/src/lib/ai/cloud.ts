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
const GEMINI_MODEL = "gemini-1.5-flash-8b"; // per Project.md fallback recommendation
const OPENAI_WHISPER_MODEL = "whisper-1";
const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";

function stripCodeFence(s: string): string {
  return s.replace(/^```[a-z]*\n?/i, "").replace(/```$/i, "").trim();
}

// --- Anthropic (Claude) as the LLM cleanup provider ------------------------

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
      const ctx = input.context
        ? `The user is currently in: ${input.context.appContext} — ${input.context.summary}.`
        : "";
      const dict = input.dictionary?.length
        ? `Enforce these exact spellings: ${input.dictionary
            .map((d) => `"${d.term}"→"${d.replacement}"`)
            .join(", ")}.`
        : "";
      const system = [
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
      const text = stripCodeFence(await call(system, input.rawText));
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

// --- Gemini Flash-8B as the VLM provider -----------------------------------

export function geminiVlm(): VlmProvider {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

  return {
    name: "gemini",
    async describe(imageBase64): Promise<ScreenContext> {
      if (!imageBase64) throw new Error("gemini VLM requires an image");
      const b64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const instruction =
        'Identify the foreground application and what the user is doing. ' +
        'Respond with strict JSON: {"appContext": string, "summary": string, ' +
        '"primitives": [{"label": string, "bbox": [x,y,w,h] in 0..1}]}. No prose.';
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: instruction },
                { inline_data: { mime_type: "image/png", data: b64 } },
              ],
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const raw = stripCodeFence(data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}");
      const parsed = JSON.parse(raw);
      return {
        appContext: parsed.appContext ?? "Unknown Application",
        summary: parsed.summary ?? "",
        primitives: Array.isArray(parsed.primitives) ? parsed.primitives : [],
        provider: "gemini",
      };
    },
  };
}

// --- OpenAI Whisper as the STT provider ------------------------------------

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
