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

function idle() {
  return new Promise<void>((resolve) => {
    const go = () => ("requestIdleCallback" in window ? requestIdleCallback(() => resolve(), { timeout: 2000 }) : setTimeout(resolve, 300));
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
  });
}

function anchor(host: HTMLElement, img: HTMLImageElement) {
  const [ax, ay, span] = (host.dataset.anchor ?? "").split(",").map(Number);
  const place = () => {
    const nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw || !nh) return;
    const r = img.getBoundingClientRect();
    const box = (host.offsetParent as HTMLElement | null)?.getBoundingClientRect() ?? r;
    const sc = Math.max(r.width / nw, r.height / nh);
    const [px, py] = getComputedStyle(img).objectPosition.split(" ").map(parseFloat);
    const ox = ((r.width - nw * sc) * px) / 100;
    const oy = ((r.height - nh * sc) * py) / 100;
    const size = (span * nh * sc) / 0.725;
    host.style.width = `${size}px`;
    host.style.height = `${size}px`;
    host.style.left = `${r.left - box.left + ox + ax * nw * sc - size / 2}px`;
    host.style.top = `${r.top - box.top + oy + ay * nh * sc - size * 0.915}px`;
  };
  if (img.complete) place();
  else img.addEventListener("load", place, { once: true });
  new ResizeObserver(place).observe(img);
}

function plateIn(host: HTMLElement, bg: HTMLImageElement) {
  const stem = host.dataset.plate;
  if (!stem) return;
  const plate = bg.cloneNode() as HTMLImageElement;
  const from = bg.currentSrc.match(/[^/]*-\d+\.jpg$/)?.[0]?.replace(/-\d+\.jpg$/, "") ?? "";
  if (!from) return;
  const swap = (v: string | null) => v && v.split(from).join(stem.split("/").pop()!);
  plate.removeAttribute("fetchpriority");
  plate.setAttribute("srcset", swap(bg.getAttribute("srcset")) ?? "");
  plate.src = swap(bg.getAttribute("src")) ?? "";
  plate.alt = "";
  plate.classList.add("hero__plate");
  plate.decode().then(() => {
    bg.after(plate);
    requestAnimationFrame(() => plate.classList.add("is-in"));
  }).catch(() => {});
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

  const heroBg = host.dataset.anchor ? host.parentElement?.querySelector<HTMLImageElement>(".hero__bg") ?? undefined : undefined;
  if (heroBg) anchor(host, heroBg);

  async function start() {
    if (scene || loading || reduce.matches || !webglOk()) return;
    loading = true;
    if (host.dataset.defer !== undefined) await idle();
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
      made = await mod.createBarrelScene(canvas, Math.max(1, width), Math.max(1, height), undefined, host.dataset.light === "dusk" ? "dusk" : "studio");
    } catch {
      canvas.remove();
      canvas = undefined;
      loading = false;
      return;
    }
    loading = false;
    scene = made;
    if (heroBg) plateIn(host, heroBg);
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
