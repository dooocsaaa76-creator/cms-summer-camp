/* =====================================================================
   한글(.hwp / .hwpx) 학습 계획 안내문 → 웹 안내문 변환
   - 파일은 브라우저 안에서만 읽습니다 (서버로 보내지 않음)
   - extractBlocks(file)  : 문단/표 구조 추출
   - parseNotice(blocks, ctx) : 안내문 항목 + 확인 필요 목록
===================================================================== */
import { parseDate, isoDate, computeSessions, WEEKDAYS, fmtMD } from "./common.js";

/* ---------------- 외부 라이브러리 (필요할 때만 로드) ---------------- */
const libCache = {};
function loadScript(src, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (!libCache[src]) libCache[src] = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = () => res(window[globalName]); s.onerror = () => rej(new Error("라이브러리를 불러오지 못했습니다: " + src));
    document.head.appendChild(s);
  });
  return libCache[src];
}
const JSZIP_URL = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
const CFB_URL = "https://cdn.jsdelivr.net/npm/cfb@1.2.2/dist/cfb.min.js";

const PAKO_URL = "https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js";
// hwp 본문은 뒤에 여분 바이트가 붙는 경우가 있어 브라우저 기본 해제기 대신 pako 사용
async function inflateRaw(u8) {
  const pako = await loadScript(PAKO_URL, "pako");
  const inf = new pako.Inflate({ raw: true });
  inf.push(u8, true);
  if (inf.err && !(inf.result && inf.result.length)) throw new Error("hwp 본문 압축을 풀지 못했습니다.");
  return inf.result;
}

/* ---------------- 블록 구조 ----------------
   { type:"p", text }
   { type:"table", rows, cols, cells:[{r,c,rs,cs,text}] }
------------------------------------------------ */
export async function extractBlocks(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
  const isCfb = buf[0] === 0xd0 && buf[1] === 0xcf;
  if (isZip) return extractHwpx(buf);
  if (isCfb) return extractHwp(buf);
  throw new Error("한글 파일(.hwp / .hwpx)만 불러올 수 있습니다.");
}

/* ---------- HWPX (zip + xml) ---------- */
async function extractHwpx(buf) {
  const JSZip = await loadScript(JSZIP_URL, "JSZip");
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((n) => /^Contents\/section\d+\.xml$/i.test(n))
    .sort((a, b) => +a.match(/(\d+)\.xml$/i)[1] - +b.match(/(\d+)\.xml$/i)[1]);
  if (!names.length) throw new Error("hwpx 본문을 찾을 수 없습니다.");
  const blocks = [];
  for (const name of names) {
    const xml = await zip.file(name).async("string");
    const docx = new DOMParser().parseFromString(xml, "application/xml");
    walkHwpxParas(docx.documentElement, blocks);
  }
  return blocks;
}
const ln = (el) => el.localName;
function hwpxParaText(p, tablesOut) {
  let s = "";
  const visit = (el) => {
    for (const ch of el.children) {
      const n = ln(ch);
      if (n === "tbl") { tablesOut.push(hwpxTable(ch)); continue; }
      if (n === "t") { s += textOfT(ch); continue; }
      if (n === "subList" || n === "p") continue; // 글상자 등 내부 문단은 무시
      visit(ch);
    }
  };
  visit(p);
  return s;
}
function textOfT(t) {
  let s = "";
  for (const node of t.childNodes) {
    if (node.nodeType === 3) s += node.nodeValue;
    else if (node.nodeType === 1) { const n = ln(node); if (n === "tab") s += "\t"; else if (n === "lineBreak") s += "\n"; else s += node.textContent || ""; }
  }
  return s;
}
function walkHwpxParas(container, out) {
  for (const ch of container.children) {
    if (ln(ch) === "p") {
      const tables = [];
      const text = hwpxParaText(ch, tables);
      if (text.trim()) out.push({ type: "p", text: text.trim() });
      tables.forEach((t) => out.push(t));
    }
  }
}
function hwpxTable(tbl) {
  const cells = [];
  let rows = +tbl.getAttribute("rowCnt") || 0, cols = +tbl.getAttribute("colCnt") || 0;
  for (const tr of tbl.children) {
    if (ln(tr) !== "tr") continue;
    for (const tc of tr.children) {
      if (ln(tc) !== "tc") continue;
      let r = 0, c = 0, rs = 1, cs = 1, lines = [];
      for (const k of tc.children) {
        if (ln(k) === "cellAddr") { c = +k.getAttribute("colAddr") || 0; r = +k.getAttribute("rowAddr") || 0; }
        else if (ln(k) === "cellSpan") { cs = +k.getAttribute("colSpan") || 1; rs = +k.getAttribute("rowSpan") || 1; }
        else if (ln(k) === "subList") {
          for (const p of k.children) if (ln(p) === "p") { const t = hwpxParaText(p, []); if (t.trim()) lines.push(t.trim()); }
        }
      }
      cells.push({ r, c, rs, cs, text: lines.join("\n") });
    }
  }
  if (!rows) rows = Math.max(0, ...cells.map((x) => x.r + x.rs));
  if (!cols) cols = Math.max(0, ...cells.map((x) => x.c + x.cs));
  return { type: "table", rows, cols, cells };
}

