/* ===========================================================
 * 国語文法 小テスト  —  code.gs（GAS サーバーサイド）
 *
 * クライアントHTMLから次の関数を呼び出す想定：
 *   google.script.run.checkEntry(number, code)        // 認証
 *   google.script.run.saveResult({ number, testName,  // 結果保存
 *                                  score, rate, time })
 *
 * スプレッドシートは3タブ構成。存在しなければ自動生成。
 *   ・生徒 … 出席番号 ｜ 個人コード
 *   ・ログ … タイムスタンプ｜出席番号｜テスト名｜正答数｜正答率｜所要秒｜評価｜有効
 *   ・集計 … 出席番号 ｜ <テスト名>_率 ｜ <テスト名>_秒 ｜ <テスト名>_評 ｜ …
 *
 * ベスト採用基準：正答率が高い方。同率なら所要秒が短い方。
 * =========================================================== */

/* ───────── 設定 ───────── */
const SHEET = {
  student: "生徒",
  log:     "ログ",
  summary: "集計"
};

const STUDENT_HEADERS = ["出席番号", "個人コード"];
const LOG_HEADERS = [
  "タイムスタンプ", "出席番号", "テスト名",
  "正答数", "正答率", "所要秒", "評価", "有効"
];

// ログシートの列インデックス（0始まり）
const col = {
  timestamp: 0, number: 1, test: 2,
  score: 3, rate: 4, time: 5, grade: 6, enabled: 7
};

// HTMLファイル名（GASエディタで追加したHTMLファイル名と一致させる）
const HTML_FILE = "index";

/* ───────── HTML配信 ───────── */
function doGet(e) {
  ensureSheets();
  return HtmlService.createHtmlOutputFromFile(HTML_FILE)
    .setTitle("国語文法 小テスト")
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0");
}

/* ───────── 認証 ───────── */
function checkEntry(number, code) {
  const n = String(number).trim();
  const c = String(code).trim();
  if (!n || !c) return false;
  const sh = getSheet(SHEET.student);
  const last = sh.getLastRow();
  if (last < 2) return false;
  const rows = sh.getRange(2, 1, last - 1, 2).getValues();
  return rows.some(r =>
    String(r[0]).trim() === n && String(r[1]).trim() === c
  );
}

/* ───────── 結果保存 ───────── */
function saveResult(payload) {
  try {
    if (!payload || payload.number == null || !payload.testName) {
      return { success: false, error: "payload不正" };
    }
    const score = Number(payload.score) || 0;
    const rate  = Number(payload.rate)  || 0;
    const time  = Number(payload.time)  || 0;
    const grade = judgeGrade(rate, time);

    const sh = getSheet(SHEET.log);
    sh.appendRow([
      new Date(),
      String(payload.number).trim(),
      String(payload.testName).trim(),
      score, rate, time, grade, true
    ]);

    // 追記直後に集計を更新。負荷が高い場合はトリガで定期実行に切替可能。
    updateSummary();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err && err.message || err) };
  }
}

/* ───────── 評価判定 ───────── */
function judgeGrade(rate, time) {
  if (rate === 100 && time <= 60) return "A";
  if (rate >= 80) return "B";
  if (rate >= 50) return "C";
  return "D";
}

/* ───────── 集計更新 ───────── */
function updateSummary() {
  const logSh = getSheet(SHEET.log);
  const sumSh = getSheet(SHEET.summary);

  sumSh.clear();

  const last = logSh.getLastRow();
  if (last < 2) {
    sumSh.getRange(1, 1).setValue("出席番号");
    return;
  }

  const rows = logSh.getRange(2, 1, last - 1, LOG_HEADERS.length).getValues();
  const enabled = rows.filter(r => r[col.enabled] === true);

  // 出席番号 × テスト名 のベスト（正答率優先、同率なら時間短い方）
  const bestMap = {};
  enabled.forEach(r => {
    const num  = String(r[col.number]).trim();
    const test = String(r[col.test]).trim();
    if (!num || !test) return;
    const rate  = Number(r[col.rate]);
    const time  = Number(r[col.time]);
    const grade = r[col.grade] || judgeGrade(rate, time);
    if (!bestMap[num]) bestMap[num] = {};
    const prev = bestMap[num][test];
    const better = !prev
      || rate > prev.rate
      || (rate === prev.rate && time < prev.time);
    if (better) bestMap[num][test] = { rate, time, grade };
  });

  const students = Object.keys(bestMap).sort();
  const tests = [...new Set(
    enabled.map(r => String(r[col.test]).trim()).filter(Boolean)
  )].sort();

  const header = ["出席番号"];
  tests.forEach(t => header.push(t + "_率", t + "_秒", t + "_評"));
  const output = [header];

  students.forEach(n => {
    const row = [n];
    tests.forEach(t => {
      const b = bestMap[n][t];
      if (b) row.push(b.rate, b.time, b.grade);
      else   row.push("", "", "");
    });
    output.push(row);
  });

  if (output.length > 0) {
    sumSh.getRange(1, 1, output.length, header.length).setValues(output);
    sumSh.getRange(1, 1, 1, header.length).setFontWeight("bold");
    sumSh.setFrozenRows(1);
  }
}

/* ───────── シート準備 ───────── */
function ensureSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const make = (name, headers) => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (headers && headers.length && sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, headers.length)
        .setValues([headers])
        .setFontWeight("bold");
      sh.setFrozenRows(1);
    }
    return sh;
  };

  make(SHEET.student, STUDENT_HEADERS);
  const logSh = make(SHEET.log, LOG_HEADERS);
  make(SHEET.summary, null);

  // ログシートの「有効」列をチェックボックス化（先生が手で切替可能に）
  const rule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  logSh.getRange(2, col.enabled + 1, Math.max(1, logSh.getMaxRows() - 1), 1)
       .setDataValidation(rule);
}

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { ensureSheets(); sh = ss.getSheetByName(name); }
  return sh;
}

/* ───────── スプレッドシート側メニュー ───────── */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("小テスト管理")
    .addItem("集計シートを更新", "updateSummary")
    .addItem("シートを初期化（不足分のみ作成）", "ensureSheets")
    .addToUi();
}
