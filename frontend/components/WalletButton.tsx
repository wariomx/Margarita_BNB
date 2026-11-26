"use client";

import { useWallet } from "@/hooks/useWallet";
import { ConnectWallet } from "./ConnectWallet";
import { NATIVE } from "@/lib/contract";
import { formatNative, shortHex } from "@/lib/format";

export function WalletButton() {
  const w = useWallet();

  if (w.status === "disconnected" || w.status === "connecting") {
    return <ConnectWallet className="btn btn-primary min-h-11 px-4 sm:px-6" menu />;
  }

  if (w.status === "wrongNetwork") {
    return (
      <button type="button" className="btn btn-primary min-h-11" onClick={w.switchToTarget} disabled={w.isSwitching}>
        {w.isSwitching ? "Switching…" : "Switch network"}
      </button>
    );
  }

  const bal = w.balance === undefined ? "" : trim(formatNative(w.balance, NATIVE));
  return (
    <button
      type="button"
      className="chip min-h-11 cursor-pointer gap-3 hover:bg-paper-2 active:bg-paper-3"
      onClick={w.disconnect}
      title="Disconnect"
      aria-label={`Connected as ${w.address}. Disconnect`}
    >
      <span className="font-mono font-normal">{shortHex(w.address ?? "")}</span>
      {bal ? <span className="hidden text-muted sm:inline">{bal}</span> : null}
    </button>
  );
}

function trim(s: string) {
  return s.replace(/(\.\d{4})\d+/, "$1");
}