/* ---------- HWP 5.0 (CFB + 레코드) ---------- */
async function extractHwp(buf) {
  const CFB = await loadScript(CFB_URL, "CFB");
  const cfb = CFB.read(buf, { type: "array" });
  const hdrEnt = CFB.find(cfb, "Root Entry/FileHeader") || CFB.find(cfb, "FileHeader");
  if (!hdrEnt) throw new Error("hwp 파일 헤더를 찾을 수 없습니다.");
  const hdr = hdrEnt.content;
  if (hdr[36] & 2) throw new Error("암호가 걸린 한글 파일은 불러올 수 없습니다.");
  const compressed = hdr[36] & 1;
  const blocks = [];
  for (let i = 0; ; i++) {
    const e = CFB.find(cfb, "Root Entry/BodyText/Section" + i) || CFB.find(cfb, "BodyText/Section" + i);
    if (!e) break;
    let data = new Uint8Array(e.content);
    if (compressed) data = await inflateRaw(data);
    parseHwpRecords(data, blocks);
  }
  if (!blocks.length) throw new Error("hwp 본문을 읽지 못했습니다. (배포용 문서는 지원하지 않습니다)");
  return blocks;
}
function parseHwpRecords(u8, out) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const stack = []; // 열린 표: {k, rows, cols, cells, cur}
  const closeTo = (L) => {
    while (stack.length && L < stack[stack.length - 1].k) {
      const t = stack.pop();
      out.push({ type: "table", rows: t.rows, cols: t.cols, cells: t.cells.map((c) => ({ r: c.r, c: c.c, rs: c.rs, cs: c.cs, text: c.lines.join("\n") })) });
    }
  };
  let p = 0;
  while (p + 4 <= u8.length) {
    const h = dv.getUint32(p, true); p += 4;
    const tag = h & 0x3ff, L = (h >>> 10) & 0x3ff;
    let size = (h >>> 20) & 0xfff;
    if (size === 0xfff) { size = dv.getUint32(p, true); p += 4; }
    const start = p; p += size;
    if (tag === 66) closeTo(L);            // PARA_HEADER
    if (tag === 77) {                       // TABLE
      closeTo(L);
      stack.push({ k: L, rows: size >= 8 ? dv.getUint16(start + 4, true) : 0, cols: size >= 8 ? dv.getUint16(start + 6, true) : 0, cells: [], cur: null });
    } else if (tag === 72) {                // LIST_HEADER (표 셀)
      const top = stack[stack.length - 1];
      if (top && top.k === L && size >= 16) {
        const cell = { c: dv.getUint16(start + 8, true), r: dv.getUint16(start + 10, true), cs: dv.getUint16(start + 12, true) || 1, rs: dv.getUint16(start + 14, true) || 1, lines: [] };
        top.cells.push(cell); top.cur = cell;
      }
    } else if (tag === 67) {                // PARA_TEXT
      const text = hwpText(dv, start, size);
      if (!text.trim()) continue;
      const top = stack[stack.length - 1];
      if (top && top.cur) top.cur.lines.push(text.trim());
      else if (!stack.length) out.push({ type: "p", text: text.trim() });
    }
  }
  closeTo(-1);
}
function hwpText(dv, start, size) {
  let s = "";
  const EXT = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  for (let j = 0; j + 1 < size; j += 2) {
    const c = dv.getUint16(start + j, true);
    if (c < 32) {
      if (c === 9) { s += "\t"; j += 14; continue; }
      if (EXT.includes(c)) { j += 14; continue; }
      if (c === 10) s += "\n";
      continue;
    }
    s += String.fromCharCode(c);
  }
  return s;
}

