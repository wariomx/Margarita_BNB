import Image from "next/image";
import { TIERS, TIER_IDS, type TierId } from "@/lib/contract";

export const POSTER: Record<TierId, string> = {
  1: "/assets/barrel/bottles/blanco.webp",
  2: "/assets/barrel/bottles/reposado.webp",
  3: "/assets/barrel/bottles/anejo.webp",
  4: "/assets/barrel/bottles/extra-anejo.webp",
};

export function Lineup({
  pick,
  waiting = false,
  showOdds = true,
  priority = false,
  className = "",
}: {
  pick?: TierId;
  waiting?: boolean;
  showOdds?: boolean;
  priority?: boolean;
  className?: string;
}) {
  return (
    <ul
      className={`lineup m-0 grid w-full list-none grid-cols-4 items-end gap-2 p-0 sm:gap-4 ${className}`}
      data-pick={pick ?? undefined}
      data-waiting={waiting && !pick ? "" : undefined}
      aria-label="The four tiers"
    >
      {TIER_IDS.map((id) => (
        <li key={id} className="lineup-item flex min-w-0 flex-col items-center gap-2" data-picked={pick === id ? "" : undefined}>
          <Image
            src={POSTER[id]}
            width={448}
            height={560}
            alt={`${TIERS[id].name} bottle`}
            priority={priority}
            sizes="(min-width: 64rem) 180px, 25vw"
            className="aspect-[4/5] w-full object-cover"
          />
          {showOdds ? (
            <span className="flex flex-col items-center text-center">
              <span className="whitespace-nowrap text-xs font-semibold sm:text-sm">{TIERS[id].name}</span>
              <span className="num text-lg">{TIERS[id].chance}</span>
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
