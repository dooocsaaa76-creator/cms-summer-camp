/* =====================================================================
   반별 겨울방학 학습 계획 안내문 렌더러
   (★ 겨울방학 안내문 양식 - 각 특강 담당 특강별 대표 안내문 업로드.hwp 구성 기반)
   admin.html 미리보기 / notice.html 공개 페이지에서 공통 사용
===================================================================== */
import { esc, nl2br, parseDate, isoDate, fmtMD, fmtMDshort, fmtRange, inBreaks, computeSessions, WEEKDAYS, CONTACT } from "./common.js";

export const NOTICE_DEFAULTS = {
  slogan: "서로의 생각을 공유하고 발전시킴으로써 함께 성장하는 ‘지적 공동체(Intellectual Community)’를 지향합니다.",
  question: "왜 이번 겨울방학 특강이 필수일까요?",
  footnote: "재원생들은 진행 과정과의 연계를 위해 특강 수업 전원 필수 참여로 진행됩니다.",
  holidays: [{ from: "2027-02-06", to: "2027-02-10", label: "설 연휴" }],
  winterGoal: "정규과정 과제 및 타 학원 과제 학습",
  winterGoalDetail: "소중한 아침 시간. 일일 학습계획표에 따른 자기주도학습 능력을 키울 수 있는 시간!"
};

const startMin = (t) => {
  const m = String(t || "").match(/(\d{1,2}):(\d{2})/);
  return m ? +m[1] * 60 + +m[2] : 9999;
};
const DAY_ORDER = ["월", "화", "수", "목", "금", "토", "일"];

function timetable(n) {
  const items = [];
  if (n.winter && n.winter.on) items.push({ days: ["월", "화", "수", "목", "금"], time: n.winter.time, text: `${n.winter.title || "윈터스쿨"} (요일 선택 가능)`, cls: "w" });
  (n.specials || []).forEach((s) => items.push({ days: s.days || [], time: s.time, text: `방학 특강<br><small>${esc(s.title)}</small>`, cls: "s" }));
  (n.regular || []).forEach((r) => items.push({ days: r.days || [], time: r.time, text: `정규 수업<br><small>${esc(r.name)}</small>`, cls: "r" }));
  const valid = items.filter((i) => i.time && i.days.length);
  if (!valid.length) return "";
  const days = DAY_ORDER.filter((d) => valid.some((i) => i.days.includes(d)));
  const times = [...new Set(valid.map((i) => i.time))].sort((a, b) => startMin(a) - startMin(b));
  const rows = times.map((t) => {
    const cells = days.map((d) => {
      const hit = valid.filter((i) => i.time === t && i.days.includes(d));
      return { html: hit.map((h) => h.text).join("<hr>"), cls: hit.length ? hit[0].cls : "" };
    });
    let out = "";
    for (let i = 0; i < cells.length;) {
      let j = i + 1;
      while (j < cells.length && cells[j].html && cells[j].html === cells[i].html) j++;
      out += `<td colspan="${j - i}" class="${cells[i].html ? "on " + cells[i].cls : ""}">${cells[i].html}</td>`;
      i = j;
    }
    return `<tr><th>${esc(t)}</th>${out}</tr>`;
  }).join("");
  return `<table class="nt-tt"><thead><tr><th>구 분</th>${days.map((d) => `<th>${d}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
}

