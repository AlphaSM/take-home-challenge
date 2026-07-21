// Thin wrapper over the Web Speech API (webkitSpeechRecognition), which gives
// zero-install live STT in Chromium browsers. When unavailable, we return a
// recognizer that surfaces a friendly error and lets the UI fall back to typing.
//
// This is the browser STT path (STT_PROVIDER=browser). A server-side Whisper
// route can be dropped in behind the same shape without touching the HUD.

export interface Recognizer {
  start(): void;
  stop(): void;
  finalText(): string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function createRecognizer(opts: {
  onResult: (text: string) => void;
  onError: (message: string) => void;
}): Recognizer {
  const SR: any =
    typeof window !== "undefined" &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  let finalTranscript = "";

  if (!SR) {
    return {
      start: () =>
        opts.onError(
          "Live speech recognition isn't available in this browser. Use Chrome, or type the raw text.",
        ),
      stop: () => {},
      finalText: () => finalTranscript,
    };
  }

  const rec = new SR();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";

  rec.onresult = (event: any) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) finalTranscript += res[0].transcript;
      else interim += res[0].transcript;
    }
    opts.onResult((finalTranscript + interim).trim());
  };
  rec.onerror = (e: any) => {
    if (e.error !== "no-speech" && e.error !== "aborted")
      opts.onError(`Speech recognition error: ${e.error}`);
  };

  return {
    start: () => {
      finalTranscript = "";
      try {
        rec.start();
      } catch {
        /* already started */
      }
    },
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    },
    finalText: () => finalTranscript.trim(),
  };
}
