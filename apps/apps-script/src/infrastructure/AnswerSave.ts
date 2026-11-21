function afWriteMemberAnswers_(
  column: number,
  slotRows: Map<string, number>,
  updates: Map<string, AfModels['Answer']>,
): number {
  const sheet = sheet_(AF.admin);
  const range = sheet.getRange(5, column, AF.lastSlotRow - AF.firstSlotRow + 1, 1);
  const values = range.getValues();
  const changedIndexes: number[] = [];
  for (const [key, answer] of updates) {
    const index = Number(slotRows.get(key)) - AF.firstSlotRow;
    if (values[index][0] !== answer) {
      values[index][0] = answer;
      changedIndexes.push(index);
    }
  }
  if (changedIndexes.length) {
    changedIndexes.sort((a, b) => a - b);
    const runs = afAnswerRowRuns_(changedIndexes);
    // Keep sparse edits small; batch the column when many separate writes cost more.
    if (runs.length > 3 || changedIndexes.length > 14) range.setValues(values);
    else
      for (const [start, end] of runs) {
        sheet
          .getRange(5 + start, column, end - start + 1, 1)
          .setValues(values.slice(start, end + 1));
      }
  }
  return changedIndexes.length;
}

function afAnswerRowRuns_(indexes: readonly number[]): [number, number][] {
  const runs: [number, number][] = [];
  let first = indexes[0];
  let last = first;
  for (const index of indexes.slice(1)) {
    if (index === last + 1) last = index;
    else {
      runs.push([first, last]);
      first = index;
      last = index;
    }
  }
  runs.push([first, last]);
  return runs;
}
