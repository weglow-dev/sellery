import { env } from '$env/dynamic/private';

/** 슬랙 알림 한 줄 — packages/db/src/server/partner/slack.server.ts 와 같은 전송 방식(3초 타임아웃)이지만,
 *  거기서는 "알림"이라 실패를 삼키는 반면 여기서는 **슬랙이 제조의뢰의 유일한 접수 경로**라 결과를 돌려준다.
 *  false 면 호출자(apply/+page.server.ts)가 사용자에게 "접수 실패 — 다시 시도" 를 보여줘 입력이 조용히 사라지지 않게 한다.
 *  SLACK_WEBHOOK_URL 이 없는 것도 실패로 친다 — Vercel 프로젝트 sellery-branding 에 설정돼 있어야 한다(docs/branding-plan.md §5). */
export async function notifySlack(text: string): Promise<boolean> {
	const url = env.SLACK_WEBHOOK_URL;
	if (!url) {
		console.error('[slack] SLACK_WEBHOOK_URL 이 없어 접수를 받을 수 없습니다:', text);
		return false;
	}
	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ text }),
			signal: AbortSignal.timeout(3_000)
		});
		if (!res.ok) {
			console.error('[slack] webhook responded', res.status);
			return false;
		}
		return true;
	} catch (e) {
		console.error('[slack] webhook failed:', e instanceof Error ? e.message : e);
		return false;
	}
}
