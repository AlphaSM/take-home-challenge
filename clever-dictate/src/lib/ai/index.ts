import type { VlmProvider, LlmProvider, SttProvider } from "./types";
import { mockVlm, mockLlm, mockStt } from "./mock";
import { anthropicLlm, geminiLlm, geminiVlm, geminiStt, openaiWhisperStt } from "./cloud";

// Provider registry. Selection is driven by env so ops can flip between
// offline mocks and cloud APIs without code changes. Any construction error
// (e.g. missing key) degrades gracefully to the mock so the app never hard-fails.

export function getVlm(): VlmProvider {
  const choice = (process.env.VLM_PROVIDER ?? "mock").toLowerCase();
  try {
    if (choice === "gemini") return geminiVlm();
  } catch (e) {
    console.warn(`[ai] VLM '${choice}' unavailable, using mock:`, (e as Error).message);
  }
  return mockVlm;
}

export function getLlm(): LlmProvider {
  const choice = (process.env.LLM_PROVIDER ?? "mock").toLowerCase();
  try {
    if (choice === "gemini") return geminiLlm();
    if (choice === "anthropic") return anthropicLlm();
  } catch (e) {
    console.warn(`[ai] LLM '${choice}' unavailable, using mock:`, (e as Error).message);
  }
  return mockLlm;
}

export function getStt(): SttProvider {
  // "browser" is the client-side Web Speech API default (see src/lib/speech.ts)
  // and has no server-side meaning — treat it the same as "mock" here.
  const choice = (process.env.STT_PROVIDER ?? "mock").toLowerCase();
  try {
    if (choice === "gemini") return geminiStt();
    if (choice === "openai") return openaiWhisperStt();
  } catch (e) {
    console.warn(`[ai] STT '${choice}' unavailable, using mock:`, (e as Error).message);
  }
  return mockStt;
}

export * from "./types";
