import { operations } from '../generated/operations.ts';
export type Action = Exclude<(typeof operations)[number]['action'], null>;
type Query = { view?: string; memberId?: string; fresh?: boolean; offset?: number };
export function bffRoute(action: Action, payload: Query = {}): [string, string] {
  const view = ['schedule', 'answer', 'admin'].includes(payload.view ?? '') ? payload.view : 'schedule';
  const operation = operations.find(op => op.action === action && (action !== 'af.read' || op.view === view));
  if (!operation) throw Error('Unknown API action');
  const query = new URLSearchParams();
  if (action === 'af.read') {
    if (view === 'answer' && payload.memberId) query.set('memberId', payload.memberId);
    if (payload.fresh) query.set('fresh', '1');
  }
  if (action === 'af.history') query.set('offset', String(payload.offset || 0));
  return [operation.method, operation.path + (query.size ? '?' + query : '')];
}
export function bffEndpoint(value: string, allowLoopback = false) {
  const url = new URL(value);
  const local = allowLoopback && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !local) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw Error("Invalid BFF origin");
  return url.origin;
}
