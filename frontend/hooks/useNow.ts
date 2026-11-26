"use client";

import { useSyncExternalStore } from "react";
import { useBlock } from "wagmi";
import { CHAIN } from "@/lib/contract";

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let second = 0;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    second = Math.floor(Date.now() / 1000);
    timer = setInterval(() => {
      second = Math.floor(Date.now() / 1000);
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function useNow() {
  const local = useSyncExternalStore<number | null>(
    subscribe,
    () => second || Math.floor(Date.now() / 1000),
    () => null,
  );
  const block = useBlock({ chainId: CHAIN.id, query: { refetchInterval: 15_000 } });
  const offset = block.data
    ? Math.max(0, Number(block.data.timestamp) - Math.floor(block.dataUpdatedAt / 1000))
    : 0;
  return local === null ? null : local + offset;
}
