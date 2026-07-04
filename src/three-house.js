/* ══════════════════════════════════════════════════════════════
   three-house.js  ―  2階建ての家を建てて一人称で歩く
   ・1F/2F を積層、階段で上下移動(視点の高さが実際に変化)
   ・当たり判定はフロアごと。階段内は高さを補間しフロアを切替
   ・壁紙/巾木/木目床/暖色照明/カーテン/ドア枠でリアルに
   ══════════════════════════════════════════════════════════════ */
import * as THREE from "three";
import { WALL_H, WALL_T, CELL, FLOOR_H, SLAB, ROOM_TYPES } from "./floorplan.js";

const EYE = 1.55;
const RADIUS = 0.28;
const SPEED = 2.7;
const RUN = 4.4;

/* ── 手続き的テクスチャ ── */
function makeCanvasTexture(draw, size = 256) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  draw(cv.getContext("2d"), size);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}
function woodTex() {
  return makeCanvasTexture((ctx, s) => {
    ctx.fillStyle = "#d8b98a"; ctx.fillRect(0, 0, s, s);
    const planks = 5, pw = s / planks;
    for (let i = 0; i < planks; i++) {
      const base = 202 + Math.floor(Math.sin(i * 2.7) * 18);
      ctx.fillStyle = `rgb(${base},${base - 38},${base - 84})`;
      ctx.fillRect(i * pw, 0, pw - 1.5, s);
      ctx.strokeStyle = "rgba(110,74,38,0.22)"; ctx.lineWidth = 1;
      for (let y = 0; y < s; y += 6 + (i % 3)) {
        ctx.beginPath(); ctx.moveTo(i * pw, y);
        ctx.bezierCurveTo(i*pw+pw*0.3, y+2, i*pw+pw*0.6, y-2, i*pw+pw-1.5, y+(i%2?2:-2));
        ctx.stroke();
      }
    }
    ctx.strokeStyle = "rgba(70,46,22,0.45)"; ctx.lineWidth = 1.5;
    for (let i = 0; i <= planks; i++) { ctx.beginPath(); ctx.moveTo(i * pw, 0); ctx.lineTo(i * pw, s); ctx.stroke(); }
  });
}
function tatamiTex() {
  return makeCanvasTexture((ctx, s) => {
    ctx.fillStyle = "#a3b168"; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "rgba(78,92,44,0.30)"; ctx.lineWidth = 1;
    for (let y = 0; y < s; y += 5) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke(); }
    ctx.strokeStyle = "#39392a"; ctx.lineWidth = 6; ctx.strokeRect(3, 3, s - 6, s - 6);
    ctx.beginPath(); ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s); ctx.stroke();
  });
}
function tileTex(col = "#e8e6df") {
  return makeCanvasTexture((ctx, s) => {
    ctx.fillStyle = col; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "rgba(150,150,150,0.45)"; ctx.lineWidth = 3;
    const n = 4, t = s / n;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath(); ctx.moveTo(i*t, 0); ctx.lineTo(i*t, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i*t); ctx.lineTo(s, i*t); ctx.stroke();
    }
  });
}
function wallpaperTex() {
  return makeCanvasTexture((ctx, s) => {
    ctx.fillStyle = "#f4efe6"; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      const g = 228 + Math.floor(Math.random() * 20);
      ctx.fillStyle = `rgba(${g},${g-5},${g-14},0.5)`;
      ctx.fillRect(Math.random()*s, Math.random()*s, 1, 1);
    }
    ctx.strokeStyle = "rgba(214,206,192,0.5)"; ctx.lineWidth = 1;
    for (let x = 0; x < s; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, s); ctx.stroke(); }
  }, 128);
}
/* 瓦(いぶし銀の和瓦) */
function kawaraTex() {
  return makeCanvasTexture((ctx, s) => {
    ctx.fillStyle = "#3c4652"; ctx.fillRect(0, 0, s, s);
    const rows = 7, rh = s / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rh;
      const shade = 60 + (r % 2) * 10;
      ctx.fillStyle = `rgb(${shade},${shade+8},${shade+20})`;
      ctx.fillRect(0, y, s, rh - 2);
      // 縦の瓦割り + ハイライト
      for (let x = 0; x < s; x += rh) {
        ctx.fillStyle = "rgba(120,135,155,0.5)";
        ctx.fillRect(x + 1, y + 1, 2, rh - 4);
        ctx.fillStyle = "rgba(20,26,34,0.6)";
        ctx.fillRect(x + rh - 2, y, 2, rh);
      }
      ctx.fillStyle = "rgba(15,20,28,0.7)"; ctx.fillRect(0, y + rh - 3, s, 3);
    }
  });
}
/* 窯業系サイディング(横張り・淡色) */
function sidingTex() {
  return makeCanvasTexture((ctx, s) => {
    ctx.fillStyle = "#e7e0d2"; ctx.fillRect(0, 0, s, s);
    const rows = 6, rh = s / rows;
    for (let r = 0; r < rows; r++) {
      const g = 226 + Math.floor(Math.sin(r*1.7)*8);
      ctx.fillStyle = `rgb(${g},${g-6},${g-18})`;
      ctx.fillRect(0, r*rh, s, rh - 1);
      ctx.fillStyle = "rgba(150,140,120,0.5)"; ctx.fillRect(0, (r+1)*rh - 2, s, 1.5);
      ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(0, r*rh, s, 1);
    }
  });
}
/* 障子(和紙 + 木の格子) */
function shojiTex() {
  return makeCanvasTexture((ctx, s) => {
    ctx.fillStyle = "#f3efe4"; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "#8a6a44"; ctx.lineWidth = s*0.045;
    ctx.strokeRect(0, 0, s, s);
    ctx.lineWidth = s*0.022;
    const nx = 4, ny = 5;
    for (let i = 1; i < nx; i++) { ctx.beginPath(); ctx.moveTo(i*s/nx, 0); ctx.lineTo(i*s/nx, s); ctx.stroke(); }
    for (let i = 1; i < ny; i++) { ctx.beginPath(); ctx.moveTo(0, i*s/ny); ctx.lineTo(s, i*s/ny); ctx.stroke(); }
  }, 128);
}

