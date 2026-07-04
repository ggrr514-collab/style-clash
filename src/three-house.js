/* ══════════════════════════════════════════════════════════════
   three-house.js  ―  間取りデータから3Dの家を建てて一人称で歩く
   ・壁/床/天井/窓/家具を生成
   ・PC: クリックでポインタロック → マウス視点 + WASD/矢印移動
   ・スマホ: 左半分ドラッグで移動、右半分ドラッグで視点
   ・壁との当たり判定（軸分離スライド）
   ══════════════════════════════════════════════════════════════ */
import * as THREE from "three";
import { WALL_H, WALL_T, CELL, ROOM_TYPES } from "./floorplan.js";

const EYE = 1.55;
const RADIUS = 0.28;
const SPEED = 2.7;
const RUN = 4.4;

/* ── 手続き的テクスチャ ── */
function makeCanvasTexture(draw, size = 256) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
function woodTex() {
  return makeCanvasTexture((ctx, s) => {
    ctx.fillStyle = "#c9a978"; ctx.fillRect(0, 0, s, s);
    const planks = 4, pw = s / planks;
    for (let i = 0; i < planks; i++) {
      const base = 190 + Math.floor(Math.sin(i * 2.3) * 22);
      ctx.fillStyle = `rgb(${base},${base - 40},${base - 90})`;
      ctx.fillRect(i * pw, 0, pw - 2, s);
      // 木目
      ctx.strokeStyle = "rgba(120,80,40,0.25)"; ctx.lineWidth = 1;
      for (let y = 0; y < s; y += 7 + (i % 3)) {
        ctx.beginPath(); ctx.moveTo(i * pw, y);
        ctx.lineTo(i * pw + pw - 2, y + (i % 2 ? 3 : -3)); ctx.stroke();
      }
    }
    ctx.strokeStyle = "rgba(60,40,20,0.5)"; ctx.lineWidth = 2;
    for (let i = 0; i <= planks; i++) { ctx.beginPath(); ctx.moveTo(i * pw, 0); ctx.lineTo(i * pw, s); ctx.stroke(); }
  });
}
function tatamiTex() {
  return makeCanvasTexture((ctx, s) => {
    ctx.fillStyle = "#9fae63"; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "rgba(80,95,45,0.35)"; ctx.lineWidth = 1;
    for (let y = 0; y < s; y += 5) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke(); }
    // 縁(へり)
    ctx.strokeStyle = "#3a3a2a"; ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, s - 6, s - 6);
    ctx.beginPath(); ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s); ctx.stroke();
  });
}
function tileTex(col = "#e8e6df") {
  return makeCanvasTexture((ctx, s) => {
    ctx.fillStyle = col; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "rgba(150,150,150,0.5)"; ctx.lineWidth = 3;
    const n = 4, t = s / n;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath(); ctx.moveTo(i * t, 0); ctx.lineTo(i * t, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * t); ctx.lineTo(s, i * t); ctx.stroke();
    }
  });
}

