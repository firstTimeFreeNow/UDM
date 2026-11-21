function afAssert_(condition: unknown, code: AfErrorCode): asserts condition {
  if (!condition) throw afError_(code);
}

function afError_(code: AfErrorCode): Error & { code: AfErrorCode } {
  return Object.assign(new Error(code), { code });
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
