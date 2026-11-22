/* =====================================================================
   CMS 서초영재관 방학특강 — 공통 설정 / 유틸
   index.html · admin.html · notice.html 에서 함께 사용합니다.
===================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyDCI98mwQ4lz3h0yzFfooTqXjrsdzyQArU",
  authDomain: "cms-summer-camp.firebaseapp.com",
  projectId: "cms-summer-camp",
  storageBucket: "cms-summer-camp.firebasestorage.app",
  messagingSenderId: "506548644045",
  appId: "1:506548644045:web:6fb7f90d37d5891747a184"
};
export const fbApp = initializeApp(firebaseConfig);
export const db = getFirestore(fbApp);

/* ---------------------------------------------------------------
   시즌 설정
   - SEASON: 현재 외부에 공개되는 시즌 (다음 방학 때 이 값만 바꾸면 됨)
   - LEGACY_SEASON: season 값이 없는 예전 데이터(2026 여름)를 부르는 이름
   ※ SEASON을 바꾸면 Firestore 보안규칙의 PUBLIC_SEASONS 도 같이 바꿔주세요.
---------------------------------------------------------------- */
export const SEASON = "2027겨울";
export const SEASON_LABEL = "2027 겨울방학";
export const LEGACY_SEASON = "2026여름";
export const SEASON_NAMES = { "2027겨울": "2027 겨울방학", "2026여름": "2026 여름방학" };
export const seasonOf = (x) => (x && x.season) || LEGACY_SEASON;
export const seasonName = (s) => SEASON_NAMES[s] || s;

/* 구글시트 백업 (Apps Script 웹앱) */
export const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyEOOvOMQhblJUSTMJyBCQ2zKJyq8r5PUJz-g9s9h0HxbLlhQ3sYVDZjV9-8WP-iKwyFw/exec";
export const SHEET_URL = "https://docs.google.com/spreadsheets/d/18sNJcYX8orImVibaF6Uh0RXjjKsdUDQxspZmsiPhJJo/edit";

export const CONTACT = "02-595-1280";
export const CATEGORIES = ["고등", "중등", "초등", "프리미엄관"];
export const HALLS = [
  { id: "gifted",  name: "영재관",    cats: ["고등", "중등", "초등"], logo: "assets/logo_gifted.png",  color: "var(--green)", address: "고무래로 18-4 송암빌딩 2층" },
  { id: "premium", name: "프리미엄관", cats: ["프리미엄관"],          logo: "assets/logo_premium.png", color: "var(--blue)", address: "동작대로 234 M빌딩" }
];
export const hallOf = (cat) => (cat === "프리미엄관" ? HALLS[1] : HALLS[0]);
export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
export const GRADES = ["초1","초2","초3","초4","초5","초6","중1","중2","중3","고1","고2","고3"];

/* 사이트 설정 기본값 (Firestore settings/site 문서가 없을 때 사용) */
export const DEFAULT_SETTINGS = {
  applyOpen: true,
  heroNote: "설 연휴 2/6(토) ~ 2/10(수) 기간은 휴강입니다.",
  winter: {
    enabled: true,
    title: "윈터스쿨",
    subtitle: "자기주도학습",
    time: "09:00~12:00",
    start: "2027-01-11",
    end: "2027-02-12",
    breaks: [{ from: "2027-02-06", to: "2027-02-10" }],
    room: "",
    blog: "https://blog.naver.com/cms_seocho/224485232446",
    desc: "정규과정 과제 및 타 학원 과제 학습. 일일 학습계획표에 따라 자기주도학습 능력을 키우는 소중한 아침 시간입니다. 요일 선택이 가능합니다."
  }
};
export function mergeSettings(raw) {
  const s = raw || {};
  return {
    ...DEFAULT_SETTINGS, ...s,
    winter: { ...DEFAULT_SETTINGS.winter, ...(s.winter || {}) }
  };
}

