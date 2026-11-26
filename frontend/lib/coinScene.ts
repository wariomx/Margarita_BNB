import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type CoinStyle = { ticker: string; line: string; face: string; edge: string; ink: string };

export const COIN_STYLES: Record<string, CoinStyle> = {
  nvda: { ticker: "NVDAx", line: "Tokenized stock", face: "#4f8a1e", edge: "#2f5512", ink: "#f4f1ea" },
  tsla: { ticker: "TSLAx", line: "Tokenized stock", face: "#a8231d", edge: "#6b1410", ink: "#f4f1ea" },
  aapl: { ticker: "AAPLx", line: "Tokenized stock", face: "#8d939a", edge: "#4c5157", ink: "#1f1a17" },
  cake: { ticker: "CAKE", line: "BNB ecosystem", face: "#c98a3c", edge: "#7a4f1c", ink: "#1f1a17" },
};

function faceTexture(style: CoinStyle) {
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size * 0.4, size * 0.35, size * 0.05, size / 2, size / 2, size / 2);
  grad.addColorStop(0, style.face);
  grad.addColorStop(1, style.edge);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  g.strokeStyle = style.ink;
  g.globalAlpha = 0.55;
  g.lineWidth = 14;
  g.beginPath();
  g.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 4;
  g.beginPath();
  g.arc(size / 2, size / 2, size * 0.38, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = style.ink;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const fontSize = style.ticker.length > 4 ? 190 : 230;
  g.font = `800 ${fontSize}px system-ui, -apple-system, Helvetica, Arial, sans-serif`;
  g.fillText(style.ticker, size / 2, size * 0.47);
  g.font = `500 64px system-ui, -apple-system, Helvetica, Arial, sans-serif`;
  g.globalAlpha = 0.85;
  g.fillText(style.line, size / 2, size * 0.64);
  g.font = `500 46px system-ui, -apple-system, Helvetica, Arial, sans-serif`;
  g.fillText("Margarita test token", size / 2, size * 0.73);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.center.set(0.5, 0.5);
  t.rotation = Math.PI / 2;
  return t;
}

export type CoinScene = {
  setToken(key: string): void;
  setRunning(on: boolean): void;
  resize(w: number, h: number): void;
  snapshot(): string;
  dispose(): void;
};

export function createCoinScene(canvas: HTMLCanvasElement, width: number, height: number, opts: { still?: boolean } = {}): CoinScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04);
  room.dispose();
  pmrem.dispose();
  scene.environment = env.texture;
  scene.environmentIntensity = 0.9;
  const key = new THREE.DirectionalLight("#ffffff", 1.6);
  key.position.set(1.5, 2, 2.5);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 20);
  camera.position.set(0, 0.15, 3.2);
  camera.lookAt(0, 0, 0);

  const geo = new THREE.CylinderGeometry(0.62, 0.62, 0.1, 96, 1);
  geo.rotateX(Math.PI / 2);
  const edgeMat = new THREE.MeshStandardMaterial({ color: "#b9a37a", metalness: 0.9, roughness: 0.32 });
  const faceMat = new THREE.MeshStandardMaterial({ metalness: 0.55, roughness: 0.38 });
  const coin = new THREE.Mesh(geo, [edgeMat, faceMat, faceMat]);
  scene.add(coin);

  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = shadowCanvas.height = 128;
  const sg = shadowCanvas.getContext("2d")!;
  const sgr = sg.createRadialGradient(64, 64, 0, 64, 64, 64);
  sgr.addColorStop(0, "rgba(31,26,23,0.35)");
  sgr.addColorStop(1, "rgba(31,26,23,0)");
  sg.fillStyle = sgr;
  sg.fillRect(0, 0, 128, 128);
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
  const shadowGeo = new THREE.PlaneGeometry(1.4, 0.4);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.position.set(0, -0.86, 0);
  shadow.rotation.x = -Math.PI / 2.2;
  scene.add(shadow);

  let tex: THREE.Texture | undefined;
  let raf = 0;
  let running = !opts.still;
  let t0 = performance.now();
  let spinFrom = 0;

  function pose(t: number) {
    const s = t / 1000;
    const settle = Math.min(1, (t - spinFrom) / 900);
    const kick = (1 - settle) * (1 - settle) * Math.PI * 2;
    coin.rotation.y = opts.still ? -0.45 : s * 1.1 + kick;
    coin.rotation.x = opts.still ? 0.12 : 0.12 + Math.sin(s * 1.3) * 0.08;
    coin.position.y = opts.still ? 0 : Math.sin(s * 1.6) * 0.05;
  }

  function frame(now: number) {
    raf = 0;
    pose(now - t0);
    renderer.render(scene, camera);
    if (running && !document.hidden) raf = requestAnimationFrame(frame);
  }

  function schedule() {
    if (!raf && running && !document.hidden) raf = requestAnimationFrame(frame);
  }

  const onVis = () => schedule();
  document.addEventListener("visibilitychange", onVis);

  const api: CoinScene = {
    setToken(k) {
      const style = COIN_STYLES[k] ?? COIN_STYLES.cake;
      tex?.dispose();
      tex = faceTexture(style);
      faceMat.map = tex;
      faceMat.needsUpdate = true;
      edgeMat.color.set(style.edge).lerp(new THREE.Color("#c9b383"), 0.55);
      spinFrom = performance.now() - t0;
      pose(performance.now() - t0);
      renderer.render(scene, camera);
      schedule();
    },
    setRunning(on) {
      running = on && !opts.still;
      if (!running && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      schedule();
    },
    resize(w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    },
    snapshot() {
      renderer.render(scene, camera);
      return canvas.toDataURL("image/png");
    },
    dispose() {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      tex?.dispose();
      for (const x of [geo, shadowGeo]) x.dispose();
      for (const m of [edgeMat, faceMat, shadowMat]) m.dispose();
      shadowTex.dispose();
      env.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
  t0 = performance.now();
  return api;
}
