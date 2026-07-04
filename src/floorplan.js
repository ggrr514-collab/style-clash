/* ══════════════════════════════════════════════════════════════
   間取りジェネレーター  ―  日本の住宅っぽい間取りを自動生成する
   ────────────────────────────────────────────────────────────────
   考え方:
   ・グリッド(1マス = 0.91m ≒ 半間)の上に部屋を並べる。
   ・「バンド(横帯)」を手前→奥に積み上げ、各バンドを横幅で分割する
     ことで、必ず隙間なくタイル状に部屋が敷き詰められる。
   ・mergeUp で上の帯と縦につなげて廊下や縦長の部屋を作る。
   ・部屋の隣接グラフを作り、玄関からの全域木でドアを配置するので
     「どの部屋にも必ず行ける」ことが保証される。
   ・生成のたびに寸法・左右反転・家具がランダムに変わる。
   ══════════════════════════════════════════════════════════════ */

export const CELL = 0.91;      // 1グリッド = 半間
export const WALL_H = 2.45;    // 天井高
export const WALL_T = 0.09;    // 壁厚

/* ── 部屋タイプ定義 ── */
export const ROOM_TYPES = {
  genkan:   { name: "玄関",       floor: "tile",     habitable: false, wet: false, ceil: true,  color: 0x9a8f80 },
  corridor: { name: "廊下",       floor: "wood",     habitable: false, wet: false, ceil: true,  color: 0xbfa98a },
  ldk:      { name: "LDK",        floor: "wood",     habitable: true,  wet: false, ceil: true,  color: 0xc9b18c },
  living:   { name: "リビング",   floor: "wood",     habitable: true,  wet: false, ceil: true,  color: 0xc9b18c },
  kitchen:  { name: "キッチン",   floor: "tilewood", habitable: true,  wet: false, ceil: true,  color: 0xb9a37e },
  bedroom:  { name: "洋室",       floor: "wood",     habitable: true,  wet: false, ceil: true,  color: 0xc4ab84 },
  washitsu: { name: "和室",       floor: "tatami",   habitable: true,  wet: false, ceil: true,  color: 0x9caf6d },
  bath:     { name: "浴室",       floor: "wet",      habitable: false, wet: true,  ceil: true,  color: 0xa9c4cf },
  toilet:   { name: "トイレ",     floor: "wet",      habitable: false, wet: true,  ceil: true,  color: 0xc8d3d6 },
  washroom: { name: "洗面所",     floor: "wet",      habitable: false, wet: true,  ceil: true,  color: 0xbcc9cc },
  closet:   { name: "クローゼット",floor: "wood",    habitable: false, wet: false, ceil: true,  color: 0x8f7f68 },
  balcony:  { name: "バルコニー", floor: "concrete", habitable: false, wet: false, ceil: false, outdoor: true, color: 0x8b8b8b },
};

/* ── 乱数ヘルパー ── */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const ri = (rng, a, b) => a + Math.floor(rng() * (b - a + 1)); // [a,b]整数

/* ══════════ バンドテンプレート ══════════
   各テンプレートは {width, bands} を返す。
   band = { d: 帯の奥行(マス), cells: [{t: type, w: 幅マス, mergeUp?:bool}] }
   cells の w の合計 = width。mergeUp は真上の同x同幅セルと連結。
*/

/* 左側(x=0)に幅1マスの廊下スパインを通す統一モデル。
   玄関→廊下→水回り／LDK→各居室と自然に接続する。 */

function template1K(rng) {
  const W = ri(rng, 5, 6);
  const roomD = ri(rng, 4, 5);
  const bands = [
    // 玄関 + キッチン廊下 + ユニットバス
    { d: 2, cells: [ {t:"genkan", w:2}, {t:"corridor", w:W-4}, {t:"bath", w:2} ] },
    { d: 2, cells: [ {t:"kitchen", w:2}, {t:"corridor", w:W-4, mergeUp:true}, {t:"toilet", w:2} ] },
    { d: roomD, cells: [ {t:"bedroom", w:W} ] },
    { d: 1, cells: [ {t:"balcony", w:W} ] },
  ];
  return { type:"1K", width:W, bands };
}

