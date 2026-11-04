/**
 * 거래 메일 설정 + 발송(서버 전용). 값은 앱이 `configureMyrCore` 로 넣는다 — `resendApiKey`(RESEND_API_KEY · 없으면 비활성 · 프로세스당 1회 안내) ·
 * `resendApiUrl`(로컬 목 서버) · `mailFrom`(MAIL_FROM — 기본 `MYR <noreply@sellery.life>` · MYR 도메인이 Resend 에 Verified 되면 값만 바꾼다) ·
 * `shopUrl`(메일 링크 오리진 — 샵의 PUBLIC_SITE_URL · 없으면 https://myr-shop.vercel.app). docs/deploy.md MYR 표.
 * 절대 throw 하지 않는다 — 주문·환불 흐름을 메일이 막지 않는다.
 */
import { createMailer, type MailMessage, type MailSendResult, type Mailer } from '../mail/resend';
import type { MailCtx } from '../mail/templates';
import { siteOrigin } from '../site';
import { myrConfig } from './config.server';

export { SITE_URL_FALLBACK } from '../site';
let mailer: Mailer | null = null;

export const isMailEnabled = (): boolean => !!myrConfig().resendApiKey;
/** 메일 링크 오리진 — 샵의 canonical 과 같은 함수(`site.ts siteOrigin`) 로 정한다 */
export const mailCtx = (): MailCtx => ({ siteUrl: siteOrigin(myrConfig().shopUrl) });

function getMailer(): Mailer {
	if (!mailer) {
		const c = myrConfig();
		mailer = createMailer({ apiKey: c.resendApiKey, from: c.mailFrom, apiUrl: c.resendApiUrl });
	}
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
