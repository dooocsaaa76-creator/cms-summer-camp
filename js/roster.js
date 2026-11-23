/* =====================================================================
   재원생 인원현황 — 배치생 리스트(.xlsx) 읽기 · 담임 배정 · 표시용 도우미
   - 엑셀 파일은 브라우저 안에서만 읽습니다 (원본 파일은 서버로 보내지 않음)
   - 학생 1명당 여러 줄(반마다 1줄)인 배치생 리스트를 학생 단위로 묶습니다.

   배정 규칙
   1. [HM##] 반(클라이매쓰 고등관) · 과학고 대비 · 면접대비 · 기출 예상 모의고사 반은 제외. 이 반만 듣는 학생은 명단에서 빠짐
   2. 정규반([FIT] [GS] [GSTOP] [BL] 등) > [PL] 개별진도반 > 단과([SM] [SL] [G] [RE] 등) 순으로 담임 결정
      - 정규반 + PL  → 정규반 담임
      - PL + 단과    → PL반 담임
      - 같은 종류가 여러 개면 [IL] 표시 반 우선, 그다음 요일(월→일) · 시간 순
   3. 반 이름에서 [IL] 은 빼고 표시
===================================================================== */

/* ---------------- 반 이름 ---------------- */
export const cleanClass = (s) => String(s || "").replace(/\[IL\]/gi, "").replace(/\s+/g, " ").trim();
const tagsOf = (s) => (String(s || "").match(/\[[^\]]*\]/g) || []).map((t) => t.slice(1, -1).toUpperCase());
export const isHM = (s) => tagsOf(s).some((t) => /^HM\d*$/.test(t));
export const isPL = (s) => tagsOf(s).some((t) => /^PL\d*$/.test(t));
const REGULAR_TAG = /^(FIT|GS|GSTOP|BL)\d*$/;
export const isRegular = (s) => !isPL(s) && tagsOf(s).some((t) => REGULAR_TAG.test(t));
export const classKind = (s) => (isExcluded(s) ? "제외" : isRegular(s) ? "정규" : isPL(s) ? "PL" : "단과");
const KIND_RANK = { 정규: 0, PL: 1, 단과: 2 };
const DAY_ORDER = "월화수목금토일";
// 요일: '_' 뒤(없으면 마지막 ']' 뒤)에서 처음 나오는 요일 글자
export function classDay(s) {
  const raw = String(s || "");
  const u = raw.lastIndexOf("_");
  const tail = u >= 0 ? raw.slice(u + 1) : raw.slice(raw.lastIndexOf("]") + 1);
  const m = tail.match(/[월화수목금토일]/);
  return m ? DAY_ORDER.indexOf(m[0]) : 9;
}
const classTime = (s) => { const m = String(s || "").match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : 9999; };
// 짧은 반 이름: [태그] 와 시간을 뺀 이름 (예: [IL][FIT09]중1-2_화목 19:00 → 중1-2_화목)
export const shortClass = (s) => cleanClass(s).replace(/\[[^\]]*\]/g, "").replace(/\s*\d{1,2}:\d{2}\s*$/, "").trim();
// 배치생 리스트의 이름 → 웹에 보일 이름 (리스트는 그대로 올려도 화면에서만 바뀜)
export const TEACHER_ALIAS = { "김수진": "김나연" };
// 프리미엄관 소속 선생님 (영재관 선생님 다음에 나열)
export const PREMIUM_TEACHERS = ["김나연", "유재은", "오선영"];
export const dispTeacher = (t) => { const s = String(t || "").replace(/[,\s]/g, "").trim(); return TEACHER_ALIAS[s] || s; };
export const teacherName = dispTeacher;
export const teacherHall = (t) => (!t || t === "미지정" ? 2 : PREMIUM_TEACHERS.includes(t) ? 1 : 0);
// 인원현황에서 아예 빼는 반: [HM] 클라이매쓰 + 과학고 대비 · 면접대비 · 기출 예상 모의고사
const EXCLUDE_NAME = /과학고\s*대비|면접\s*대비|기출\s*예상\s*모의고사/;
export const isExcluded = (s) => isHM(s) || EXCLUDE_NAME.test(String(s || ""));

