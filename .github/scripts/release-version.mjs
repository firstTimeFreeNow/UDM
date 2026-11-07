export const RELEASE_TYPES = ['major', 'minor', 'patch', 'hotfix'];

export function parseVersion(input) {
  const value = input.trim();
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-hotfix\.([1-9]\d*))?$/.exec(value);
  if (!match) throw new Error(`Invalid RELEASE version: ${value}`);
  const numbers = match.slice(1).map(value => value === undefined ? 0 : Number(value));
  if (numbers.some(value => !Number.isSafeInteger(value))) throw new Error('Version number exceeds the safe integer range.');
  return numbers;
}

export function bumpVersion(input, type) {
  if (!RELEASE_TYPES.includes(type)) throw new Error(`Invalid release type: ${type}`);
  const numbers = parseVersion(input);
  const index = RELEASE_TYPES.indexOf(type);
  numbers[index] += 1;
  if (!Number.isSafeInteger(numbers[index])) throw new Error('Version number exceeds the safe integer range.');
  for (let i = index + 1; i < numbers.length; i++) numbers[i] = 0;
  return numbers.slice(0, 3).join('.') + (numbers[3] ? `-hotfix.${numbers[3]}` : '');
}

export function validateBump(previous, next) {
  parseVersion(next);
  const type = RELEASE_TYPES.find(type => bumpVersion(previous, type) === next);
  if (!type) throw new Error(`RELEASE must increment exactly one version component: ${previous} -> ${next}`);
  return type;
}
