/**
 * キャッシュは表示高速化専用。保存時の正本は常に回答管理シート。
 * シートとWeb実行の両方で同じScriptCacheを参照する。
 */
function answerCache_(): GoogleAppsScript.Cache.Cache {
  return CacheService.getScriptCache();
}

function answerCacheKey_(): string {
  return 'af-answer-dialog-v8';
}

function cachedAnswerData_(): AfAnswerData | null {
  try {
    const json = answerCache_().get(answerCacheKey_());
    return json ? JSON.parse(json) : null;
  } catch (error) {
    console.warn('回答キャッシュの読み取りに失敗: ' + error);
    return null;
  }
}

function cacheAnswerData_(data: AfAnswerData): void {
  try {
    answerCache_().put(answerCacheKey_(), JSON.stringify(data), AF.cacheTtlSeconds);
  } catch (error) {
    // CacheServiceの上限や一時障害で、回答画面を止めない。
    console.warn('回答キャッシュの保存に失敗: ' + error);
  }
}

function invalidateAnswerCache_() {
  try {
    answerCache_().remove(answerCacheKey_());
  } catch (error) {
    console.warn('回答キャッシュの破棄に失敗: ' + error);
  }
}
