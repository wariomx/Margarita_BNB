import { formatEther } from "viem";

export function formatNative(wei: bigint, unit: string) {
  return `${formatEther(wei)} ${unit}`;
}

export function shortHex(value: string | bigint, head = 6, tail = 4) {
  const s = typeof value === "bigint" ? `0x${value.toString(16)}` : value;
  return s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;
}

export function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function formatMinutes(totalSeconds: number) {
  const m = Math.max(0, Math.ceil(totalSeconds / 60));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function formatClock(unixSeconds: number | bigint) {
  return new Date(Number(unixSeconds) * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatGroup(n: number) {
  return n.toLocaleString("en-US").replace(/,/g, " ");
}