function template1LDK(rng) {
  const W = 6;
  const ldkD = ri(rng, 4, 5);
  const bedD = ri(rng, 3, 4);
  const bands = [
    { d: 2, cells: [ {t:"corridor", w:1}, {t:"genkan", w:2}, {t:"washroom", w:W-3} ] },
    { d: 2, cells: [ {t:"corridor", w:1, mergeUp:true}, {t:"bath", w:3}, {t:"toilet", w:2} ] },
    { d: ldkD, cells: [ {t:"kitchen", w:2}, {t:"ldk", w:W-2} ] },
    { d: bedD, cells: [ {t:"bedroom", w:W} ] },
    { d: 1, cells: [ {t:"balcony", w:W} ] },
  ];
  return { type:"1LDK", width:W, bands };
}

function template2LDK(rng) {
  const W = ri(rng, 7, 8);
  const ldkD = ri(rng, 4, 5);
  const bedD = ri(rng, 3, 4);
  const bands = [
    { d: 2, cells: [ {t:"corridor", w:1}, {t:"genkan", w:2}, {t:"washroom", w:W-3} ] },
    { d: 2, cells: [ {t:"corridor", w:1, mergeUp:true}, {t:"bath", w:3}, {t:"toilet", w:2}, {t:"closet", w:W-6} ] },
    { d: ldkD, cells: [ {t:"kitchen", w:2}, {t:"ldk", w:W-2} ] },
    { d: bedD, cells: [ {t:"bedroom", w:Math.ceil(W/2)}, {t: pick(rng,["bedroom","washitsu"]), w:Math.floor(W/2)} ] },
    { d: 1, cells: [ {t:"balcony", w:W} ] },
  ];
  return { type:"2LDK", width:W, bands };
}

function template3LDK(rng) {
  const W = ri(rng, 8, 9);
  const ldkD = ri(rng, 4, 5);
  const bedD1 = ri(rng, 3, 4);
  const bedD2 = ri(rng, 3, 4);
  const half = Math.floor(W/2);
  const bands = [
    { d: 2, cells: [ {t:"corridor", w:1}, {t:"genkan", w:2}, {t:"washroom", w:W-3} ] },
    { d: 2, cells: [ {t:"corridor", w:1, mergeUp:true}, {t:"bath", w:3}, {t:"toilet", w:2}, {t:"closet", w:W-6} ] },
    { d: ldkD, cells: [ {t:"kitchen", w:2}, {t:"ldk", w:W-2} ] },
    { d: bedD1, cells: [ {t:"bedroom", w:half}, {t: pick(rng,["bedroom","washitsu"]), w:W-half} ] },
    { d: bedD2, cells: [ {t:"bedroom", w:W} ] },
    { d: 1, cells: [ {t:"balcony", w:W} ] },
  ];
  return { type:"3LDK", width:W, bands };
}

const TEMPLATES = {
  "1K":   template1K,
  "1LDK": template1LDK,
  "2LDK": template2LDK,
  "3LDK": template3LDK,
};

