function udmPath_(path: unknown): path is string {
  return (
    typeof path === 'string' &&
    path.length <= 240 &&
    /^\/UDM\/(?:[a-zA-Z0-9_-]+\/)*$/.test(path) &&
    !path.startsWith('/UDM/s/')
  );
}
function afLinkCode_(code: unknown): asserts code is string {
  afAssert_(typeof code === 'string' && /^[A-Za-z0-9_-]{4,32}$/.test(code), 'INVALID_REQUEST');
}
