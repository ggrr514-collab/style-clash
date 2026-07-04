import { useState, useRef, useEffect, useCallback } from "react";
import { generateHouse, CELL } from "./floorplan.js";
import { HouseGame } from "./three-house.js";

/* 部屋タイプ別のミニマップ色 */
const MAP_COLOR = {
  genkan: "#c9bda6", corridor: "#e0d3b8", hall: "#e0d3b8", stairs: "#d8b98c", stairwell: "#d8b98c",
  ldk: "#f2e3c0", kitchen: "#e8d6ad", bedroom: "#efe0bd", washitsu: "#cfe0a0",
  bath: "#bfe0ea", toilet: "#dbeaee", washroom: "#cfe0e6",
  closet: "#d8c4a4", balcony: "#c8c8c8",
};

const SIZES = [
  { idx: 0, label: "2LDK", desc: "コンパクトな一戸建て" },
  { idx: 1, label: "3LDK", desc: "標準的なファミリー住宅" },
  { idx: 2, label: "4LDK", desc: "ゆとりある間取り" },
  { idx: 3, label: "5LDK", desc: "広々とした大きな家" },
];

export default function App() {
  const [screen, setScreen] = useState("title");   // title | play
  const [sizeIdx, setSizeIdx] = useState(1);
  const [house, setHouse] = useState(null);
  const [room, setRoom] = useState(null);
  const [locked, setLocked] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [doorHint, setDoorHint] = useState(false);

  const mountRef = useRef(null);
  const gameRef = useRef(null);
  const miniRef = useRef(null);
  const houseRef = useRef(null);   // 描画ループから最新の家を参照

  useEffect(() => {
    setIsTouch("ontouchstart" in window || navigator.maxTouchPoints > 0);
  }, []);

  const startGame = useCallback((idx) => { setSizeIdx(idx); setScreen("play"); }, []);

  const newHouse = useCallback((idx) => {
    const i = idx == null ? sizeIdx : idx;
    const h = generateHouse(i);
    houseRef.current = h; setHouse(h); setRoom(null);
    if (gameRef.current) gameRef.current.build(h);
  }, [sizeIdx]);

  /* play画面に入ったら three を初期化 */
  useEffect(() => {
    if (screen !== "play" || !mountRef.current) return;
    const game = new HouseGame(mountRef.current, {
      onRoom: (r) => setRoom(r),
      onLock: (l) => setLocked(l),
      onHint: (on) => setDoorHint(on),
    });
    gameRef.current = game;
    const h = generateHouse(sizeIdx);
    houseRef.current = h; setHouse(h);
    game.build(h); game.start();
    return () => { game.dispose(); gameRef.current = null; };
  }, [screen]); // eslint-disable-line

  /* ミニマップ描画ループ(現在フロアを描画) */
  useEffect(() => {
    if (screen !== "play" || !miniRef.current) return;
    const cv = miniRef.current;
    const ctx = cv.getContext("2d");
    let raf;
    const DPR = Math.min(devicePixelRatio || 1, 2);
    const CSS = 150;
    cv.width = CSS * DPR; cv.height = CSS * DPR;
    cv.style.width = cv.style.height = CSS + "px";

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const h = houseRef.current; if (!h) return;
      const pl = gameRef.current ? gameRef.current.getPlayer() : { x: 0, z: 0, yaw: Math.PI, floor: 0 };
      const floor = h.floors[pl.floor] || h.floors[0];
      const pad = 8;
      const scale = Math.min((CSS - pad*2)/h.widthM, (CSS - pad*2)/h.depthM);
      const ox = pad, oy = pad;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, CSS, CSS);
      ctx.fillStyle = "rgba(20,22,30,0.55)"; ctx.fillRect(0, 0, CSS, CSS);
      const X = (mx) => ox + mx*scale, Y = (mz) => oy + mz*scale;

      for (const rm of floor.rooms) {
        ctx.fillStyle = MAP_COLOR[rm.type] || "#ddd";
        ctx.fillRect(X(rm.x0*CELL), Y(rm.z0*CELL), (rm.x1-rm.x0)*CELL*scale, (rm.z1-rm.z0)*CELL*scale);
      }
      for (const w of floor.walls) {
        ctx.strokeStyle = w.type === "window" ? "#5fb8d8" : w.type === "rail" ? "#9aa" : "#33302a";
        ctx.lineWidth = w.type === "solid" ? 2 : 1.5;
        ctx.beginPath(); ctx.moveTo(X(w.x1), Y(w.z1)); ctx.lineTo(X(w.x2), Y(w.z2)); ctx.stroke();
      }
      // 階段位置マーク
      const st = h.stairs;
      ctx.strokeStyle = "#c98a3a"; ctx.lineWidth = 1.5;
      ctx.strokeRect(X(st.x), Y(st.zBottom), (st.xEnd-st.x)*scale, (st.zTop-st.zBottom)*scale);

      const px = X(pl.x), py = Y(pl.z);
      ctx.save(); ctx.translate(px, py); ctx.rotate(-pl.yaw);
      ctx.fillStyle = "#ff4d5e";
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [screen]);

  /* ══════════ タイトル画面 ══════════ */
  if (screen === "title") {
    return (
      <div style={S.title}>
        <div style={S.titleInner}>
          <div style={S.logoBadge}>🏠 HOME EXPLORER</div>
          <h1 style={S.h1}>間取り探索ハウス</h1>
          <p style={S.lead}>
            2階建ての一戸建てを<b>毎回自動生成</b>。<br />
            階段で2階へ。一人称でリアルな家の中を歩き回ろう。
          </p>
          <div style={S.grid}>
            {SIZES.map((t) => (
              <button key={t.idx} style={S.card} onClick={() => startGame(t.idx)}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-4px)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "none")}>
                <div style={S.cardLabel}>{t.label}</div>
                <div style={S.cardDesc}>{t.desc}</div>
              </button>
            ))}
          </div>
          <p style={S.hint}>
            {isTouch
              ? "スマホ: 画面左半分ドラッグで移動 / 右半分ドラッグで視点"
              : "PC: 画面クリックで操作開始 · WASD/矢印で移動 · マウスで視点 · Shiftでダッシュ"}
          </p>
        </div>
      </div>
    );
  }

  /* ══════════ プレイ画面 ══════════ */
  return (
    <div style={S.playRoot}>
      <div ref={mountRef} style={S.canvasWrap} />

      {/* クロスヘア */}
      <div style={S.crosshair} />

      {/* 上部HUD: 現在の部屋 */}
      <div style={S.topbar}>
        <div style={S.roomTag}>
          <span style={S.floorBadge}>{room?.floor ? `${room.floor}F` : "1F"}</span>
          {room && room.name ? (
            <span><b>{room.name}</b>{room.tatami ? ` · 約${room.tatami}畳` : ""}</span>
          ) : (
            <span style={{ opacity: 0.7 }}>探索中…</span>
          )}
        </div>
        <div style={S.planTag}>{house?.label} · {house?.widthM.toFixed(1)}×{house?.depthM.toFixed(1)}m</div>
      </div>

      {/* ミニマップ */}
      <div style={S.miniWrap}>
        <canvas ref={miniRef} style={{ borderRadius: 8, display: "block" }} />
        <div style={S.miniLabel}>MAP</div>
      </div>

      {/* ドア開閉のヒント / ボタン */}
      {doorHint && !isTouch && (
        <div style={S.doorHint}><b>E</b> または <b>Space</b> でドアを開閉</div>
      )}
      {isTouch && (
        <button
          style={{ ...S.doorBtn, opacity: doorHint ? 1 : 0.4 }}
          onClick={() => gameRef.current?.toggleNearDoor()}
        >🚪 ドア開閉</button>
      )}

      {/* 操作ボタン */}
      <div style={S.actions}>
        <button style={S.btn} onClick={() => newHouse()}>🔀 別の家</button>
        <button style={S.btnGhost} onClick={() => setScreen("title")}>🏠 間取り変更</button>
      </div>

      {/* クリック開始オーバーレイ(PC・未ロック時) */}
      {!isTouch && !locked && (
        <div style={S.clickOverlay} onClick={() => mountRef.current?.querySelector("canvas")?.click()}>
          <div style={S.clickCard}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🖱️</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>クリックで探索スタート</div>
            <div style={{ fontSize: 13, opacity: 0.75, marginTop: 8, lineHeight: 1.7 }}>
              <b>WASD / 矢印キー</b> … 移動 ／ <b>マウス</b> … 見回す<br />
              <b>E / Space</b> … ドアの開閉 ／ <b>Shift</b> … ダッシュ<br />
              階段を上ると<b>2階</b>へ ／ <b>Esc</b> … 操作解除
            </div>
          </div>
        </div>
      )}

      {/* スマホ操作ガイド */}
      {isTouch && (
        <div style={S.touchGuide}>
          <div style={S.touchZone}>◐ 移動</div>
          <div style={S.touchZone}>視点 ◑</div>
        </div>
      )}
    </div>
  );
}

