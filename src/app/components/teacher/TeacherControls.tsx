"use client";

// Transport controls for the lesson player: Play/Pause, Prev/Next, Restart,
// voice toggle, plus a step counter and progress bar.

type Props = {
  current: number; // 0-based
  total: number;
  isPlaying: boolean;
  isMuted: boolean;
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onRestart: () => void;
  onToggleMute: () => void;
};

export default function TeacherControls({
  current,
  total,
  isPlaying,
  isMuted,
  onPlayPause,
  onPrev,
  onNext,
  onRestart,
  onToggleMute,
}: Props) {
  const canPrev = current > 0;
  const canNext = current < total - 1;
  const pct = total > 0 ? Math.round(((current + 1) / total) * 100) : 0;

  const btn =
    "w-9 h-9 flex items-center justify-center rounded-lg text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed";

  return (
    <div className="space-y-2.5">
      <div className="h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
        <div
          className="h-full bg-indigo-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrev}
            disabled={!canPrev}
            className={`${btn} text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800`}
            title="Previous step"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={onPlayPause}
            className={`${btn} w-12 bg-indigo-600 text-white hover:bg-indigo-500`}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!canNext}
            className={`${btn} text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800`}
            title="Next step"
          >
            ▶
          </button>
          <button
            type="button"
            onClick={onRestart}
            className={`${btn} text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800`}
            title="Restart lesson"
          >
            ↻
          </button>
        </div>

        <button
          type="button"
          onClick={onToggleMute}
          className={`${btn} text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800`}
          title={isMuted ? "Voice off" : "Voice on"}
        >
          {isMuted ? "🔇" : "🔊"}
        </button>
      </div>

      <div className="text-center text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
        Step {current + 1} / {total}
      </div>
    </div>
  );
}
