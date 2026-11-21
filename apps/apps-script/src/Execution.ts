function afWithScriptLock_<T>(operation: () => T, timeoutMs: number, onBusy: () => never): T {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(timeoutMs)) onBusy();
  try {
    return operation();
  } finally {
    lock.releaseLock();
  }
}

function afWithLock_<T>(operation: () => T): T {
  return afWithScriptLock_(operation, 10000, () => {
    throw afError_('BUSY');
  });
}

function afWithSheetLock_<T>(operation: () => T, busyMessage: string): T {
  return afWithScriptLock_(operation, 15000, () => {
    throw new Error(busyMessage);
  });
}

function afAssert_(condition: unknown, code: AfErrorCode): asserts condition {
  if (!condition) throw afError_(code);
}

function afError_(code: AfErrorCode): Error & { code: AfErrorCode } {
  return Object.assign(new Error(code), { code });
}

function afHex_(bytes: number[]): string {
  return bytes.map((byte) => ('0' + ((byte + 256) % 256).toString(16)).slice(-2)).join('');
}

function afPublicErrorCode_(error: unknown): AfErrorCode {
  const codes: readonly AfErrorCode[] = [
    'INVALID_REQUEST',
    'AUTH_REQUIRED',
    'FORBIDDEN',
    'CONFIG_REQUIRED',
    'BUSY',
    'CONFLICT',
    'WEEK_CHANGED',
    'CAPACITY',
    'HAS_ANSWERS',
    'INELIGIBLE',
    'DUPLICATE',
    'NOT_FOUND',
  ];
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && codes.includes(code as AfErrorCode)
    ? (code as AfErrorCode)
    : 'INTERNAL_ERROR';
}
