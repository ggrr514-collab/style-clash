/* ══════════════════════════════════════════════════════════════
   間取りジェネレーター  ―  2階建ての一戸建てを自動生成する
   ────────────────────────────────────────────────────────────────
   ・グリッド(1マス = 0.91m ≒ 半間)の上に部屋を並べる。
   ・「バンド(横帯)」を手前→奥に積み上げ隙間なくタイル状に敷き詰める。
   ・1F/2Fで同じ footprint(幅×奥行) を共有し、同じ位置に階段を置く。
   ・階段は下端(z小)が1F床(Y=0)・上端(z大)が2F床(Y=FLOOR_H)。
   ・各フロアで玄関/ホールを起点に全域木でドアを配置し全室到達を保証。
   ・階段室は「下端は1Fの廊下」「上端は2Fのホール」だけにドアを開ける。
   ══════════════════════════════════════════════════════════════ */

export const CELL = 0.91;      // 1グリッド = 半間
export const WALL_H = 2.45;    // 各階の天井高
export const SLAB = 0.28;      // 床スラブ厚
export const FLOOR_H = WALL_H + SLAB; // 階高(床〜床)

export const WALL_T = 0.09;    // 壁厚

/* ── 部屋タイプ定義 ── */
export const ROOM_TYPES = {
  genkan:    { name: "玄関",       floor: "tile",     habitable: false, wet: false, ceil: true,  color: 0x9a8f80 },
  corridor:  { name: "廊下",       floor: "wood",     habitable: false, wet: false, ceil: true,  color: 0xbfa98a },
  hall:      { name: "ホール",     floor: "wood",     habitable: false, wet: false, ceil: true,  color: 0xc0aa8a },
  stairs:    { name: "階段",       floor: "wood",     habitable: false, wet: false, ceil: false, color: 0xa88a60 }, // 1F 吹抜け上部
  stairwell: { name: "階段",       floor: "none",     habitable: false, wet: false, ceil: true,  color: 0xa88a60 }, // 2F 床スラブ無し
  ldk:       { name: "LDK",        floor: "wood",     habitable: true,  wet: false, ceil: true,  color: 0xc9b18c },
  kitchen:   { name: "キッチン",   floor: "tilewood", habitable: true,  wet: false, ceil: true,  color: 0xb9a37e },
  bedroom:   { name: "洋室",       floor: "wood",     habitable: true,  wet: false, ceil: true,  color: 0xc4ab84 },
  washitsu:  { name: "和室",       floor: "tatami",   habitable: true,  wet: false, ceil: true,  color: 0x9caf6d },
  bath:      { name: "浴室",       floor: "wet",      habitable: false, wet: true,  ceil: true,  color: 0xa9c4cf },
  toilet:    { name: "トイレ",     floor: "wet",      habitable: false, wet: true,  ceil: true,  color: 0xc8d3d6 },
  washroom:  { name: "洗面所",     floor: "wet",      habitable: false, wet: true,  ceil: true,  color: 0xbcc9cc },
  closet:    { name: "クローゼット",floor: "wood",    habitable: false, wet: false, ceil: true,  color: 0x8f7f68 },
  balcony:   { name: "バルコニー", floor: "concrete", habitable: false, wet: false, ceil: false, outdoor: true, color: 0x8b8b8b },
};

/* ── 乱数ヘルパー ── */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const ri = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

