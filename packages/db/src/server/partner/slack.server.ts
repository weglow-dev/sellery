/**
 * Slack 알림 한 줄 (선택 — `SLACK_WEBHOOK_URL` 이 있을 때만, docs/inf-console-plan.md §4.3 · §2.3). web/src/lib/partner/slack.ts 의 이식.
 * 보내는 곳은 둘: 가입 완료(`seller code · 활동명 · 플랫폼`) · 채널 [인증 확인](`channel code · 플랫폼`).
 * **이메일·핸들·채널 URL 은 넣지 않는다** — 개인정보가 제3자(Slack)로 나가지 않으므로 /privacy 의 제3자 제공 항목에도 넣지 않는다.
 * 실패해도 호출자를 막지 않는다(best-effort · 3초 타임아웃). webhook URL 은 `configureDb({ slackWebhookUrl })` 로 주입 — 없으면 아무것도 하지 않는다.
 */
import { dbConfig } from "../config.server";

export async function notifySlack(text: string, webhookUrl: string | undefined = dbConfig().slackWebhookUrl): Promise<void> {
  if (!webhookUrl) return;
  try {
    const res = await fetch(webhookUrl, {
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