/* ══════════ グリッド構築 ══════════ */
function buildGrid(spec) {
  // 全帯の奥行合計 = rows、width = cols
  const cols = spec.width;
  let rows = 0;
  for (const b of spec.bands) rows += b.d;

  const grid = new Int16Array(cols * rows).fill(-1);
  const rooms = [];
  const idx = (c, r) => r * cols + c;

  // 各帯を配置
  let z0 = 0;
  const bandCellRooms = []; // 各帯セルの roomId 記録（mergeUp用）
  for (let bi = 0; bi < spec.bands.length; bi++) {
    const band = spec.bands[bi];
    const rowMap = []; // このバンドの {x0,x1,roomId}
    let x0 = 0;
    for (const cell of band.cells) {
      const x1 = x0 + cell.w;
      let roomId = -1;
      if (cell.mergeUp && bi > 0) {
        // 真上の帯で同じ x0..x1 のセルを探す
        const prev = bandCellRooms[bi - 1].find(c => c.x0 === x0 && c.x1 === x1);
        if (prev) roomId = prev.roomId;
      }
      if (roomId === -1) {
        roomId = rooms.length;
        rooms.push({ id: roomId, type: cell.t, x0, x1, z0, z1: z0 + band.d });
      } else {
        rooms[roomId].z1 = z0 + band.d; // 縦に伸ばす
      }
      // グリッド塗り
      for (let r = z0; r < z0 + band.d; r++)
        for (let c = x0; c < x1; c++)
          grid[idx(c, r)] = roomId;
      rowMap.push({ x0, x1, roomId });
      x0 = x1;
    }
    bandCellRooms.push(rowMap);
    z0 += band.d;
  }

  // 部屋の中心・寸法を計算
  for (const rm of rooms) {
    rm.cx = (rm.x0 + rm.x1) / 2 * CELL;
    rm.cz = (rm.z0 + rm.z1) / 2 * CELL;
    rm.w = (rm.x1 - rm.x0) * CELL;
    rm.d = (rm.z1 - rm.z0) * CELL;
    rm.info = ROOM_TYPES[rm.type];
    rm.name = rm.info.name;
    rm.tatami = Math.round((rm.w * rm.d) / 1.62); // 畳数の目安
  }

  return { cols, rows, grid, rooms };
}

/* ══════════ 隣接・ドア（全域木） ══════════ */
function buildDoors(g, rng) {
  const { cols, rows, grid, rooms } = g;
  const idx = (c, r) => r * cols + c;
  const roomOf = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows) ? -1 : grid[idx(c, r)];

  // 隣接エッジ収集: pairKey -> [{edge}]
  const adj = new Map();
  const addAdj = (a, b, edge) => {
    if (a === b || a < 0 || b < 0) return;
    const k = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (!adj.has(k)) adj.set(k, []);
    adj.get(k).push(edge);
  };
  // 縦エッジ(x=c ライン, セル(c-1,r)|(c,r))
  for (let c = 1; c < cols; c++)
    for (let r = 0; r < rows; r++)
      addAdj(roomOf(c-1,r), roomOf(c,r), { kind:"v", c, r });
  // 横エッジ(z=r ライン, セル(c,r-1)|(c,r))
  for (let r = 1; r < rows; r++)
    for (let c = 0; c < cols; c++)
      addAdj(roomOf(c,r-1), roomOf(c,r), { kind:"h", c, r });

  // 玄関からBFSで全域木 → 親へのドア
  const genkan = rooms.find(rm => rm.type === "genkan") || rooms[0];
  const graph = new Map();
  for (const k of adj.keys()) {
    const [a, b] = k.split("_").map(Number);
    if (!graph.has(a)) graph.set(a, []);
    if (!graph.has(b)) graph.set(b, []);
    graph.get(a).push(b);
    graph.get(b).push(a);
  }
  const visited = new Set([genkan.id]);
  const queue = [genkan.id];
  const doorKeys = new Set();
  const balconyDoors = [];

  const openEdge = (a, b, wide) => {
    const k = a < b ? `${a}_${b}` : `${b}_${a}`;
    const edges = adj.get(k);
    if (!edges || !edges.length) return;
    // 中央付近のエッジを選ぶ
    const mid = edges[Math.floor(edges.length / 2)];
    const rmB = rooms[b];
    const isBalcony = rooms[a].type === "balcony" || rmB.type === "balcony";
    const span = (isBalcony || wide) ? Math.min(2, edges.length) : 1;
    // 連続する span 本を中央から開ける
    const start = Math.max(0, Math.floor(edges.length / 2) - Math.floor(span / 2));
    for (let i = 0; i < span; i++) {
      const e = edges[start + i];
      if (!e) break;
      doorKeys.add(`${e.kind}:${e.c}:${e.r}`);
      if (isBalcony) balconyDoors.push(e);
    }
  };

  while (queue.length) {
    const cur = queue.shift();
    const neighbors = graph.get(cur) || [];
    // ランダム順で探索して家ごとに経路を変える
    for (let i = neighbors.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [neighbors[i], neighbors[j]] = [neighbors[j], neighbors[i]];
    }
    for (const nx of neighbors) {
      if (visited.has(nx)) continue;
      visited.add(nx);
      openEdge(cur, nx, false);
      queue.push(nx);
    }
  }

  return { doorKeys, genkan };
}

