function afCreateHistoryService_(repository: AfHistoryRepository) {
  return {
    read(payload: AfPayloads['af.history']): AfModels['History'] {
      const offset = payload.offset === undefined ? 0 : payload.offset;
      afAssert_(Number.isSafeInteger(offset) && offset >= 0 && offset <= 10000, 'INVALID_REQUEST');
      const { items, total } = repository.page(offset, 12);
      return { items, nextOffset: total > offset + items.length ? offset + items.length : null };
    },
  };
}