/* ══════════ 2階建てテンプレート ══════════
   size 0..3 → 2LDK / 3LDK / 4LDK / 5LDK 相当
   共通: 左側 x[0,2) を廊下/ホールのスパイン、階段は x[0,2) z[4,7)。
*/
function houseTemplate(rng, size) {
  const W = 6 + size;                       // 幅 6..9 マス
  const ldkD = ri(rng, 3, 4);               // LDKの奥行き
  const backD = ri(rng, 3, 4);              // 1F奥(和室/LDK)
  const closetW = W - 7;                    // >0 なら1Fにクローゼット

  // ── 1F バンド ──
  const f1 = [
    { d: 2, cells: [ {t:"corridor", w:2}, {t:"genkan", w:2}, {t:"washroom", w:W-4} ] },
    { d: 2, cells: closetW > 0
        ? [ {t:"corridor", w:2, mergeUp:true}, {t:"bath", w:3}, {t:"toilet", w:2}, {t:"closet", w:closetW} ]
        : [ {t:"corridor", w:2, mergeUp:true}, {t:"bath", w:W-4}, {t:"toilet", w:2} ] },
    { d: 3, cells: [ {t:"stairs", w:2}, {t:"kitchen", w:2}, {t:"ldk", w:W-4} ] },
    { d: backD, cells: [ {t:"washitsu", w:4}, {t:"ldk", w:W-4, mergeUp:true} ] },
  ];
  const rows = 2 + 2 + 3 + backD;           // 総奥行き
  const stairs = { x0: 0, z0: 4, w: 2, d: 3 }; // z[4,7)

  // ── 2F バンド (footprint一致・階段吹抜けを同位置に) ──
  // 前方に寝室、中段に階段吹抜け+寝室、奥にホール+トイレ+バルコニー
  const frontBed = size >= 2
    ? [ {t:"bedroom", w:Math.ceil(W/2)}, {t:"bedroom", w:Math.floor(W/2)} ]  // 2部屋
    : [ {t:"bedroom", w:W} ];                                                // 1部屋
  const f2 = [
    { d: 4, cells: frontBed },                                        // z[0,4)
    { d: 3, cells: [ {t:"stairwell", w:2}, {t:"bedroom", w:W-2} ] },  // z[4,7) 吹抜け
    { d: rows - 7, cells: [ {t:"hall", w:2}, {t:"toilet", w:2}, {t:"balcony", w:W-4} ] }, // z[7,rows)
  ];

  const labels = ["2LDK", "3LDK", "4LDK", "5LDK"];
  return { label: labels[size] + " 一戸建て", W, rows, f1, f2, stairs };
}

/* ══════════ グリッド構築 ══════════ */
function buildGrid(bands, cols) {
  let rows = 0; for (const b of bands) rows += b.d;
  const grid = new Int16Array(cols * rows).fill(-1);
  const rooms = [];
  const idx = (c, r) => r * cols + c;
  let z0 = 0;
  const bandCellRooms = [];
  for (let bi = 0; bi < bands.length; bi++) {
    const band = bands[bi];
    const rowMap = [];
    let x0 = 0;
    for (const cell of band.cells) {
      const x1 = x0 + cell.w;
      let roomId = -1;
      if (cell.mergeUp && bi > 0) {
        const prev = bandCellRooms[bi - 1].find(c => c.x0 === x0 && c.x1 === x1);
        if (prev) roomId = prev.roomId;
      }
      if (roomId === -1) {
        roomId = rooms.length;
        rooms.push({ id: roomId, type: cell.t, x0, x1, z0, z1: z0 + band.d });
      } else {
        rooms[roomId].z1 = z0 + band.d;
      }
      for (let r = z0; r < z0 + band.d; r++)
        for (let c = x0; c < x1; c++) grid[idx(c, r)] = roomId;
      rowMap.push({ x0, x1, roomId });
      x0 = x1;
    }
    bandCellRooms.push(rowMap);
    z0 += band.d;
  }
  for (const rm of rooms) {
    rm.cx = (rm.x0 + rm.x1) / 2 * CELL;
    rm.cz = (rm.z0 + rm.z1) / 2 * CELL;
    rm.w = (rm.x1 - rm.x0) * CELL;
    rm.d = (rm.z1 - rm.z0) * CELL;
    rm.info = ROOM_TYPES[rm.type];
    rm.name = rm.info.name;
    rm.tatami = Math.round((rm.w * rm.d) / 1.62);
  }
  return { cols, rows, grid, rooms };
}

/* 左右反転 */
function mirrorX(g) {
  const { cols, rows, grid } = g;
  const idx = (c, r) => r * cols + c;
  const ng = new Int16Array(cols * rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) ng[idx(c, r)] = grid[idx(cols - 1 - c, r)];
  g.grid.set(ng);
  for (const rm of g.rooms) {
    const nx0 = cols - rm.x1, nx1 = cols - rm.x0;
    rm.x0 = nx0; rm.x1 = nx1;
    rm.cx = (rm.x0 + rm.x1) / 2 * CELL;
  }
}

