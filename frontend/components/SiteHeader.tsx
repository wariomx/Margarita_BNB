import Image from "next/image";
import { CHAIN } from "@/lib/contract";
import { NavLinks } from "./NavLinks";
import { WalletButton } from "./WalletButton";

export function SiteHeader() {
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b-2 border-ink px-5 py-4 sm:px-10">
      <a href="/" className="flex min-h-11 items-center gap-2 text-ink no-underline hover:text-ink active:text-ink">
        <Image src="/assets/logo/margarita-mark.svg" width={19} height={26} alt="" priority />
        <span className="font-display text-2xl font-extrabold leading-none tracking-tight">Margarita</span>
      </a>
      <NavLinks />
      <span className="chip ml-auto hidden sm:inline-flex">
        <span aria-hidden="true" className="size-2.5 bg-accent" />
        {CHAIN.name} ({CHAIN.id})
      </span>
      <div className="ml-auto sm:ml-0">
        <WalletButton />
      </div>
    </header>
  );
}
