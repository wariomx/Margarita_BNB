"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { TierId } from "@/lib/contract";
import type { BarrelScene } from "@/lib/barrelScene";
import { BarrelArt } from "./BarrelArt";

const W = 280;
const H = 300;

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function useReducedMotion() {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
}

export function PullStage({
  tier,
  spinning,
  onDone,
}: {
  tier?: TierId;
  spinning: boolean;
  onDone: (still?: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<BarrelScene | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    let cancelled = false;
    import("@/lib/barrelScene")
      .then(async ({ createBarrelScene }) => {
        if (cancelled || !canvasRef.current) return;
        const scene = await createBarrelScene(canvasRef.current, W, H);
        if (cancelled) {
          scene.dispose();
          return;
        }
        sceneRef.current = scene;
        scene.launch();
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  const revealed = useRef(false);
  useEffect(() => {
    if (status === "failed") {
      if (tier !== undefined && !revealed.current) {
        revealed.current = true;
        onDoneRef.current(undefined);
      }
      return;
    }
    const scene = sceneRef.current;
    if (status !== "ready" || !scene) return;
    if (tier === undefined) {
      if (!spinning) scene.settle();
      return;
    }
    if (revealed.current) return;
    revealed.current = true;
    setPlaying(true);
    scene.resize(window.innerWidth, window.innerHeight);
    scene.playReveal(tier, () => {
      const s = sceneRef.current;
      s?.resize(W, H);
      const still = s?.snapshot();
      setPlaying(false);
      setFinished(true);
      onDoneRef.current(still);
    });
  }, [status, tier, spinning]);

  const canSkip = tier !== undefined && !finished;
  const skip = () => {
    if (playing) {
      sceneRef.current?.skip();
      return;
    }
    revealed.current = true;
    setFinished(true);
    onDoneRef.current(undefined);
  };
  const skipRef = useRef(skip);
  useEffect(() => {
    skipRef.current = skip;
  });

  useEffect(() => {
    if (!canSkip) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skipRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canSkip]);

  useEffect(() => {
    if (!playing) return;
    const onResize = () => sceneRef.current?.resize(window.innerWidth, window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [playing]);

  if (status === "failed") {
    return tier === undefined ? (
      <BarrelArt id="drawing" size={150} label="Your barrel, waiting for the roll" />
    ) : null;
  }

  return (
    <div className="flex flex-col items-center" style={{ width: W, minHeight: playing ? H : undefined }}>
      <div
        className={playing ? "fixed inset-0 z-50 flex items-center justify-center bg-paper/95 backdrop-blur-sm" : "flex flex-col items-center"}
      >
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={playing ? { width: "100vw", height: "100dvh" } : { width: W, height: H }}
        role="img"
        aria-label={tier !== undefined ? "Your barrel is opening" : spinning ? "Your barrel is spinning while the roll is drawn" : "Your barrel stands still, waiting for the roll"}
        onClick={canSkip ? skip : undefined}
        className={canSkip ? "cursor-pointer" : undefined}
      />
      {canSkip ? (
        <button
          type="button"
          className={`btn btn-secondary min-h-[44px] px-4 text-sm ${playing ? "fixed bottom-6 right-6 z-50" : "self-end"}`}
          onClick={skip}
        >
          Skip
        </button>
      ) : null}
      </div>
    </div>
  );
}