/* =====================================================================
   파서: 블록 → 안내문 초안
===================================================================== */
const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
const clean = (s) => String(s || "").replace(/[ \t\u00a0]+/g, " ").trim();
const squash = (s) => String(s || "").replace(/\s+/g, "");
const norm = (s) => String(s || "").toLowerCase().replace(/특강|과정|반$/g, "").replace(/[\s\/+·:,.()\[\]~\-_'"“”‘’]/g, "");

function grid(t) {
  const g = Array.from({ length: t.rows }, () => Array(t.cols).fill(null));
  t.cells.forEach((cell) => {
    for (let r = cell.r; r < Math.min(t.rows, cell.r + cell.rs); r++)
      for (let c = cell.c; c < Math.min(t.cols, cell.c + cell.cs); c++) g[r][c] = cell;
  });
  return g;
}
const tableText = (t) => t.cells.map((c) => c.text).join(" ");

function normTime(s) {
  const m = String(s || "").match(/(\d{1,2})\s*:\s*(\d{2})\s*[~∼\-–]\s*(\d{1,2})\s*:\s*(\d{2})/);
  if (!m) return "";
  const p = (h) => String(h).padStart(2, "0");
  return `${p(m[1])}:${m[2]}~${p(m[3])}:${m[4]}`;
}
function parseDays(s) {
  const t = squash(s).replace(/\(.*?\)/g, "");
  const range = t.match(/([월화수목금토일])[~∼\-]([월화수목금토일])/);
  if (range) { const a = DAYS.indexOf(range[1]), b = DAYS.indexOf(range[2]); if (a >= 0 && b >= a) return DAYS.slice(a, b + 1); }
  const only = t.replace(/[,.·、]/g, "");
  if (/^[월화수목금토일]+$/.test(only)) return DAYS.filter((d) => only.includes(d));
  return [];
}
const DATE_RE = /(\d{1,2})\s*[\/.]\s*(\d{1,2})\s*(?:\(\s*([월화수목금토일])\s*\))?/g;
function makeDateResolver(seasonYear, isWinter) {
  return (mo, d) => {
    let y = seasonYear;
    if (isWinter && mo >= 7) y = seasonYear - 1;
    return new Date(y, mo - 1, d);
  };
}
function datesIn(text, toDate) {
  const out = [];
  let m; DATE_RE.lastIndex = 0;
  while ((m = DATE_RE.exec(text))) {
    const mo = +m[1], d = +m[2];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    out.push({ raw: m[0].replace(/\s+/g, ""), date: toDate(mo, d), wd: m[3] || "", index: m.index });
  }
  return out;
}

/* ctx: { courses, season, seasonYear, isWinter, winterSettings, defaults } */
export function parseNotice(blocks, ctx) {
  const warn = [];
  const info = [];
  const toDate = makeDateResolver(ctx.seasonYear, ctx.isWinter);
  const draft = {};

  // ---------- 섹션 나누기 ----------
  const secOf = (txt) => { const m = clean(txt).match(/^([1-9])\s*[.)]\s*(.*)$/); return m ? { n: +m[1], rest: m[2] } : null; };
  const isPlanHead = (t) => /학습\s*계획/.test(t) && !/안내문/.test(t);
  const isTtHead = (t) => /시간표/.test(t);
  const isSessHead = (t) => /수업\s*구성/.test(t);
  const isCalHead = (t) => /학습\s*일정/.test(t);
  const sections = { intro: [], plan: [], tt: [], sess: [], cal: [] };
  let cur = "intro"; let sessHeadText = ""; let planHeadText = "";
  blocks.forEach((b) => {
    if (b.type === "p") {
      const s = secOf(b.text);
      if (s) {
        if (isPlanHead(s.rest)) { cur = "plan"; planHeadText = s.rest; return; }
        if (isTtHead(s.rest)) { cur = "tt"; return; }
        if (isSessHead(s.rest)) { cur = "sess"; sessHeadText = s.rest; return; }
        if (isCalHead(s.rest)) { cur = "cal"; return; }
      }
    }
    sections[cur].push(b);
  });
  // 제목이 섹션 앞에 없을 때를 대비해 표 내용으로도 찾기
  const allTables = blocks.filter((b) => b.type === "table");
  const findTable = (list, test) => list.find((b) => b.type === "table" && test(squash(tableText(b))));
  const planTable = findTable(sections.plan, (t) => /목표/.test(t)) || findTable(allTables, (t) => /수업.*과정.*목표/.test(t));
  const ttTable = findTable(sections.tt, (t) => /\d:\d\d/.test(t)) || findTable(allTables, (t) => /(구분|시간).*(월|화|수|목|금)/.test(t) && /\d{1,2}:\d\d/.test(t) && !/목표/.test(t));
  const sessTables = sections.sess.filter((b) => b.type === "table" && /회차|1회/.test(squash(tableText(b))));
  if (!sessTables.length) { const t = findTable(allTables, (x) => /회차.*수업진도/.test(x)); if (t) sessTables.push(t); }
  const calText = sections.cal.map((b) => b.type === "p" ? b.text : tableText(b)).join(" ");

  // ---------- 제목 / 반 이름 ----------
  const introParas = [];
  sections.intro.forEach((b) => { if (b.type === "p") introParas.push(...b.text.split("\n").map(clean).filter(Boolean)); });
  // 상단 슬로건·연락처 표(hwp 머리 표) 문구 제거
  const junk = (t) => /지적\s*공동체|^CMS\s*(영재관|프리미엄관|교과관)?$|^서초\S*관$|^\d{2,3}[)\-]\s*\d{3}-\d{4}$|서로의 생각을 공유/.test(t);
  const intro = introParas.filter((t) => !junk(t));
  let titleIdx = intro.findIndex((t) => /방학/.test(t) && /안내문/.test(t));
  let title = "";
  if (titleIdx >= 0) title = intro[titleIdx].replace(/[♥♡❤★☆■□▶◀◆◇●○※]/g, "").trim();
  else {
    const fromTable = allTables.map((t) => t.cells.map((c) => c.text)).flat().find((t) => /방학/.test(t) && /안내문/.test(t));
    if (fromTable) title = clean(fromTable.replace(/[♥♡❤★☆]/g, ""));
  }
  if (title) {
    const m = title.match(/^(?:\d{4}\s*년?\s*)?(?:서초\s*)?(.+?)\s*(?:반)?\s*(?:의)?\s*(겨울|여름)\s*방학/);
    if (m) draft.className = clean(m[1]).replace(/반$/, "").replace(/반의$/, "");
    if (/여름\s*방학/.test(title) && ctx.isWinter) warn.push(`제목이 「${title}」로 되어 있습니다. 여름방학 → 겨울방학, 연도를 확인해주세요. (웹 안내문 제목은 자동으로 만들어집니다)`);
    const y = title.match(/(\d{4})\s*년/);
    if (y && +y[1] !== ctx.seasonYear) warn.push(`제목의 연도가 ${y[1]}년입니다. 웹 안내문은 ${ctx.seasonYear}년으로 표시됩니다.`);
  } else warn.push("안내문 제목(반 이름)을 찾지 못했습니다. 반 이름을 직접 입력해주세요.");

  // ---------- 도입 문구 ----------
  const body = titleIdx >= 0 ? intro.slice(titleIdx + 1) : intro;
  const pickIdx = body.findIndex((t) => /그래서/.test(t) && /(준비|필수)/.test(t));
  let before = pickIdx >= 0 ? body.slice(0, pickIdx) : body;
  let after = pickIdx >= 0 ? body.slice(pickIdx + 1) : [];
  if (pickIdx >= 0) {
    draft.pickLead = body[pickIdx].replace(/[!！]?\s*$/, "!");
    const t0 = after[0] || "";
    const pm = t0.match(/^[▮■▶“"『「【\[]+\s*(.+?)\s*[▮■◀”"』」】\]]+$/);
    if (pm || (t0 && t0.length <= 30 && /특강|과정|수업/.test(t0) && !/^✔/.test(t0))) { draft.pickTitle = clean(pm ? pm[1] : t0); after = after.slice(1); }
  }
  if (before.length) { draft.headline = before[0]; before = before.slice(1); }
  draft.intro = before.join("\n");
  draft.closing = after.join("\n");
  draft.question = "";
  draft.points = "";
  draft.highlightTitle = ""; draft.highlightBody = "";

  // ---------- 1. 학습 계획 표 ----------
  const rows = { regular: [], special: [], winter: [] };
  if (planTable) {
    const g = grid(planTable);
    for (let r = 0; r < planTable.rows; r++) {
      const row = g[r]; if (!row[0]) continue;
      const kind = squash(row[0].text);
      const key = /정규/.test(kind) ? "regular" : /특강/.test(kind) ? "special" : /윈터|썸머|스쿨/.test(kind) ? "winter" : null;
      if (!key) continue;
      const seen = new Set([row[0]]);
      const cells = [];
      for (let c = 1; c < planTable.cols; c++) { const x = row[c]; if (x && !seen.has(x)) { seen.add(x); cells.push(x); } }
      rows[key].push(classifyRow(cells, row[planTable.cols - 1], row[0]));
    }
  } else warn.push("「1. 학습 계획」 표를 찾지 못했습니다. 정규수업·특강을 직접 입력해주세요.");
  const pr = (m) => planHeadText.match(/\((.+?)\)/);
  if (pr()) draft.planRange = pr()[1].replace(/\s*~\s*/g, " ~ ").replace(/(\d)월?\s*~\s*(\d)월/, "$1월 ~ $2월");

  // ---------- 2. 시간표 ----------
  const tt = { special: [], regular: [] }; // {time, days[], name}
  let ttWinterTime = "";
  if (ttTable) {
    const g = grid(ttTable);
    const head = g[0].map((c) => (c ? squash(c.text) : ""));
    for (let r = 1; r < ttTable.rows; r++) {
      const time = normTime(g[r][0] && g[r][0].text);
      if (!time) continue;
      for (let c = 1; c < ttTable.cols; c++) {
        const cell = g[r][c]; if (!cell) continue;
        const day = DAYS.find((d) => head[c] === d);
        const txt = squash(cell.text);
        if (/윈터|썸머|스쿨/.test(txt)) { ttWinterTime = time; continue; }
        if (!day) continue;
        const nm = (cell.text.match(/\(([^)]+)\)/) || [])[1] || "";
        if (/특강/.test(txt)) tt.special.push({ time, day, name: clean(nm) });
        else if (/정규/.test(txt)) tt.regular.push({ time, day, name: clean(nm) });
      }
    }
  }

  // ---------- 정규수업 ----------
  const regular = rows.regular.map((x) => ({ name: x.name, days: x.days, time: x.time, start: x.start, end: x.end, goal: x.goal, _daysCell: x.daysCell, _dates: x.dates }));
  // 시간표에서 시간/요일 보완
  regular.forEach((r) => {
    const byName = tt.regular.filter((t) => t.name && squash(t.name) === squash(r.name));
    if (byName.length) { r.days = DAYS.filter((d) => byName.some((t) => t.day === d)); if (!r.time) r.time = byName[0].time; }
  });
  // 같은 요일 칸을 여러 정규수업이 공유하면 요일을 하나씩 나눠 배정
  const groups = new Map();
  regular.forEach((r) => { if (r._daysCell) { if (!groups.has(r._daysCell)) groups.set(r._daysCell, []); groups.get(r._daysCell).push(r); } });
  groups.forEach((list) => {
    if (list.length < 2) return;
    const days = list[0].days;
    if (list.some((r) => tt.regular.some((t) => t.name && squash(t.name) === squash(r.name)))) return;
    if (days.length === list.length) {
      list.forEach((r, i) => { r.days = [days[i]]; });
      warn.push(`정규수업 ${list.map((r) => r.name).join(", ")}이(가) 요일 칸(${days.join(" ")})을 함께 쓰고 있어 순서대로 ${list.map((r, i) => `${r.name}=${days[i]}`).join(", ")}요일로 나눴습니다. 맞는지 확인해주세요.`);
    } else warn.push(`정규수업 ${list.map((r) => r.name).join(", ")}의 요일이 한 칸(${days.join(" ")})으로 묶여 있습니다. 반별 요일을 확인해주세요.`);
  });
  const regTime = tt.regular.length ? tt.regular[0].time : "";
  regular.forEach((r) => {
    if (!r.time && regTime) r.time = regTime;
    if (!r.time) warn.push(`정규수업 ${r.name}의 수업 시간을 찾지 못했습니다.`);
    checkWeekdays(r._dates, `정규수업 ${r.name}`, warn);
    delete r._daysCell; delete r._dates;
  });
  draft.regular = regular;

  // ---------- 특강 ----------
  const seasonCourses = (ctx.courses || []).filter((c) => (c.variants || []).length);
  const specials = [];
  rows.special.forEach((x, i) => {
    const ttHits = tt.special.filter((t) => !t.name || squash(t.name) === squash(x.name));
    const days = x.days.length ? x.days : DAYS.filter((d) => ttHits.some((t) => t.day === d));
    const time = x.time || (ttHits[0] && ttHits[0].time) || "";
    const docSessions = sessionsFrom(sessTables[i] || (rows.special.length === 1 ? sessTables[0] : null));
    const match = matchCourse(x.name, days, time, seasonCourses);
    let sp;
    if (match) {
      sp = ctx.specialFrom(match.c, match.vi, x.goal, x.goalDetail);
      const v = match.c.variants[match.vi];
      if (docSessions.length) {
        if (docSessions.length !== (v.count || 0)) warn.push(`특강 ${x.name}: 한글 파일의 수업 구성은 ${docSessions.length}회인데 등록된 강좌는 ${v.count}회입니다.`);
        sp.sessions = docSessions;
      }
      info.push(`특강 「${x.name}」 → 등록된 강좌 「${match.c.title}${(match.c.variants.length > 1) ? " (" + (v.label || "") + ")" : ""}」와 연결했습니다. 날짜는 강좌 관리의 일정으로 계산합니다.`);
      if (days.length && v.days && squash(days.join("")) !== squash(v.days.join(""))) warn.push(`특강 ${x.name}: 한글 파일 요일(${days.join(",")})과 등록된 강좌 요일(${v.days.join(",")})이 다릅니다. 강좌 일정 기준으로 표시합니다.`);
      if (time && v.time && normTime(v.time) !== time) warn.push(`특강 ${x.name}: 한글 파일 시간(${time})과 등록된 강좌 시간(${v.time})이 다릅니다. 강좌 시간 기준으로 표시합니다.`);
      if (x.start && v.start && x.start !== v.start) warn.push(`특강 ${x.name}: 한글 파일 개강일(${fmtMD(parseDate(x.start))})과 등록된 강좌 개강일(${fmtMD(parseDate(v.start))})이 다릅니다.`);
      if (x.end && v.end && x.end !== v.end && x.end > v.end) warn.push(`특강 ${x.name}: 한글 파일 종강일(${fmtMD(parseDate(x.end))})과 등록된 강좌 종강일(${fmtMD(parseDate(v.end))})이 다릅니다. 강좌 일정 기준으로 표시합니다.`);
    } else {
      const breaks = [...(x.breaks || []), ...(ctx.defaults.holidays || []).map((h) => ({ from: h.from, to: h.to }))];
      sp = { courseId: null, vi: 0, title: x.name, short: x.name.slice(0, 8), label: "", days, time, start: x.start, end: x.end, count: docSessions.length, period: "", sessions: docSessions, breaks, goal: x.goal, goalDetail: x.goalDetail };
      warn.push(`특강 「${x.name}」과 같은 강좌를 강좌 관리에서 찾지 못했습니다. 안내문에는 표시되지만 [특강 신청하러 가기]에서 자동 선택되지 않습니다. 필요하면 특강을 삭제하고 목록에서 다시 선택해주세요.`);
      const r = computeSessions(sp, sp.breaks);
      if (r && x.end && r.dates.length && isoDate(r.dates[r.dates.length - 1]) !== x.end) warn.push(`특강 ${x.name}: ${docSessions.length}회 일정으로 계산하면 마지막 수업이 ${fmtMD(r.dates[r.dates.length - 1])}인데, 한글 파일 종강일은 ${fmtMD(parseDate(x.end))}입니다.`);
    }
    // 한글 파일 자체의 기간 vs 회차 일정 점검
    if (x.end && match) {
      const r = computeSessions(sp, sp.breaks);
      if (r && r.dates.length) {
        const last = isoDate(r.dates[r.dates.length - 1]);
        if (x.end < last) warn.push(`특강 ${x.name}: 한글 파일에 기간이 「${x.periodRaw}」로 적혀 있지만 ${sp.sessions.length}회 수업은 ${fmtMD(r.dates[r.dates.length - 1])}까지 이어집니다.`);
      }
    }
    if (x.start && days.length) {
      const sd = parseDate(x.start);
      if (sd && !days.includes(WEEKDAYS[sd.getDay()])) warn.push(`특강 ${x.name}: 개강일 ${fmtMD(sd)}이 수업 요일(${days.join(",")})이 아닙니다.`);
    }
    checkWeekdays(x.dates, `특강 ${x.name}`, warn);
    specials.push(sp);
  });
  if (!rows.special.length) warn.push("학습 계획 표에서 특강을 찾지 못했습니다. 특강을 목록에서 직접 추가해주세요.");
  if (specials.length > 1 && sessTables.length < specials.length) warn.push("특강이 여러 개인데 수업 구성 표가 부족합니다. 회차 진도를 확인해주세요.");
  draft.specials = specials;

  // ---------- 특강 구성 안내 문구 ----------
  const fm = sessHeadText.match(/\*\s*(.+)$/);
  if (fm) draft.footnote = clean(fm[1]);

  // ---------- 윈터스쿨 ----------
  const w = rows.winter[0];
  draft.winter = { ...(ctx.defaults.winter || {}) };
  if (w) {
    draft.winter.on = true;
    if (w.goal) draft.winter.goal = w.goal;
    if (w.goalDetail) draft.winter.goalDetail = w.goalDetail;
    const docTime = w.time || ttWinterTime;
    const sw = ctx.winterSettings || {};
    info.push(`윈터스쿨 시간·기간은 [설정] 값(${sw.time || "-"})을 사용합니다.${docTime ? ` 한글 파일: ${docTime}` : ""}${w.periodRaw ? `, ${w.periodRaw}` : ""}`);
    if (docTime && sw.time && normTime(sw.time) !== docTime) warn.push(`윈터스쿨 시간이 한글 파일(${docTime})과 설정값(${sw.time})이 다릅니다.`);
  } else draft.winter.on = false;

  // ---------- 휴무 ----------
  const hm = squash(calText).match(/(설연휴|휴강|휴무|방학)[^()]*\((\d{1,2})[\/.](\d{1,2})~(\d{1,2})[\/.](\d{1,2})\)/);
  if (hm) {
    const from = isoDate(toDate(+hm[2], +hm[3])), to = isoDate(toDate(+hm[4], +hm[5]));
    draft.holidays = [{ from, to, label: /설/.test(hm[1]) ? "설 연휴" : "휴강" }];
  }

  return { draft, warn, info };

  /* ----- 내부 도우미 ----- */
  function classifyRow(cells, goalCell, kindCell) {
    const res = { name: "", days: [], time: "", start: "", end: "", goal: "", goalDetail: "", dates: [], breaks: [], periodRaw: "", daysCell: null };
    const rest = [];
    cells.forEach((cell) => {
      if (cell === goalCell && cells.length > 1) return;
      const t = cell.text;
      const ds = datesIn(t, toDate);
      if (ds.length && /\(.\)|~/.test(t)) {
        res.periodRaw = clean(t.replace(/\n/g, " "));
        res.dates = ds;
        // "2/1(월) ~ 2/10(수) 휴강" 같은 추가 휴강
        const lines = t.split("\n");
        const joined = lines.join(" ");
        const brk = joined.match(/(\d{1,2}[\/.]\d{1,2}[^~]*~\s*\d{1,2}[\/.]\d{1,2}[^가-힣]*)휴강/);
        let main = ds;
        if (brk) {
          const bd = datesIn(brk[1], toDate);
          if (bd.length >= 2) { res.breaks.push({ from: isoDate(bd[0].date), to: isoDate(bd[1].date) }); main = ds.filter((d) => d.index < joined.indexOf(brk[1])); }
        }
        if (main[0]) res.start = isoDate(main[0].date);
        if (main[1]) res.end = isoDate(main[1].date);
        return;
      }
      const days = parseDays(t.split("\n")[0]);
      if (days.length) { res.days = days; res.daysCell = cell; const tm = normTime(t); if (tm) res.time = tm; return; }
      if (normTime(t) && squash(t).replace(/[\d:~∼\-()]/g, "") === "") { res.time = normTime(t); return; }
      rest.push(cell);
    });
    if (rest.length) res.name = clean(rest[0].text.replace(/\n/g, " ")).replace(/(\S+)\s+(응용|심화|\+)/, "$1 $2");
    if (!res.name) res.name = clean((kindCell && kindCell.text) || "");
    const gl = String((goalCell && goalCell !== rest[0] ? goalCell.text : "") || "").split("\n").map(clean).filter(Boolean);
    res.goal = gl[0] || ""; res.goalDetail = gl.slice(1).join(" ");
    if (!res.time) { const tm = normTime(cells.map((c) => c.text).join(" ")); if (tm) res.time = tm; }
    return res;
  }
  function checkWeekdays(ds, label, out) {
    (ds || []).forEach((d) => {
      if (!d.wd) return;
      const real = WEEKDAYS[d.date.getDay()];
      if (real !== d.wd) out.push(`${label}: 「${d.raw}」의 요일이 맞지 않습니다. (${d.date.getFullYear()}년 ${d.date.getMonth() + 1}/${d.date.getDate()}은 ${real}요일)`);
    });
  }
}

