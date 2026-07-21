import { CopyButton } from "./CopyButton";

type Dictation = {
  id: string;
  appContext: string | null;
  contextSummary: string | null;
  rawText: string;
  cleanText: string;
  editedText: string | null;
  createdAt: Date;
  author: { name: string };
};

export function SessionTimeline({ dictations }: { dictations: Dictation[] }) {
  if (dictations.length === 0) {
    return (
      <div className="card p-8 text-center text-sm text-secondary">
        No dictations yet. Use the mic below to add the first turn.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {dictations.map((d) => (
        <div key={d.id} className="space-y-2">
          {/* Context card (VLM) */}
          {(d.appContext || d.contextSummary) && (
            <div className="flex items-center gap-2 rounded border border-vision/20 bg-vision/5 px-3 py-1.5">
              <span className="text-vision">📷</span>
              <span className="font-mono text-xs text-vision">
                Context: {d.appContext ?? "Unknown"}
                {d.contextSummary && (
                  <span className="text-vision/60">{` // ${d.contextSummary}`}</span>
                )}
              </span>
            </div>
          )}

          {/* Dual-text transcription block */}
          <div className="card group p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[11px] text-secondary">{d.author.name}</span>
              <div className="opacity-0 transition-opacity group-hover:opacity-100">
                <CopyButton text={d.editedText ?? d.cleanText} />
              </div>
            </div>
            <p className="mb-2 text-xs italic text-secondary/70">{d.rawText}</p>
            <div className="h-px bg-hairline" />
            <p className="mt-2 whitespace-pre-wrap text-sm text-dominant">
              {d.editedText ?? d.cleanText}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
