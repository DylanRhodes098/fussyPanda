import styles from "./PhotoStudioGenerationProgress.module.css";

export default function PhotoStudioGenerationProgress() {
  return (
    <div
      aria-label="Polishing your photograph"
      aria-live="polite"
      className="mr-auto w-full max-w-md rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-sm"
      role="status"
    >
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="font-semibold text-zinc-950">
          Polishing your photograph
        </span>

        <span className="text-xs text-zinc-500">Please wait</span>
      </div>

      <div className={`mt-3 ${styles.track}`}>
        <div className={styles.bar} />
      </div>
    </div>
  );
}
