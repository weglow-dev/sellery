import { env } from '$env/dynamic/private';

/** 슬랙 알림 한 줄 — packages/db/src/server/partner/slack.server.ts 와 같은 패턴(선택 · best-effort · 3초 타임아웃).
 *  이 앱은 워크스페이스 의존성이 없는 독립 앱이라 그 모듈을 가져오지 않고 그대로 옮겨 쓴다.
 *  SLACK_WEBHOOK_URL 이 Vercel 프로젝트(sellery-branding)에 없으면 조용히 아무 일도 하지 않는다 — 그 경우
 *  접수 내용이 어디에도 남지 않으니 실제 운영 전에 반드시 설정해야 한다 (docs/branding-plan.md §5). */
export async function notifySlack(text: string): Promise<void> {
	const url = env.SLACK_WEBHOOK_URL;
	if (!url) {
		console.warn('[slack] SLACK_WEBHOOK_URL 이 없어 알림을 보내지 않았습니다:', text);
		return;
	}
	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ text }),
			signal: AbortSignal.timeout(3_000)
		});
		if (!res.ok) console.error('[slack] webhook responded', res.status);
	} catch (e) {
		console.error('[slack] webhook failed:', e instanceof Error ? e.message : e);
	}
}
