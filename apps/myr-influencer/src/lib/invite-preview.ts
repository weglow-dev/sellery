/**
 * 초대 가입 미리보기 주소 — 로컬 dev · Vercel Preview 에서만(서버가 허용 여부를 정한다 · lib/server/invite-preview.ts). 운영(Production)에서는 일반 토큰처럼 "만료" 화면.
 *   /invite/preview          초대장 → 가입 폼 → 환영(저장 안 함 · 핸들 확인은 실제 DB 규칙)
 *   /invite/preview-used     "이미 가입을 마친 초대 링크예요"
 *   /invite/preview-expired  "초대 링크가 만료됐어요" + 새 초대 요청(기록 안 함)
 * 순수 — `$env` · `$app` 없음 · src/test/invite-preview.test.ts.
 */
import { INVITE_DAYS } from '@sellery/myr-core/invite-rules';

export const PREVIEW_EMAIL = 'creator@myr.kr';
export const PREVIEW_TOKENS = ['preview', 'preview-used', 'preview-expired'] as const;
export type PreviewToken = (typeof PREVIEW_TOKENS)[number];
export const isPreviewToken = (v: unknown): v is PreviewToken => PREVIEW_TOKENS.includes(v as PreviewToken);

export type PreviewInvite = { state: 'valid'; email: string; expiresAt: string } | { state: 'expired'; reason: 'USED' | 'EXPIRED' };

export function previewInvite(token: PreviewToken, now: Date = new Date()): PreviewInvite {
	if (token === 'preview-used') return { state: 'expired', reason: 'USED' };
	if (token === 'preview-expired') return { state: 'expired', reason: 'EXPIRED' };
	return { state: 'valid', email: PREVIEW_EMAIL, expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000).toISOString() };
}