/* ── 家具ファクトリ ── */
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0.05, ...o });
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}
function furnitureMesh(kind, opt) {
  const g = new THREE.Group();
  const w = opt.w || 1;
  switch (kind) {
    case "sofa": {
      const c = M(0x6b7b8c);
      g.add(box(w, 0.4, 0.85, c, 0, 0.2, 0));
      g.add(box(w, 0.5, 0.2, c, 0, 0.45, -0.32));
      g.add(box(0.18, 0.45, 0.85, c, -w/2+0.09, 0.42, 0));
      g.add(box(0.18, 0.45, 0.85, c, w/2-0.09, 0.42, 0));
      break;
    }
    case "lowtable": {
      const t = M(0x7a5230, { rough: 0.6 });
      g.add(box(1.0, 0.06, 0.5, t, 0, 0.35, 0));
      for (const [sx,sz] of [[-0.45,-0.2],[0.45,-0.2],[-0.45,0.2],[0.45,0.2]])
        g.add(box(0.05,0.35,0.05, t, sx, 0.17, sz));
      break;
    }
    case "diningtable": {
      const t = M(0x8a6038, { rough: 0.6 });
      g.add(box(1.2, 0.06, 0.75, t, 0, 0.72, 0));
      for (const [sx,sz] of [[-0.5,-0.3],[0.5,-0.3],[-0.5,0.3],[0.5,0.3]])
        g.add(box(0.07,0.72,0.07, t, sx, 0.36, sz));
      const ch = M(0x9a9a9a);
      g.add(box(0.4,0.05,0.4, ch, 0, 0.45, 0.55));
      g.add(box(0.4,0.4,0.05, ch, 0, 0.65, 0.72));
      g.add(box(0.4,0.05,0.4, ch, 0, 0.45, -0.55));
      g.add(box(0.4,0.4,0.05, ch, 0, 0.65, -0.72));
      break;
    }
    case "tvstand": {
      g.add(box(w, 0.4, 0.4, M(0x3a3a3a), 0, 0.2, 0));
      const tv = box(Math.min(1.3,w*0.9), 0.7, 0.05, M(0x111111, { rough: 0.3 }), 0, 0.9, -0.05);
      g.add(tv);
      break;
    }
    case "rug": {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(w, opt.d || 1.2),
        new THREE.MeshStandardMaterial({ color: 0xb05a4a, roughness: 1 }));
      r.rotation.x = -Math.PI/2; r.position.y = 0.02; r.receiveShadow = true; g.add(r);
      break;
    }
    case "bed": {
      const fr = M(0x7a5a3a);
      g.add(box(w, 0.3, 2.0, fr, 0, 0.15, 0));
      g.add(box(w, 0.18, 2.0, M(0xf0ece0), 0, 0.39, 0));       // マットレス
      g.add(box(w, 0.25, 0.4, M(0xdfe6ec), 0, 0.5, -0.75));    // 枕
      g.add(box(w, 0.05, 1.2, M(0x5a7a9a), 0, 0.52, 0.3));     // 掛け布団
      g.add(box(w, 0.6, 0.1, fr, 0, 0.4, -1.0));               // ヘッドボード
      break;
    }
    case "desk": {
      const t = M(0x6a4a2a);
      g.add(box(1.1, 0.05, 0.55, t, 0, 0.73, 0));
      g.add(box(0.05,0.73,0.5, t, -0.5, 0.36, 0));
      g.add(box(0.05,0.73,0.5, t, 0.5, 0.36, 0));
      g.add(box(0.5,0.35,0.03, M(0x111111,{rough:0.3}), 0, 1.0, -0.2)); // モニタ
      break;
    }
    case "shelf": {
      const s = M(0x8a6a48);
      g.add(box(0.8, 1.6, 0.3, s, 0, 0.8, 0));
      for (let i=1;i<4;i++) g.add(box(0.72,0.03,0.28, M(0x5a4028), 0, i*0.4, 0.01));
      for (let i=0;i<5;i++) g.add(box(0.08,0.28,0.22, M((i*97)%0xffffff), -0.3+i*0.15, 1.25, 0));
      break;
    }
    case "counter": {
      g.add(box(w, 0.9, 0.6, M(0xd8d2c4), 0, 0.45, 0));
      g.add(box(w, 0.05, 0.6, M(0x9a9a9a,{metal:0.4,rough:0.4}), 0, 0.92, 0)); // 天板
      g.add(box(0.5, 0.03, 0.35, M(0x777777,{metal:0.6,rough:0.3}), w*0.2, 0.94, 0)); // シンク
      break;
    }
    case "fridge": g.add(box(0.6, 1.7, 0.6, M(0xe8e8ec,{metal:0.2,rough:0.35}), 0, 0.85, 0)); break;
    case "toiletunit": {
      g.add(box(0.4, 0.4, 0.6, M(0xf5f5f5,{rough:0.3}), 0, 0.2, 0.05));
      g.add(box(0.4, 0.5, 0.2, M(0xf5f5f5,{rough:0.3}), 0, 0.45, -0.25));
      g.add(box(0.42, 0.06, 0.42, M(0xffffff,{rough:0.3}), 0, 0.42, 0.08));
      break;
    }
    case "bathtub": {
      g.add(box(w, 0.55, 0.8, M(0xf4f7f8,{rough:0.25}), 0, 0.28, 0));
      g.add(box(w-0.2, 0.2, 0.6, M(0xbfe0ea,{rough:0.15,metal:0.1,opacity:0.85,transparent:true}), 0, 0.42, 0));
      break;
    }
    case "washstand": {
      g.add(box(w, 0.8, 0.5, M(0xe8e4dc), 0, 0.4, 0));
      g.add(box(w, 0.04, 0.5, M(0xffffff,{rough:0.3}), 0, 0.82, 0));
      g.add(box(w*0.7, 0.9, 0.05, M(0xbfe0ea,{rough:0.1,metal:0.3,opacity:0.6,transparent:true}), 0, 1.4, -0.24)); // 鏡
      break;
    }
    case "washer": {
      g.add(box(0.6, 0.9, 0.6, M(0xf0f0f4,{rough:0.4}), 0, 0.45, 0));
      g.add(box(0.35, 0.35, 0.05, M(0x333333,{rough:0.2,metal:0.3}), 0, 0.55, 0.3));
      break;
    }
    case "shoebox": g.add(box(0.4, 1.4, w*0+1.4, M(0x9a7a58), 0, 0.7, 0)); break;
    case "closetlow": g.add(box(w, 0.9, 0.5, M(0xa88a62), 0, 0.45, 0)); break;
    case "tatamiset": {
      g.add(box(1.0, 0.28, 0.6, M(0x6a4a2a,{rough:0.6}), 0, 0.24, 0)); // 座卓
      g.add(box(0.5, 0.1, 0.5, M(0x9a5a4a), -0.8, 0.05, 0)); // 座布団
      g.add(box(0.5, 0.1, 0.5, M(0x9a5a4a), 0.8, 0.05, 0));
      break;
    }
    case "plant": {
      g.add(box(0.3, 0.35, 0.3, M(0x8a6a4a), 0, 0.17, 0));
      const leaf = M(0x3a7a3a);
      g.add(box(0.5, 0.9, 0.5, leaf, 0, 0.9, 0));
      break;
    }
    case "acunit": g.add(box(0.8, 0.28, 0.25, M(0xf2f2f2,{rough:0.4}), 0, 2.05, 0)); break;
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
    this._raf = null;
    this._disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8fb8d8);
    scene.fog = new THREE.Fog(0x8fb8d8, 30, 70);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(72, container.clientWidth / container.clientHeight, 0.05, 200);
    this.camera = camera;

    this.yaw = 0; this.pitch = 0;
    this.pos = new THREE.Vector3(0, EYE, 0);
    this.vel = new THREE.Vector3();
    this.keys = {};
    this.walls = [];       // 当たり判定AABB
    this.textures = {
      wood: woodTex(), tatami: tatamiTex(),
      tile: tileTex("#e8e6df"), wet: tileTex("#dfeaee"), concrete: tileTex("#9a9a9a"),
    };
    this._clock = new THREE.Clock();

    this._buildLights();
    this._bindControls();
    this._onResize = () => this._resize();
    window.addEventListener("resize", this._onResize);
  }

  _buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a7a, 0.75));
    const sun = new THREE.DirectionalLight(0xfff2df, 1.1);
    sun.position.set(12, 22, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 30;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    sun.shadow.camera.far = 80;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);
    this.sun = sun;
  }

  /* 間取りから3Dを構築 */
  build(plan) {
    // 既存の家を破棄
    if (this.houseGroup) { this.scene.remove(this.houseGroup); this._disposeGroup(this.houseGroup); }
    const group = new THREE.Group();
    this.houseGroup = group;
    this.scene.add(group);
    this.walls = [];
    this.plan = plan;

    const W = plan.widthM, D = plan.depthM;
    const cx = W / 2, cz = D / 2;

    // 屋外の地面
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x6f8a5a, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(cx, -0.02, cz);
    ground.receiveShadow = true; group.add(ground);
    // 建物の外基礎
    group.add(box(W + 0.4, 0.1, D + 0.4, M(0x777777), cx, -0.05, cz));

    this._buildFloorsAndCeilings(plan, group);
    this._buildWalls(plan, group);
    this._buildFurniture(plan, group);

    // 部屋ラベル用にルックアップ格子を保持
    this._grid = plan.grid; this._cols = plan.cols; this._rows = plan.rows;

    // スポーン
    this.pos.set(plan.spawn.x, EYE, plan.spawn.z);
    this.yaw = plan.spawn.yaw ?? Math.PI;    // 奥(z+)を向く
    this.pitch = 0;
    this.vel.set(0, 0, 0);
    this._curRoom = null;
    this._updateCamera();
    this.onReady(plan);
  }

  _floorMat(type) {
    const info = ROOM_TYPES[type];
    const key = info.floor === "tilewood" ? "wood" : info.floor;
    const tex = this.textures[key] || this.textures.wood;
    const t = tex.clone(); t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: info.wet ? 0.4 : 0.85, color: 0xffffff });
  }

  _buildFloorsAndCeilings(plan, group) {
    for (const rm of plan.rooms) {
      const w = rm.w, d = rm.d;
      const x = rm.cx, z = rm.cz;
      const mat = this._floorMat(rm.type);
      const rep = rm.type === "washitsu" ? [Math.max(1,Math.round(w/0.95)), Math.max(1,Math.round(d/0.95))]
                 : [Math.max(1, w / 1.0), Math.max(1, d / 1.0)];
      mat.map.repeat.set(rep[0], rep[1]);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      floor.rotation.x = -Math.PI / 2; floor.position.set(x, 0.01, z);
      floor.receiveShadow = true; group.add(floor);
      // 天井
      if (ROOM_TYPES[rm.type].ceil) {
        const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
          new THREE.MeshStandardMaterial({ color: 0xf3f0ea, roughness: 0.95 }));
        ceil.rotation.x = Math.PI / 2; ceil.position.set(x, WALL_H, z);
        group.add(ceil);
        // 天井灯
        const lamp = new THREE.PointLight(0xfff4e0, ROOM_TYPES[rm.type].habitable ? 0.7 : 0.4,
          Math.max(w, d) * 2.2, 2);
        lamp.position.set(x, WALL_H - 0.15, z);
        group.add(lamp);
        group.add(box(Math.min(0.6,w*0.4), 0.06, Math.min(0.6,d*0.4),
          new THREE.MeshStandardMaterial({ color:0xffffff, emissive:0xfff0d0, emissiveIntensity:0.6 }),
          x, WALL_H - 0.04, z));
      }
    }
  }

  _buildWalls(plan, group) {
    const wallMat = M(0xefe9df, { rough: 0.95 });
    const railMat = M(0x9aa0a4, { rough: 0.6, metal: 0.3 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xbfe6f0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28,
      side: THREE.DoubleSide,
    });
    const frameMat = M(0xd8d2c8, { rough: 0.7 });

    for (const w of plan.walls) {
      const midx = (w.x1 + w.x2) / 2, midz = (w.z1 + w.z2) / 2;
      const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
      const horiz = w.horizontal;
      const sx = horiz ? len : WALL_T;
      const sz = horiz ? WALL_T : len;

      if (w.type === "rail") {
        // バルコニー手すり(低い)
        const h = 1.05;
        const m = box(sx, h, sz, railMat, midx, h / 2, midz);
        group.add(m);
        group.add(box(sx, 0.05, sz, M(0x777777), midx, h, midz));
        this._addWallAABB(w, 0, h);
        continue;
      }

      if (w.type === "window") {
        // 腰壁 + 窓ガラス + 垂れ壁 + 枠
        const sill = 0.9, head = 2.05;
        group.add(box(sx, sill, sz, wallMat, midx, sill / 2, midz));                       // 腰壁
        group.add(box(sx, WALL_H - head, sz, wallMat, midx, (head + WALL_H) / 2, midz));   // 垂れ壁
        const gx = horiz ? len : 0.04, gz = horiz ? 0.04 : len;
        group.add(box(gx, head - sill, gz, glassMat, midx, (sill + head) / 2, midz));      // ガラス
        // 枠
        group.add(box(sx, 0.05, sz, frameMat, midx, sill, midz));
        group.add(box(sx, 0.05, sz, frameMat, midx, head, midz));
        this._addWallAABB(w, 0, WALL_H); // 窓も通り抜け不可
        continue;
      }

      // 通常壁
      group.add(box(sx, WALL_H, sz, wallMat, midx, WALL_H / 2, midz));
      this._addWallAABB(w, 0, WALL_H);
    }
  }

  _addWallAABB(w) {
    const half = WALL_T / 2 + RADIUS;
    const minX = Math.min(w.x1, w.x2) - (w.horizontal ? 0 : half) - (w.horizontal ? RADIUS : 0);
    const maxX = Math.max(w.x1, w.x2) + (w.horizontal ? 0 : half) + (w.horizontal ? RADIUS : 0);
    const minZ = Math.min(w.z1, w.z2) - (w.horizontal ? half : 0) - (w.horizontal ? 0 : RADIUS);
    const maxZ = Math.max(w.z1, w.z2) + (w.horizontal ? half : 0) + (w.horizontal ? 0 : RADIUS);
    this.walls.push({ minX, maxX, minZ, maxZ });
  }

  _buildFurniture(plan, group) {
    for (const f of plan.furniture) {
      const g = furnitureMesh(f.kind, f);
      if (!g.children.length) continue;
      g.position.set(f.x, 0, f.z);
      g.rotation.y = f.rot || 0;
      group.add(g);
    }
  }

  /* ── 操作 ── */
  _bindControls() {
    const dom = this.renderer.domElement;
    dom.style.touchAction = "none";
    dom.style.cursor = "pointer";

    // キーボード
    this._kd = e => {
      this.keys[e.code] = true;
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code)) e.preventDefault();
    };
    this._ku = e => { this.keys[e.code] = false; };
    window.addEventListener("keydown", this._kd);
    window.addEventListener("keyup", this._ku);

    // ポインタロック(PC)
    this._onClick = () => {
      if (!this._isTouch) dom.requestPointerLock?.();
    };
    dom.addEventListener("click", this._onClick);
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === dom;
      this.onLock(this.locked);
    };
    document.addEventListener("pointerlockchange", this._onLockChange);
    this._onMouseMove = e => {
      if (!this.locked) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
      this._clampPitch();
    };
    document.addEventListener("mousemove", this._onMouseMove);

    // タッチ(スマホ): 左=移動, 右=視点
    this.touchMove = null; this.touchLook = null;
    this._onTouchStart = e => {
      this._isTouch = true;
      for (const t of e.changedTouches) {
        if (t.clientX < window.innerWidth / 2 && !this.touchMove)
          this.touchMove = { id: t.identifier, ox: t.clientX, oy: t.clientY, dx: 0, dy: 0 };
        else if (!this.touchLook)
          this.touchLook = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
      e.preventDefault();
    };
    this._onTouchMove = e => {
      for (const t of e.changedTouches) {
        if (this.touchMove && t.identifier === this.touchMove.id) {
          this.touchMove.dx = t.clientX - this.touchMove.ox;
          this.touchMove.dy = t.clientY - this.touchMove.oy;
        } else if (this.touchLook && t.identifier === this.touchLook.id) {
          this.yaw -= (t.clientX - this.touchLook.x) * 0.006;
          this.pitch -= (t.clientY - this.touchLook.y) * 0.006;
          this.touchLook.x = t.clientX; this.touchLook.y = t.clientY;
          this._clampPitch();
        }
      }
      e.preventDefault();
    };
    this._onTouchEnd = e => {
      for (const t of e.changedTouches) {
        if (this.touchMove && t.identifier === this.touchMove.id) this.touchMove = null;
        if (this.touchLook && t.identifier === this.touchLook.id) this.touchLook = null;
      }
    };
    dom.addEventListener("touchstart", this._onTouchStart, { passive: false });
    dom.addEventListener("touchmove", this._onTouchMove, { passive: false });
    dom.addEventListener("touchend", this._onTouchEnd);
    dom.addEventListener("touchcancel", this._onTouchEnd);
  }

  _clampPitch() {
    const lim = Math.PI / 2 - 0.05;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  _resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /* ── 移動 + 当たり判定 ── */
  _move(dt) {
    let ix = 0, iz = 0; // 入力(前後左右)
    if (this.keys["KeyW"] || this.keys["ArrowUp"]) iz += 1;
    if (this.keys["KeyS"] || this.keys["ArrowDown"]) iz -= 1;
    if (this.keys["KeyA"] || this.keys["ArrowLeft"]) ix -= 1;
    if (this.keys["KeyD"] || this.keys["ArrowRight"]) ix += 1;
    const run = this.keys["ShiftLeft"] || this.keys["ShiftRight"];

    if (this.touchMove) {
      const dz = -this.touchMove.dy / 45, dx = this.touchMove.dx / 45;
      iz += Math.max(-1, Math.min(1, dz));
      ix += Math.max(-1, Math.min(1, dx));
    }

    const len = Math.hypot(ix, iz);
    if (len > 0.001) {
      ix /= Math.max(1, len); iz /= Math.max(1, len);
      const spd = (run ? RUN : SPEED) * dt;
      // yaw基準: 前方 = (sin, cos) を -z前提で
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      const fwdX = -sin, fwdZ = -cos;
      const rightX = cos, rightZ = -sin;
      let mx = (fwdX * iz + rightX * ix) * spd;
      let mz = (fwdZ * iz + rightZ * ix) * spd;
      this._tryMove(mx, mz);
    }
  }

  _tryMove(mx, mz) {
    // X軸
    let nx = this.pos.x + mx;
    if (!this._collides(nx, this.pos.z)) this.pos.x = nx;
    // Z軸
    let nz = this.pos.z + mz;
    if (!this._collides(this.pos.x, nz)) this.pos.z = nz;
  }

  _collides(x, z) {
    for (const w of this.walls) {
      if (x > w.minX && x < w.maxX && z > w.minZ && z < w.maxZ) return true;
    }
    return false;
  }

  _updateCamera() {
    this.camera.position.copy(this.pos);
    const dir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    this.camera.lookAt(this.pos.clone().add(dir));
  }

  _checkRoom() {
    if (!this._grid) return;
    const c = Math.floor(this.pos.x / CELL), r = Math.floor(this.pos.z / CELL);
    let id = -1;
    if (c >= 0 && r >= 0 && c < this._cols && r < this._rows) id = this._grid[r * this._cols + c];
    if (id !== this._curRoom) {
      this._curRoom = id;
      const rm = id >= 0 ? this.plan.rooms[id] : null;
      this.onRoom(rm ? { name: rm.name, tatami: rm.tatami, type: rm.type } : null);
    }
  }

  start() {
    const loop = () => {
      if (this._disposed) return;
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, this._clock.getDelta());
      this._move(dt);
      this._updateCamera();
      this._checkRoom();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  // ミニマップ用: プレイヤー位置と向き
  getPlayer() { return { x: this.pos.x, z: this.pos.z, yaw: this.yaw }; }

  _disposeGroup(g) {
    g.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
  }

  dispose() {
    this._disposed = true;
    cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("keydown", this._kd);
    window.removeEventListener("keyup", this._ku);
    document.removeEventListener("pointerlockchange", this._onLockChange);
    document.removeEventListener("mousemove", this._onMouseMove);
    if (document.pointerLockElement) document.exitPointerLock?.();
    if (this.houseGroup) this._disposeGroup(this.houseGroup);
    Object.values(this.textures).forEach(t => t.dispose());
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode)
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
  }
}
