/**
 * サーバー側の回答取得時間を測定する。
 * HTML起動・ネットワーク・ブラウザ描画時間は含まない。
 */
function afBenchmarkAnswerData_() {
  const durations = [];
  for (let index = 0; index < 10; index++) {
    const startedAt = Date.now();
    getAnswerData(true);
    durations.push(Date.now() - startedAt);
  }
  const sorted = durations.slice().sort((a, b) => a - b);
  const median = (sorted[4] + sorted[5]) / 2;
  const p95 = sorted[9];
  console.log(JSON.stringify({ durations, median, p95 }));
}

/** キャッシュの先読み・命中・強制更新を分けて測定する。 */
function afBenchmarkPreload_() {
  invalidateAnswerCache_();
  const t0 = Date.now();
  preloadAnswerData();
  const warmMs = Date.now() - t0;
  const t1 = Date.now();
  getAnswerData();
  const cacheHitMs = Date.now() - t1;
  const t2 = Date.now();
  getAnswerData(true);
  const forceRefreshMs = Date.now() - t2;
  console.log(JSON.stringify({ warmMs, cacheHitMs, forceRefreshMs }));
}
