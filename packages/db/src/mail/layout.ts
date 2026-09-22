/**
 * 거래 메일 공용 레이아웃 — 순수 모듈(브라우저·서버·테스트 공용, DB·환경 없음).
 * 디자인은 docs/emails/*.html(Supabase 인증 메일)과 같은 테이블 레이아웃 · 배경 #eef3dc · 버튼 #4f8a2c · 로고 https://sellery.life/email/celery.png(불변) ·
 * 푸터 사업자 정보는 `company.ts` COMPANY 에서 읽는다(값이 바뀌면 메일도 따라간다).
 *
 *   renderMailHtml(doc) · renderMailText(doc)  — 같은 입력으로 HTML 본문과 text 대체본을 만든다.
 *   escapeHtml(s)                              — 사용자 입력(옵션명 · 배송지 · 문의 본문 · 사유)은 전부 이 함수를 거친다(레이아웃이 자동으로 건다).
 *   mailIdempotencyKey(event, ...parts)        — Resend `Idempotency-Key` = `<event>:<id…>` (재시도·중복 훅에서 두 번 보내지 않는다).
 */
import { COMPANY } from "../company";
import { asciiToken } from "./resend";

export const MAIL_LOGO_URL = "https://sellery.life/email/celery.png";
/** 발신자 기본값 — Resend 에서 Verified 된 도메인(sellery.life) 주소만 쓸 수 있다 (docs/deploy.md §5.5 · §5.7) */
export const MAIL_FROM_DEFAULT = "Sellery <noreply@sellery.life>";

const COLORS = {
  bg: "#eef3dc",
  ink: "#1c2a14",
  mute: "#5b6b4a",
  green: "#4f8a2c",
  greenDark: "#2f5a1a",
  border: "#b7d38e",
  boxBg: "#f6f9ec",
} as const;

