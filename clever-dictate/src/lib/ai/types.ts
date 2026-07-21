// Shared contracts for the three-stage dictation pipeline.
//
//   screenshot ──▶ [VLM] ──▶ context ─┐
//                                      ├─▶ [LLM cleanup] ──▶ final text
//   audio ──────▶ [STT] ──▶ raw text ─┘
//
// Every stage is an interface with (a) a real cloud adapter and (b) a
// deterministic offline mock, selected by env. This is what lets the whole
// product be demonstrated with no keys and no GPU, while leaving a clean seam
// to drop in Moondream2 / Whisper / Qwen locally or Gemini / Claude in cloud.

/** Structured output of the VLM stage (Design.md steps 1–3). */
export interface ScreenContext {
  /** The detected foreground application, e.g. "VS Code", "Gmail", "Slack". */
  appContext: string;
  /** One-line human summary, e.g. "IDE editing README.md". */
  summary: string;
  /**
   * "Visual primitives" per the Thinking-with-Visual-Primitives paper: the
   * salient UI regions the model grounded its reasoning on. Kept structured so
   * the LLM can point at concrete regions instead of guessing.
   */
  primitives: Array<{
    label: string;
    /** Normalised [x, y, w, h] in 0..1, optional. */
    bbox?: [number, number, number, number];
  }>;
  provider: string;
}

export interface VlmProvider {
  name: string;
  /** @param imageBase64 a data URL or raw base64 PNG of the screen. */
  describe(imageBase64: string | null): Promise<ScreenContext>;
}

/** Result of the LLM cleanup stage (Design.md step 5). */
export interface CleanupResult {
  cleanText: string;
  provider: string;
}

export interface CleanupInput {
  rawText: string;
  context: ScreenContext | null;
  /** Org-shared prompt profile selected by the VLM->LLM router, if any. */
  profilePrompt?: string | null;
  /** Corporate dictionary: force-replace jargon spellings. */
  dictionary?: Array<{ term: string; replacement: string }>;
}

export interface LlmProvider {
  name: string;
  cleanup(input: CleanupInput): Promise<CleanupResult>;
  /** Optional: generate follow-up suggestions from enriched context. */
  suggest?(input: CleanupInput): Promise<string[]>;
}

/** Result of the STT stage (Design.md step 4). */
export interface SttResult {
  text: string;
  provider: string;
  durationSec?: number;
}

export interface SttProvider {
  name: string;
  /**
   * @param audio raw audio bytes (e.g. a WAV file body).
   * @param mimeType the audio content type, e.g. "audio/wav".
   * @param hintText optional ground-truth text. Real cloud adapters ignore
   * this; the offline mock uses it to inject a known transcript so tests can
   * assert on exact pipeline output without a real speech model.
   */
  transcribe(audio: Buffer, mimeType: string, hintText?: string): Promise<SttResult>;
}
