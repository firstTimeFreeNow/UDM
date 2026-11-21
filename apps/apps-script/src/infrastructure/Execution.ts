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

function afHex_(bytes: number[]): string {
  return bytes.map((byte) => ('0' + ((byte + 256) % 256).toString(16)).slice(-2)).join('');
}