function sessionsFrom(t) {
  if (!t) return [];
  const g = grid(t);
  const out = [];
  for (let r = 0; r < t.rows; r++) {
    const row = g[r]; if (!row[0]) continue;
    if (!/^\d+\s*회/.test(clean(row[0].text))) continue;
    const c1 = row.find((x, i) => i > 0 && x && x !== row[0]);
    out.push(c1 ? clean(c1.text.replace(/\n/g, " ")) : "");
  }
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
}

function matchCourse(name, days, time, courses) {
  const n = norm(name);
  if (!n) return null;
  let best = null;
  courses.forEach((c) => {
    const keys = [c.title, c.subtitle, ...(String(c.title).split(":"))].filter(Boolean).map(norm).filter((k) => k.length >= 3);
    let score = 0;
    keys.forEach((k) => {
      if (k === n) score = Math.max(score, 100);
      else if (k.includes(n) || n.includes(k)) score = Math.max(score, 60 + Math.min(k.length, n.length));
    });
    if (!score) return;
    (c.variants || []).forEach((v, vi) => {
      let s = score;
      if (days.length && v.days && squash(days.join("")) === squash(v.days.join(""))) s += 20;
      if (time && normTime(v.time) === time) s += 5;
      if (!best || s > best.s) best = { c, vi, s };
    });
  });
  return best;
}
