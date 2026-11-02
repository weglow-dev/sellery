/**
 * MYR 거래 메일 공용 레이아웃 — 순수(브라우저·서버·테스트 공용 · DB·환경 없음). packages/db/src/mail/layout.ts 복사 · 색은 MYR(앰버 #ff7a3d · 잉크 #0a0b0e) · 로고는 텍스트 워드마크.
 *   renderMailHtml(doc) · renderMailText(doc) — 같은 입력으로 HTML 과 text 대체본 · 사용자 입력은 전부 이스케이프 · mailIdempotencyKey(event, ...ids)
 * 푸터 사업자 정보는 `../company.ts`(셀러리와 같은 (주)위글로우).
 */
import { COMPANY } from '../company';
import { asciiToken } from './resend';

const COLORS = { bg: '#f5f1ec', ink: '#0a0b0e', mute: '#6b6f78', accent: '#ff7a3d', accentDark: '#c9531c', border: '#e6dccf', boxBg: '#fff6f0' } as const;

export function escapeHtml(s: string | null | undefined): string {
	if (s === null || s === undefined) return '';
	return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const textToHtml = (s: string): string => escapeHtml(s).replace(/\r?\n/g, '<br>');

export type MailRow = { label: string; value: string };
export type MailButton = { label: string; url: string };
export type MailDoc = { title: string; preheader?: string; intro: string; rows?: MailRow[]; quote?: string; button?: MailButton; notes?: string[] };

function rowsHtml(rows: MailRow[]): string {
	if (!rows.length) return '';
	const tr = rows
		.map(
			(r) =>
				`<tr><td style="padding:8px 12px 8px 0;font-size:13px;line-height:1.6;color:${COLORS.mute};white-space:nowrap;vertical-align:top;">${escapeHtml(r.label)}</td>` +
				`<td style="padding:8px 0;font-size:14px;line-height:1.6;color:${COLORS.ink};vertical-align:top;word-break:break-all;">${textToHtml(r.value)}</td></tr>`
		)
		.join('');
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${COLORS.border};border-bottom:1px solid ${COLORS.border};margin:0 0 22px;">${tr}</table>`;
}
const quoteHtml = (q: string): string =>
	`<div style="margin:0 0 22px;padding:14px 16px;background:${COLORS.boxBg};border-left:4px solid ${COLORS.accent};font-size:14px;line-height:1.7;color:${COLORS.ink};word-break:break-all;">${textToHtml(q)}</div>`;
function buttonHtml(b: MailButton): string {
	const url = escapeHtml(b.url);
	return (
		`<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${COLORS.accent};border:2px solid ${COLORS.accentDark};border-radius:12px;">` +
		`<a href="${url}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:${COLORS.ink};text-decoration:none;">${escapeHtml(b.label)} →</a>` +
		`</td></tr></table>` +
		`<p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:${COLORS.mute};">버튼이 열리지 않으면 아래 주소를 복사해 브라우저 주소창에 붙여넣으세요.<br><span style="word-break:break-all;color:${COLORS.accentDark};">${url}</span></p>`
	);
}

export function renderMailHtml(doc: MailDoc): string {
	const notes = (doc.notes ?? []).map((n) => `<p style="margin:18px 0 0;font-size:13px;line-height:1.7;color:${COLORS.mute};">${textToHtml(n)}</p>`).join('');
	const preheader = doc.preheader ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${COLORS.bg};">${escapeHtml(doc.preheader)}</div>` : '';
	return (
		`<!DOCTYPE html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(doc.title)}</title></head>\n` +
		`<body style="margin:0;padding:0;background:${COLORS.bg};font-family:'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',Arial,sans-serif;color:${COLORS.ink};">\n` +
		preheader +
		`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.bg};">\n<tr><td align="center" style="padding:32px 16px;">\n` +
		`  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">\n` +
		`    <tr><td style="padding:0 0 16px 4px;"><span style="display:inline-block;background:${COLORS.ink};color:#ffffff;font-family:Arial Black,Arial,sans-serif;font-weight:900;font-size:16px;letter-spacing:2px;padding:7px 12px;border-radius:10px;">MYR</span><span style="margin-left:10px;font-size:12px;color:${COLORS.mute};letter-spacing:.5px;">MAKE YOUR RECIPE</span></td></tr>\n` +
		`    <tr><td style="background:#ffffff;border:1px solid ${COLORS.border};border-radius:16px;padding:36px 32px 32px;">\n` +
		`      <h1 style="margin:0 0 14px;font-size:22px;line-height:1.35;font-weight:700;color:${COLORS.ink};">${escapeHtml(doc.title)}</h1>\n` +
		`      <p style="margin:0 0 22px;font-size:15px;line-height:1.75;color:${COLORS.ink};">${textToHtml(doc.intro)}</p>\n` +
		(doc.rows?.length ? `      ${rowsHtml(doc.rows)}\n` : '') +
		(doc.quote ? `      ${quoteHtml(doc.quote)}\n` : '') +
		(doc.button ? `      ${buttonHtml(doc.button)}\n` : '') +
		(notes ? `      ${notes}\n` : '') +
		`    </td></tr>\n` +
		`    <tr><td style="padding:18px 4px 0;font-size:11.5px;line-height:1.7;color:${COLORS.mute};">\n` +
		`      이 메일은 발신 전용입니다. 문의는 아래 이메일로 보내주세요.<br>${escapeHtml(COMPANY.name)} · 대표 ${escapeHtml(COMPANY.ceo)} · 사업자등록번호 ${escapeHtml(COMPANY.bizNo)}<br>` +
		`${escapeHtml(COMPANY.address)} · 문의 <a href="mailto:${escapeHtml(COMPANY.email)}" style="color:${COLORS.mute};text-decoration:underline;">${escapeHtml(COMPANY.email)}</a>\n` +
		`    </td></tr>\n  </table>\n</td></tr></table>\n</body></html>\n`
	);
}

export function renderMailText(doc: MailDoc): string {
	const lines: string[] = [doc.title, '', doc.intro];
	if (doc.rows?.length) {
		lines.push('');
		for (const r of doc.rows) lines.push(`${r.label}: ${r.value}`);
	}
	if (doc.quote) lines.push('', `> ${doc.quote.replace(/\r?\n/g, '\n> ')}`);
	if (doc.button) lines.push('', `${doc.button.label}: ${doc.button.url}`);
	for (const n of doc.notes ?? []) lines.push('', n);
	lines.push('', '—', `이 메일은 발신 전용입니다. 문의는 ${COMPANY.email} 로 보내주세요.`, `${COMPANY.name} · 대표 ${COMPANY.ceo} · 사업자등록번호 ${COMPANY.bizNo} · ${COMPANY.address}`);
	return lines.join('\n') + '\n';
}

/** Resend Idempotency-Key `<event>:<id>[:<id>…]` — ASCII 만 · 200자 */
export function mailIdempotencyKey(event: string, ...parts: (string | number | null | undefined)[]): string {
	const clean = [event, ...parts].map((p) => asciiToken(String(p ?? '').trim().replace(/[\s:]+/g, '_'))).filter(Boolean);
	return clean.join(':').slice(0, 200);
}
