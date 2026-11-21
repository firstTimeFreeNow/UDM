function afSheetsHistoryRepository_(): AfHistoryRepository {
  return {
    page(offset, limit) {
      const history = sheet_(AF.history);
      const total = Math.max(0, history.getLastRow() - 3);
      const count = Math.min(limit, Math.max(0, total - offset));
      const rows = count
        ? history
            .getRange(4 + total - offset - count, 1, count, 6)
            .getValues()
            .reverse()
        : [];
      return {
        total,
        items: rows.map(function (row) {
          return {
            weekId: responseWeekId_(row[0]),
            confirmed: row[3] instanceof Date ? slotKey_(fmtDate_(row[3]), fmtTime_(row[3])) : null,
            status: String(row[4] || ''),
          };
        }),
      };
    },
  };
}
