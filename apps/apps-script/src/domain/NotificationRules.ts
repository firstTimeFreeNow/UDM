function afPushToken_(token: unknown): string {
  afAssert_(
    typeof token === 'string' && /^[A-Za-z0-9:_.-]{20,2048}$/.test(token),
    'INVALID_REQUEST',
  );
  return token;
}
function afTestNotification_(payload: AfModels['PushTestRequest']): {
  title: string;
  body: string;
} {
  afAssert_(
    typeof payload.title === 'string' && typeof payload.body === 'string',
    'INVALID_REQUEST',
  );
  const title = payload.title.trim(),
    body = payload.body.trim();
  afAssert_(
    title.length > 0 &&
      title.length <= 80 &&
      body.length > 0 &&
      body.length <= 500 &&
      !/[\x00-\x1f\x7f]/.test(title) &&
      !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(body),
    'INVALID_REQUEST',
  );
  return { title, body };
}
function afNextPushEvent_(
  previous: AfPushEvent | null,
  current: AfPushCurrent,
  newId: () => string,
): AfPushEvent {
  if (previous && previous.key === current.key) return previous;
  return {
    key: current.key,
    id: current.upcoming ? newId() : '',
    weekId: current.weekId,
    slot: current.slot,
    changed:
      !!previous &&
      !!previous.key &&
      previous.weekId === current.weekId &&
      previous.slot !== current.slot,
  };
}
function afNotificationMessage_(event: AfPushEvent, token: string, now: number): AfFcmMessage {
  const expiresAt = new Date(event.slot.replace(' ', 'T') + ':00+09:00').getTime();
  return {
    token,
    data: {
      type: 'afetiria-confirmed',
      title: 'アフェティリアハード追加便',
      body: event.slot + (event.changed ? ' の開催が変更されました' : ' の開催が決まりました。'),
      eventId: event.id,
    },
    webpush: {
      headers: {
        TTL: String(Math.max(0, Math.min(3600, Math.floor((expiresAt - now) / 1000)))),
        Urgency: 'high',
      },
    },
  };
}
