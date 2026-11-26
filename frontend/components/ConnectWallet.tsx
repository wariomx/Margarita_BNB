"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { useWallet } from "@/hooks/useWallet";

export function ConnectWallet({
  label = "Connect wallet",
  className = "btn btn-primary",
  menu = false,
}: {
  label?: string;
  className?: string;
  menu?: boolean;
}) {
  const w = useWallet();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: PointerEvent) {
      if (menu && root.current && !root.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, menu]);

  const checking = w.status === "connecting";
  const none = !checking && w.wallets.length === 0;

  function onMain() {
    if (w.wallets.length === 1) {
      w.connect(w.wallets[0].id);
      return;
    }
    setOpen((o) => !o);
  }

  return (
    <div ref={root} className={`relative flex flex-col gap-2 ${menu ? "" : "w-full"}`}>
      <button
        type="button"
        className={className}
        onClick={onMain}
        disabled={checking || none}
        aria-expanded={w.wallets.length > 1 ? open : undefined}
        aria-controls={w.wallets.length > 1 ? listId : undefined}
        aria-busy={w.isConnecting}
      >
        {checking ? "Checking wallet…" : w.isConnecting ? "Connecting…" : label}
      </button>
      {none && !menu ? <p className="text-sm text-muted">No browser wallet found. Install MetaMask, Rabby or Binance Wallet.</p> : null}
      {open && w.wallets.length > 1 ? (
        <ul
          id={listId}
          aria-label="Choose a wallet"
          className={`m-0 flex list-none flex-col border-2 border-ink bg-paper p-0 ${
            menu ? "absolute right-0 top-full z-[var(--z-dropdown)] mt-2 w-72" : "w-full"
          }`}
        >
          {w.wallets.map((wallet) => (
            <li key={wallet.id} className="border-b border-rule last:border-b-0">
              <button
                type="button"
                className="flex min-h-11 w-full cursor-pointer items-center gap-3 px-4 text-left font-semibold text-ink hover:bg-paper-2 active:bg-paper-3"
                onClick={() => {
                  w.connect(wallet.id);
                  setOpen(false);
                }}
              >
                {wallet.icon ? (
                  <Image src={wallet.icon} alt="" width={24} height={24} unoptimized className="size-6 flex-none" />
                ) : (
                  <span aria-hidden="true" className="size-6 flex-none bg-paper-3" />
                )}
                <span className="flex-1">{wallet.name}</span>
                {w.pendingId === wallet.id ? <span className="text-sm font-normal text-muted">Connecting…</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
