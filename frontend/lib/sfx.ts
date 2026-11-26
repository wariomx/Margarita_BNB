export type Cue =
  | "tap"
  | "throw"
  | "riser"
  | "creak"
  | "burst"
  | "chime1"
  | "chime2"
  | "chime3"
  | "chime4"
  | "card";

const FILES: Record<Cue | "spin", string> = {
  tap: "ui_tap",
  throw: "throw",
  spin: "spin_loop",
  riser: "riser",
  creak: "creak",
  burst: "burst",
  chime1: "chime_blanco",
  chime2: "chime_reposado",
  chime3: "chime_anejo",
  chime4: "fanfare_extra",
  card: "card_in",
};

const VOLUME: Partial<Record<Cue | "spin", number>> = { spin: 0.35, tap: 0.6, card: 0.5, riser: 0.7 };
const MUTE_KEY = "margarita:muted";

let ctx: AudioContext | undefined;
let master: GainNode | undefined;
const buffers = new Map<string, AudioBuffer>();
let loading: Promise<void> | undefined;
let loop: { src: AudioBufferSourceNode; gain: GainNode } | undefined;
const listeners = new Set<(muted: boolean) => void>();

export function isMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {}
  if (master) master.gain.value = muted ? 0 : 1;
  for (const l of listeners) l(muted);
}

export function onMuteChange(fn: (muted: boolean) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function unlock() {
  if (typeof window === "undefined") return;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = isMuted() ? 0 : 1;
    master.connect(ctx.destination);
    document.addEventListener("visibilitychange", () => {
      if (!ctx) return;
      if (document.hidden) void ctx.suspend();
      else void ctx.resume();
    });
  }
  if (ctx.state === "suspended" && !document.hidden) void ctx.resume();
}

export function preload() {
  if (!ctx || loading) return loading;
  const c = ctx;
  loading = Promise.all(
    Object.values(FILES).map(async (name) => {
      try {
        const res = await fetch(`/assets/sfx/${name}.mp3`);
        buffers.set(name, await c.decodeAudioData(await res.arrayBuffer()));
      } catch {}
    }),
  ).then(() => undefined);
  return loading;
}

export function play(cue: Cue) {
  if (!ctx || !master) return;
  const buf = buffers.get(FILES[cue]);
  if (!buf) return;
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = VOLUME[cue] ?? 1;
  src.buffer = buf;
  src.connect(gain).connect(master);
  src.start();
}

export function spin(rate: number) {
  if (!ctx || !master) return;
  if (rate <= 0.05) {
    stopSpin();
    return;
  }
  if (!loop) {
    const buf = buffers.get(FILES.spin);
    if (!buf) return;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buf;
    src.loop = true;
    src.connect(gain).connect(master);
    gain.gain.value = 0;
    src.start();
    loop = { src, gain };
  }
  const t = ctx.currentTime;
  loop.src.playbackRate.setTargetAtTime(0.6 + 0.6 * Math.min(1.6, rate), t, 0.05);
  loop.gain.gain.setTargetAtTime((VOLUME.spin ?? 1) * Math.min(1, rate), t, 0.08);
}

export function stopSpin() {
  if (!loop || !ctx) return;
  const l = loop;
  loop = undefined;
  l.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  setTimeout(() => {
    try {
      l.src.stop();
    } catch {}
  }, 300);
}
