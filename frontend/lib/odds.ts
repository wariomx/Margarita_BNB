export type Chances = readonly [number, number, number, number];
export type AgingCost = readonly [number, number, number];

export const CHANCES: Chances = [0.7, 0.22, 0.07, 0.01];
export const AGING_COST: AgingCost = [3, 3, 7];

export function extraAnejoPerPull(chances: Chances, agingCost: AgingCost) {
  const [p1, p2, p3, p4] = chances;
  const [c1, c2, c3] = agingCost;
  return p4 + p3 / c3 + p2 / (c2 * c3) + p1 / (c1 * c2 * c3);
}

export function expectedPullsPerExtraAnejo(chances: Chances, agingCost: AgingCost) {
  return 1 / extraAnejoPerPull(chances, agingCost);
}

export function expectedPullsWithoutAging(chances: Chances) {
  return 1 / chances[3];
}

export function breakEvenPullPrice(bottleUsd: number, bnbUsd: number, chances: Chances, agingCost: AgingCost) {
  return (bottleUsd * extraAnejoPerPull(chances, agingCost)) / bnbUsd;
}
