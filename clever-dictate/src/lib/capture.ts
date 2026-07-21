import type { ScreenContext } from "./ai/types";

/**
 * Grab a single frame of the screen via the Screen Capture API, downscale it,
 * and POST it to the VLM stage. Falls back to a text hint when capture is
 * unavailable or denied (e.g. headless, non-secure context, user cancels).
 *
 * Runs entirely client-side up to the /api/vlm call.
 */
export async function captureScreenContext(hint?: string): Promise<ScreenContext> {
  let image: string | null = null;

  const canCapture =
    typeof navigator !== "undefined" &&
    navigator.mediaDevices &&
    "getDisplayMedia" in navigator.mediaDevices;

  if (canCapture) {
    try {
      image = await grabFrame();
    } catch {
      image = null; // denied / cancelled — fall through to hint
    }
  }

  const res = await fetch("/api/vlm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image, hint }),
  });
  if (!res.ok) throw new Error("VLM request failed");
  const data = await res.json();
  return data.context as ScreenContext;
}

async function grabFrame(): Promise<string> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 1 },
    audio: false,
  });
  try {
    const track = stream.getVideoTracks()[0];
    // Give the frame a beat to paint.
    await new Promise((r) => setTimeout(r, 200));

    const video = document.createElement("video");
    video.srcObject = stream;
    await video.play();

    // Downscale to keep the payload small (max 1280px wide).
    const scale = Math.min(1, 1280 / (video.videoWidth || 1280));
    const w = Math.round((video.videoWidth || 1280) * scale);
    const h = Math.round((video.videoHeight || 720) * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(video, 0, 0, w, h);
    track.stop();
    return canvas.toDataURL("image/png");
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
