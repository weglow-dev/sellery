/**
 * 캠페인 오픈 알림 (0043) — 신청 · 취소 · 수신거부 · 발송.
 *
 * 판매 페이지의 "🔔 오픈 알림 받기" 버튼은 원래 토스트만 띄우고 아무것도 저장하지 않았다(허위 안내 ·
 * 2026-10-08 제거). 이 모듈이 실제 구현이다. 채널은 이메일(Resend) — 운영 결정 2026-09-22 ·
 * docs/launch-checklist.md §5 결정 3. 카카오 알림톡은 보류 상태이며 추후 도입 가능성이 있다.
 *
 * 범위: **이메일이 등록된 회원만**. 비회원은 받지 않는다 — 이메일을 새로 수집하지 않으려는 결정이다
 * (개인정보 수집 항목이 늘지 않는다). 이메일은 저장하지 않고 발송 시점에 계정에서 읽는다.
 *
 * 발송 시각은 틱과 분리한다 — 캠페인은 KST 자정에 LIVE 가 되는데(크론 `5 * * * *` → KST 00:05) 그때
 * 보내면 새벽 0시에 도착한다. `sendDueCampaignAlerts` 는 호출자가 정한 창에서만 돌고, 크론 라우트가
 * KST 시(hour)를 보고 아침에만 부른다.
 */
import { campaignOpenMail, type MailCampaignAlert } from "../mail/templates";
import { isEmailAddress } from "../mail/resend";
import { createAdminClient, type Admin } from "./admin.server";
import { mailCtx, sendMail } from "./mail.server";

// 신청 상태 타입은 **순수 모듈**이 갖는다 — UI 가 prop 으로 받아야 해서(서버 모듈은 import 할 수 없다).
// 라우트·컴포넌트는 `@sellery/db/campaign-alerts` 에서 직접 가져온다.
import type { AlertState } from "../campaign-alerts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/* ---------------------------------------------------------------- 신청 · 취소 · 상태 ---------------------------------------------------------------- */

export type AlertSubscribeResult =
  | { ok: true; already: boolean; campaignCode: string }
  | { ok: false; code: "NOT_FOUND" | "WRONG_STATUS" | "NO_EMAIL" | "DB_ERROR"; status?: string | null };

/** 캠페인 code → id. 형식이 어긋나면 null(라우트 404). */
async function campaignIdOf(admin: Admin, code: string): Promise<string | null | "error"> {
  if (!/^[a-z0-9_-]{1,32}$/.test(code)) return null;
  const { data, error } = await admin.from("campaigns").select("id").eq("code", code).maybeSingle();
  if (error) {
    console.error("[alerts] campaign lookup failed:", error.message);
    return "error";
  }
  return data?.id ?? null;
}