/* ══════════ 窓・玄関ドア ══════════ */
function buildOpenings(g, doorKeys, rng) {
  const { cols, rows, grid } = g;
  const idx = (c, r) => r * cols + c;
  const roomOf = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows) ? -1 : grid[idx(c, r)];

  const windowKeys = new Set();
  // 外周エッジで、居室(habitable)側なら一定確率で窓に
  const tryWindow = (a, b, key, chance) => {
    // どちらか一方が外(-1)
    const inside = a === -1 ? b : (b === -1 ? a : -1);
    if (inside === -1) return;
    const rt = g.rooms[inside];
    if (!rt) return;
    if (rt.info.habitable && rng() < chance) windowKeys.add(key);
  };
  for (let c = 1; c <= cols - 1; c++)
    for (let r = 0; r < rows; r++) {
      const a = roomOf(c-1,r), b = roomOf(c,r);
      if ((a === -1) !== (b === -1)) tryWindow(a, b, `v:${c}:${r}`, 0.55);
    }
  // 外周(左端 c=0, 右端 c=cols)
  for (let r = 0; r < rows; r++) {
    let a = roomOf(-1,r), b = roomOf(0,r);
    if ((a===-1)!==(b===-1)) tryWindow(a,b,`v:0:${r}`,0.55);
    a = roomOf(cols-1,r); b = roomOf(cols,r);
    if ((a===-1)!==(b===-1)) tryWindow(a,b,`v:${cols}:${r}`,0.55);
  }
  for (let r = 1; r <= rows - 1; r++)
    for (let c = 0; c < cols; c++) {
      const a = roomOf(c,r-1), b = roomOf(c,r);
      if ((a===-1)!==(b===-1)) tryWindow(a,b,`h:${c}:${r}`,0.5);
    }
  for (let c = 0; c < cols; c++) {
    let a = roomOf(c,-1), b = roomOf(c,0);
    if ((a===-1)!==(b===-1)) tryWindow(a,b,`h:${c}:0`,0.4);
    a = roomOf(c,rows-1); b = roomOf(c,rows);
    if ((a===-1)!==(b===-1)) tryWindow(a,b,`h:${c}:${rows}`,0.4);
  }

  // 玄関ドア: 玄関の手前側(外に面する)エッジを1つ開ける
  const genkan = g.rooms.find(rm => rm.type === "genkan");
  let entrance = null;
  if (genkan) {
    // 手前(z=0)側で外に面するセルを探す
    for (let c = genkan.x0; c < genkan.x1 && !entrance; c++) {
      if (roomOf(c, genkan.z0 - 1) === -1) {
        const key = `h:${c}:${genkan.z0}`;
        windowKeys.delete(key);
        entrance = { kind:"h", c, r: genkan.z0, key };
      }
    }
    // 見つからなければ左右
    if (!entrance) {
      for (let r = genkan.z0; r < genkan.z1 && !entrance; r++) {
        if (roomOf(genkan.x0 - 1, r) === -1) {
          const key = `v:${genkan.x0}:${r}`;
          windowKeys.delete(key); entrance = { kind:"v", c: genkan.x0, r, key };
        }
      }
    }
  }
  return { windowKeys, entrance };
}