/* ── マテリアル/ボックス ── */
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0.05, ...o });
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}

/* ── 家具ファクトリ（内部yは床基準0） ── */
function furnitureMesh(kind, opt) {
  const g = new THREE.Group();
  const w = opt.w || 1;
  switch (kind) {
    case "sofa": {
      const c = M(0x6f7f90);
      g.add(box(w, 0.4, 0.9, c, 0, 0.22, 0));
      g.add(box(w, 0.5, 0.2, c, 0, 0.5, -0.34));
      g.add(box(0.18, 0.45, 0.9, c, -w/2+0.09, 0.45, 0));
      g.add(box(0.18, 0.45, 0.9, c, w/2-0.09, 0.45, 0));
      const cush = M(0x8794a2);
      g.add(box(w*0.42, 0.14, 0.5, cush, -w*0.24, 0.5, 0.02));
      g.add(box(w*0.42, 0.14, 0.5, cush, w*0.24, 0.5, 0.02));
      break;
    }
    case "lowtable": {
      const t = M(0x6f4a28, { rough: 0.5 });
      g.add(box(1.0, 0.06, 0.55, t, 0, 0.36, 0));
      for (const [sx,sz] of [[-.44,-.22],[.44,-.22],[-.44,.22],[.44,.22]]) g.add(box(0.05,0.36,0.05, t, sx, 0.18, sz));
      g.add(box(0.25,0.12,0.18, M(0x9a9a9a,{rough:0.4}), 0, 0.45, 0));
      break;
    }
    case "diningtable": {
      const t = M(0x8a6038, { rough: 0.5 });
      g.add(box(1.25, 0.06, 0.78, t, 0, 0.72, 0));
      for (const [sx,sz] of [[-.52,-.3],[.52,-.3],[-.52,.3],[.52,.3]]) g.add(box(0.07,0.72,0.07, t, sx, 0.36, sz));
      const ch = M(0x9a9a9a);
      for (const sz of [0.6,-0.6]) { g.add(box(0.42,0.05,0.42, ch, 0, 0.46, sz)); g.add(box(0.42,0.42,0.05, ch, 0, 0.67, sz+(sz>0?0.18:-0.18))); }
      break;
    }
    case "tvstand": {
      g.add(box(w, 0.42, 0.4, M(0x3a3230), 0, 0.21, 0));
      g.add(box(Math.min(1.5,w*0.95), 0.78, 0.06, M(0x0d0d0d, { rough: 0.25 }), 0, 1.0, -0.06));
      g.add(box(Math.min(1.5,w*0.95)-0.06, 0.72, 0.01, M(0x223, { emissive:0x111a2a, emissiveIntensity:0.4 }), 0, 1.0, -0.02));
      break;
    }
    case "rug": {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(w, opt.d || 1.2), new THREE.MeshStandardMaterial({ color: 0xa9564a, roughness: 1 }));
      r.rotation.x = -Math.PI/2; r.position.y = 0.02; r.receiveShadow = true; g.add(r);
      const r2 = new THREE.Mesh(new THREE.PlaneGeometry(w*0.8, (opt.d||1.2)*0.7), new THREE.MeshStandardMaterial({ color: 0xc27a6a, roughness: 1 }));
      r2.rotation.x = -Math.PI/2; r2.position.y = 0.03; g.add(r2);
      break;
    }
    case "bed": {
      const fr = M(0x6f5030);
      g.add(box(w, 0.3, 2.0, fr, 0, 0.15, 0));
      g.add(box(w, 0.2, 2.0, M(0xf2eee2), 0, 0.4, 0));
      g.add(box(w, 0.26, 0.42, M(0xe4ebf0), 0, 0.53, -0.74));
      g.add(box(w, 0.08, 1.25, M(0x5a7fa0), 0, 0.55, 0.3));
      g.add(box(w, 0.62, 0.1, fr, 0, 0.42, -1.02));
      break;
    }
    case "nightstand": g.add(box(0.42, 0.44, 0.4, M(0x6f5030), 0, 0.22, 0)); break;
    case "lamp": {
      g.add(box(0.06, 0.32, 0.06, M(0x333), 0, 0.62, 0));
      g.add(box(0.24, 0.2, 0.24, M(0xfff2d0, { emissive:0xffe6a8, emissiveIntensity:0.7 }), 0, 0.86, 0));
      break;
    }
    case "wardrobe": g.add(box(w, 1.9, 0.58, M(0x9a8462), 0, 0.95, 0)),
      g.add(box(0.03, 1.7, 0.02, M(0x555), 0, 0.95, 0.3)); break;
    case "desk": {
      const t = M(0x6a4a2a);
      g.add(box(1.1, 0.05, 0.55, t, 0, 0.73, 0));
      g.add(box(0.05,0.73,0.5, t, -0.5, 0.36, 0)); g.add(box(0.05,0.73,0.5, t, 0.5, 0.36, 0));
      g.add(box(0.5,0.34,0.03, M(0x0d0d0d,{rough:0.25}), 0, 1.0, -0.2));
      break;
    }
    case "shelf": {
      const s = M(0x8a6a48);
      g.add(box(0.8, 1.6, 0.3, s, 0, 0.8, 0));
      for (let i=0;i<6;i++) g.add(box(0.09,0.26,0.22, M((i*99+40)%0xffffff), -0.32+i*0.13, 1.3, 0));
      break;
    }
    case "counter": {
      g.add(box(w, 0.88, 0.6, M(0xe6e0d4), 0, 0.44, 0));
      g.add(box(w, 0.05, 0.62, M(0x8f8f92,{metal:0.4,rough:0.35}), 0, 0.9, 0));
      g.add(box(0.5, 0.02, 0.34, M(0x6f6f72,{metal:0.6,rough:0.3}), w*0.22, 0.92, 0));
      g.add(box(0.04,0.28,0.04, M(0xbfbfc4,{metal:0.7,rough:0.2}), w*0.22, 1.05, -0.02));
      break;
    }
    case "range": {
      g.add(box(0.6, 0.88, 0.58, M(0x2a2a2c,{rough:0.4}), 0, 0.44, 0));
      g.add(box(0.58, 0.03, 0.56, M(0x111,{rough:0.3,metal:0.3}), 0, 0.9, 0));
      break;
    }
    case "rangehood": g.add(box(0.7, 0.35, 0.5, M(0xd7d7da,{metal:0.4,rough:0.4}), 0, WALL_H-0.85, 0)); break;
    case "upcab": g.add(box(w, 0.6, 0.35, M(0xe6ddcc), 0, WALL_H-0.55, 0)); break;
    case "fridge": {
      g.add(box(0.62, 1.72, 0.62, M(0xececef,{metal:0.15,rough:0.35}), 0, 0.86, 0));
      g.add(box(0.03, 0.5, 0.03, M(0x999), 0.26, 1.2, 0.31));
      g.add(box(0.03, 0.4, 0.03, M(0x999), 0.26, 0.55, 0.31));
      break;
    }
    case "toiletunit": {
      g.add(box(0.4, 0.4, 0.62, M(0xf6f6f6,{rough:0.25}), 0, 0.2, 0.04));
      g.add(box(0.42, 0.52, 0.22, M(0xf6f6f6,{rough:0.25}), 0, 0.46, -0.24));
      g.add(box(0.44, 0.06, 0.44, M(0xffffff,{rough:0.25}), 0, 0.42, 0.08));
      break;
    }
    case "toiletpaper": g.add(box(0.14, 0.14, 0.14, M(0xffffff), 0, 0.7, 0)); break;
    case "bathtub": {
      g.add(box(w, 0.56, 0.85, M(0xf3f6f7,{rough:0.2}), 0, 0.28, 0));
      g.add(box(w-0.16, 0.16, 0.66, M(0xbfe2ec,{rough:0.12,metal:0.1,opacity:0.85,transparent:true}), 0, 0.44, 0));
      break;
    }
    case "shower": {
      g.add(box(0.06, 1.9, 0.5, M(0xcfe6ee,{opacity:0.25,transparent:true,rough:0.05}), 0, 0.95, 0));
      g.add(box(0.05,0.4,0.05, M(0xcccfd2,{metal:0.6,rough:0.2}), 0, 1.6, 0));
      break;
    }
    case "washstand": {
      g.add(box(w, 0.8, 0.5, M(0xe9e4dc), 0, 0.4, 0));
      g.add(box(w, 0.04, 0.52, M(0xffffff,{rough:0.25}), 0, 0.82, 0));
      g.add(box(w*0.7, 0.9, 0.05, M(0xcfe6ee,{rough:0.08,metal:0.3,opacity:0.5,transparent:true}), 0, 1.42, -0.24));
      break;
    }
    case "washer": {
      g.add(box(0.62, 0.92, 0.62, M(0xf1f1f4,{rough:0.4}), 0, 0.46, 0));
      g.add(box(0.36, 0.36, 0.05, M(0x2a2a2a,{rough:0.2,metal:0.3}), 0, 0.56, 0.31));
      break;
    }
    case "shoebox": g.add(box(0.42, 1.45, 1.35, M(0x9a7a58), 0, 0.72, 0)); break;
    case "closetlow": g.add(box(w, 0.9, 0.5, M(0xa88a62), 0, 0.45, 0)); break;
    case "tatamiset": {
      g.add(box(1.05, 0.28, 0.65, M(0x6a4a2a,{rough:0.55}), 0, 0.24, 0));
      g.add(box(0.5,0.09,0.5, M(0x9a5a4a), -0.82, 0.05, 0)); g.add(box(0.5,0.09,0.5, M(0x9a5a4a), 0.82, 0.05, 0));
      break;
    }
    case "plant": {
      g.add(box(0.3, 0.34, 0.3, M(0x9a7048, { rough: 0.9 }), 0, 0.17, 0)); // 鉢
      g.add(box(0.05, 0.5, 0.05, M(0x6a5a3a), 0, 0.5, 0));                  // 幹
      // 葉を小さなブロックで茂らせる
      const leaf = M(0x4c8a42, { rough: 1 }), leaf2 = M(0x3c7a38, { rough: 1 });
      const blobs = [[0,0.9,0,0.34],[0.14,0.78,0.05,0.24],[-0.12,0.82,-0.06,0.26],[0.05,1.02,-0.08,0.22],[-0.06,1.0,0.1,0.2]];
      for (const [x,y,z,s] of blobs) g.add(box(s, s, s, (x+z>0?leaf:leaf2), x, y, z));
      break;
    }
    case "picture": {
      g.add(box(0.66, 0.5, 0.03, M(0x5a4630), 0, 1.55, 0));
      g.add(box(0.56, 0.4, 0.01, M((opt.i||3)*0x2233aa % 0xffffff | 0x304050), 0, 1.55, 0.02));
      break;
    }
    case "acunit": g.add(box(0.82, 0.28, 0.22, M(0xf2f2f2,{rough:0.4}), 0, WALL_H-0.4, 0)); break;
    case "pendant": {
      g.add(box(0.02,0.5,0.02, M(0x333), 0, WALL_H-0.25, 0));
      g.add(box(0.4,0.16,0.4, M(0xfff3d8,{emissive:0xffe9b8,emissiveIntensity:0.9}), 0, WALL_H-0.5, 0));
      break;
    }
    case "ceiling": g.add(box(0.5,0.07,0.5, M(0xffffff,{emissive:0xfff0d2,emissiveIntensity:0.8}), 0, WALL_H-0.05, 0)); break;
    case "tokonoma": {
      // 床板(一段高い) + 奥の壁 + 掛軸 + 花瓶
      g.add(box(w, 0.12, 0.5, M(0x5a3a1e, { rough: 0.5 }), 0, 0.06, 0));           // 床板
      g.add(box(w, 2.0, 0.06, M(0xe7ddc8, { rough: 0.95 }), 0, 1.0, -0.24));       // 床の間の壁
      g.add(box(w, 0.1, 0.14, M(0x4a2f18, { rough: 0.5 }), 0, 2.0, -0.2));         // 落とし掛け
      g.add(box(0.34, 1.15, 0.02, M(0xd8cbb0, { rough: 1 }), -w*0.15, 1.15, -0.2)); // 掛軸
      g.add(box(0.34, 0.08, 0.02, M(0x6a4a2a), -w*0.15, 1.72, -0.2));
      g.add(box(0.16, 0.34, 0.16, M(0x2a4a5a, { rough: 0.3 }), w*0.22, 0.29, 0));  // 花瓶
      g.add(box(0.04, 0.4, 0.04, M(0x3a6a3a), w*0.22, 0.6, 0));                     // 生け花
      break;
    }
    case "woodpost": g.add(box(0.12, WALL_H, 0.12, M(0x6a4a28, { rough: 0.55 }), 0, WALL_H/2, 0)); break;
    case "kamachi": g.add(box(w - 0.1, 0.16, 0.12, M(0x5a3a1e, { rough: 0.5 }), 0, 0.08, 0)); break;
    case "slatceil": {
      // 竿縁天井: 木の下地 + 細い竿
      const ww = opt.w || 3, dd = opt.d || 3;
      g.add(box(ww - 0.1, 0.03, dd - 0.1, M(0xcabf98, { rough: 0.9 }), 0, WALL_H - 0.04, 0));
      const n = Math.max(2, Math.round(ww / 0.45));
      for (let i = 0; i < n; i++) {
        const x = -ww/2 + (i + 0.5) * (ww / n);
        g.add(box(0.04, 0.04, dd - 0.12, M(0x6a4a28, { rough: 0.6 }), x, WALL_H - 0.08, 0));
      }
      break;
    }
    default: break;
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/* ══════════ ゲーム本体 ══════════ */
export class HouseGame {
  constructor(container, opts = {}) {
    this.container = container;
    this.onRoom = opts.onRoom || (() => {});
    this.onReady = opts.onReady || (() => {});
    this.onLock = opts.onLock || (() => {});
    this._raf = null; this._disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9cc3e0);
    scene.fog = new THREE.Fog(0x9cc3e0, 40, 90);
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(72, container.clientWidth / container.clientHeight, 0.05, 300);

    this.yaw = 0; this.pitch = 0;
    this.pos = new THREE.Vector3(0, EYE, 0);
    this.groundY = 0; this.activeFloor = 0;
    this.keys = {};
    this.wallsByFloor = [[], []];
    this.textures = {
      wood: woodTex(), tatami: tatamiTex(), wall: wallpaperTex(),
      tile: tileTex("#e8e6df"), wet: tileTex("#dfeaee"), concrete: tileTex("#9a9a9a"),
      kawara: kawaraTex(), siding: sidingTex(), shoji: shojiTex(),
    };
    this._clock = new THREE.Clock();

    this._buildLights();
    this._bindControls();
    this._onResize = () => this._resize();
    window.addEventListener("resize", this._onResize);
  }

  _buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6b5f50, 0.55));
    this.scene.add(new THREE.AmbientLight(0xfff0dd, 0.18));
    const sun = new THREE.DirectionalLight(0xfff1d8, 1.15);
    sun.position.set(16, 30, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 26;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    sun.shadow.camera.far = 120; sun.shadow.bias = -0.0004;
    this.scene.add(sun); this.sun = sun;
  }

  build(house) {
    if (this.houseGroup) { this.scene.remove(this.houseGroup); this._disposeGroup(this.houseGroup); }
    const group = new THREE.Group();
    this.houseGroup = group; this.scene.add(group);
    this.wallsByFloor = [[], []];
    this.house = house;
    this.stairs = house.stairs;

    const W = house.widthM, D = house.depthM, cx = W/2, cz = D/2;
    const topH = FLOOR_H + WALL_H;

    // 屋外の地面
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: 0x748d59, roughness: 1 }));
    ground.rotation.x = -Math.PI/2; ground.position.set(cx, -0.02, cz);
    ground.receiveShadow = true; group.add(ground);
    group.add(box(W + 0.5, 0.35, D + 0.5, M(0x8a8378), cx, -0.16, cz));   // 基礎(コンクリ)

    for (const floor of house.floors) {
      const yBase = floor.level * FLOOR_H;
      this._buildFloorSlabsCeil(floor, group, yBase);
      this._buildWalls(floor, group, yBase);
      this._buildDoorCasings(floor, group, yBase);
      this._buildFurniture(floor, group, yBase);
    }
    this._buildStairs(group);
    this._buildRoof(group, W, D, cx, cz, topH);
    this._buildExterior(group, house, W, D, cx, cz);

    // スポーン
    const sp = house.spawn;
    this.pos.set(sp.x, EYE, sp.z);
    this.groundY = 0; this.activeFloor = 0;
    this.yaw = sp.yaw ?? Math.PI; this.pitch = 0;
    this._updateFloor(); this._updateCamera(); this._curRoom = undefined;
    if (typeof window !== "undefined") window.__houseGame = this; // デバッグ用
    this.onReady(house);
  }

  _floorMat(type) {
    const info = ROOM_TYPES[type];
    const key = info.floor === "tilewood" ? "wood" : info.floor;
    const tex = (this.textures[key] || this.textures.wood).clone(); tex.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: info.wet ? 0.35 : 0.82 });
  }

  _buildFloorSlabsCeil(floor, group, yBase) {
    for (const rm of floor.rooms) {
      const info = ROOM_TYPES[rm.type];
      if (info.floor !== "none") {
        const mat = this._floorMat(rm.type);
        const rep = rm.type === "washitsu"
          ? [Math.max(1, Math.round(rm.w/0.95)), Math.max(1, Math.round(rm.d/0.95))]
          : [Math.max(1, rm.w/1.0), Math.max(1, rm.d/1.0)];
        mat.map.repeat.set(rep[0], rep[1]);
        const slab = box(rm.w, 0.1, rm.d, mat, rm.cx, yBase + 0.0, rm.cz);
        // 上面を yBase に
        slab.position.y = yBase - 0.05;
        group.add(slab);
      }
      if (info.ceil) {
        const ceil = new THREE.Mesh(new THREE.PlaneGeometry(rm.w, rm.d),
          new THREE.MeshStandardMaterial({ color: 0xf5f2ec, roughness: 0.95 }));
        ceil.rotation.x = Math.PI/2; ceil.position.set(rm.cx, yBase + WALL_H, rm.cz);
        group.add(ceil);
        const lamp = new THREE.PointLight(0xffe8c4, info.habitable ? 12 : 7, Math.max(rm.w, rm.d) * 2.4, 2);
        lamp.position.set(rm.cx, yBase + WALL_H - 0.2, rm.cz);
        group.add(lamp);
      }
    }
  }

  _buildWalls(floor, group, yBase) {
    const wallMat = new THREE.MeshStandardMaterial({ map: this.textures.wall.clone(), color: 0xffffff, roughness: 0.94 });
    wallMat.map.repeat.set(2, 1.4); wallMat.map.needsUpdate = true;
    const baseMat = M(0x5a3f26, { rough: 0.55 });      // 巾木(こげ茶)
    const railMat = M(0x8a8f93, { rough: 0.55, metal: 0.35 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xbfe6f0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.24, side: THREE.DoubleSide });
    const frameMat = M(0x6a4a2a, { rough: 0.6 });      // 窓枠(木)
    // サイディング外壁マテリアル(外壁だけ差し替え)
    const sidingMat = () => { const m = new THREE.MeshStandardMaterial({ map: this.textures.siding.clone(), roughness: 0.9 }); m.map.repeat.set(1.4, 1.2); m.map.needsUpdate = true; return m; };
    const shojiMat = () => { const m = new THREE.MeshStandardMaterial({ map: this.textures.shoji.clone(), roughness: 0.95, transparent: true, opacity: 0.94, emissive: 0xfff4e0, emissiveIntensity: 0.12 }); return m; };

    for (const w of floor.walls) {
      const midx = (w.x1 + w.x2)/2, midz = (w.z1 + w.z2)/2;
      const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
      const horiz = w.horizontal;
      const sx = horiz ? len : WALL_T, sz = horiz ? WALL_T : len;
      const outMat = w.exterior ? sidingMat() : wallMat;

      if (w.type === "rail") {
        const h = 1.02;
        // 和風の格子手すり
        group.add(box(sx, 0.06, sz, M(0x6a4a2a), midx, yBase + h, midz));
        group.add(box(sx, 0.06, sz, M(0x6a4a2a), midx, yBase + 0.05, midz));
        const n = Math.max(2, Math.round(len / 0.22));
        for (let i = 0; i <= n; i++) {
          const f = i / n;
          const bx2 = w.x1 + (w.x2 - w.x1) * f, bz2 = w.z1 + (w.z2 - w.z1) * f;
          group.add(box(0.03, h, 0.03, M(0x7a5a34), bx2, yBase + h/2, bz2));
        }
        this._addWallAABB(w, floor.level); continue;
      }
      if (w.type === "window") {
        const sill = 0.85, head = 2.05;
        group.add(box(sx, sill, sz, outMat, midx, yBase + sill/2, midz));
        group.add(box(sx, WALL_H - head, sz, outMat, midx, yBase + (head + WALL_H)/2, midz));
        const gx = horiz ? len : 0.04, gz = horiz ? 0.04 : len;
        group.add(box(gx, head - sill, gz, glassMat, midx, yBase + (sill + head)/2, midz));
        // 木の窓枠
        group.add(box(sx, 0.06, sz, frameMat, midx, yBase + sill, midz));
        group.add(box(sx, 0.06, sz, frameMat, midx, yBase + head, midz));
        // 障子(内側・格子＋和紙のパネル)
        const off = 0.075;
        const cx2 = midx + (horiz ? 0 : (w.x1 <= CELL*0.01 ? off : -off));
        const cz2 = midz + (horiz ? (w.z1 <= CELL*0.01 ? off : -off) : 0);
        const cw = horiz ? len : 0.03, cd = horiz ? 0.03 : len;
        const sm = shojiMat(); sm.map.repeat.set(horiz ? Math.max(1, len/0.9) : 1, 1); sm.map.needsUpdate = true;
        const shoji = new THREE.Mesh(new THREE.BoxGeometry(cw, head - sill, cd), sm);
        shoji.position.set(cx2, yBase + (sill + head)/2, cz2);
        group.add(shoji);
        this._addWallAABB(w, floor.level); continue;
      }
      // 通常壁 + 巾木
      group.add(box(sx, WALL_H, sz, outMat, midx, yBase + WALL_H/2, midz));
      const bx = horiz ? len : WALL_T + 0.02, bz = horiz ? WALL_T + 0.02 : len;
      group.add(box(bx, 0.09, bz, baseMat, midx, yBase + 0.045, midz));
      this._addWallAABB(w, floor.level);
    }
  }

  _buildDoorCasings(floor, group, yBase) {
    if (!floor.doors) return;
    const caseMat = M(0x7a5a38, { rough: 0.6 });   // 木の枠
    const leafMat = M(0x9a7a50, { rough: 0.65 });  // 建具(木)
    const fusumaMat = M(0xece3d1, { rough: 0.95 }); // 襖紙
    const H = 2.04;
    for (const d of floor.doors) {
      const horiz = d.horizontal;
      const cx0 = d.c * CELL, cz0 = d.r * CELL;
      if (horiz) {
        const x = cx0 + CELL/2, z = cz0;
        group.add(box(CELL + 0.06, 0.08, 0.14, caseMat, x, yBase + H, z));
        group.add(box(0.08, H, 0.14, caseMat, cx0 + 0.04, yBase + H/2, z));
        group.add(box(0.08, H, 0.14, caseMat, cx0 + CELL - 0.04, yBase + H/2, z));
        if (d.wash) {
          // 襖(片引き・半開)…壁面に沿ってスライド
          const pw = CELL * 0.5;
          const panel = box(pw, H - 0.08, 0.04, fusumaMat, cx0 + 0.04 + pw/2, yBase + H/2, z);
          group.add(panel);
          group.add(box(pw, 0.05, 0.05, caseMat, cx0 + 0.04 + pw/2, yBase + H - 0.06, z));
        } else {
          const leaf = box(CELL - 0.1, H - 0.06, 0.04, leafMat, cx0 + 0.06, yBase + H/2, z + 0.42);
          leaf.rotation.y = Math.PI/2 * 0.92; group.add(leaf);
        }
      } else {
        const x = cx0, z = cz0 + CELL/2;
        group.add(box(0.14, 0.08, CELL + 0.06, caseMat, x, yBase + H, z));
        group.add(box(0.14, H, 0.08, caseMat, x, yBase + H/2, cz0 + 0.04));
        group.add(box(0.14, H, 0.08, caseMat, x, yBase + H/2, cz0 + CELL - 0.04));
        if (d.wash) {
          const pw = CELL * 0.5;
          const panel = box(0.04, H - 0.08, pw, fusumaMat, x, yBase + H/2, cz0 + 0.04 + pw/2);
          group.add(panel);
        } else {
          const leaf = box(0.04, H - 0.06, CELL - 0.1, leafMat, x + 0.42, yBase + H/2, cz0 + 0.06);
          leaf.rotation.y = Math.PI/2 * 0.92; group.add(leaf);
        }
      }
    }
  }

  _buildFurniture(floor, group, yBase) {
    for (const f of floor.furniture) {
      const mesh = furnitureMesh(f.kind, f);
      if (!mesh.children.length) continue;
      mesh.position.set(f.x, yBase, f.z);
      mesh.rotation.y = f.rot || 0;
      group.add(mesh);
    }
  }

  _buildStairs(group) {
    const st = this.stairs;
    const N = 14;
    const runLen = st.zTop - st.zBottom;
    const stepD = runLen / N;
    const stepH = FLOOR_H / N;
    const wx = (st.x + st.xEnd) / 2;
    const wWidth = (st.xEnd - st.x) - 0.12;
    const mat = M(0xb08a5c, { rough: 0.7 });
    const side = M(0x8a6a44, { rough: 0.7 });
    for (let i = 0; i < N; i++) {
      const top = (i + 1) * stepH;
      const zc = st.zBottom + (i + 0.5) * stepD;
      // 段(下から積み上げた塊で階段の形に)
      group.add(box(wWidth, top, stepD + 0.01, mat, wx, top/2, zc));
    }
    // 側桁
    group.add(box(0.06, FLOOR_H, runLen, side, st.x + 0.04, FLOOR_H/2, (st.zBottom+st.zTop)/2));
    group.add(box(0.06, FLOOR_H, runLen, side, st.xEnd - 0.04, FLOOR_H/2, (st.zBottom+st.zTop)/2));
    // 手すり
    const rail = M(0x6a4a2a, { rough: 0.5 });
    for (const sx of [st.x + 0.12, st.xEnd - 0.12]) {
      const r = box(0.05, 0.05, runLen*1.02, rail, sx, 0, (st.zBottom+st.zTop)/2);
      r.position.y = FLOOR_H/2 + 0.9;
      r.rotation.x = Math.atan2(FLOOR_H, runLen);
      group.add(r);
    }
  }

  /* 寄棟の瓦屋根 + 深い軒 */
  _buildRoof(group, W, D, cx, cz, topH) {
    const OH = 0.55;              // 軒の出
    const eaveY = topH + 0.02;
    const a = W + OH*2, b = D + OH*2;   // 軒先の寸法
    const long = Math.max(a, b), short = Math.min(a, b);
    const RH = short * 0.32;     // 棟の高さ
    const ridgeY = eaveY + RH;
    const L = long - short;      // 棟の長さ
    const alongZ = b >= a;

    // 6頂点
    const v = alongZ ? [
      [cx-a/2, eaveY, cz-b/2], [cx+a/2, eaveY, cz-b/2],
      [cx+a/2, eaveY, cz+b/2], [cx-a/2, eaveY, cz+b/2],
      [cx, ridgeY, cz-L/2], [cx, ridgeY, cz+L/2],
    ] : [
      [cx-a/2, eaveY, cz-b/2], [cx+a/2, eaveY, cz-b/2],
      [cx+a/2, eaveY, cz+b/2], [cx-a/2, eaveY, cz+b/2],
      [cx-L/2, ridgeY, cz], [cx+L/2, ridgeY, cz],
    ];
    // 面(三角形分割)
    const tris = alongZ
      ? [[0,1,4],[2,3,5],[3,0,4],[3,4,5],[1,2,5],[1,5,4]]
      : [[3,0,4],[1,2,5],[0,1,5],[0,5,4],[2,3,4],[2,4,5]];
    const pos = [], uv = [];
    for (const [i,j,k] of tris) {
      for (const idx of [i,j,k]) { pos.push(v[idx][0], v[idx][1], v[idx][2]); }
      // 簡易UV(斜面に瓦を流す)
      uv.push(0,0, 1,0, 0.5,1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const km = this.textures.kawara.clone(); km.needsUpdate = true; km.repeat.set(long*0.8, short*0.8);
    const roof = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: km, roughness: 0.85, side: THREE.DoubleSide }));
    roof.castShadow = true; group.add(roof);

    // 破風/鼻隠し(軒先の板) + 軒天
    const fasc = M(0x4a4a52, { rough: 0.7 });
    group.add(box(a + 0.1, 0.16, 0.06, fasc, cx, eaveY, cz - b/2));
    group.add(box(a + 0.1, 0.16, 0.06, fasc, cx, eaveY, cz + b/2));
    group.add(box(0.06, 0.16, b + 0.1, fasc, cx - a/2, eaveY, cz));
    group.add(box(0.06, 0.16, b + 0.1, fasc, cx + a/2, eaveY, cz));
    const soffit = M(0xcabfa6, { rough: 0.9 });
    const s2 = new THREE.Mesh(new THREE.PlaneGeometry(a, b), soffit);
    s2.rotation.x = Math.PI/2; s2.position.set(cx, eaveY - 0.02, cz); group.add(s2);
  }

  /* 玄関ポーチ・飛び石・庭木・塀 */
  _buildExterior(group, house, W, D, cx, cz) {
    const ent = house.entrance;
    // 玄関ポーチ(小屋根＋沓脱ぎ石)
    if (ent) {
      const outward = ent.kind === "h" ? { x: 0, z: -1 } : { x: -1, z: 0 };
      const px = ent.x + outward.x * 0.7, pz = ent.z + outward.z * 0.7;
      // 沓脱ぎ/踏み石
      group.add(box(1.3, 0.12, 0.9, M(0x9a938a, { rough: 1 }), px, 0.06, pz));
      // ポーチ屋根(片流れ)と柱
      const roofY = 2.25;
      const pr = box(1.8, 0.1, 1.4, M(0x4a4a52, { rough: 0.7 }), px, roofY, pz);
      pr.rotation.x = (ent.kind === "h" ? 1 : 0) * -0.12; group.add(pr);
      for (const s of [-0.7, 0.7]) {
        const cxp = px + (ent.kind === "h" ? s : 0.6);
        const czp = pz + (ent.kind === "h" ? 0.6 : s);
        group.add(box(0.1, roofY, 0.1, M(0x6a4a2a), cxp, roofY/2, czp));
      }
    }
    // 飛び石(スポーンから玄関へ)
    const sp = house.spawn;
    if (ent) {
      const steps = 4;
      for (let i = 1; i <= steps; i++) {
        const f = i / (steps + 1);
        const sx = sp.x + (ent.x - sp.x) * f, sz = sp.z + (ent.z - sp.z) * f - 0.6 * (1 - f);
        const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.08, 7),
          new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 1 }));
        stone.position.set(sx, 0.04, sz); stone.receiveShadow = true; group.add(stone);
      }
    }
    // 庭木(株立ち風)
    const treeX = cx > W/2 ? 0.9 : W - 0.9, treeZ = -2.2;
    const trunk = M(0x5a4028, { rough: 1 });
    group.add(box(0.16, 1.4, 0.16, trunk, treeX, 0.7, treeZ));
    const foli = M(0x4a7a3a, { rough: 1 }), foli2 = M(0x3c6a30, { rough: 1 });
    for (const [dx,dy,dz,s] of [[0,1.8,0,1.0],[0.4,1.5,0.3,0.7],[-0.35,1.6,-0.25,0.7],[0.1,2.2,-0.1,0.7]])
      group.add(box(s, s, s, (dx+dz>0?foli:foli2), treeX+dx, dy, treeZ+dz));
    // 低い塀(前面・門の隙間あり)
    const wallMat = M(0xd8d0c0, { rough: 0.95 });
    const fz = -3.6;
    const gateX = sp.x;
    for (const seg of [[0.2, gateX-1.0], [gateX+1.0, W-0.2]]) {
      const len = seg[1] - seg[0];
      if (len > 0.3) group.add(box(len, 1.1, 0.14, wallMat, (seg[0]+seg[1])/2, 0.55, fz));
    }
    // 門柱
    group.add(box(0.22, 1.35, 0.22, M(0xc8c0b0), gateX-1.0, 0.68, fz));
    group.add(box(0.22, 1.35, 0.22, M(0xc8c0b0), gateX+1.0, 0.68, fz));
  }

  _addWallAABB(w, floorLevel) {
    const half = WALL_T/2 + RADIUS;
    const minX = Math.min(w.x1, w.x2) - (w.horizontal ? RADIUS : half);
    const maxX = Math.max(w.x1, w.x2) + (w.horizontal ? RADIUS : half);
    const minZ = Math.min(w.z1, w.z2) - (w.horizontal ? half : RADIUS);
    const maxZ = Math.max(w.z1, w.z2) + (w.horizontal ? half : RADIUS);
    this.wallsByFloor[floorLevel].push({ minX, maxX, minZ, maxZ });
  }

  /* ── 操作 ── */
  _bindControls() {
    const dom = this.renderer.domElement;
    dom.style.touchAction = "none"; dom.style.cursor = "pointer";
    this._kd = e => { this.keys[e.code] = true; if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code)) e.preventDefault(); };
    this._ku = e => { this.keys[e.code] = false; };
    window.addEventListener("keydown", this._kd); window.addEventListener("keyup", this._ku);

    this._onClick = () => { if (!this._isTouch) dom.requestPointerLock?.(); };
    dom.addEventListener("click", this._onClick);
    this._onLockChange = () => { this.locked = document.pointerLockElement === dom; this.onLock(this.locked); };
    document.addEventListener("pointerlockchange", this._onLockChange);
    this._onMouseMove = e => { if (!this.locked) return; this.yaw -= e.movementX*0.0022; this.pitch -= e.movementY*0.0022; this._clampPitch(); };
    document.addEventListener("mousemove", this._onMouseMove);

    this.touchMove = null; this.touchLook = null;
    this._onTouchStart = e => {
      this._isTouch = true;
      for (const t of e.changedTouches) {
        if (t.clientX < window.innerWidth/2 && !this.touchMove) this.touchMove = { id:t.identifier, ox:t.clientX, oy:t.clientY, dx:0, dy:0 };
        else if (!this.touchLook) this.touchLook = { id:t.identifier, x:t.clientX, y:t.clientY };
      }
      e.preventDefault();
    };
    this._onTouchMove = e => {
      for (const t of e.changedTouches) {
        if (this.touchMove && t.identifier === this.touchMove.id) { this.touchMove.dx = t.clientX - this.touchMove.ox; this.touchMove.dy = t.clientY - this.touchMove.oy; }
        else if (this.touchLook && t.identifier === this.touchLook.id) { this.yaw -= (t.clientX - this.touchLook.x)*0.006; this.pitch -= (t.clientY - this.touchLook.y)*0.006; this.touchLook.x=t.clientX; this.touchLook.y=t.clientY; this._clampPitch(); }
      }
      e.preventDefault();
    };
    this._onTouchEnd = e => { for (const t of e.changedTouches) { if (this.touchMove && t.identifier===this.touchMove.id) this.touchMove=null; if (this.touchLook && t.identifier===this.touchLook.id) this.touchLook=null; } };
    dom.addEventListener("touchstart", this._onTouchStart, { passive:false });
    dom.addEventListener("touchmove", this._onTouchMove, { passive:false });
    dom.addEventListener("touchend", this._onTouchEnd); dom.addEventListener("touchcancel", this._onTouchEnd);
  }

  _clampPitch() { const l = Math.PI/2 - 0.05; this.pitch = Math.max(-l, Math.min(l, this.pitch)); }
  _resize() { const w=this.container.clientWidth, h=this.container.clientHeight; this.renderer.setSize(w,h); this.camera.aspect=w/h; this.camera.updateProjectionMatrix(); }

  _move(dt) {
    let ix=0, iz=0;
    if (this.keys["KeyW"]||this.keys["ArrowUp"]) iz+=1;
    if (this.keys["KeyS"]||this.keys["ArrowDown"]) iz-=1;
    if (this.keys["KeyA"]||this.keys["ArrowLeft"]) ix-=1;
    if (this.keys["KeyD"]||this.keys["ArrowRight"]) ix+=1;
    const run = this.keys["ShiftLeft"]||this.keys["ShiftRight"];
    if (this.touchMove) { iz += Math.max(-1,Math.min(1,-this.touchMove.dy/45)); ix += Math.max(-1,Math.min(1,this.touchMove.dx/45)); }
    const len = Math.hypot(ix, iz);
    if (len > 0.001) {
      ix /= Math.max(1,len); iz /= Math.max(1,len);
      const spd = (run?RUN:SPEED)*dt;
      const sin=Math.sin(this.yaw), cos=Math.cos(this.yaw);
      const mx = (-sin*iz + cos*ix)*spd;
      const mz = (-cos*iz - sin*ix)*spd;
      this._tryMove(mx, mz);
    }
    this._updateFloor();
  }

  _tryMove(mx, mz) {
    const nx = this.pos.x + mx;
    if (!this._collides(nx, this.pos.z)) this.pos.x = nx;
    const nz = this.pos.z + mz;
    if (!this._collides(this.pos.x, nz)) this.pos.z = nz;
  }

  _collides(x, z) {
    const walls = this.wallsByFloor[this.activeFloor];
    for (const w of walls) if (x > w.minX && x < w.maxX && z > w.minZ && z < w.maxZ) return true;
    return false;
  }

  _updateFloor() {
    const st = this.stairs;
    const inStairs = this.pos.x > st.x && this.pos.x < st.xEnd && this.pos.z > st.zBottom && this.pos.z < st.zTop;
    if (inStairs) {
      const t = Math.max(0, Math.min(1, (this.pos.z - st.zBottom) / (st.zTop - st.zBottom)));
      this.groundY = t * FLOOR_H;
      this.activeFloor = t < 0.5 ? 0 : 1;
    } else {
      this.activeFloor = this.groundY > FLOOR_H * 0.5 ? 1 : 0;
      this.groundY = this.activeFloor * FLOOR_H;
    }
    this.pos.y = this.groundY + EYE;
  }

  _updateCamera() {
    this.camera.position.copy(this.pos);
    const dir = new THREE.Vector3(-Math.sin(this.yaw)*Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw)*Math.cos(this.pitch));
    this.camera.lookAt(this.pos.clone().add(dir));
  }

  _checkRoom() {
    const floor = this.house.floors[this.activeFloor];
    const c = Math.floor(this.pos.x/CELL), r = Math.floor(this.pos.z/CELL);
    let id = -1;
    if (c>=0 && r>=0 && c<floor.cols && r<floor.rows) id = floor.grid[r*floor.cols + c];
    const key = this.activeFloor + ":" + id;
    if (key !== this._curRoom) {
      this._curRoom = key;
      const rm = id >= 0 ? floor.rooms[id] : null;
      this.onRoom(rm ? { name: rm.name, tatami: rm.tatami, type: rm.type, floor: this.activeFloor+1 } : { name:"屋外", outside:true, floor:this.activeFloor+1 });
    }
  }

  start() {
    const loop = () => {
      if (this._disposed) return;
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, this._clock.getDelta());
      this._move(dt); this._updateCamera(); this._checkRoom();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  getPlayer() { return { x: this.pos.x, z: this.pos.z, yaw: this.yaw, floor: this.activeFloor }; }

  _disposeGroup(g) {
    g.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { const m = Array.isArray(o.material)?o.material:[o.material]; m.forEach(x=>{ if(x.map)x.map.dispose(); x.dispose(); }); }
    });
  }
  dispose() {
    this._disposed = true; cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("keydown", this._kd); window.removeEventListener("keyup", this._ku);
    document.removeEventListener("pointerlockchange", this._onLockChange);
    document.removeEventListener("mousemove", this._onMouseMove);
    if (document.pointerLockElement) document.exitPointerLock?.();
    if (this.houseGroup) this._disposeGroup(this.houseGroup);
    Object.values(this.textures).forEach(t => t.dispose());
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
  }
}
