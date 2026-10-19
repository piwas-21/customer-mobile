import { MAX_BASKET_DEPTH, MAX_BASKET_ROWS } from './basketLimits';
export function compositionRows<T, R>(
  items: readonly T[],
  children: (line: T) => readonly T[],
  project: (line: T, key: string, depth: number) => R,
): R[] {
  const rows: R[] = [];
  const stack = items.map((line, index) => ({ line, key: String(index), depth: 0 })).reverse();
  while (stack.length) {
    const { line, key, depth } = stack.pop()!;
    if (depth > MAX_BASKET_DEPTH || rows.length >= MAX_BASKET_ROWS)
      throw new Error('Unsupported order composition');
    rows.push(project(line, key, depth));
    const nested = children(line);
    for (let index = nested.length - 1; index >= 0; index--)
      stack.push({ line: nested[index]!, key: `${key}.${index}`, depth: depth + 1 });
  }
  return rows;
}