/* ══════════ 隣接・ドア（全域木） ══════════ */
function buildDoors(g, rng, anchorType, stairConstraint) {
  const { cols, rows, grid, rooms } = g;
  const idx = (c, r) => r * cols + c;
  const roomOf = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows) ? -1 : grid[idx(c, r)];

  const adj = new Map();
  const addAdj = (a, b, edge) => {
    if (a === b || a < 0 || b < 0) return;
    const k = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (!adj.has(k)) adj.set(k, []);
    adj.get(k).push(edge);
  };
  for (let c = 1; c < cols; c++)
    for (let r = 0; r < rows; r++) addAdj(roomOf(c-1,r), roomOf(c,r), { kind:"v", c, r });
  for (let r = 1; r < rows; r++)
    for (let c = 0; c < cols; c++) addAdj(roomOf(c,r-1), roomOf(c,r), { kind:"h", c, r });

  // 階段室の隣接を「許可された相手」だけに剪定
  if (stairConstraint) {
    const { stairId, partnerId } = stairConstraint;
    for (const k of [...adj.keys()]) {
      const [a, b] = k.split("_").map(Number);
      if ((a === stairId || b === stairId)) {
        const other = a === stairId ? b : a;
        if (other !== partnerId) adj.delete(k);
      }
    }
  }

  const graph = new Map();
  for (const k of adj.keys()) {
    const [a, b] = k.split("_").map(Number);
    if (!graph.has(a)) graph.set(a, []);
    if (!graph.has(b)) graph.set(b, []);
    graph.get(a).push(b); graph.get(b).push(a);
  }
  const anchor = rooms.find(rm => rm.type === anchorType) || rooms[0];
  const visited = new Set([anchor.id]);
  const queue = [anchor.id];
  const doorKeys = new Set();

  const openEdge = (a, b) => {
    const k = a < b ? `${a}_${b}` : `${b}_${a}`;
    const edges = adj.get(k);
    if (!edges || !edges.length) return;
    const isStair = rooms[a].type === "stairs" || rooms[b].type === "stairs" ||
                    rooms[a].type === "stairwell" || rooms[b].type === "stairwell";
    const isBalcony = rooms[a].type === "balcony" || rooms[b].type === "balcony";
    // 階段は必ず端(下端/上端)にドア。バルコニーは広め。
    let span = (isBalcony) ? Math.min(2, edges.length) : 1;
    let start;
    if (isStair) { start = 0; span = Math.min(2, edges.length); } // 端(スパン全体寄り)
    else start = Math.max(0, Math.floor(edges.length / 2) - Math.floor(span / 2));
    for (let i = 0; i < span; i++) {
      const e = edges[start + i]; if (!e) break;
      doorKeys.add(`${e.kind}:${e.c}:${e.r}`);
    }
  };

  while (queue.length) {
    const cur = queue.shift();
    const neighbors = (graph.get(cur) || []).slice();
    for (let i = neighbors.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [neighbors[i], neighbors[j]] = [neighbors[j], neighbors[i]];
    }
    for (const nx of neighbors) {
      if (visited.has(nx)) continue;
      visited.add(nx); openEdge(cur, nx); queue.push(nx);
    }
  }
  return { doorKeys, anchor };
}

