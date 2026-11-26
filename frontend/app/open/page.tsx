import { MarketPanel } from "@/components/MarketPanel";
import { OddsTable } from "@/components/OddsTable";
import { PullPanel } from "@/components/PullPanel";

const STEPS = [
  { title: "Pull.", body: "Pay the exact price. The roll arrives in a second transaction from Chainlink." },
  { title: "Age.", body: "Put a token in a barrel. It comes out one tier higher after a few minutes." },
  { title: "Redeem.", body: "Burn an Extra Añejo to claim a bottle." },
] as const;

export default function Home() {
  return (
    <div className="flex flex-col gap-16">
      <header className="grid items-end gap-x-12 gap-y-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <h1 className="max-w-[16ch] text-4xl sm:text-5xl">Open a barrel. The chain picks what’s inside.</h1>
        <p className="max-w-[52ch] text-lg text-ink-2">
          Each pull is rolled by Chainlink VRF. You get one of four tiers, and you can age it up a tier while you wait. An
          Extra Añejo can be redeemed for a real bottle from the barrel.
        </p>
      </header>

      <PullPanel />

      <MarketPanel />

      <section aria-labelledby="steps-title" className="flex flex-col gap-6">
        <h2 id="steps-title" className="sr-only">
          How it works
        </h2>
        <ol className="m-0 grid list-none gap-6 p-0 sm:grid-cols-3 sm:gap-8">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4 border-t-2 border-ink pt-4">
              <span className="badge">{i + 1}</span>
              <span>
                <b>{s.title}</b> {s.body}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="odds-title" className="grid gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <div className="flex flex-col gap-3">
          <h2 id="odds-title" className="text-3xl">
            What can come out
          </h2>
          <p className="text-muted">
            The odds are fixed in the contract. They don’t change with stock, and the reveal never hints at a tier before it
            lands.
          </p>
        </div>
        <OddsTable />
      </section>

      <section aria-labelledby="proof-title" className="panel grid gap-8 p-8 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 id="proof-title" className="text-xl">
            How the draw is checked
          </h2>
          <p>
            Chainlink VRF v2.5 returns a random word with a proof the coordinator verifies on-chain. The contract reduces it
            to a roll from 0 to 9 999 without modulo bias, then maps the roll to a tier.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="font-body text-sm font-semibold tracking-normal text-muted">Check any reveal yourself</h3>
          <code className="font-mono text-sm">PullRevealed(player, requestId, tier, roll)</code>
          <code className="font-mono text-sm">rollToTier(roll) → tier</code>
          <p className="text-sm text-muted">Every reveal in My cellar runs this check for you.</p>
        </div>
      </section>
    </div>
  );
}
