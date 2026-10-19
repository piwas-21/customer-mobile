type Presentation = Readonly<{ order: number; role: string; label?: string | null }>;
export function completeManifestRows<T extends Presentation>(
  rows: T[],
  defaults: readonly T[],
  key: (row: T) => string,
  screen: (row: T) => string,
  compatible: (first: T, second: T) => boolean,
): void {
  const seen = new Set(rows.map(key));
  const authored = [...rows];
  let nextOrder = rows.reduce((max, row) => Math.max(max, row.order), -1) + 1;
  const missingScreens = new Map<string, T[]>();
  for (const row of defaults) {
    if (seen.has(key(row))) continue;
    const identity = screen(row);
    const refs = missingScreens.get(identity) ?? [];
    refs.push(row);
    missingScreens.set(identity, refs);
  }
  for (const missing of missingScreens.values()) {
    const first = missing[0]!;
    const candidates = authored.filter((row) => compatible(row, first));
    const screens = new Set(candidates.map(screen));
    const target = screens.size === 1 ? candidates[0] : undefined;
    const order = target?.order ?? nextOrder++;
    rows.push(
      ...missing.map((row) => ({
        ...row,
        order,
        role: target?.role ?? row.role,
        label: target?.label ?? null,
      })),
    );
  }
}