/* ══════════ 窓・玄関ドア ══════════ */
function buildOpenings(g, doorKeys, rng, opts) {
  const { cols, rows, grid, rooms } = g;
  const idx = (c, r) => r * cols + c;
  const roomOf = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows) ? -1 : grid[idx(c, r)];
  const windowKeys = new Set();

  const tryWindow = (a, b, key, chance) => {
    const inside = a === -1 ? b : (b === -1 ? a : -1);
    if (inside === -1) return;
    const rt = rooms[inside]; if (!rt) return;
    if (rt.info.habitable && rng() < chance) windowKeys.add(key);
  };
  for (let c = 0; c <= cols; c++)
    for (let r = 0; r < rows; r++) {
      const a = roomOf(c-1,r), b = roomOf(c,r);
      if ((a === -1) !== (b === -1)) tryWindow(a, b, `v:${c}:${r}`, 0.55);
    }
  for (let r = 0; r <= rows; r++)
    for (let c = 0; c < cols; c++) {
      const a = roomOf(c,r-1), b = roomOf(c,r);
      if ((a === -1) !== (b === -1)) tryWindow(a, b, `h:${c}:${r}`, 0.5);
    }

  let entrance = null;
  if (opts.entrance) {
    const genkan = rooms.find(rm => rm.type === "genkan");
    if (genkan) {
      for (let c = genkan.x0; c < genkan.x1 && !entrance; c++) {
        if (roomOf(c, genkan.z0 - 1) === -1) {
          const key = `h:${c}:${genkan.z0}`; windowKeys.delete(key);
          entrance = { kind:"h", c, r: genkan.z0, key };
        }
      }
      if (!entrance) for (let r = genkan.z0; r < genkan.z1 && !entrance; r++) {
        if (roomOf(genkan.x0 - 1, r) === -1) {
          const key = `v:${genkan.x0}:${r}`; windowKeys.delete(key);
          entrance = { kind:"v", c: genkan.x0, r, key };
        }
      }
    }
  }
  return { windowKeys, entrance };
}

/* ══════════ 壁セグメント抽出（連結マージ） ══════════ */
function buildWalls(g, doorKeys, windowKeys, entrance) {
  const { cols, rows, grid, rooms } = g;
  const idx = (c, r) => r * cols + c;
  const roomOf = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows) ? -1 : grid[idx(c, r)];
  const isBalcony = (id) => id >= 0 && rooms[id].type === "balcony";

  const walls = [];
  // 種別 + 外壁フラグ("solid|1" 等)を返し、マージ判定にも使う
  const edgeType = (a, b, key) => {
    if (a === b) return null;
    if (a === -1 && b === -1) return null;
    if (entrance && key === entrance.key) return null;
    if (doorKeys.has(key)) return null;
    const oneOutside = (a === -1 || b === -1);
    const ext = oneOutside ? 1 : 0;
    if (oneOutside && (isBalcony(a) || isBalcony(b))) return "rail|1";
    if (windowKeys.has(key)) return "window|" + ext;
    return "solid|" + ext;
  };
  const push = (o) => {
    const [type, ext] = o.type.split("|");
    walls.push({ ...o, type, exterior: ext === "1" });
  };

  for (let c = 0; c <= cols; c++) {
    let run = null;
    for (let r = 0; r <= rows; r++) {
      let t = null;
      if (r < rows) t = edgeType(roomOf(c-1,r), roomOf(c,r), `v:${c}:${r}`);
      if (run && run.type === t) continue;
      if (run) { push({ x1:c*CELL, z1:run.r0*CELL, x2:c*CELL, z2:r*CELL, type:run.type, horizontal:false }); run = null; }
      if (t) run = { r0:r, type:t };
    }
  }
  for (let r = 0; r <= rows; r++) {
    let run = null;
    for (let c = 0; c <= cols; c++) {
      let t = null;
      if (c < cols) t = edgeType(roomOf(c,r-1), roomOf(c,r), `h:${c}:${r}`);
      if (run && run.type === t) continue;
      if (run) { push({ x1:run.c0*CELL, z1:r*CELL, x2:c*CELL, z2:r*CELL, type:run.type, horizontal:true }); run = null; }
      if (t) run = { c0:c, type:t };
    }
  }
  return walls;
}

