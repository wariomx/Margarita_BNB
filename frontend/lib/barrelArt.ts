type Material = { face: string; side: string; sideLine: string; line: string; staves: string };

const MATERIALS: Record<0 | 1 | 2 | 3 | 4, Material> = {
  0: { face: "#E9C88C", side: "#E9C88C", sideLine: "#A16207", line: "#1F1A17", staves: "#1F1A17" },
  1: { face: "#F4F1EA", side: "#F4F1EA", sideLine: "#7A746B", line: "#1F1A17", staves: "#1F1A17" },
  2: { face: "#E9C88C", side: "#E9C88C", sideLine: "#A16207", line: "#1F1A17", staves: "#1F1A17" },
  3: { face: "#D9A24A", side: "#A16207", sideLine: "#7C2D12", line: "#1F1A17", staves: "#1F1A17" },
  4: { face: "#7C2D12", side: "#5C200C", sideLine: "#1F1A17", line: "#1F1A17", staves: "#E9C88C" },
};

export function barrelSvg(tier: 0 | 1 | 2 | 3 | 4, opts: { id: string; label?: string; size?: number } ) {
  const m = MATERIALS[tier];
  const w = opts.size ?? 240;
  const h = Math.round(w * 1.5);
  const pat = `shade-${opts.id}`;
  const a11y = opts.label
    ? `role="img" aria-label="${opts.label.replace(/"/g, "&quot;")}"`
    : `aria-hidden="true"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 300 450" ${a11y}><defs><pattern id="${pat}" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="${m.side}"/><rect width="1.6" height="5" fill="${m.sideLine}"/></pattern></defs><rect x="138" y="8" width="24" height="88" fill="${m.line}"/><path d="M40 120 L95 92 L205 92 L260 120 L205 148 L95 148 Z" fill="${m.face}" stroke="${m.line}" stroke-width="3"/><path d="M70 106 L230 106 M58 134 L242 134" stroke="${m.staves}" stroke-width="1"/><path d="M40 120 L95 148 L95 300 L40 272 Z" fill="url(#${pat})" stroke="${m.line}" stroke-width="3"/><path d="M205 148 L260 120 L260 272 L205 300 Z" fill="${m.face}" stroke="${m.line}" stroke-width="3"/><path d="M95 148 L205 148 L205 300 L95 300 Z" fill="${m.face}" stroke="${m.line}" stroke-width="3"/><path d="M58.3 129.3 L58.3 281.3 M223.3 138.7 L223.3 290.7 M131.7 148 L131.7 300 M76.7 138.7 L76.7 290.7 M241.7 129.3 L241.7 281.3 M168.3 148 L168.3 300" stroke="${m.staves}" stroke-width="1.1"/><path d="M40 134 L95 162 L205 162 L260 134 L260 144 L205 172 L95 172 L40 144 Z" fill="${m.line}"/><path d="M40 244 L95 272 L205 272 L260 244 L260 254 L205 282 L95 282 L40 254 Z" fill="${m.line}"/><path d="M40 272 L95 300 L205 300 L260 272 L150 440 Z" fill="${m.face}" stroke="${m.line}" stroke-width="3"/><path d="M95 300 L150 440 L205 300" fill="none" stroke="${m.line}" stroke-width="2"/></svg>`;
}
