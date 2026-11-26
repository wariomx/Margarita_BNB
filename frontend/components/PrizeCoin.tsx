"use client";

import { useEffect, useRef, useState } from "react";
import type { CoinScene } from "@/lib/coinScene";
import { useReducedMotion } from "./PullStage";

export function PrizeCoin({ token, size, still = false, label }: { token: string; size: number; still?: boolean; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CoinScene | null>(null);
  const reduce = useReducedMotion();
  const frozen = still || reduce;
  const [img, setImg] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (img && frozen) return;
    let cancelled = false;
    import("@/lib/coinScene")
      .then(({ createCoinScene }) => {
        if (cancelled || !canvasRef.current) return;
        const scene = createCoinScene(canvasRef.current, size, size, { still: frozen });
        scene.setToken(token);
        if (frozen) {
          setImg(scene.snapshot());
          scene.dispose();
          return;
        }
        sceneRef.current = scene;
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [frozen, size, token, img]);

  if (failed) return <span aria-hidden="true" style={{ width: size, height: size }} className="inline-block rounded-full bg-paper-3" />;
  if (frozen && img) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={img} width={size} height={size} alt={label} style={{ width: size, height: size }} />
    );
  }
  return <canvas ref={canvasRef} width={size} height={size} role="img" aria-label={label} style={{ width: size, height: size }} />;
}
