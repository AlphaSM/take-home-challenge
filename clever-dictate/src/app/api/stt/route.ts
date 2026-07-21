import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStt } from "@/lib/ai";

// Buffering the whole file with Buffer.from requires the Node.js runtime
// (not the Edge runtime, which lacks Node buffer/file APIs used here).
export const runtime = "nodejs";

/**
 * POST /api/stt
 * multipart/form-data body:
 *   - audio: File (required) — the recorded clip, e.g. audio/wav
 *   - hint:  string (optional) — ground-truth transcript. Forwarded to the
 *     active STT provider; the mock provider echoes it back verbatim so
 *     tests/demos can exercise the full audio -> stt -> cleanup pipeline
 *     deterministically without a real speech model understanding the clip.
 *
 * Runs the STT stage: audio -> raw transcript text.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "audio file required" }, { status: 400 });
  }
  const hintRaw = form.get("hint");
  const hint = typeof hintRaw === "string" ? hintRaw : undefined;

  const mimeType = audio.type || "application/octet-stream";
  const buffer = Buffer.from(await audio.arrayBuffer());

  const stt = getStt();
  try {
    const result = await stt.transcribe(buffer, mimeType, hint);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