/* ══════════ 壁セグメント抽出（連結マージ） ══════════ */
function buildWalls(g, doorKeys, windowKeys, entrance) {
  const { cols, rows, grid } = g;
  const idx = (c, r) => r * cols + c;
  const roomOf = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows) ? -1 : grid[idx(c, r)];
  const isBalcony = (id) => id >= 0 && g.rooms[id].type === "balcony";

  const walls = []; // {x1,z1,x2,z2, type:'solid'|'window'|'rail', horizontal:bool}

  // エッジの種類判定
  const edgeType = (a, b, key) => {
    if (a === b) return null;              // 同室 → 壁なし
    if (a === -1 && b === -1) return null; // 両方外
    if (entrance && key === entrance.key) return null; // 玄関ドア=開口
    if (doorKeys.has(key)) return null;    // 室内ドア=開口
    // バルコニーの外周は手すり
    const oneOutside = (a === -1 || b === -1);
    if (oneOutside && (isBalcony(a) || isBalcony(b))) return "rail";
    if (windowKeys.has(key)) return "window";
    return "solid";
  };

  // 縦壁: x=c ライン
  for (let c = 0; c <= cols; c++) {
    let run = null; // {r0, type}
    for (let r = 0; r <= rows; r++) {
      let t = null;
      if (r < rows) t = edgeType(roomOf(c-1,r), roomOf(c,r), `v:${c}:${r}`);
      if (run && run.type === t) continue;
      if (run) {
        walls.push({ x1:c*CELL, z1:run.r0*CELL, x2:c*CELL, z2:r*CELL, type:run.type, horizontal:false });
        run = null;
      }
      if (t) run = { r0:r, type:t };
    }
  }
  // 横壁: z=r ライン
  for (let r = 0; r <= rows; r++) {
    let run = null;
    for (let c = 0; c <= cols; c++) {
      let t = null;
      if (c < cols) t = edgeType(roomOf(c,r-1), roomOf(c,r), `h:${c}:${r}`);
      if (run && run.type === t) continue;
      if (run) {
        walls.push({ x1:run.c0*CELL, z1:r*CELL, x2:c*CELL, z2:r*CELL, type:run.type, horizontal:true });
        run = null;
      }
      if (t) run = { c0:c, type:t };
    }
  }
  return walls;
}