/* ══════════ スタイル ══════════ */
const S = {
  title: {
    position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
    background: "radial-gradient(1200px 700px at 50% -10%, #24304a 0%, #0b0d15 60%)",
    color: "#eef1f6", fontFamily: "'Hiragino Sans','Noto Sans JP',system-ui,sans-serif",
    padding: 20, overflow: "auto",
  },
  titleInner: { width: "100%", maxWidth: 640, textAlign: "center" },
  logoBadge: {
    display: "inline-block", fontSize: 12, letterSpacing: 3, fontWeight: 700,
    color: "#9fd0ff", border: "1px solid rgba(159,208,255,.4)", borderRadius: 20,
    padding: "5px 14px", marginBottom: 18,
  },
  h1: { fontSize: 40, margin: "0 0 14px", fontWeight: 800, letterSpacing: 1 },
  lead: { fontSize: 15, lineHeight: 1.9, opacity: 0.85, margin: "0 0 30px" },
  grid: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14, marginBottom: 26 },
  card: {
    background: "linear-gradient(160deg,#2a3557,#1a2036)", border: "1px solid rgba(255,255,255,.08)",
    borderRadius: 16, padding: "22px 16px", cursor: "pointer", color: "#eef1f6",
    transition: "transform .15s ease, box-shadow .15s", boxShadow: "0 6px 20px rgba(0,0,0,.35)",
    textAlign: "left",
  },
  cardLabel: { fontSize: 26, fontWeight: 800, color: "#ffd27a" },
  cardDesc: { fontSize: 13, opacity: 0.8, marginTop: 6 },
  hint: { fontSize: 12.5, opacity: 0.6, lineHeight: 1.7 },

  playRoot: { position: "fixed", inset: 0, overflow: "hidden", background: "#000",
    fontFamily: "'Hiragino Sans','Noto Sans JP',system-ui,sans-serif" },
  canvasWrap: { position: "absolute", inset: 0 },
  crosshair: {
    position: "absolute", left: "50%", top: "50%", width: 6, height: 6, marginLeft: -3, marginTop: -3,
    borderRadius: "50%", background: "rgba(255,255,255,.7)", boxShadow: "0 0 0 1.5px rgba(0,0,0,.4)",
    pointerEvents: "none",
  },
  topbar: {
    position: "absolute", top: 12, left: 12, right: 12, display: "flex", justifyContent: "space-between",
    gap: 10, pointerEvents: "none", flexWrap: "wrap", zIndex: 30,
  },
  roomTag: {
    background: "rgba(15,18,28,.72)", color: "#fff", padding: "9px 15px", borderRadius: 24,
    fontSize: 15, backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.1)",
    display: "flex", alignItems: "center", gap: 8,
  },
  roomIcon: { fontSize: 15 },
  floorBadge: {
    fontSize: 13, fontWeight: 800, color: "#20160a", background: "#ffce6a",
    borderRadius: 12, padding: "2px 9px", minWidth: 22, textAlign: "center",
  },
  planTag: {
    background: "rgba(15,18,28,.72)", color: "#ffd27a", padding: "9px 14px", borderRadius: 24,
    fontSize: 13, fontWeight: 700, backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.1)",
  },
  miniWrap: {
    position: "absolute", right: 12, bottom: 12, padding: 6, borderRadius: 12,
    background: "rgba(15,18,28,.55)", border: "1px solid rgba(255,255,255,.12)", backdropFilter: "blur(6px)",
    zIndex: 30,
  },
  miniLabel: { position: "absolute", top: 8, left: 12, fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,.6)", fontWeight: 700 },
  actions: { position: "absolute", left: 12, bottom: 12, display: "flex", gap: 10, zIndex: 30 },
  doorHint: {
    position: "absolute", left: "50%", top: "58%", transform: "translateX(-50%)", zIndex: 30,
    background: "rgba(15,18,28,.78)", color: "#fff", padding: "7px 14px", borderRadius: 20,
    fontSize: 13.5, border: "1px solid rgba(255,255,255,.14)", pointerEvents: "none", whiteSpace: "nowrap",
  },
  doorBtn: {
    position: "absolute", right: 12, bottom: 176, zIndex: 30,
    background: "#8ab6d8", color: "#0c1a26", border: "none", borderRadius: 24,
    padding: "11px 16px", fontSize: 14, fontWeight: 800, cursor: "pointer",
    boxShadow: "0 4px 14px rgba(0,0,0,.4)", transition: "opacity .15s",
  },
  btn: {
    background: "#ffce6a", color: "#20160a", border: "none", borderRadius: 24, padding: "11px 18px",
    fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,.4)",
  },
  btnGhost: {
    background: "rgba(15,18,28,.7)", color: "#fff", border: "1px solid rgba(255,255,255,.18)",
    borderRadius: 24, padding: "11px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer",
    backdropFilter: "blur(8px)",
  },
  clickOverlay: {
    position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(6,8,14,.55)", backdropFilter: "blur(3px)", cursor: "pointer", zIndex: 20,
  },
  clickCard: {
    background: "rgba(20,24,36,.9)", color: "#fff", borderRadius: 18, padding: "28px 34px",
    textAlign: "center", border: "1px solid rgba(255,255,255,.12)", boxShadow: "0 10px 40px rgba(0,0,0,.5)",
  },
  touchGuide: {
    position: "absolute", bottom: 74, left: 0, right: 0, display: "flex", justifyContent: "space-between",
    padding: "0 24px", pointerEvents: "none",
  },
  touchZone: {
    fontSize: 11, color: "rgba(255,255,255,.5)", background: "rgba(0,0,0,.3)", padding: "4px 10px",
    borderRadius: 12,
  },
};