function classSort(a, b) {
  return (KIND_RANK[a.kind] - KIND_RANK[b.kind])
    || ((/\[IL\]/i.test(b.raw) ? 1 : 0) - (/\[IL\]/i.test(a.raw) ? 1 : 0))
    || (classDay(a.raw) - classDay(b.raw))
    || (classTime(a.raw) - classTime(b.raw))
    || a.name.localeCompare(b.name, "ko");
}

/* ---------------- 학교 이름 줄이기 ---------------- */
export const SCHOOL_SHORT = {
  "중앙대학교사범대학부속초등학교": "중대부초",
  "중앙대학교사범대학부속중학교": "중대부중",
  "중대부중학교": "중대부중",
  "이화여자대학교사범대학부속초등학교": "이대부초",
  "서울교육대학교부설초등학교": "교대부초",
  "덜위치칼리지서울영국학교": "덜위치",
  "CMIS캐나다국제학교": "CMIS",
  "채드윅송도국제학교": "채드윅",
  "청심국제중학교": "청심중",
};
export function shortSchool(name) {
  let s = String(name || "").replace(/\s+/g, "").trim();
  if (!s) return "";
  if (SCHOOL_SHORT[s]) return SCHOOL_SHORT[s];
  s = s.replace(/여자고등학교$/, "여고").replace(/여자중학교$/, "여중")
    .replace(/초등학교$/, "초").replace(/고등학교$/, "고").replace(/중학교$/, "중");
  // 서울원촌중 → 원촌중 (서울고처럼 '서울'만 남는 경우는 그대로)
  const m = s.match(/^서울(.{2,})$/);
  if (m && /(초|중|고|여중|여고)$/.test(s)) s = m[1];
  return s;
}
export const shortGrade = (g) => (String(g || "").match(/[초중고]\s*\d/) || [String(g || "").trim()])[0].replace(/\s/g, "");

/* ---------------- 이름 비교용 ---------------- */
// 동명이인 구분용 접미사(A,B,a)·기호(♡)를 뗀 이름
export const baseName = (n) => String(n || "").replace(/\s+/g, "").replace(/[^가-힣A-Za-z]/g, "").replace(/[A-Za-z]+$/, "");

/* ---------------- 엑셀(.xlsx) 읽기 ---------------- */
const JSZIP_URL = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = JSZIP_URL; s.onload = () => res(window.JSZip); s.onerror = () => rej(new Error("엑셀 읽기 도구를 불러오지 못했습니다."));
    document.head.appendChild(s);
  });
}
const decXml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&");
const textOf = (xml) => decXml([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));
const colIndex = (ref) => [...ref].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

// 순수 함수: 시트 xml + 공유문자열 xml → 2차원 배열
export function sheetRows(sheetXml, sharedXml) {
  const ss = sharedXml ? [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : [];
  const rows = [];
  for (const r of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    let seq = 0;
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1], body = c[2] || "";
      const ref = (attrs.match(/\br="([A-Z]+)\d+"/) || [])[1];
      const idx = ref ? colIndex(ref) : seq;
      seq = idx + 1;
      const t = (attrs.match(/\bt="(\w+)"/) || [])[1];
      const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let val = "";
      if (t === "s") val = ss[+v] ?? "";
      else if (t === "inlineStr") val = textOf(body);
      else if (v !== undefined) val = decXml(v);
      row[idx] = val;
    }
    rows.push(row.map((x) => x ?? ""));
  }
  return rows;
}

export async function readXlsx(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (!(buf[0] === 0x50 && buf[1] === 0x4b)) throw new Error("엑셀 .xlsx 파일만 올릴 수 있습니다. (.xls 파일은 엑셀에서 '다른 이름으로 저장 → .xlsx'로 바꿔주세요)");
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(buf);
  // 첫 번째 시트 찾기
  let sheetPath = "xl/worksheets/sheet1.xml";
  try {
    const wb = await zip.file("xl/workbook.xml").async("string");
    const rid = (wb.match(/<sheet\b[^>]*r:id="([^"]+)"/) || [])[1];
    const rels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
    const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((x) => x.includes(`Id="${rid}"`));
    const target = rel && (rel.match(/Target="([^"]+)"/) || [])[1];
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
  } catch (e) { /* 기본 경로 사용 */ }
  const sheet = zip.file(sheetPath) || zip.file(/xl\/worksheets\/sheet\d+\.xml/)[0];
  if (!sheet) throw new Error("엑셀 시트를 찾을 수 없습니다.");
  const shared = zip.file("xl/sharedStrings.xml");
  return sheetRows(await sheet.async("string"), shared ? await shared.async("string") : "");
}

