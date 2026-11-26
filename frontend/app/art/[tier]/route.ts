import { asTier } from "@/lib/contract";
import { barrelSvg } from "@/lib/barrelArt";

export async function GET(_request: Request, ctx: RouteContext<"/art/[tier]">) {
  const { tier: raw } = await ctx.params;
  let tier: 0 | 1 | 2 | 3 | 4;
  try {
    tier = raw === "0" ? 0 : asTier(Number(raw));
  } catch {
    return new Response("not found", { status: 404 });
  }
  const barrel = barrelSvg(tier, { id: `art${tier}`, size: 400 }).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 600 600"><rect width="600" height="600" fill="#F4F1EA"/><g transform="translate(150 30) scale(1)">${barrel}</g></svg>`;
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
  });
}