/** 오픈 알림 신청 — `SCHEDULE_CONFIRMED` 이고 이메일이 등록된 회원만(0043 `app_campaign_alert_subscribe`). */
export async function subscribeCampaignAlert(
  campaignCode: string,
  userId: string,
  admin: Admin = createAdminClient(),
): Promise<AlertSubscribeResult> {
  const id = await campaignIdOf(admin, campaignCode);
  if (id === "error") return { ok: false, code: "DB_ERROR" };
  if (!id) return { ok: false, code: "NOT_FOUND" };
  const { data, error } = await admin.rpc("app_campaign_alert_subscribe", { p_campaign_id: id, p_user_id: userId });
  if (error) {
    console.error("[alerts] subscribe failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const o = obj(data);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok !== true) {
    const code = typeof o.code === "string" ? o.code : "DB_ERROR";
    return {
      ok: false,
      code: code === "NOT_FOUND" || code === "WRONG_STATUS" || code === "NO_EMAIL" ? code : "DB_ERROR",
      status: typeof o.status === "string" ? o.status : null,
    };
  }
  return { ok: true, already: o.already === true, campaignCode: typeof o.campaign_code === "string" ? o.campaign_code : campaignCode };
}

/** 신청 취소 — 판매 페이지의 토글. 삭제하지 않고 `unsubscribed_at` 을 적는다(재신청 가능). */
export async function cancelCampaignAlert(
  campaignCode: string,
  userId: string,
  admin: Admin = createAdminClient(),
): Promise<{ ok: true; already: boolean } | { ok: false; code: "NOT_FOUND" | "DB_ERROR" }> {
  const id = await campaignIdOf(admin, campaignCode);
  if (id === "error") return { ok: false, code: "DB_ERROR" };
  if (!id) return { ok: false, code: "NOT_FOUND" };
  const { data, error } = await admin.rpc("app_campaign_alert_cancel", { p_campaign_id: id, p_user_id: userId });
  if (error) {
    console.error("[alerts] cancel failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const o = obj(data);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok !== true) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, already: o.already === true };
}

/** 버튼 상태 — 비로그인·이메일 없는 계정은 전부 false(판매 페이지가 안내 문구를 바꾼다). */
export async function campaignAlertState(
  campaignCode: string,
  userId: string | null,
  admin: Admin = createAdminClient(),
): Promise<AlertState> {
  const off: AlertState = { subscribed: false, canSubscribe: false, hasEmail: false };
  if (!userId) return off;
  const id = await campaignIdOf(admin, campaignCode);
  if (id === "error" || !id) return off;
  const { data, error } = await admin.rpc("app_campaign_alert_state", { p_campaign_id: id, p_user_id: userId });
  if (error) {
    console.error("[alerts] state failed:", error.message);
    return off;
  }
  const o = obj(data);
  if (!o) return off;
  return { subscribed: o.subscribed === true, canSubscribe: o.can_subscribe === true, hasEmail: o.has_email === true };
}

/** 1클릭 수신거부 — 메일 하단 링크. 토큰만으로 동작한다(메일을 받은 사람이 본인). */
export async function unsubscribeCampaignAlert(
  token: string,
  admin: Admin = createAdminClient(),
): Promise<{ ok: true; already: boolean; campaignCode: string | null } | { ok: false; code: "NOT_FOUND" | "DB_ERROR" }> {
  if (!UUID_RE.test(token)) return { ok: false, code: "NOT_FOUND" };
  const { data, error } = await admin.rpc("app_campaign_alert_unsubscribe", { p_token: token });
  if (error) {
    console.error("[alerts] unsubscribe failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const o = obj(data);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok !== true) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, already: o.already === true, campaignCode: typeof o.campaign_code === "string" ? o.campaign_code : null };
}

/* ---------------------------------------------------------------- 발송 ---------------------------------------------------------------- */

export type AlertSendSummary = { ok: true; today: string; due: number; sent: number; failed: number; skipped: number };

type DueRow = {
  alert_id: string;
  email: string | null;
  unsub_token: string;
  campaign_code: string;
  seller_handle: string;
  product_name: string;
  brand_name: string;
  sale_price: number | null;
  consumer_price: number | null;
  end_date: string | null;
};

function toMail(r: DueRow): MailCampaignAlert {
  return {
    alertId: r.alert_id,
    campaignCode: r.campaign_code,
    sellerHandle: r.seller_handle,
    productName: r.product_name,
    brandName: r.brand_name,
    salePrice: r.sale_price,
    consumerPrice: r.consumer_price,
    endDate: r.end_date,
    unsubToken: r.unsub_token,
  };
}

/**
 * 오늘(KST) 오픈한 캠페인의 신청자에게 한 통씩 — `app_campaign_alerts_due` → 발송 → `app_campaign_alert_sent`.
 *
 * 멱등: `sent_at` 기록 + 메일 쪽 `idempotencyKey`(Resend) 이중 방어. 크론이 여러 번 돌아도 한 통이다.
 * **발송에 성공한 것만 `sent_at` 을 적는다** — 실패분은 다음 틱에서 다시 시도한다(그날 안에는 재시도가 의미 있다).
 * 절대 throw 하지 않는다(크론 라우트가 500 으로 죽지 않게).
 */
export async function sendDueCampaignAlerts(admin: Admin = createAdminClient(), limit = 200): Promise<AlertSendSummary> {
  const empty: AlertSendSummary = { ok: true, today: "", due: 0, sent: 0, failed: 0, skipped: 0 };
  const { data, error } = await admin.rpc("app_campaign_alerts_due", { p_limit: limit });
  if (error) {
    console.error("[alerts] due failed:", error.message);
    return empty;
  }
  const o = obj(data);
  const rows = Array.isArray(o?.rows) ? (o.rows as DueRow[]) : [];
  const today = typeof o?.today === "string" ? o.today : "";
  if (!rows.length) return { ...empty, today };

  const ctx = mailCtx();
  const done: string[] = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  // 메일 공급자 레이트리밋을 피해 10건씩
  for (let i = 0; i < rows.length; i += 10) {
    const chunk = rows.slice(i, i + 10);
    await Promise.all(
      chunk.map(async (r) => {
        if (!isEmailAddress(r.email)) {
          // 주소가 사라진 계정 — 다시 시도해도 같으니 발송 완료로 닫는다
          skipped += 1;
          done.push(r.alert_id);
          return;
        }
        const tpl = campaignOpenMail(toMail(r), ctx);
        const res = await sendMail({
          to: r.email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          tag: tpl.tag,
          idempotencyKey: tpl.idempotencyKey,
        });
        if (res.ok) {
          sent += 1;
          done.push(r.alert_id);
        } else {
          failed += 1;
        }
      }),
    );
  }

  if (done.length) {
    const { error: markError } = await admin.rpc("app_campaign_alert_sent", { p_ids: done });
    if (markError) console.error("[alerts] mark sent failed:", markError.message);
  }
  return { ok: true, today, due: rows.length, sent, failed, skipped };
}
