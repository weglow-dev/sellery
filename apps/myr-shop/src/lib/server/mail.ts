/**
 * 거래 메일 설정 + 발송(서버 전용). `$env/dynamic/private` 의 `RESEND_API_KEY`(없으면 비활성 · 프로세스당 1회 안내) · `RESEND_API_URL`(로컬 목 서버) · `MAIL_FROM`(발신자 — 기본 `MYR <noreply@sellery.life>` ·
 * MYR 도메인이 Resend 에 Verified 되면 값만 바꾼다) · `$env/dynamic/public` 의 `PUBLIC_SITE_URL`(메일 링크 오리진 · 없으면 https://myr-shop.vercel.app). docs/deploy.md MYR 표.
 * 절대 throw 하지 않는다 — 주문·환불 흐름을 메일이 막지 않는다.
 */
import { env } from '$env/dynamic/private';
import { env as pub } from '$env/dynamic/public';
import { createMailer, type MailMessage, type MailSendResult, type Mailer } from '$lib/mail/resend';
import type { MailCtx } from '$lib/mail/templates';
import { siteOrigin } from '$lib/seo';

export { SITE_URL_FALLBACK } from '$lib/seo';
let mailer: Mailer | null = null;

const clean = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
export const isMailEnabled = (): boolean => !!clean(env.RESEND_API_KEY);
/** 메일 링크 오리진 — canonical 과 같은 함수(`lib/seo.ts siteOrigin`) 로 정한다 */
export const mailCtx = (): MailCtx => ({ siteUrl: siteOrigin(pub.PUBLIC_SITE_URL) });

function getMailer(): Mailer {
	if (!mailer) mailer = createMailer({ apiKey: clean(env.RESEND_API_KEY), from: clean(env.MAIL_FROM), apiUrl: clean(env.RESEND_API_URL) });
	return mailer;
}

export async function sendMail(msg: MailMessage): Promise<MailSendResult> {
	try {
		return await getMailer().send(msg);
	} catch (e) {
		console.error('[mail] send threw:', e instanceof Error ? e.message : e);
		return { ok: false, reason: 'network', message: e instanceof Error ? e.message : String(e) };
	}
}
export type { MailMessage, MailSendResult };
