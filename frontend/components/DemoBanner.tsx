import { CHAIN } from "@/lib/contract";

export function DemoBanner() {
  return (
    <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 bg-ink px-6 py-2.5 text-center text-sm text-paper">
      <span className="font-semibold">{CHAIN.name} demo</span>
      <span>Test BNB has no value. The contract is unaudited. This is not betting.</span>
    </div>
  );
}
