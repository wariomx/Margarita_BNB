"use client";

import { useGame } from "@/hooks/useGame";
import { TIERS, TIER_IDS } from "@/lib/contract";
import { formatGroup, formatMinutes } from "@/lib/format";
import { TierSwatch } from "./TierSwatch";

export function OddsTable() {
  const { data } = useGame();
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="co min-w-[480px] sm:min-w-[620px]">
        <caption className="sr-only">Tiers, odds and roll ranges</caption>
        <thead>
          <tr>
            <th scope="col">Tier</th>
            <th scope="col" className="hidden sm:table-cell">Token ID</th>
            <th scope="col">Chance</th>
            <th scope="col">Roll range (0 to 9 999)</th>
            <th scope="col">Ages into</th>
          </tr>
        </thead>
        <tbody>
          {TIER_IDS.map((id) => {
            const t = TIERS[id];
            const next = id < 4 ? TIERS[(id + 1) as 2 | 3 | 4].name : undefined;
            const secs = id < 4 ? data?.agingSeconds[id as 1 | 2 | 3] : undefined;
            return (
              <tr key={id}>
                <th scope="row" className="font-normal">
                  <span className="inline-flex items-center gap-3 text-ink">
                    <TierSwatch tier={id} />
                    <b>{t.name}</b>
                  </span>
                </th>
                <td className="num hidden sm:table-cell">{id}</td>
                <td className="num text-xl">{t.chance}</td>
                <td className="num">
                  {formatGroup(t.from)} to {formatGroup(t.to)}
                </td>
                <td>{next ? `${next}${secs ? ` in ${formatMinutes(secs)}` : ""}` : "Redeem for a bottle"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
