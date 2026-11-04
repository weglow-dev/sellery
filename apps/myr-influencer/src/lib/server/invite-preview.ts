/** 초대 가입 미리보기 주소를 열어도 되는 환경 — 로컬 dev · Vercel Preview 만(lib/invite-preview.ts) */
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { isPreviewToken, type PreviewToken } from '$lib/invite-preview';

export const invitePreviewAllowed = (): boolean => dev || env.VERCEL_ENV === 'preview';
export const previewTokenOf = (token: string): PreviewToken | null => (invitePreviewAllowed() && isPreviewToken(token) ? token : null);