function calendar(n) {
  const holidays = n.holidays || [];
  const ranges = [];
  const w = n.winter && n.winter.on ? n.winter : null;
  if (w && w.start) ranges.push([w.start, w.end || w.start]);
  const specialDates = (n.specials || []).map((s) => {
    const r = computeSessions(s, s.breaks);
    if (s.start) ranges.push([s.start, s.end || s.start]);
    const map = {};
    if (r) r.dates.forEach((d, i) => { map[isoDate(d)] = i + 1; });
    return { s, map };
  });
  if (!ranges.length) return "";
  const minS = ranges.map((r) => r[0]).sort()[0];
  const maxE = ranges.map((r) => r[1]).sort().slice(-1)[0];
  const start = parseDate(minS), end = parseDate(maxE);
  if (!start || !end) return "";
  const cur = new Date(start); cur.setDate(cur.getDate() - cur.getDay());
  const last = new Date(end); last.setDate(last.getDate() + (6 - last.getDay()));
  const weeks = [];
  let guard = 0;
  while (cur <= last && guard++ < 20) {
    const cells = [];
    for (let k = 0; k < 7; k++) {
      const d = new Date(cur);
      const iso = isoDate(d);
      const ev = [];
      const hol = holidays.find((h) => h.from && iso >= h.from && iso <= (h.to || h.from));
      const inRange = d >= start && d <= end;
      if (hol) ev.push(`<span class="ev h">${esc(hol.label || "휴무")}</span>`);
      else if (inRange) {
        if (w && d.getDay() >= 1 && d.getDay() <= 5 && iso >= w.start && iso <= (w.end || w.start) && !inBreaks(d, w.breaks)) ev.push(`<span class="ev w">윈터스쿨</span>`);
        specialDates.forEach(({ s, map }) => {
          if (map[iso]) ev.push(`<span class="ev s">${(n.specials || []).length > 1 ? esc(s.short || s.title) + " " : "특강 "}${map[iso]}회</span>`);
        });
        (n.regular || []).forEach((r) => {
          if (!(r.days || []).includes(WEEKDAYS[d.getDay()])) return;
          if (r.start && iso < r.start) return;
          if (r.end && iso > r.end) return;
          ev.push(`<span class="ev r">정규수업</span>`);
        });
      }
      const showMonth = d.getDate() === 1 || (weeks.length === 0 && k === 0);
      cells.push(`<td class="${inRange ? "" : "out"} ${hol ? "hol" : ""} ${k === 0 ? "sun" : k === 6 ? "sat" : ""}"><div class="dn">${showMonth ? `${d.getMonth() + 1}/${d.getDate()}` : d.getDate()}</div>${ev.join("")}</td>`);
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(`<tr>${cells.join("")}</tr>`);
  }
  return `<table class="nt-cal"><thead><tr>${WEEKDAYS.map((d, i) => `<th class="${i === 0 ? "sun" : i === 6 ? "sat" : ""}">${d}</th>`).join("")}</tr></thead><tbody>${weeks.join("")}</tbody></table>`;
}

export function noticeTitle(n) {
  return n.title || `2027 서초 ${n.className || "OO반"} 겨울방학 학습 계획 안내문`;
}

export function renderNotice(n, opts = {}) {
  const logo = n.hall === "premium" ? "assets/logo_premium.png" : "assets/logo_gifted.png";
  const accent = n.hall === "premium" ? "blue" : "green";
  const points = String(n.points || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const closing = String(n.closing || "").trim();
  const specials = n.specials || [];
  const regular = n.regular || [];
  const w = n.winter && n.winter.on ? n.winter : null;

  const planRows = [];
  regular.forEach((r, i) => planRows.push(`<tr>${i === 0 ? `<th rowspan="${regular.length}">정규수업</th>` : ""}
    <td><b>${esc(r.name)}</b></td><td>${esc((r.days || []).join("."))}${r.time ? `<br><small>(${esc(r.time)})</small>` : ""}</td>
    <td>${esc(fmtRange(r.start, r.end)).replace(" ~ ", "<br>~ ")}</td><td>${nl2br(r.goal || "")}</td></tr>`));
  specials.forEach((s, i) => planRows.push(`<tr class="hl">${i === 0 ? `<th rowspan="${specials.length}">특강</th>` : ""}
    <td><b>${esc(s.title)}</b>${s.label ? `<br><small>${esc(s.label)}</small>` : ""}</td><td>${esc((s.days || []).join("."))}${s.time ? `<br><small>(${esc(s.time)})</small>` : ""}</td>
    <td>${esc(s.period || fmtRange(s.start, s.end)).replace(" ~ ", "<br>~ ")}</td>
    <td><b>${nl2br(s.goal || "")}</b>${s.goalDetail ? `<div class="sub">${nl2br(s.goalDetail)}</div>` : ""}</td></tr>`));
  if (w) planRows.push(`<tr><th>${esc(w.title || "윈터스쿨")}</th><td><b>자기주도학습</b></td><td>월~금<br><small>(요일선택가능)</small><br><small>(${esc(w.time || "")})</small></td>
    <td>${esc(fmtRange(w.start, w.end)).replace(" ~ ", "<br>~ ")}</td><td><b>${nl2br(w.goal || "")}</b>${w.goalDetail ? `<div class="sub">${nl2br(w.goalDetail)}</div>` : ""}</td></tr>`);

  const tt = timetable(n);
  const cal = calendar(n);
  const sessionsHtml = specials.filter((s) => (s.sessions || []).length).map((s) => {
    const r = computeSessions(s, s.breaks);
    return `<div class="nt-sess">
      ${specials.length > 1 ? `<div class="nt-sess-t">${esc(s.title)} <small>${esc(s.label || "")}</small></div>` : ""}
      <table class="nt-tbl"><thead><tr><th style="width:70px">회차</th><th>수업 진도</th>${r ? `<th style="width:96px">날짜</th>` : ""}</tr></thead>
      <tbody>${s.sessions.map((t, i) => `<tr><td class="c">${i + 1}회</td><td>${esc(t)}</td>${r ? `<td class="c">${r.dates[i] ? fmtMD(r.dates[i]) : ""}</td>` : ""}</tr>`).join("")}</tbody></table></div>`;
  }).join("");

  let sec = 0;
  const H = (t, extra = "") => `<h2 class="nt-h"><span>${++sec}.</span> ${t}${extra}</h2>`;
  const applyLink = opts.applyUrl ? `<div class="nt-cta"><a href="${esc(opts.applyUrl)}" class="nt-btn ${accent}">특강 신청하러 가기</a><div class="nt-cta-s">링크에서 특강이 자동으로 선택됩니다.</div></div>` : "";

  return `
  <article class="nt ${accent}">
    <header class="nt-top">
      <div class="nt-slogan">${esc(n.slogan || NOTICE_DEFAULTS.slogan)}</div>
      <div class="nt-brand"><img src="${logo}" alt="CMS"><div class="nt-contact"><b>서초영재교과관</b><span>${esc(CONTACT.replace(/-/, ")"))}</span></div></div>
    </header>
    <h1 class="nt-title">${esc(noticeTitle(n))}</h1>
    ${n.headline ? `<div class="nt-headline">${nl2br(n.headline)}</div>` : ""}
    ${(n.question || points.length) ? `<div class="nt-why">
      ${n.question ? `<h3>${esc(n.question)}</h3>` : ""}
      ${points.length ? `<ul>${points.map((p) => `<li>${esc(p.replace(/^✔\s*/, ""))}</li>`).join("")}</ul>` : ""}
    </div>` : ""}
    ${(n.highlightTitle || n.highlightBody) ? `<div class="nt-alert"><b>${esc(n.highlightTitle || "")}</b>${n.highlightBody ? `<p>${nl2br(n.highlightBody)}</p>` : ""}</div>` : ""}
    ${specials.length ? `<div class="nt-pick"><small>그래서 우리 반 학생들을 위해 준비된 필수 수업!</small><div>${specials.map((s) => esc(s.title)).join(" · ")}</div></div>` : ""}
    ${closing ? `<div class="nt-closing">${nl2br(closing)}</div>` : ""}

    ${planRows.length ? `${H("학습 계획", ` <small>(${esc(n.planRange || "1월 ~ 2월")})</small>`)}
      <table class="nt-tbl nt-plan"><thead><tr><th style="width:84px">수업</th><th>과정</th><th style="width:110px">요일 / 시간</th><th style="width:104px">개강 및 종강</th><th>목표</th></tr></thead><tbody>${planRows.join("")}</tbody></table>` : ""}

    ${(tt || sessionsHtml || cal) ? `<section class="nt-p2">
    ${tt ? `${H("방학 기간 학습 시간표")}${tt}` : ""}

    ${sessionsHtml ? `${H("특강 수업 구성")}${n.footnote ? `<p class="nt-foot">* ${esc(n.footnote)}</p>` : ""}<div class="nt-sess-wrap${specials.filter((s) => (s.sessions || []).length).length > 1 ? " multi" : ""}">${sessionsHtml}</div>` : ""}

    ${cal ? `${H("방학 기간 학습 일정")}${cal}
      <div class="nt-legend"><span class="ev s">특강</span>${w ? `<span class="ev w">윈터스쿨</span>` : ""}${regular.length ? `<span class="ev r">정규수업</span>` : ""}${(n.holidays || []).length ? `<span class="ev h">휴무</span>` : ""}</div>` : ""}
    </section>` : ""}

    ${applyLink}
    <footer class="nt-bottom">문의 : CMS 서초영재교과관 ${esc(CONTACT)}</footer>
  </article>`;
}

export const NOTICE_CSS = `
.nt{--ac:#00A57E;--ac-p:#E6F6F1;--ac-d:#008866;background:#fff;color:#2B2B2E;max-width:820px;margin:0 auto;padding:36px 40px 30px;font-family:'Pretendard',-apple-system,'Malgun Gothic',sans-serif;line-height:1.6;font-size:14.5px;}
.nt.blue{--ac:#00A7E1;--ac-p:#E5F5FC;--ac-d:#0087B8;}
.nt-top{border-bottom:2px solid #414143;padding-bottom:14px;margin-bottom:22px;}
.nt-slogan{font-size:12px;color:#8A8A90;margin-bottom:12px;}
.nt-brand{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.nt-brand img{height:40px;width:auto;}
.nt-contact{text-align:right;display:flex;flex-direction:column;font-size:13px;color:#55555A;}
.nt-contact b{color:#2B2B2E;}
.nt-title{font-size:26px;letter-spacing:-0.03em;line-height:1.3;margin:0 0 18px;font-weight:800;text-align:center;}
.nt-headline{font-size:19px;font-weight:800;color:var(--ac-d);text-align:center;margin-bottom:18px;letter-spacing:-0.02em;}
.nt-why{background:#F7F7F9;border-radius:14px;padding:18px 20px;margin-bottom:14px;}
.nt-why h3{margin:0 0 8px;font-size:16px;}
.nt-why ul{margin:0;padding:0;list-style:none;}
.nt-why li{padding-left:24px;position:relative;margin:6px 0;}
.nt-why li::before{content:"✔";position:absolute;left:0;color:var(--ac);font-weight:800;}
.nt-alert{border:1.5px solid #E5484D;background:#FDECEC;border-radius:14px;padding:14px 18px;margin-bottom:14px;}
.nt-alert b{color:#C7262C;font-size:15px;}
.nt-alert p{margin:4px 0 0;}
.nt-pick{background:var(--ac);color:#fff;border-radius:14px;padding:16px 20px;text-align:center;margin-bottom:14px;}
.nt-pick small{opacity:.85;font-size:13px;}
.nt-pick div{font-size:20px;font-weight:800;letter-spacing:-0.02em;}
.nt-closing{text-align:center;font-weight:600;color:#414143;margin:16px 0 8px;}
.nt-h{font-size:17px;margin:30px 0 10px;display:flex;align-items:baseline;gap:6px;font-weight:800;}
.nt-h span{color:var(--ac);}
.nt-h small{font-size:13px;color:#8A8A90;font-weight:600;}
.nt-tbl{width:100%;border-collapse:collapse;font-size:13.5px;}
.nt-tbl th,.nt-tbl td{border:1px solid #DADAE0;padding:8px 10px;vertical-align:middle;}
.nt-tbl thead th{background:#414143;color:#fff;font-weight:700;font-size:13px;}
.nt-tbl tbody th{background:#F3F3F6;font-weight:700;}
.nt-tbl td.c{text-align:center;}
.nt-tbl small{color:#8A8A90;}
.nt-plan td{text-align:center;}
.nt-plan td:last-child{text-align:left;}
.nt-plan tr.hl td{background:var(--ac-p);}
.nt-plan .sub{font-size:12.5px;color:#55555A;margin-top:4px;}
.nt-tt{width:100%;border-collapse:collapse;font-size:13px;text-align:center;table-layout:fixed;}
.nt-tt thead th:first-child{width:104px;}
.nt-tt th,.nt-tt td{border:1px solid #DADAE0;padding:10px 6px;}
.nt-tt thead th{background:#414143;color:#fff;}
.nt-tt tbody th{background:#F3F3F6;white-space:nowrap;font-weight:700;}
.nt-tt td.on{font-weight:700;}
.nt-tt td.w{background:#EFEFF3;}
.nt-tt td.s{background:var(--ac-p);color:var(--ac-d);}
.nt-tt td.r{background:#fff;}
.nt-tt small{font-weight:500;color:#55555A;}
.nt-tt hr{border:0;border-top:1px dashed #ccc;margin:6px 0;}
.nt-foot{font-size:12.5px;color:#C7262C;margin:0 0 8px;}
.nt-sess{margin-bottom:12px;}
.nt-sess-t{font-weight:800;margin:10px 0 6px;}
.nt-sess-t small{color:#8A8A90;font-weight:600;}
.nt-cal{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11.5px;}
.nt-cal th{background:#414143;color:#fff;padding:6px 0;font-size:12.5px;border:1px solid #414143;}
.nt-cal th.sun{background:#C7262C;border-color:#C7262C;}
.nt-cal th.sat{background:#2F6FB3;border-color:#2F6FB3;}
.nt-cal td{border:1px solid #DADAE0;vertical-align:top;height:78px;padding:4px;}
.nt-cal td.out{background:#FAFAFB;color:#C4C4CA;}
.nt-cal td.hol{background:#FDF1F1;}
.nt-cal .dn{font-weight:700;font-size:12px;margin-bottom:2px;}
.nt-cal td.sun .dn{color:#C7262C;}
.nt-cal td.sat .dn{color:#2F6FB3;}
.ev{display:block;border-radius:4px;padding:1px 4px;margin-top:2px;font-size:10.5px;font-weight:700;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ev.w{background:#EFEFF3;color:#55555A;}
.ev.s{background:var(--ac);color:#fff;}
.ev.r{background:#fff;border:1px solid #414143;color:#414143;}
.ev.h{background:#E5484D;color:#fff;}
.nt-legend{display:flex;gap:8px;justify-content:flex-end;margin-top:8px;}
.nt-legend .ev{display:inline-block;font-size:11px;padding:2px 8px;}
.nt-cta{text-align:center;margin:30px 0 6px;}
.nt-btn{display:inline-flex;align-items:center;justify-content:center;height:52px;padding:0 34px;border-radius:14px;color:#fff;background:var(--ac);font-weight:800;font-size:16px;text-decoration:none;}
.nt-cta-s{font-size:12px;color:#8A8A90;margin-top:6px;}
.nt-bottom{margin-top:26px;padding-top:14px;border-top:1px solid #E6E6EA;text-align:center;font-size:12.5px;color:#8A8A90;}
@media (max-width:640px){
  .nt{padding:22px 16px;font-size:14px;}
  .nt-title{font-size:21px;}
  .nt-brand img{height:30px;}
  .nt-tbl,.nt-tt{font-size:12px;}
  .nt-tbl th,.nt-tbl td{padding:6px;}
  .nt-cal td{height:64px;padding:2px;}
  .ev{font-size:9.5px;padding:1px 2px;}
}
@media print{
  @page{size:A4;margin:10mm 12mm;}
  .nt,.nt *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .nt{padding:0;max-width:none;}
  .nt-cta{display:none;}
  .nt-h{break-after:avoid;}
  table{break-inside:avoid;}
  /* 2·3·4번(시간표·수업 구성·일정)을 한 페이지에 */
  .nt-p2{break-before:page;break-inside:avoid;}
  .nt-p2 .nt-h{margin:12px 0 5px;font-size:15px;}
  .nt-p2 .nt-h:first-child{margin-top:0;}
  .nt-p2 .nt-tt{font-size:12px;}
  .nt-p2 .nt-tt th,.nt-p2 .nt-tt td{padding:4px 6px;line-height:1.3;}
  .nt-p2 .nt-foot{font-size:11.5px;margin:0 0 4px;}
  .nt-p2 .nt-sess{margin-bottom:6px;}
  .nt-p2 .nt-sess-t{margin:4px 0 3px;font-size:13px;}
  .nt-p2 .nt-sess-wrap.multi{display:grid;grid-template-columns:1fr 1fr;gap:0 10px;}
  .nt-p2 .nt-sess .nt-tbl{font-size:12px;}
  .nt-p2 .nt-sess .nt-tbl th,.nt-p2 .nt-sess .nt-tbl td{padding:3px 8px;line-height:1.4;}
  .nt-p2 .nt-cal th{padding:3px 0;font-size:11.5px;}
  .nt-p2 .nt-cal td{height:42px;padding:2px 3px;}
  .nt-p2 .nt-cal .dn{font-size:11px;margin-bottom:0;}
  .nt-p2 .ev{font-size:9.5px;margin-top:1px;padding:0 3px;line-height:1.3;}
  .nt-p2 .nt-legend{margin-top:5px;}
  .nt-bottom{display:none;}
}
`;
