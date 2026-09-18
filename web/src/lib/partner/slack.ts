import "server-only";

/**
 * Slack 알림 한 줄 (선택 — `SLACK_WEBHOOK_URL` 이 있을 때만, docs/inf-console-plan.md §4.3 · §2.3).
 * 보내는 곳은 둘: 가입 완료(`seller code · 활동명 · 플랫폼`) · 채널 [인증 확인](`channel code · 플랫폼`).
 * **이메일·핸들·채널 URL 은 넣지 않는다** — 개인정보가 제3자(Slack)로 나가지 않으므로 /privacy 의 제3자 제공 항목에도 넣지 않는다.
 * 실패해도 호출자를 막지 않는다(best-effort · 3초 타임아웃). env 가 없으면 아무것도 하지 않는다.
 */
export async function notifySlack(text: string): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) console.error("[slack] webhook responded", res.status);
  } catch (e) {
    console.error("[slack] webhook failed:", e instanceof Error ? e.message : e);
  }
}
