function afPushCurrent_(): { key: string; weekId: string; slot: string; upcoming: boolean } {
  const week = weekId_();
  const selected = afSelectedDate_(sheet_(AF.summary).getRange('B3').getValue());
  if (!(selected instanceof Date)) return { key: '', weekId: week, slot: '', upcoming: false };
  const slot = slotKey_(fmtDate_(selected), fmtTime_(selected));
  const valid = listSlots_().some(function (candidate) {
    return candidate.key === slot;
  });
  return {
    key: valid ? week + '|' + slot : '',
    weekId: week,
    slot: valid ? slot : '',
    upcoming: valid && selected.getTime() > Date.now(),
  };
}
