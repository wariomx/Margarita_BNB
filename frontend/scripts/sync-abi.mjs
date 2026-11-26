import { readFileSync, writeFileSync } from "node:fs";

const src = new URL("../../smart-contracts/out/Margarita.sol/Margarita.json", import.meta.url);
const { abi } = JSON.parse(readFileSync(src, "utf8"));
const out =
  `export const margaritaAbi = ${JSON.stringify(abi, null, 2)} as const;\n`;
writeFileSync(new URL("../lib/margaritaAbi.ts", import.meta.url), out);
console.log(`wrote lib/margaritaAbi.ts (${abi.length} entries)`);