export function escapeHtml(s: string | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** 줄바꿈을 <br> 로 — 그 밖은 전부 이스케이프 */
function textToHtml(s: string): string {
  return escapeHtml(s).replace(/\r?\n/g, "<br>");
}

export type MailRow = { label: string; value: string };
export type MailButton = { label: string; url: string };

export type MailDoc = {
  /** <title> · 제목 줄 — 메일 subject 는 템플릿이 따로 준다 */
  title: string;
  /** 받은편지함 미리보기 한 줄(본문에는 숨김) */
  preheader?: string;
  /** 첫 문단 — \n 은 줄바꿈 */
  intro: string;
  /** 라벨 · 값 표 (값은 사용자 입력 가능 — 자동 이스케이프) */
  rows?: MailRow[];
  /** 인용 상자 — 문의 본문 · 답변 미리보기 */
  quote?: string;
  button?: MailButton;
  /** 버튼 아래 작은 안내 문단들 */
  notes?: string[];
};

function rowsHtml(rows: MailRow[]): string {
  if (!rows.length) return "";
  const tr = rows
    .map(
      (r) =>
        `<tr><td style="padding:8px 12px 8px 0;font-size:13px;line-height:1.6;color:${COLORS.mute};white-space:nowrap;vertical-align:top;">${escapeHtml(r.label)}</td>` +
        `<td style="padding:8px 0;font-size:14px;line-height:1.6;color:${COLORS.ink};vertical-align:top;word-break:break-all;">${textToHtml(r.value)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${COLORS.border};border-bottom:1px solid ${COLORS.border};margin:0 0 22px;">${tr}</table>`;
}

function quoteHtml(q: string): string {
  return `<div style="margin:0 0 22px;padding:14px 16px;background:${COLORS.boxBg};border-left:4px solid ${COLORS.green};font-size:14px;line-height:1.7;color:${COLORS.ink};word-break:break-all;">${textToHtml(q)}</div>`;
}

function buttonHtml(b: MailButton): string {
  const url = escapeHtml(b.url);
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${COLORS.green};border:2px solid ${COLORS.greenDark};">` +
    `<a href="${url}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(b.label)} →</a>` +
    `</td></tr></table>` +
    `<p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:${COLORS.mute};">버튼이 열리지 않으면 아래 주소를 복사해 브라우저 주소창에 붙여넣으세요.<br><span style="word-break:break-all;color:${COLORS.green};">${url}</span></p>`
  );
}

export function renderMailHtml(doc: MailDoc): string {
  const notes = (doc.notes ?? []).map((n) => `<p style="margin:18px 0 0;font-size:13px;line-height:1.7;color:${COLORS.mute};">${textToHtml(n)}</p>`).join("");
  const preheader = doc.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${COLORS.bg};">${escapeHtml(doc.preheader)}</div>`
    : "";
  return (
    `<!DOCTYPE html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(doc.title)}</title></head>\n` +
    `<body style="margin:0;padding:0;background:${COLORS.bg};font-family:'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',Arial,sans-serif;color:${COLORS.ink};">\n` +
    preheader +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.bg};">\n<tr><td align="center" style="padding:32px 16px;">\n` +
    `  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">\n` +
    `    <tr><td style="padding:0 0 16px 4px;">\n      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>\n        <td style="background:#ffffff;border:2px solid ${COLORS.border};padding:6px 12px 6px 8px;">\n` +
    `          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>\n            <td style="vertical-align:middle;padding-right:8px;"><img src="${MAIL_LOGO_URL}" width="28" height="32" alt="" style="display:block;border:0;"></td>\n` +
    `            <td style="vertical-align:middle;font-family:Arial Black,Arial,sans-serif;font-weight:900;font-size:16px;letter-spacing:1.5px;color:${COLORS.ink};">SELLERY<span style="color:${COLORS.green};">.</span></td>\n          </tr></table>\n        </td>\n      </tr></table>\n    </td></tr>\n` +
    `    <tr><td style="background:#ffffff;border:2px solid ${COLORS.border};padding:36px 32px 32px;">\n` +
    `      <h1 style="margin:0 0 14px;font-size:22px;line-height:1.35;font-weight:700;color:${COLORS.ink};">${escapeHtml(doc.title)}</h1>\n` +
    `      <p style="margin:0 0 22px;font-size:15px;line-height:1.75;color:${COLORS.ink};">${textToHtml(doc.intro)}</p>\n` +
    (doc.rows?.length ? `      ${rowsHtml(doc.rows)}\n` : "") +
    (doc.quote ? `      ${quoteHtml(doc.quote)}\n` : "") +
    (doc.button ? `      ${buttonHtml(doc.button)}\n` : "") +
    (notes ? `      ${notes}\n` : "") +
    `    </td></tr>\n` +
    `    <tr><td style="padding:18px 4px 0;font-size:11.5px;line-height:1.7;color:${COLORS.mute};">\n` +
    `      이 메일은 발신 전용입니다. 문의는 아래 이메일로 보내주세요.<br>${escapeHtml(COMPANY.name)} · 대표 ${escapeHtml(COMPANY.ceo)} · 사업자등록번호 ${escapeHtml(COMPANY.bizNo)}<br>` +
    `${escapeHtml(COMPANY.address)} · 문의 <a href="mailto:${escapeHtml(COMPANY.email)}" style="color:${COLORS.mute};text-decoration:underline;">${escapeHtml(COMPANY.email)}</a>\n` +
    `    </td></tr>\n  </table>\n</td></tr></table>\n</body></html>\n`
  );
}

export function renderMailText(doc: MailDoc): string {
  const lines: string[] = [doc.title, "", doc.intro];
  if (doc.rows?.length) {
    lines.push("");
    for (const r of doc.rows) lines.push(`${r.label}: ${r.value}`);
  }
  if (doc.quote) lines.push("", `> ${doc.quote.replace(/\r?\n/g, "\n> ")}`);
  if (doc.button) lines.push("", `${doc.button.label}: ${doc.button.url}`);
  for (const n of doc.notes ?? []) lines.push("", n);
  lines.push("", "—", `이 메일은 발신 전용입니다. 문의는 ${COMPANY.email} 로 보내주세요.`, `${COMPANY.name} · 대표 ${COMPANY.ceo} · 사업자등록번호 ${COMPANY.bizNo} · ${COMPANY.address}`);
  return lines.join("\n") + "\n";
}

/**
 * Resend Idempotency-Key — `<event>:<id>[:<id>…]`. HTTP 헤더는 Latin-1 만 허용하므로 **ASCII 로만** 만든다:
 * 공백·콜론·비ASCII(택배사 한글 이름 등)는 `asciiToken` 으로 코드포인트 16진수 토큰(`_ac00_`)이 된다 — 결정적이라 같은 입력은 같은 키. 200자 제한.
 */
export function mailIdempotencyKey(event: string, ...parts: (string | number | null | undefined)[]): string {
  const clean = [event, ...parts].map((p) => asciiToken(String(p ?? "").trim().replace(/[\s:]+/g, "_"))).filter(Boolean);
  return clean.join(":").slice(0, 200);
}
