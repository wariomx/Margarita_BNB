export async function getLogsChunked<T>(
  fetch: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>,
  fromBlock: bigint,
  toBlock: bigint,
  step = 5_000n,
): Promise<T[]> {
  const out: T[] = [];
  let start = fromBlock;
  let size = step;
  while (start <= toBlock) {
    const end = start + size - 1n > toBlock ? toBlock : start + size - 1n;
    try {
      out.push(...(await fetch(start, end)));
      start = end + 1n;
      size = step;
    } catch (err) {
      if (size <= 100n) throw err;
      size = size / 2n;
    }
  }
  return out;
}
