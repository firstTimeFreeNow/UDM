function afDispatchRequest_(request: AfRequest): unknown {
  return afRequestHandler_().handle(request);
}
