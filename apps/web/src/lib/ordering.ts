/**
 * Manual ordering for sidebar items and drag-reordered citations.
 *
 * Rows carry a float `position`. Inserting between two neighbours takes the
 * midpoint, so a move rewrites exactly one row instead of renumbering the whole
 * list. Floats run out of precision after ~50 consecutive midpoint inserts in
 * the same gap, so `needsRebalance` flags that and `rebalance` spreads the list
 * back out onto clean multiples of STEP.
 */
export const POSITION_STEP = 1024;

/** Smallest gap we trust before rebalancing. */
const MIN_GAP = 1e-6;

export function positionBetween(before?: number, after?: number): number {
  if (before === undefined && after === undefined) return POSITION_STEP;
  if (before === undefined) return after! - POSITION_STEP;
  if (after === undefined) return before + POSITION_STEP;
  return (before + after) / 2;
}

export function positionAtEnd(positions: number[]): number {
  if (positions.length === 0) return POSITION_STEP;
  return Math.max(...positions) + POSITION_STEP;
}

export function needsRebalance(before?: number, after?: number): boolean {
  if (before === undefined || after === undefined) return false;
  return Math.abs(after - before) < MIN_GAP;
}

/** Returns `[id, newPosition]` pairs for a clean respacing of `orderedIds`. */
export function rebalance(orderedIds: string[]): Array<[string, number]> {
  return orderedIds.map((id, i) => [id, (i + 1) * POSITION_STEP]);
}
