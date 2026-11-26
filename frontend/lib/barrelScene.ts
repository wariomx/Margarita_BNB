import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

type Tier = 1 | 2 | 3 | 4;

const RAW = { staves: "#a39a8c" };
export const TIER_WOOD: Record<Tier, { staves: string; head: string; spark: string }> = {
  1: { staves: "#efe6d2", head: "#ddd0b6", spark: "#fff6dc" },
  2: { staves: "#d5a865", head: "#c4964f", spark: "#ffd27a" },
  3: { staves: "#a86a2a", head: "#955b22", spark: "#ffb347" },
  4: { staves: "#6e2a12", head: "#5c220e", spark: "#ff8a3d" },
};

export const LAUNCH_MS = 1100;
export const REVEAL_MS = 4750;
const BOTTLE_H = 0.7;
const LIQUID: Record<Tier, string | null> = { 1: "#eef1ec", 2: "#e0a83c", 3: "#b3621a", 4: null };
export const BOTTLE_URL: Record<Tier, string> = {
  1: "/assets/barrel/bottle.glb",
  2: "/assets/barrel/bottle.glb",
  3: "/assets/barrel/bottle.glb",
  4: "/assets/barrel/bottle-extra.glb",
};
const SPIN_UP = 600;
const TINT_FROM = 850;
const TINT_TO = 1250;
const SLOW_FROM = 1300;
const LAND = 2350;
const BURST = 3050;
const XA_EXTRA = 700;
const MAX_SPIN = 26;
const DRAW_SPIN = 15;
const PLAY_SPIN = 9;
const FRONT = -0.5;
const STAVE = (Math.PI * 2) / 16;

export const MODEL_URL = "/assets/barrel/barrel-top.glb";
const MODEL_H = 0.86;
const TINT_GAIN = 2.1;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOutCubic = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const easeInOut = (x: number) => (x = clamp01(x)) * x * (3 - 2 * x);

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(31,26,23,0.55)");
  grad.addColorStop(1, "rgba(31,26,23,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function sparkTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.7)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export type BarrelScene = {
  launch(): void;
  settle(): void;
  playReveal(tier: Tier, onEnd: () => void): void;
  play(): void;
  kick(dw: number): void;
  setWood(wood: { staves: string; head: string }, instant?: boolean): void;
  setRunning(on: boolean): void;
  resize(width: number, height: number): void;
  skip(): void;
  snapshot(): string;
  dispose(): void;
};

