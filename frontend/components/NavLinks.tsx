"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/open", label: "Open a barrel" },
  { href: "/cellar", label: "My cellar" },
] as const;

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="order-last flex w-full flex-wrap gap-1 sm:order-none sm:w-auto sm:flex-auto">
      {LINKS.map((l) => {
        const current = pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={current ? "page" : undefined}
            className={`inline-flex min-h-11 items-center px-3 font-semibold text-ink no-underline hover:bg-paper-2 hover:text-ink active:bg-paper-3 active:text-ink ${
              current ? "shadow-[inset_0_-3px_0_var(--color-ink)]" : ""
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
