/* ============ utils (js/00-core.js) ============ */
export const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
export const DAY = 86400000;
export const today = () => new Date(new Date().toDateString());
export const addD = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
export const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
export const ymd = (d: Date) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const P = (d: string) => new Date(d + 'T00:00:00');
export const esc = (s: unknown) =>
	String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
/** HTML 태그 제거 (시스템 메시지 미리보기용) */
export const strip = (t: unknown) => String(t).replace(/<[^>]+>/g, '');
/** ₩1.2억 · 3,400만 형식 */
export function fmtKR(v: number) {
	if (v >= 1e8) return (v / 1e8).toFixed(1).replace(/\.0$/, '') + '억';
	if (v >= 1e4) return Math.round(v / 1e4).toLocaleString() + '만';
	return fmt(v);
}
/** 남은 일수 (마감일 포함) */
export const daysLeft = (end: string) => Math.max(0, Math.ceil((addD(P(end), 1).getTime() - Date.now()) / DAY));
export const daysUntil = (start: string) => Math.ceil((P(start).getTime() - today().getTime()) / DAY);
