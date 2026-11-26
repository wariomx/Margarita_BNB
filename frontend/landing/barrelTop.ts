import type { BarrelScene } from "../lib/barrelScene";

const loadScene = () => import("../lib/barrelScene");

const WOODS: Record<string, 1 | 2 | 3 | 4> = { blanco: 1, reposado: 2, anejo: 3, "extra-anejo": 4 };

function webglOk() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function mount(host: HTMLElement) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  let scene: BarrelScene | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let visible = false;
  let paused = false;
  let wood = WOODS[host.dataset.wood ?? "reposado"] ?? 2;

  const pauseBtn = document.createElement("button");
  pauseBtn.type = "button";
  pauseBtn.className = "loop-pause";
  pauseBtn.style.display = "none";
  const setPauseLabel = () => {
    pauseBtn.setAttribute("aria-label", paused ? "Play the barrel" : "Pause the barrel");
    pauseBtn.setAttribute("aria-pressed", String(paused));
    pauseBtn.classList.toggle("is-paused", paused);
    pauseBtn.innerHTML = paused
      ? '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor"/></svg>';
  };
  setPauseLabel();
  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    setPauseLabel();
    sync();
  });
  host.append(pauseBtn);

  const sync = () => scene?.setRunning(visible && !paused);

  let loading = false;
  let woods: typeof import("../lib/barrelScene").TIER_WOOD | undefined;

  async function start() {
    if (scene || loading || reduce.matches || !webglOk()) return;
    loading = true;
    const mod = await loadScene().catch(() => undefined);
    if (!mod || scene || reduce.matches) {
      loading = false;
      return;
    }
    woods = mod.TIER_WOOD;
    canvas = document.createElement("canvas");
    canvas.className = "barrel-top__canvas";
    canvas.setAttribute("aria-hidden", "true");
    host.append(canvas);
    const { width, height } = host.getBoundingClientRect();
    let made: BarrelScene;
    try {
      made = await mod.createBarrelScene(canvas, Math.max(1, width), Math.max(1, height));
    } catch {
      canvas.remove();
      canvas = undefined;
      loading = false;
      return;
    }
    loading = false;
    scene = made;
    scene.setWood(woods[wood], true);
    scene.play();
    sync();
    host.classList.add("is-live");
    pauseBtn.style.display = "";

    new ResizeObserver(([e]) => {
      const r = e.contentRect;
      if (r.width && r.height) scene?.resize(r.width, r.height);
    }).observe(host);

    let lastX = 0;
    let lastT = 0;
    let moved = 0;
    canvas.addEventListener("pointerdown", (e) => {
      canvas!.setPointerCapture(e.pointerId);
      lastX = e.clientX;
      lastT = e.timeStamp;
      moved = 0;
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!canvas!.hasPointerCapture(e.pointerId)) return;
      const dx = e.clientX - lastX;
      const dt = Math.max(8, e.timeStamp - lastT);
      moved += Math.abs(dx);
      lastX = e.clientX;
      lastT = e.timeStamp;
      scene?.kick(Math.max(-3, Math.min(3, (dx / dt) * 2.2)));
    });
    canvas.addEventListener("pointerup", (e) => {
      if (moved < 6) scene?.kick(8);
      canvas!.releasePointerCapture(e.pointerId);
    });
  }

  reduce.addEventListener("change", () => {
    if (reduce.matches && scene) {
      scene.dispose();
      scene = undefined;
      canvas?.remove();
      canvas = undefined;
      host.classList.remove("is-live");
      pauseBtn.style.display = "none";
    } else if (!reduce.matches && visible) void start();
  });

  new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting;
      if (visible) void start();
      sync();
    },
    { rootMargin: "200px 0px" },
  ).observe(host);

  for (const btn of document.querySelectorAll<HTMLButtonElement>(`[data-barrel-wood="#${host.id}"]`)) {
    btn.addEventListener("click", () => {
      const next = WOODS[btn.value];
      if (!next) return;
      wood = next;
      for (const b of document.querySelectorAll<HTMLButtonElement>(`[data-barrel-wood="#${host.id}"]`)) {
        b.setAttribute("aria-pressed", String(b === btn));
      }
      host.dataset.wood = btn.value;
      const poster = host.querySelector<HTMLImageElement>(".barrel-top__poster");
      if (poster?.dataset.src) poster.src = poster.dataset.src.replace("{wood}", btn.value);
      if (woods) scene?.setWood(woods[wood]);
      scene?.kick(5);
    });
  }
}

for (const host of document.querySelectorAll<HTMLElement>("[data-barrel-top]")) mount(host);