/* ══════════ 家具配置 ══════════ */
function placeFurniture(g, rng, level) {
  const items = [];
  const add = (kind, x, z, rot, opt) => items.push({ kind, x, z, rot: rot||0, ...(opt||{}) });

  for (const rm of g.rooms) {
    const x0 = rm.x0*CELL, x1 = rm.x1*CELL, z0 = rm.z0*CELL, z1 = rm.z1*CELL;
    const cx = rm.cx, cz = rm.cz, w = rm.w, d = rm.d;

    switch (rm.type) {
      case "ldk": {
        add("sofa", cx, z1 - 0.6, 0, { w: Math.min(2.0, w*0.55) });
        add("rug", cx, cz + 0.2, 0, { w: Math.min(2.0, w*0.6), d: Math.min(1.3, d*0.35) });
        add("lowtable", cx, cz + 0.2, 0);
        add("tvstand", cx, z0 + 0.35, Math.PI, { w: Math.min(1.7, w*0.5) });
        add("plant", x1 - 0.4, z0 + 0.45, 0);
        add("diningtable", x0 + Math.min(1.5, w*0.32), cz - d*0.12, 0);
        add("pendant", cx, 0, 0, { ceil: true });
        add("picture", x1 - 0.02, cz, -Math.PI/2, { wall: "x1" });
        add("floorlamp", x1 - 0.4, z1 - 0.5, 0);
        add("clock", cx + 0.6, z0 + 0.05, 0);
        add("wallshelf", x0 + 0.02, cz + d*0.15, Math.PI/2);
        break;
      }
      case "kitchen": {
        add("counter", cx, z0 + 0.35, 0, { w: w - 0.3 });
        add("range", cx - w*0.15, z0 + 0.35, 0);
        add("rangehood", cx - w*0.15, z0 + 0.2, 0, { ceil: false });
        add("upcab", cx, z0 + 0.2, 0, { w: w - 0.3 });
        add("fridge", x1 - 0.42, z1 - 0.42, 0);
        break;
      }
      case "bedroom": {
        // 「誰かの部屋」風にインテリア＆雑貨で作り込む
        const bw = Math.min(1.4, w*0.5);
        add("bed", x0 + bw/2 + 0.12, cz + d*0.05, Math.PI/2, { w: bw });
        add("nightstand", x0 + 0.28, cz - d*0.3, 0);
        add("lamp", x0 + 0.28, cz - d*0.3, 0, { y: 0.44 });          // ナイトスタンドの上
        add("wardrobe", x1 - 0.3, z0 + 0.6, -Math.PI/2, { w: Math.min(1.6, d*0.5) });
        add("desk", x1 - 0.35, z1 - 0.7, -Math.PI/2);
        add("laptop", x1 - 0.4, z1 - 0.7, -Math.PI/2, { y: 0.75 });  // デスクの上
        add("ceiling", cx, 0, 0, { ceil: true });
        add("rug", cx, cz + d*0.08, 0, { w: Math.min(1.7, w*0.55), d: Math.min(1.2, d*0.4) });
        add("stringlights", cx, z0 + 0.05, 0, { w: w * 0.9 });        // 壁のガーランドライト
        add("poster", x0 + w*0.62, z0 + 0.04, 0, { i: (rng()*6)|0 });
        add("picture", x0 + w*0.32, z0 + 0.04, 0, { wall: "z0" });
        add("bookstack", x0 + 0.55, z1 - 0.45, 0);                   // 床の本の山
        add("cushion", cx + w*0.12, cz + d*0.24, 0);
        add("plant", x0 + 0.38, z1 - 0.42, 0, { big: true });        // 隅の観葉植物
        add("mirror", x1 - 0.1, cz + d*0.2, -Math.PI/2, { y: 0.85 }); // 姿見
        break;
      }
      case "washitsu": {
        add("tatamiset", cx, cz, 0);
        // 床の間(奥壁の一方の隅)＋床柱
        add("tokonoma", x0 + 0.85, z0 + 0.32, 0, { w: 1.5 });
        add("woodpost", x0 + 1.62, z0 + 0.2, 0);
        if (w > 3.4) add("closetlow", x1 - 0.9, z0 + 0.3, 0, { w: Math.min(1.6, w - 2.0) });
        add("slatceil", cx, 0, 0, { ceil: true, w, d });   // 竿縁天井
        break;
      }
      case "bath": {
        add("bathtub", cx, z1 - 0.6, 0, { w: Math.min(1.6, w*0.7) });
        add("shower", x0 + 0.15, cz, Math.PI/2);
        break;
      }
      case "toilet": {
        add("toiletunit", cx, z1 - 0.45, Math.PI);
        add("toiletpaper", x0 + 0.14, z1 - 0.8, 0);
        add("toiletmat", cx, z1 - 0.35, 0, { w: Math.min(0.85, w * 0.72) });
        add("cornershelf", x0 + 0.22, z0 + 0.22, 0);
        add("tabletop", x0 + 0.22, z0 + 0.22, 0, { y: 1.32 });   // 棚上の小さな観葉
        break;
      }
      case "washroom": {
        add("washstand", cx, z0 + 0.35, 0, { w: Math.min(1.3, w*0.7) });
        add("washer", x1 - 0.42, z1 - 0.42, 0);
        break;
      }
      case "genkan": {
        add("shoebox", x1 - 0.2, cz, -Math.PI/2);
        add("kamachi", cx, z1 - 0.08, 0, { w });   // 上がり框
        break;
      }
      case "hall":
      case "corridor": {
        if (d > 2.5 && rng() < 0.6) add("plant", x0 + 0.3, cz, 0);
        break;
      }
      case "balcony": {
        if (rng() < 0.7) add("plant", x0 + 0.4, cz, 0);
        if (rng() < 0.6) add("acunit", x1 - 0.4, z0 + 0.4, 0);
        break;
      }
      default: break;
    }
  }
  return items;
}

