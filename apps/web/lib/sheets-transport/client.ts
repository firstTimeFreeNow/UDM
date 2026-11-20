const ACTIONS = new Set(['probe.read', 'probe.write', 'probe.admin']);

export class TransportError extends Error {
  code: string;
  outcomeUnknown: boolean;
  constructor(code: string, message: string, outcomeUnknown = false) {
    super(message);
    this.name = 'TransportError';
    this.code = code;
    this.outcomeUnknown = outcomeUnknown;
  }
}

/** Only the isolated probe may opt into a loopback HTTP endpoint. */
export function validateEndpoint(endpoint: string, allowLocalEndpoint = false) {
  let url;
  try { url = new URL(endpoint); } catch { throw new TransportError('INVALID_ENDPOINT', '接続先URLが不正です'); }
  const google = url.protocol === 'https:' && url.hostname === 'script.google.com' &&
    /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname) && url.port === '';
  const local = allowLocalEndpoint && url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((!google && !local) || url.username || url.password || url.search || url.hash) {
    throw new TransportError('INVALID_ENDPOINT', '許可されていない接続先です');
  }
  return url.href;
}

/**
 * Preliminary transport, not a production API or evidence of Google CORS support.
 * getIdToken supplies a fresh Firebase token. It is never put in URLs or storage.
 */
type ProbeOptions = { requestId?: string };
type ProbePayload = { value?: string; expectedRevision?: number };
type ProbeConfig = { endpoint: string; getIdToken: () => Promise<string>; fetchImpl?: typeof fetch; timeoutMs?: number; allowLocalEndpoint?: boolean };
export function createProbeClient({ endpoint, getIdToken, fetchImpl = globalThis.fetch,
  timeoutMs = 15000, allowLocalEndpoint = false }: ProbeConfig) {
  const url = validateEndpoint(endpoint, allowLocalEndpoint);
  if (typeof getIdToken !== 'function' || typeof fetchImpl !== 'function' ||
      !Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('Invalid client configuration');

  async function call(action: string, payload: ProbePayload = {}, { requestId = globalThis.crypto.randomUUID() }: ProbeOptions = {}) {
    if (!ACTIONS.has(action) || !/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) {
      throw new TransportError('INVALID_REQUEST', 'リクエストが不正です');
    }
    let idToken;
    try { idToken = await getIdToken(); } catch { throw new TransportError('AUTH_REQUIRED', '再ログインしてください'); }
    if (typeof idToken !== 'string' || !idToken || idToken.length > 16000) {
      throw new TransportError('AUTH_REQUIRED', '再ログインしてください');
    }
    const writing = action === 'probe.write';
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'follow', cache: 'no-store',
        // A CORS-safelisted content type avoids preflight; live Google redirects still need testing.
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ version: 1, requestId, action, payload, idToken }),
        signal: controller.signal,
      });
      if (!response.ok) throw new TransportError('HTTP_ERROR', '接続先から正常な応答がありません', writing);
      const contentType = response.headers.get('content-type') || '';
      if (!/^application\/json(?:;|$)/i.test(contentType)) {
        throw new TransportError('INVALID_RESPONSE', '接続先の応答を確認できません', writing);
      }
      let result;
      try { result = await response.json(); } catch {
        throw new TransportError('INVALID_RESPONSE', '接続先の応答を確認できません', writing);
      }
      if (!result || result.version !== 1 || result.requestId !== requestId || typeof result.ok !== 'boolean') {
        throw new TransportError('INVALID_RESPONSE', '接続先の応答を確認できません', writing);
      }
      if (!result.ok) {
        const code = result.error?.code;
        const messages: Record<string, string> = {
          AUTH_REQUIRED: '再ログインしてください', FORBIDDEN: 'この操作の権限がありません',
          INVALID_REQUEST: '入力を確認してください', CONFLICT: 'データが更新されています。再取得してください',
          BUSY: 'ほかの処理が実行中です', CONFIG_REQUIRED: 'テスト用接続設定が必要です',
          FIXTURE_REQUIRED: 'テスト用シートを確認してください', INTERNAL_ERROR: '処理結果を確認できません',
        };
        if (!Object.hasOwn(messages, code)) throw new TransportError('INVALID_RESPONSE', '接続先の応答を確認できません', writing);
        throw new TransportError(code, messages[code], writing && code === 'INTERNAL_ERROR');
      }
      if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) {
        throw new TransportError('INVALID_RESPONSE', '接続先の応答を確認できません', writing);
      }
      const data = result.data;
      const validState = Number.isSafeInteger(data.revision) && data.revision >= 0 &&
        ['', 'yes', 'maybe', 'no'].includes(data.value);
      const valid = action === 'probe.admin' ? data.role === 'admin' :
        action === 'probe.read' ? validState : validState && data.saved === true &&
          typeof data.replayed === 'boolean' && data.value === payload.value &&
          data.revision === Number(payload.expectedRevision) + 1;
      if (!valid) throw new TransportError('INVALID_RESPONSE', '処理結果の内容を確認できません', writing);
      return data;
    } catch (error) {
      if (error instanceof TransportError) throw error;
      throw new TransportError(timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
        timedOut ? '通信がタイムアウトしました' : '通信結果を確認できません', writing);
    } finally { clearTimeout(timer); }
  }
  return Object.freeze({
    read: (options?: ProbeOptions) => call('probe.read', {}, options),
    write: (payload: ProbePayload, options?: ProbeOptions) => call('probe.write', payload, options),
    checkAdmin: (options?: ProbeOptions) => call('probe.admin', {}, options),
  });
}
