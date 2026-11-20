import styles from "./afetiria.module.css";
export function LoadingProgress({
  label = "読み込み中…",
  initial = false,
  compact = false,
}: {
  label?: string;
  initial?: boolean;
  compact?: boolean;
}) {
  if (compact)
    return (
      <div className={styles.compactProgress} role="status" aria-label={label}>
        <span />
      </div>
    );
  return (
    <div className={styles.loading} aria-busy="true">
      <div role="status" className={styles.loadingLabel}>
        <span className={styles.spinner} aria-hidden="true" />
        {label}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        className={styles.progressTrack}
      >
        <span />
      </div>
      {initial && (
        <div className={styles.skeleton} aria-hidden="true">
          <div />
          <div />
          <div />
        </div>
      )}
    </div>
  );
}