/* ══════════ メイン生成関数 ══════════ */
export function generateHouse(size = 1, seed) {
  if (seed == null) seed = Math.floor(Math.random() * 1e9);
  const rng = makeRng(seed);
  const tpl = houseTemplate(rng, size);
  const cols = tpl.W;

  const g1 = buildGrid(tpl.f1, cols);
  const g2 = buildGrid(tpl.f2, cols);

  // 反転は両フロア＆階段を揃えて適用
  const mirror = rng() < 0.5;
  let stairs = { ...tpl.stairs };
  if (mirror) {
    mirrorX(g1); mirrorX(g2);
    stairs.x0 = cols - (stairs.x0 + stairs.w);
  }

  // 階段室の特定
  const stairsRoom = g1.rooms.find(rm => rm.type === "stairs");
  const stairwellRoom = g2.rooms.find(rm => rm.type === "stairwell");

  // 階段の相手(1F: 下端 z0 の外側 = 廊下 / 2F: 上端 z1 の外側 = ホール)
  const idx1 = (c, r) => r * cols + c;
  const px = stairsRoom.x0; // 反転後も x0..x1 に階段。代表セル
  const partner1 = g1.grid[idx1(px, stairsRoom.z0 - 1)]; // 下端の上(手前)= 廊下
  const idx2 = (c, r) => r * cols + c;
  const partner2 = g2.grid[idx2(px, stairwellRoom.z1)];  // 上端の先(奥)= ホール

  const d1 = buildDoors(g1, rng, "genkan", { stairId: stairsRoom.id, partnerId: partner1 });
  const d2 = buildDoors(g2, rng, "hall",   { stairId: stairwellRoom.id, partnerId: partner2 });

  const o1 = buildOpenings(g1, d1.doorKeys, rng, { entrance: true });
  const o2 = buildOpenings(g2, d2.doorKeys, rng, { entrance: false });

  const w1 = buildWalls(g1, d1.doorKeys, o1.windowKeys, o1.entrance);
  const w2 = buildWalls(g2, d2.doorKeys, o2.windowKeys, o2.entrance);

  let fur1 = placeFurniture(g1, rng, 0);
  let fur2 = placeFurniture(g2, rng, 1);

  // ── 出入り口(ドア)に床置き家具を置かない ──
  const WALL_MOUNTED = new Set(["pendant","ceiling","picture","clock","poster","stringlights","mirror","slatceil","acunit","rangehood","upcab","cornershelf","wallshelf"]);
  const doorPts = (keys, entrance) => {
    const pts = [];
    for (const k of keys) {
      const [kind, cc, rr] = k.split(":"); const c = +cc, r = +rr;
      pts.push(kind === "h" ? { x: (c + 0.5) * CELL, z: r * CELL } : { x: c * CELL, z: (r + 0.5) * CELL });
    }
    if (entrance) pts.push(entrance.kind === "h" ? { x: (entrance.c + 0.5) * CELL, z: entrance.r * CELL } : { x: entrance.c * CELL, z: (entrance.r + 0.5) * CELL });
    return pts;
  };
  const clearDoors = (fur, pts) => fur.filter(f => {
    if (WALL_MOUNTED.has(f.kind) || (f.y && f.y > 0.5)) return true;   // 壁/天井/棚上は対象外
    return !pts.some(p => Math.hypot(p.x - f.x, p.z - f.z) < 0.72);    // ドア前0.72m以内は除外
  });
  fur1 = clearDoors(fur1, doorPts(d1.doorKeys, o1.entrance));
  fur2 = clearDoors(fur2, doorPts(d2.doorKeys, null));

  // ドア位置(枠描画用)。"kind:c:r" → {horizontal,c,r, wash}
  const doorList = (g, keys, entrance) => {
    const { grid, cols } = g;
    const at = (c, r) => (c<0||r<0||c>=cols||r>=g.rows) ? -1 : grid[r*cols+c];
    const isWash = (id) => id >= 0 && g.rooms[id].type === "washitsu";
    const arr = [];
    for (const k of keys) {
      const [kind, cc, rr] = k.split(":"); const c = +cc, r = +rr;
      const a = kind === "h" ? at(c, r-1) : at(c-1, r);
      const b = at(c, r);
      arr.push({ horizontal: kind === "h", c, r, wash: isWash(a) || isWash(b) });
    }
    if (entrance) arr.push({ horizontal: entrance.kind === "h", c: entrance.c, r: entrance.r, entrance: true });
    return arr;
  };

  const floors = [
    { level: 0, cols, rows: g1.rows, grid: g1.grid, rooms: g1.rooms, walls: w1, furniture: fur1, entrance: o1.entrance, doors: doorList(g1, d1.doorKeys, o1.entrance) },
    { level: 1, cols, rows: g2.rows, grid: g2.grid, rooms: g2.rooms, walls: w2, furniture: fur2, entrance: null, doors: doorList(g2, d2.doorKeys, null) },
  ];

  // 階段情報(メートル)。下端 z0(Y=0) → 上端 z1(Y=FLOOR_H)
  const st = {
    x: stairsRoom.x0 * CELL,
    xEnd: stairsRoom.x1 * CELL,
    zBottom: stairsRoom.z0 * CELL,
    zTop: stairsRoom.z1 * CELL,
    w: stairsRoom.w, d: stairsRoom.d,
  };

  // スポーン: 家の外に立って玄関(和風の外観)を眺め、そこから入る
  const ent = o1.entrance;
  let spawn;
  if (ent && ent.kind === "h") {
    spawn = { x: (ent.c + 0.5) * CELL, z: ent.r * CELL - 3.2, yaw: Math.PI, floor: 0, outside: true };
  } else if (ent && ent.kind === "v") {
    spawn = { x: ent.c * CELL - 3.2, z: (ent.r + 0.5) * CELL, yaw: Math.PI / 2, floor: 0, outside: true };
  } else {
    const gk = g1.rooms.find(rm => rm.type === "genkan") || g1.rooms[0];
    spawn = { x: gk.cx, z: gk.z0 * CELL - 3.2, yaw: Math.PI, floor: 0, outside: true };
  }
  // 玄関の位置(ポーチ/飛び石用)
  const entrance = ent ? { x: (ent.kind === "h" ? (ent.c + 0.5) : ent.c) * CELL, z: (ent.kind === "h" ? ent.r : (ent.r + 0.5)) * CELL, kind: ent.kind } : null;

  return {
    label: tpl.label, seed,
    cols, rows: g1.rows,
    widthM: cols * CELL, depthM: g1.rows * CELL,
    floorH: FLOOR_H,
    floors, stairs: st, spawn, entrance,
  };
}