/* ---------------- 배치생 리스트 → 학생 목록 ---------------- */
const HEAD = { id: ["ID", "아이디", "학생ID"], name: ["이름", "학생명", "학생이름"], grade: ["학년"], gender: ["성별"], school: ["학교"], cls: ["클래스", "반", "반명"], teacher: ["교사", "담임", "선생님"], clsState: ["클래스 상태"], stState: ["학생 상태"] };
export function buildMembers(rows) {
  const hi = rows.findIndex((r) => r.some((v) => String(v).trim() === "이름") && r.some((v) => /^(클래스|반|반명)$/.test(String(v).trim())));
  if (hi < 0) throw new Error("배치생 리스트 형식이 아닙니다. 첫 줄에 '이름', '클래스', '교사' 열이 있어야 합니다.");
  const head = rows[hi].map((v) => String(v).trim());
  const col = {};
  Object.entries(HEAD).forEach(([k, names]) => { col[k] = head.findIndex((h) => names.includes(h)); });
  if (col.name < 0 || col.cls < 0) throw new Error("'이름' 또는 '클래스' 열을 찾을 수 없습니다.");
  const get = (r, k) => (col[k] >= 0 ? String(r[col[k]] ?? "").trim() : "");

  const byStudent = new Map();
  let lines = 0, hmLines = 0;
  rows.slice(hi + 1).forEach((r) => {
    const name = get(r, "name"); const raw = get(r, "cls").replace(/\s+/g, " ").trim();
    if (!name || !raw) return;
    lines++;
    if (get(r, "stState") && !/active/i.test(get(r, "stState"))) return;
    const id = get(r, "id") || `${name}|${get(r, "school")}|${get(r, "grade")}`;
    let s = byStudent.get(id);
    if (!s) byStudent.set(id, s = { sid: id.replace(/[\/.#$\[\]]/g, "_"), name, grade: shortGrade(get(r, "grade")), gender: get(r, "gender"), school: get(r, "school"), all: [] });
    const kind = classKind(raw);
    if (kind === "제외") hmLines++;
    s.all.push({ raw, kind, name: cleanClass(raw), teacher: teacherName(get(r, "teacher")), hold: /hold/i.test(get(r, "clsState")) });
  });

  const members = [], hmOnly = [];
  byStudent.forEach((s) => {
    const cls = s.all.filter((c) => c.kind !== "제외").sort(classSort);
    if (!cls.length) { hmOnly.push(s.name); return; }
    const main = cls[0];
    members.push({
      sid: s.sid, name: s.name, grade: s.grade, gender: s.gender, school: s.school,
      mainClass: main.name, mainKind: main.kind, teacher: main.teacher || "",
      classes: cls.map((c) => ({ name: c.name, kind: c.kind, teacher: c.teacher, hold: c.hold })),
    });
  });
  members.sort((a, b) => teacherHall(a.teacher) - teacherHall(b.teacher) || (a.teacher || "힣").localeCompare(b.teacher || "힣", "ko") || a.mainClass.localeCompare(b.mainClass, "ko") || a.name.localeCompare(b.name, "ko"));
  return { members, lines, hmLines, hmOnly, students: byStudent.size };
}

/* ---------------- 확정 단계 → 특강명단 표시 ---------------- */
export const OX = ["O", "△", "X"];
// 마지막으로 입력된 단계 기준. X 이거나 아무것도 없으면 null (특강명단에 넣지 않음)
export function memberStage(m) {
  if (!m) return null;
  const st = m.final ? { step: "확정", v: m.final } : m.c2 ? { step: "2차", v: m.c2 } : m.c1 ? { step: "1차", v: m.c1 } : null;
  if (!st || st.v === "X") return null;
  return { ...st, label: st.step === "확정" ? (st.v === "O" ? "확정" : "확정△") : `${st.step}${st.v}` };
}
