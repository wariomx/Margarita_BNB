import { TIERS, asTier } from "@/lib/contract";

export async function GET(request: Request, ctx: RouteContext<"/metadata/[file]">) {
  const { file } = await ctx.params;
  const m = /^([0-9a-fA-F]{64}|\d{1,2})\.json$/.exec(file);
  if (!m) return Response.json({ error: "not found" }, { status: 404 });

  const raw = m[1].length === 64 ? Number.parseInt(m[1], 16) : Number(m[1]);
  let tier;
  try {
    tier = asTier(raw);
  } catch {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const t = TIERS[tier];
  const origin = new URL(request.url).origin;
  return Response.json(
    {
      name: `Agave Barrel · ${t.name}`,
      description:
        tier === 4
          ? "Extra Añejo from the Agave Barrel testnet demo. Can be redeemed for a bottle once delivery is set up."
          : `${t.name} from the Agave Barrel testnet demo. Age it in Margarita to reach the next tier.`,
      image: `${origin}/art/${tier}`,
      attributes: [
        { trait_type: "Tier", value: t.name },
        { trait_type: "Level", value: tier, display_type: "number" },
        { trait_type: "Chance", value: t.chance },
      ],
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