/* ---------------------------------------------------------------
   문자열 / 날짜 유틸
---------------------------------------------------------------- */
export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export const nl2br = (s) => esc(s).replace(/\n/g, "<br>");

export function parseDate(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}
export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const fmtMD = (d) => `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
export const fmtMDshort = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
export function fmtRange(start, end) {
  const a = parseDate(start), b = parseDate(end);
  if (a && b) return `${fmtMD(a)} ~ ${fmtMD(b)}`;
  if (a) return `${fmtMD(a)} ~`;
  return "";
}
export function inBreaks(d, breaks) {
  const t = isoDate(d);
  return (breaks || []).some((b) => b.from && t >= b.from && t <= (b.to || b.from));
}
export function breakText(breaks) {
  return (breaks || []).filter((b) => b.from).map((b) => {
    const a = parseDate(b.from), z = parseDate(b.to || b.from);
    return isoDate(a) === isoDate(z) ? fmtMD(a) : `${fmtMD(a)} ~ ${fmtMD(z)}`;
  }).join(", ");
}

/**
 * 요일·개강일·휴강·회차로 수업 날짜 목록을 계산.
 * - 계산 결과의 마지막 날짜가 종강일과 일치할 때만 "확정" (exact=true)
 */
export function computeSessions(v, breaks) {
  if (!v || !v.days || !v.days.length || !v.start || !v.count) return null;
  const start = parseDate(v.start), end = parseDate(v.end);
  if (!start) return null;
  const dayIdx = v.days.map((d) => WEEKDAYS.indexOf(d)).filter((i) => i >= 0);
  const out = [];
  const d = new Date(start);
  for (let guard = 0; guard < 400 && out.length < v.count; guard++) {
    if (dayIdx.includes(d.getDay()) && !inBreaks(d, breaks)) out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  const exact = out.length === +v.count && (!end || isoDate(out[out.length - 1]) === isoDate(end));
  return { dates: out, exact };
}

/* 반(variant) 표시용 텍스트 — 예전(여름) 데이터와 호환 */
export function variantTime(v) {
  if (!v) return "";
  if (v.days && v.days.length) {
    return `${v.days.join("·")} 주${v.days.length}회 ${v.time || ""}${v.count ? ` · 총 ${v.count}회` : ""}`.trim();
  }
  return v.time || "";
}
export function variantPeriod(v) {
  if (!v) return "";
  return v.period || fmtRange(v.start, v.end);
}
export function variantLabel(c, vi) {
  const v = (c.variants || [])[vi] || {};
  return (c.variants || []).length > 1 ? `${c.title} (${v.label || ""})` : c.title;
}
/* 여름 시즌 신청 데이터의 course 문자열과 같은 형식 */
export function legacyCourseLabel(c, v) {
  const suffix = (c.variants || []).length > 1 ? `(${(v.label || "").replace("반", "")})` : "";
  return `[${c.category}] ${c.title}${suffix}`;
}

export function sortCourses(list) {
  return list.sort((a, b) => {
    const ca = CATEGORIES.indexOf(a.category), cb = CATEGORIES.indexOf(b.category);
    if (ca !== cb) return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb);
    return (a.order || 0) - (b.order || 0);
  });
}

export function formatPhone(value) {
  const digits = String(value).replace(/\D/g, "").slice(0, 11);
  if (digits.length > 7) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length > 3) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return digits;
}
export function attachPhoneFormat(input) {
  input.addEventListener("input", (e) => { e.target.value = formatPhone(e.target.value); });
}

/* 구글시트 백업 전송 (실패해도 신청에는 영향 없음) */
export function backupToSheet(row) {
  if (!SCRIPT_URL) return;
  try {
    fetch(SCRIPT_URL, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(row).toString()
    }).catch(() => {});
  } catch (e) { /* ignore */ }
}

export function toast(msg, type = "") {
  let el = document.getElementById("__toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "__toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = "toast"; }, 2600);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (_) {}
    ta.remove(); return ok;
  }
}