/* ══════════ 家具配置 ══════════ */
function placeFurniture(g, rng) {
  const items = [];
  const add = (kind, x, z, rot, opt) => items.push({ kind, x, z, rot: rot||0, ...(opt||{}) });

  for (const rm of g.rooms) {
    const x0 = rm.x0*CELL, x1 = rm.x1*CELL, z0 = rm.z0*CELL, z1 = rm.z1*CELL;
    const cx = rm.cx, cz = rm.cz, w = rm.w, d = rm.d;
    const t = 0.15; // 壁からのオフセット

    switch (rm.type) {
      case "ldk":
      case "living": {
        // ソファ + ローテーブル + TV
        add("sofa", cx, z1 - 0.6, 0, { w: Math.min(2.0, w*0.6) });
        add("rug", cx, cz + 0.2, 0, { w: Math.min(1.8, w*0.6), d: Math.min(1.2, d*0.35) });
        add("lowtable", cx, cz + 0.2, 0);
        add("tvstand", cx, z0 + 0.35, Math.PI, { w: Math.min(1.6, w*0.5) });
        add("plant", x1 - 0.4, z0 + 0.4, 0);
        // ダイニング(LDKのみ)
        if (rm.type === "ldk") {
          add("diningtable", x0 + Math.min(1.4, w*0.35), cz - d*0.15, 0);
        }
        break;
      }
      case "kitchen": {
        add("counter", cx, z0 + 0.35, 0, { w: w - 0.3 });
        add("fridge", x1 - 0.4, z1 - 0.4, 0);
        break;
      }
      case "bedroom": {
        // ベッド + デスク + 棚
        const bw = Math.min(1.4, w*0.55);
        add("bed", x0 + bw/2 + t, cz, Math.PI/2, { w: bw });
        add("desk", x1 - 0.35, z0 + 0.6, -Math.PI/2);
        add("shelf", x1 - 0.25, z1 - 0.6, -Math.PI/2);
        if (rng() < 0.5) add("plant", x0 + 0.35, z1 - 0.35, 0);
        break;
      }
      case "washitsu": {
        add("tatamiset", cx, cz, 0);          // 座卓＋座布団
        add("closetlow", cx, z0 + 0.3, 0, { w: w - 0.4 }); // 押入れ風
        break;
      }
      case "bath": {
        add("bathtub", cx, z1 - 0.6, 0, { w: Math.min(1.5, w*0.7) });
        break;
      }
      case "toilet": {
        add("toiletunit", cx, z1 - 0.35, Math.PI);
        break;
      }
      case "washroom": {
        add("washstand", cx, z0 + 0.35, 0, { w: Math.min(1.2, w*0.7) });
        add("washer", x1 - 0.4, z1 - 0.4, 0);
        break;
      }
      case "genkan": {
        add("shoebox", x1 - 0.2, cz, -Math.PI/2);
        break;
      }
      case "balcony": {
        if (rng() < 0.7) add("plant", x0 + 0.4, cz, 0);
        if (rng() < 0.5) add("acunit", x1 - 0.4, z0 + 0.4, 0);
        break;
      }
      default: break;
    }
  }
  return items;
}

/* ══════════ メイン生成関数 ══════════ */
export function generateFloorPlan(type = "2LDK", seed) {
  if (seed == null) seed = Math.floor(Math.random() * 1e9);
  const rng = makeRng(seed);
  const tpl = TEMPLATES[type] || TEMPLATES["2LDK"];
  const spec = tpl(rng);

  const g = buildGrid(spec);

  // 左右反転(50%)で見た目に変化を
  if (rng() < 0.5) mirrorX(g);

  const { doorKeys, genkan } = buildDoors(g, rng);
  const { windowKeys, entrance } = buildOpenings(g, doorKeys, rng);
  const walls = buildWalls(g, doorKeys, windowKeys, entrance);
  const furniture = placeFurniture(g, rng);

  // スポーン位置: 廊下スパインの手前に立って、奥(LDK方向)を向く。
  // 廊下が無ければ玄関から。yaw=PI で +z(奥)を向く。
  const corridor = g.rooms.find(rm => rm.type === "corridor");
  const gk = genkan || g.rooms[0];
  const base = corridor || gk;
  const spawn = {
    x: base.cx,
    z: base.z0 * CELL + Math.min(0.7, base.d * 0.4),
    yaw: Math.PI,
  };

  return {
    type: spec.type,
    seed,
    cols: g.cols, rows: g.rows,
    widthM: g.cols * CELL, depthM: g.rows * CELL,
    grid: g.grid,
    rooms: g.rooms,
    walls,
    furniture,
    entrance,
    spawn,
  };
}

/* 左右反転(グリッド・部屋・家具) */
function mirrorX(g) {
  const { cols, rows, grid } = g;
  const idx = (c, r) => r * cols + c;
  const ng = new Int16Array(cols * rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      ng[idx(c, r)] = grid[idx(cols - 1 - c, r)];
  g.grid.set(ng);
  for (const rm of g.rooms) {
    const nx0 = cols - rm.x1, nx1 = cols - rm.x0;
    rm.x0 = nx0; rm.x1 = nx1;
    rm.cx = (rm.x0 + rm.x1) / 2 * CELL;
  }
}
