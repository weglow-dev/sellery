import { env } from '$env/dynamic/private';

/** 슬랙 알림 한 줄 — packages/db/src/server/partner/slack.server.ts 와 같은 전송 방식이지만,
 *  거기서는 "알림"이라 실패를 삼키는 반면 여기서는 **슬랙이 제조의뢰의 유일한 접수 경로**라 결과를 돌려준다.
 *  false 면 호출자(apply-action.ts)가 사용자에게 "접수 실패 — 다시 시도" 를 보여줘 입력이 조용히 사라지지 않게 한다.
 *  SLACK_WEBHOOK_URL 이 없는 것도 실패로 친다 — Vercel 프로젝트 myr(옛 sellery-branding) 에 설정돼 있어야 한다(docs/branding-plan.md §5).
 *
 *  타임아웃 8초(2026-10-27 · 전에는 3초): 웹훅이 메시지를 **받고도** 응답이 3초를 넘기는 일이 확인됐다. 그러면 여기서는 실패로 보여
 *  사용자가 다시 제출하고 슬랙에는 같은 접수가 두 번 올라간다. 넉넉히 기다리되, 그래도 늦게 오는 경우를 알아볼 수 있게
 *  호출자가 메시지에 접수 ID(event_id)를 넣는다 — 같은 ID 가 두 번 보이면 중복이다. */
/** 사용자 입력을 슬랙 텍스트에 넣기 전 이스케이프 — 슬랙 mrkdwn 은 `<!channel>` `<!here>` `<@U…>` 를 제어 시퀀스로 읽어서,
 *  메모에 `<!channel>` 을 적어 보내면 채널 전체가 호출된다. 슬랙이 요구하는 세 글자(& < >)만 바꾼다. */
export function escapeSlack(v: string): string {
	return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
			signal: AbortSignal.timeout(8_000)
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
