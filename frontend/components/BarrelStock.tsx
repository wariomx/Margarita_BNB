"use client";

import { useGame } from "@/hooks/useGame";

export function BarrelStock() {
  const { data } = useGame();
  const total = data?.barrel.totalShares ?? 0;
  const left = data?.bottlesFree ?? 0;
  const detail = data
    ? data.extraIssued === undefined
      ? `of ${total}, ${data.redeemed} redeemed`
      : `of ${total}. ${data.extraIssued} won as Extra Añejo, ${data.redeemed} redeemed.`
    : "";
  return (
    <div className="flex flex-col gap-2 border-t border-rule pt-4">
      <span className="label">Bottles still to win</span>
      <div className="flex items-baseline gap-3">
        <span className="num text-2xl">{data ? left : "…"}</span>
        <span className="text-sm text-muted">{detail}</span>
      </div>
      {data ? (
        <div aria-hidden="true" className="flex flex-wrap gap-0.5">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`h-7 w-1.5 ${i < left ? "bg-wood-3" : "bg-paper-2 shadow-[inset_0_0_0_1px_var(--color-rule)]"}`} />
          ))}
        </div>
      ) : (
        <div aria-hidden="true" className="h-7 animate-pulse bg-paper-2" />
      )}
      {data?.barrel.name ? (
        <span className="text-sm text-muted">
          {data.barrel.name}
          {data.barrel.distillery ? `, ${data.barrel.distillery}` : ""}
        </span>
      ) : null}
    </div>
  );
}
