/** Spreadsheet adapter: range addressing and value encoding only. */
function afInsertCandidate_(row: number, day: string, clock: string): void {
  const main = sheet_(AF.main);
  main.getRange(row, 1, 1, 2).setValues([[date_(day), time_(clock)]]);
  main.getRange(row, 1).setNumberFormat('m/d(ddd)');
  main.getRange(row, 2).setNumberFormat('hh:mm');
}

function afFreeCandidateRow_(slots: AfSheetSlot[], first: number, last: number): number {
  const used = new Set(slots.map((slot) => slot.row));
  let row = first;
  while (used.has(row) && row <= last) row++;
  return row;
}
