import { TIERS, type TierId } from "@/lib/contract";

export function TierSwatch({ tier, className = "h-7 w-9" }: { tier: TierId; className?: string }) {
  return <span aria-hidden="true" className={`inline-block flex-none tier-${tier} ${className}`} />;
}

export function TierLabel({ tier, strong = true }: { tier: TierId; strong?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <TierSwatch tier={tier} className="h-[18px] w-[22px]" />
      {strong ? <b>{TIERS[tier].name}</b> : TIERS[tier].name}
    </span>
  );
}
