import { GAME, addressUrl, deployment } from "@/lib/contract";

export function SiteFooter() {
  const url = addressUrl(GAME);
  return (
    <footer className="flex flex-wrap gap-x-8 gap-y-3 border-t-2 border-ink px-5 py-6 text-sm text-muted sm:px-10">
      <span>
        Contract <code className="break-all font-mono">{GAME}</code>
      </span>
      {url ? <a href={url}>View on BscScan</a> : <span>{deployment.chain.name}</span>}
      <span>Randomness: Chainlink VRF v2.5</span>
    </footer>
  );
}
