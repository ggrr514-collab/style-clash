import { useState, useRef, useEffect, useCallback } from "react";
import { generateFloorPlan, CELL, ROOM_TYPES } from "./floorplan.js";
import { HouseGame } from "./three-house.js";

/* 部屋タイプ別のミニマップ色 */
const MAP_COLOR = {
  genkan: "#c9bda6", corridor: "#e0d3b8", ldk: "#f2e3c0", living: "#f2e3c0",
  kitchen: "#e8d6ad", bedroom: "#efe0bd", washitsu: "#cfe0a0",
  bath: "#bfe0ea", toilet: "#dbeaee", washroom: "#cfe0e6",
  closet: "#d8c4a4", balcony: "#c8c8c8",
};

const PLAN_TYPES = [
  { id: "1K",   label: "1K",   desc: "ひとり暮らしのワンルーム" },
  { id: "1LDK", label: "1LDK", desc: "少し広めのひとり暮らし" },
  { id: "2LDK", label: "2LDK", desc: "カップル・二人暮らし向け" },
  { id: "3LDK", label: "3LDK", desc: "ファミリー向けの間取り" },
];

export default function App() {
  const [screen, setScreen] = useState("title");   // title | play
  const [planType, setPlanType] = useState("2LDK");
  const [plan, setPlan] = useState(null);
  const [room, setRoom] = useState(null);
  const [locked, setLocked] = useState(false);
  const [isTouch, setIsTouch] = useState(false);

  const mountRef = useRef(null);
  const gameRef = useRef(null);
  const miniRef = useRef(null);

  useEffect(() => {
    setIsTouch("ontouchstart" in window || navigator.maxTouchPoints > 0);
  }, []);

  /* ゲーム開始 / 家生成 */
  const startGame = useCallback((type) => {
    setPlanType(type);
    setScreen("play");
  }, []);

  const newHouse = useCallback((type) => {
    const t = type || planType;
    const p = generateFloorPlan(t);
    setPlan(p);
    setRoom(null);
    if (gameRef.current) gameRef.current.build(p);
  }, [planType]);

  /* play画面に入ったら three を初期化 */
  useEffect(() => {
    if (screen !== "play" || !mountRef.current) return;
    const game = new HouseGame(mountRef.current, {
      onRoom: (r) => setRoom(r),
      onLock: (l) => setLocked(l),
    });
    gameRef.current = game;
    const p = generateFloorPlan(planType);
    setPlan(p);
    game.build(p);
    game.start();

    return () => { game.dispose(); gameRef.current = null; };
  }, [screen]); // eslint-disable-line

  /* ミニマップ描画ループ */
  useEffect(() => {
    if (screen !== "play" || !plan || !miniRef.current) return;
    const cv = miniRef.current;
    const ctx = cv.getContext("2d");
    let raf;
    const DPR = Math.min(devicePixelRatio || 1, 2);
    const CSS = 150;
    cv.width = CSS * DPR; cv.height = CSS * DPR;
    cv.style.width = cv.style.height = CSS + "px";

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const pad = 8;
      const scale = Math.min((CSS - pad * 2) / plan.widthM, (CSS - pad * 2) / plan.depthM);
      const ox = pad, oy = pad;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, CSS, CSS);
      ctx.fillStyle = "rgba(20,22,30,0.55)";
      ctx.fillRect(0, 0, CSS, CSS);
      const X = (mx) => ox + mx * scale;
      const Y = (mz) => oy + mz * scale;

      // 部屋塗り
      for (const rm of plan.rooms) {
        ctx.fillStyle = MAP_COLOR[rm.type] || "#ddd";
        ctx.fillRect(X(rm.x0 * CELL), Y(rm.z0 * CELL), (rm.x1 - rm.x0) * CELL * scale, (rm.z1 - rm.z0) * CELL * scale);
      }
      // 壁
      for (const w of plan.walls) {
        ctx.strokeStyle = w.type === "window" ? "#5fb8d8" : w.type === "rail" ? "#9aa" : "#33302a";
        ctx.lineWidth = w.type === "solid" ? 2 : 1.5;
        ctx.beginPath(); ctx.moveTo(X(w.x1), Y(w.z1)); ctx.lineTo(X(w.x2), Y(w.z2)); ctx.stroke();
      }
      // プレイヤー
      if (gameRef.current) {
        const pl = gameRef.current.getPlayer();
        const px = X(pl.x), py = Y(pl.z);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(-pl.yaw);   // yaw=PIで奥(z+)向き
        ctx.fillStyle = "#ff4d5e";
        ctx.beginPath();
        ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [screen, plan]);

  /* ══════════ タイトル画面 ══════════ */
  if (screen === "title") {
    return (
      <div style={S.title}>
        <div style={S.titleInner}>
          <div style={S.logoBadge}>🏠 HOME EXPLORER</div>
          <h1 style={S.h1}>間取り探索ハウス</h1>
          <p style={S.lead}>
            日本の住宅っぽい間取りを<b>毎回自動生成</b>。<br />
            一人称視点で、リアルな家の中を自由に歩き回ろう。
          </p>
          <div style={S.grid}>
            {PLAN_TYPES.map((t) => (
              <button key={t.id} style={S.card} onClick={() => startGame(t.id)}
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
          <span style={S.roomIcon}>📍</span>
          {room ? (
            <span><b>{room.name}</b>{room.tatami ? ` · 約${room.tatami}畳` : ""}</span>
          ) : (
            <span style={{ opacity: 0.7 }}>屋外 / 探索中…</span>
          )}
        </div>
        <div style={S.planTag}>{plan?.type} · {plan?.widthM.toFixed(1)}×{plan?.depthM.toFixed(1)}m</div>
      </div>

      {/* ミニマップ */}
      <div style={S.miniWrap}>
        <canvas ref={miniRef} style={{ borderRadius: 8, display: "block" }} />
        <div style={S.miniLabel}>MAP</div>
      </div>

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
              <b>WASD / 矢印キー</b> … 移動<br />
              <b>マウス</b> … 見回す ／ <b>Shift</b> … ダッシュ<br />
              <b>Esc</b> … 操作解除
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