export async function createBarrelScene(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  modelUrl = MODEL_URL,
  light: "studio" | "dusk" = "studio",
): Promise<BarrelScene> {
  const dusk = light === "dusk";
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = dusk ? 0.9 : 1.05;
  let shaderFailed = false;
  renderer.debug.onShaderError = () => {
    shaderFailed = true;
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 20);
  camera.position.set(0, 0.74, 2.1);
  camera.lookAt(0, 0.49, 0);

  scene.add(dusk ? new THREE.HemisphereLight("#5a6fae", "#7a3b1c", 1.1) : new THREE.HemisphereLight("#fff4e0", "#5a4a3a", 1.4));
  const key = dusk ? new THREE.DirectionalLight("#ffb466", 3.4) : new THREE.DirectionalLight("#ffffff", 2.6);
  if (dusk) key.position.set(2.6, 0.7, -0.6);
  else key.position.set(1.4, 2.2, 1.6);
  scene.add(key);
  const rim = dusk ? new THREE.DirectionalLight("#8fa4e0", 0.9) : new THREE.DirectionalLight("#cfe0ff", 1.4);
  if (dusk) rim.position.set(-1.6, 1.6, 1.4);
  else rim.position.set(-1.8, 1.0, -1.4);
  scene.add(rim);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envTarget = pmrem.fromScene(room, 0.04);
  room.dispose();
  pmrem.dispose();
  scene.environment = envTarget.texture;
  scene.environmentIntensity = dusk ? 0.3 : 0.85;

  const pivot = new THREE.Group();
  const spinner = new THREE.Group();
  pivot.add(spinner);
  scene.add(pivot);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const model = (await loader.loadAsync(modelUrl)).scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const fit = MODEL_H / size.y;
  model.scale.setScalar(fit);
  model.position.set(-centre.x * fit, -box.min.y * fit, -centre.z * fit);
  spinner.add(model);

  const tint = { value: new THREE.Color(RAW.staves) };
  const modelGeos: THREE.BufferGeometry[] = [];
  const modelMats: THREE.Material[] = [];
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    modelGeos.push(mesh.geometry);
    const mat = mesh.material as THREE.MeshStandardMaterial;
    modelMats.push(mat);
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTint = tint;
      sh.fragmentShader =
        "uniform vec3 uTint;\n" +
        sh.fragmentShader.replace(
          "#include <map_fragment>",
          `#include <map_fragment>
          diffuseColor.rgb = uTint * dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)) * ${TINT_GAIN.toFixed(2)};`,
        );
    };
  });

  const glow = new THREE.PointLight("#ffd27a", 0, 1.4, 1.6);
  glow.position.set(0, MODEL_H + 0.05, 0);
  spinner.add(glow);

  const shadowMap = shadowTexture();
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false });
  const shadowGeo = new THREE.PlaneGeometry(0.9, 0.9);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.001;
  scene.add(shadow);

  const N = 120;
  const r = rng(42);
  const dirs = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = r() * Math.PI * 2;
    const up = 0.9 + r() * 1.1;
    const out = 0.35 + r() * 0.7;
    dirs.set([Math.cos(a) * out, up, Math.sin(a) * out], i * 3);
  }
  const sparkPos = new Float32Array(N * 3);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  const sparkMap = sparkTexture();
  const sparkMat = new THREE.PointsMaterial({
    map: sparkMap,
    size: 0.085,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: "#ffd27a",
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.visible = false;
  scene.add(sparks);

  const bottleGroup = new THREE.Group();
  bottleGroup.visible = false;
  scene.add(bottleGroup);
  const bottleGeos: THREE.BufferGeometry[] = [];
  const bottleMats: THREE.Material[] = [];
  const bottleCache = new Map<string, Promise<THREE.Object3D>>();
  const loadBottle = (tier: Tier) => {
    const url = BOTTLE_URL[tier];
    let base = bottleCache.get(url);
    if (!base) {
      base = loader.loadAsync(url).then((g) => g.scene);
      bottleCache.set(url, base);
    }
    return base.then((src) => {
      const obj = src.clone(true);
      const bb = new THREE.Box3().setFromObject(obj);
      const sz = bb.getSize(new THREE.Vector3());
      const c = bb.getCenter(new THREE.Vector3());
      const k = BOTTLE_H / sz.y;
      obj.scale.setScalar(k);
      obj.position.set(-c.x * k, -bb.min.y * k, -c.z * k);
      const holder = new THREE.Group();
      holder.add(obj);
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const orig = mesh.material as THREE.MeshStandardMaterial;
        const glass = new THREE.MeshPhysicalMaterial({
          map: orig.map,
          normalMap: orig.normalMap,
          transmission: 1,
          roughness: 0.05,
          metalness: 0,
          thickness: 0.05,
          ior: 1.45,
        });
        glass.onBeforeCompile = (sh) => {
          sh.fragmentShader = sh.fragmentShader
            .replace(
              "#include <map_fragment>",
              `#include <map_fragment>
              float gmx = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
              float gmn = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
              float glassMask = smoothstep(0.62, 0.75, gmx) * (1.0 - smoothstep(0.08, 0.16, gmx - gmn));
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), glassMask);`,
            )
            .replace(
              "#include <lights_physical_fragment>",
              `#include <lights_physical_fragment>
              material.transmission *= glassMask;`,
            );
        };
        mesh.material = glass;
        bottleMats.push(glass);
        bottleGeos.push(mesh.geometry);
        const liquid = LIQUID[tier];
        if (!liquid) return;
        const lb = new THREE.Box3().setFromObject(mesh);
        const lh = lb.max.y - lb.min.y;
        const fill = new THREE.MeshPhysicalMaterial({
          color: liquid,
          roughness: 0.08,
          metalness: 0,
          clearcoat: 1,
          clearcoatRoughness: 0.05,
          emissive: liquid,
          emissiveIntensity: tier === 1 ? 0.05 : 0.18,
          transparent: tier === 1,
          opacity: tier === 1 ? 0.35 : 1,
          clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)],
        });
        bottleMats.push(fill);
        const inner = new THREE.Mesh(mesh.geometry, fill);
        inner.position.copy(mesh.position);
        inner.quaternion.copy(mesh.quaternion);
        inner.scale.copy(mesh.scale).multiplyScalar(0.9);
        inner.position.y += lh * 0.012;
        mesh.parent!.add(inner);
        inner.onBeforeRender = () => {
          const top = new THREE.Box3().setFromObject(holder);
          fill.clippingPlanes![0].constant = top.min.y + (top.max.y - top.min.y) * 0.55;
        };
      });
      return holder;
    });
  };
  let bottle: THREE.Object3D | undefined;

  const SHARDS = 18;
  const shardGeo = new THREE.BoxGeometry(0.035, 0.17, 0.012);
  const shardMat = new THREE.MeshStandardMaterial({ color: "#d5a865", roughness: 0.7 });
  const shards: THREE.Mesh[] = [];
  const shardDir: number[][] = [];
  for (let i = 0; i < SHARDS; i++) {
    const m = new THREE.Mesh(shardGeo, shardMat);
    m.visible = false;
    scene.add(m);
    shards.push(m);
    const a = (i / SHARDS) * Math.PI * 2 + r() * 0.3;
    shardDir.push([a, 0.3 + r() * 0.35, 0.7 + r() * 0.8, 1.2 + r() * 1.4, r() * 6 - 3]);
  }
  renderer.localClippingEnabled = true;
  const baseExposure = renderer.toneMappingExposure;
  const crackWhite = new THREE.Color("#fff6e8");
  let revealTier: Tier = 1;
  let burstAt = BURST;
  let revealLen = REVEAL_MS;

  const raw = { s: new THREE.Color(RAW.staves) };
  const from = { s: new THREE.Color() };
  const target = { s: new THREE.Color() };
  tint.value.copy(raw.s);

  type Mode = "rest" | "launch" | "spin" | "settle" | "reveal" | "play";
  let mode: Mode = "rest";
  let t = 0;
  let angle = FRONT;
  let w = 0;
  let tilt = 0;
  let prec = 0;
  let y = 0;
  let vy = 0;
  let squash = 0;
  let woodK = 1;
  let revealW0 = 0;
  let revealTilt0 = 0;
  let slowA0 = 0;
  let slowTarget = 0;
  let queued: { tier: Tier; onEnd: () => void } | undefined;
  let endCb: (() => void) | undefined;

  let raf = 0;
  let running = true;
  let last = 0;

  function resetLid() {
    glow.intensity = 0;
    sparks.visible = false;
    for (const sh of shards) sh.visible = false;
    renderer.toneMappingExposure = baseExposure;
    for (const m of modelMats) (m as THREE.MeshStandardMaterial).emissiveIntensity = 0;
  }

  function showBarrel() {
    spinner.visible = true;
    bottleGroup.visible = false;
    shadow.visible = true;
  }

  function step(dt: number) {
    const ms = dt * 1000;
    t += ms;

    if (mode === "launch") {
      vy -= 9.8 * 0.55 * dt;
      y += vy * dt;
      if (y <= 0) {
        y = 0;
        if (vy < -0.35) squash = Math.min(0.09, -vy * 0.09);
        vy = vy < -0.35 ? -vy * 0.38 : 0;
      }
      w += (DRAW_SPIN - w) * Math.min(1, dt * 3.2);
      tilt += (0.09 - tilt) * Math.min(1, dt * 2.2);
      if (t >= LAUNCH_MS) {
        y = 0;
        vy = 0;
        if (queued) {
          const q = queued;
          queued = undefined;
          beginReveal(q.tier, q.onEnd);
        } else enter("spin");
      }
    } else if (mode === "spin") {
      w += (DRAW_SPIN - w) * Math.min(1, dt * 2);
      tilt += (0.09 - tilt) * Math.min(1, dt * 2);
    } else if (mode === "settle") {
      w *= Math.exp(-dt / 0.75);
      const slow = 1 - clamp01(w / DRAW_SPIN);
      const want = w > 1.2 ? 0.05 + 0.16 * Math.sin(Math.PI * slow) : 0;
      tilt += (want - tilt) * Math.min(1, dt * 4);
      if (w < 1.2) {
        const goal = FRONT + Math.round((angle - FRONT) / STAVE) * STAVE;
        angle += (goal - angle) * Math.min(1, dt * 5);
        w = 0;
        if (tilt < 0.002 && Math.abs(goal - angle) < 0.002) {
          angle = goal;
          tilt = 0;
          enter("rest");
        }
      }
    } else if (mode === "play") {
      if (w > PLAY_SPIN) w = PLAY_SPIN + (w - PLAY_SPIN) * Math.exp(-dt / 1.6);
      else w += (PLAY_SPIN - w) * Math.min(1, dt * 0.35);
      const lean = 0.05 + 0.2 * clamp01((PLAY_SPIN * 1.25 - w) / (PLAY_SPIN * 1.25 - 2.5));
      tilt += (lean - tilt) * Math.min(1, dt * 1.5);
    } else if (mode === "reveal") {
      revealStep(dt);
    }

    if (mode !== "reveal") {
      if (mode !== "settle" || w > 0) angle += w * dt;
      prec += Math.min(6, 2 + 18 / Math.max(1, w)) * dt * (tilt > 0.001 ? 1 : 0);
    }
    squash *= Math.exp(-dt / 0.06);
    if (woodK < 1) {
      woodK = Math.min(1, woodK + dt / 0.45);
      const k = easeInOut(woodK);
      tint.value.copy(from.s).lerp(target.s, k);
    }
  }

  function revealStep(dt: number) {
    const tt = t;
    if (tt < SLOW_FROM) {
      w = tt < SPIN_UP ? revealW0 + (MAX_SPIN - revealW0) * easeInOut(tt / SPIN_UP) : MAX_SPIN;
      angle += w * dt;
      slowA0 = angle;
      const D = (LAND - SLOW_FROM) / 1000;
      const natural = slowA0 + (MAX_SPIN * D) / 4;
      slowTarget = FRONT + Math.ceil((natural - FRONT) / STAVE) * STAVE;
    } else if (tt < LAND) {
      const s = (tt - SLOW_FROM) / (LAND - SLOW_FROM);
      angle = slowA0 + (slowTarget - slowA0) * (1 - Math.pow(1 - s, 4));
      w = ((slowTarget - slowA0) * 4 * Math.pow(1 - s, 3)) / ((LAND - SLOW_FROM) / 1000);
    } else {
      angle = slowTarget;
      w = 0;
    }

    y = tt < SLOW_FROM ? Math.sin(Math.PI * clamp01(tt / SLOW_FROM)) * 0.06 : 0;
    if (tt < 160 && tt + dt * 1000 >= 0) squash = Math.max(squash, Math.sin((tt / 160) * Math.PI) * 0.05);

    if (tt < SLOW_FROM) {
      tilt = revealTilt0 * (1 - easeOutCubic(tt / 500));
      prec += 4 * dt;
    } else {
      const s = (tt - SLOW_FROM) / (LAND - SLOW_FROM);
      tilt = tt < LAND ? 0.16 * Math.sin(Math.PI * clamp01(s)) : 0.05 * Math.exp(-(tt - LAND) / 180) * Math.abs(Math.cos((tt - LAND) * 0.03));
      prec += 12 * dt;
    }

    const k = easeInOut((tt - TINT_FROM) / (TINT_TO - TINT_FROM));
    tint.value.copy(raw.s).lerp(target.s, k);

    resetLid();
    if (tt >= LAND && tt < burstAt) {
      const kc = clamp01((tt - LAND) / (burstAt - LAND));
      const half = revealTier === 4 && tt < LAND + (burstAt - LAND) * 0.55;
      glow.color.copy(half ? crackWhite : target.s).lerp(new THREE.Color(TIER_WOOD[revealTier].spark), half ? 0 : 0.6);
      glow.intensity = 9 * kc * kc;
      for (const m of modelMats) {
        const sm = m as THREE.MeshStandardMaterial;
        sm.emissive.copy(glow.color);
        sm.emissiveIntensity = 0.22 * kc * kc;
      }
      y = Math.abs(Math.sin(tt * 0.11)) * 0.012 * kc;
      angle = slowTarget + Math.sin(tt * 0.17) * 0.05 * kc;
      tilt = Math.sin(tt * 0.13) * 0.03 * kc;
    }
    if (tt >= burstAt) {
      const p = tt - burstAt;
      const sp = p / 1000;
      spinner.visible = false;
      shadow.visible = p < 120;
      renderer.toneMappingExposure = baseExposure * (1 + 2.2 * Math.exp(-p / 140));
      glow.intensity = 9 * Math.exp(-p / 380);
      y = 0;
      tilt = 0;
      if (sp < 1.4) {
        for (let i = 0; i < SHARDS; i++) {
          const [ang, h0, out, up, spin] = shardDir[i];
          const sh = shards[i];
          sh.visible = true;
          const rad = 0.2 + out * sp;
          sh.position.set(Math.cos(ang) * rad, h0 + up * sp - 2.6 * sp * sp, Math.sin(ang) * rad);
          sh.rotation.set(spin * sp, ang, spin * 0.6 * sp);
          const fade = sp > 1.1 ? 1 - (sp - 1.1) / 0.3 : 1;
          sh.scale.setScalar(Math.max(0.01, fade));
        }
      }
      if (sp < 0.85) {
        sparks.visible = true;
        for (let i = 0; i < N; i++) {
          const d = i * 3;
          sparkPos[d] = dirs[d] * sp * 0.75;
          sparkPos[d + 1] = 0.45 + dirs[d + 1] * sp * 0.8 - 1.4 * sp * sp;
          sparkPos[d + 2] = dirs[d + 2] * sp * 0.75;
        }
        sparkGeo.attributes.position.needsUpdate = true;
        sparkMat.opacity = 1 - sp / 0.85;
      }
      if (bottle) {
        bottleGroup.visible = true;
        const grow = clamp01(p / 650);
        const back = 1 + 2.2 * Math.pow(grow - 1, 3) + 1.2 * Math.pow(grow - 1, 2);
        bottleGroup.scale.setScalar(Math.max(0.05, back));
        bottleGroup.position.y = 0.05 * easeOutCubic(p / 1100);
        bottleGroup.rotation.y = FRONT + 5.2 * (1 - Math.exp(-p / 520)) - 5.2 + 0.25 * (p / 1000);
      }
    }
    if (tt >= revealLen) {
      tilt = 0;
      enter("rest");
      const cb = endCb;
      endCb = undefined;
      cb?.();
    }
  }

  function apply() {
    spinner.rotation.y = angle;
    pivot.rotation.set(Math.cos(prec) * tilt, 0, Math.sin(prec) * tilt);
    pivot.position.y = y;
    pivot.scale.set(1 + squash, 1 - squash, 1 + squash);
    const lift = y;
    const sc = Math.max(0.4, 1 - lift * 3);
    shadow.scale.set(sc, sc, sc);
    shadow.position.x = Math.sin(prec) * tilt * -0.25;
    shadow.position.z = Math.cos(prec) * tilt * 0.25;
    shadowMat.opacity = Math.max(0, 1 - lift * 5);
    renderer.render(scene, camera);
  }

  function frame(now: number) {
    raf = 0;
    let dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
    last = now;
    while (dt > 0) {
      const h = Math.min(0.05, dt);
      step(h);
      dt -= h;
    }
    apply();
    schedule();
  }

  function schedule() {
    if (raf || !running || mode === "rest" || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame((now) => {
      raf = 0;
      last = Math.min(last, now);
      frame(now);
    });
  }

  function enter(m: Mode) {
    mode = m;
    t = 0;
    if (m !== "reveal") resetLid();
    schedule();
  }

  function beginReveal(tier: Tier, onEnd: () => void) {
    const wood = TIER_WOOD[tier];
    target.s.set(wood.staves);
    woodK = 1;
    tint.value.copy(raw.s);
    glow.color.set(wood.spark);
    sparkMat.color.set(wood.spark);
    shardMat.color.set(wood.staves);
    revealTier = tier;
    burstAt = BURST + (tier === 4 ? XA_EXTRA : 0);
    revealLen = REVEAL_MS + (tier === 4 ? XA_EXTRA : 0);
    bottle = undefined;
    bottleGroup.clear();
    bottleGroup.visible = false;
    void loadBottle(tier)
      .then((b) => {
        if (revealTier !== tier) return;
        bottle = b;
        bottleGroup.add(b);
      })
      .catch(() => {});
    endCb = onEnd;
    revealW0 = w;
    revealTilt0 = tilt;
    y = 0;
    vy = 0;
    enter("reveal");
  }

  const onVisibility = () => {
    if (!document.hidden) schedule();
  };
  document.addEventListener("visibilitychange", onVisibility);

  apply();

  const api: BarrelScene = {
    launch() {
      showBarrel();
      tint.value.copy(raw.s);
      woodK = 1;
      angle = FRONT;
      w = 2;
      tilt = 0.32;
      prec = 0.6;
      y = 0.2;
      vy = 0;
      enter("launch");
    },
    settle() {
      queued = undefined;
      if (mode === "rest" || mode === "reveal") return;
      y = 0;
      vy = 0;
      enter("settle");
    },
    playReveal(tier, onEnd) {
      if (mode === "launch") queued = { tier, onEnd };
      else beginReveal(tier, onEnd);
    },
    play() {
      if (mode !== "play") {
        w = Math.max(w, PLAY_SPIN);
        tilt = Math.max(tilt, 0.06);
        enter("play");
      }
    },
    kick(dw) {
      if (mode !== "play") return;
      w = Math.min(MAX_SPIN, Math.max(1.5, w + dw));
      squash = Math.max(squash, 0.035);
    },
    setWood(wood, instant) {
      from.s.copy(tint.value);
      target.s.set(wood.staves);
      const live = running && mode !== "rest" && !document.hidden;
      woodK = instant || !live ? 1 : 0;
      if (woodK === 1) {
        tint.value.copy(target.s);
        apply();
      }
      schedule();
    },
    setRunning(on) {
      running = on;
      if (!on && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      schedule();
    },
    resize(wd, ht) {
      renderer.setSize(wd, ht, false);
      camera.aspect = wd / ht;
      camera.updateProjectionMatrix();
      apply();
    },
    skip() {
      if (mode === "launch" && queued) {
        const q = queued;
        queued = undefined;
        beginReveal(q.tier, q.onEnd);
      }
      if (mode !== "reveal") return;
      while (mode === "reveal") step(0.05);
      apply();
    },
    snapshot() {
      apply();
      return canvas.toDataURL("image/png");
    },
    dispose() {
      cancelAnimationFrame(raf);
      raf = 0;
      endCb = undefined;
      queued = undefined;
      document.removeEventListener("visibilitychange", onVisibility);
      for (const g of [shadowGeo, sparkGeo, ...modelGeos]) g.dispose();
      for (const m of modelMats) {
        const sm = m as THREE.MeshStandardMaterial;
        for (const tx of [sm.map, sm.normalMap, sm.roughnessMap, sm.metalnessMap]) tx?.dispose();
        m.dispose();
      }
      for (const m of [shadowMat, sparkMat]) m.dispose();
      envTarget.dispose();
      shardGeo.dispose();
      shardMat.dispose();
      for (const g of bottleGeos) g.dispose();
      for (const m of bottleMats) {
        const pm = m as THREE.MeshPhysicalMaterial;
        for (const tx of [pm.map, pm.normalMap]) tx?.dispose();
        m.dispose();
      }
      for (const tx of [shadowMap, sparkMap]) tx.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
  if (shaderFailed) {
    api.dispose();
    throw new Error("barrel scene: shader rejected by this GPU");
  }
  return api;
}
