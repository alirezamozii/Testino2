function hashSeed(seed: string) {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function randomGenerator(seed: string) {
  let value = hashSeed(seed);
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function seededShuffle<T>(values: readonly T[], seed: string): T[] {
  const result = [...values];
  const random = randomGenerator(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random() * (index + 1));
    [result[index], result[selected]] = [result[selected], result[index]];
  }
  return result;
}

export function resolveOptionOrder(
  options: Array<{ id: string }>,
  shuffleSafe: boolean,
  questionSeed: string
): string[] {
  if (!shuffleSafe) {
    return options.map((option) => option.id);
  }
  return seededShuffle(options, questionSeed).map((option) => option.id);
}
