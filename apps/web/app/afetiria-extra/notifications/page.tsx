import { NotificationSettings } from "@/components/afetiria/notification-settings";
import styles from "@/components/afetiria/afetiria.module.css";
export default function Page() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.title}>アフェティリアハード追加便</span>
      </header>
      <main className={styles.main}>
        <h1>開催通知の設定</h1>
        <NotificationSettings />
        <p>設定が完了したら、このタブを閉じてスプレッドシートに戻れます。</p>
      </main>
    </div>
  );
}
