/**
 * 토스 지급대행 ↔ DB 글루 (0040 · docs/admin-console-plan.md "정산·돈" §7 · docs/deploy.md §5.3.1). `admin-refund.server.ts` 와 같은 자리(토스 + service role).
 * 순수 규칙은 `../payout-rules.ts`, HTTP 는 `./toss-payouts.server.ts`, 함수는 0040 의 app_* RPC. 전부 never-throw `{ ok, code }`.
 *
 *   getPayoutMode()                         platform_settings.payout_mode — 'manual' | 'toss'
 *   setPayoutMode(mode)                     app_payout_mode_set — 보류 재검사 결과 { released, held }
 *   getPayeeTossStatus(payeeType, id)       파트너 /settle 가 보여주는 상태 { toss_seller_id, status, error, synced_at, phone_set, configured }
 *   syncPayeeWithToss(payeeType, id, opts)  정산 정보 → 토스 셀러 등록/수정 → app_partner_seller_sync. 키가 없으면 NOT_CONFIGURED(조용히). 저장을 막지 않는다.
 *                                           계좌 원문을 읽을 때 sensitive_access_log(bank_info · actor 'toss-payouts') 를 남긴다.
 *   payoutTossOverview()                    관리자 화면 — { mode, configured, balance | null, rows(app_admin_payouts_toss_queue) }
 *   requestDuePayouts({ ids?, scheduleType, payoutDate?, actor })  requestable 행 → 100건씩 토스 요청 → app_payout_mark_requested. { requested, skipped, errors }
 *   cancelTossPayout(payoutId) · refreshTossPayout(payoutId)   취소(REQUESTED 만) · 재조회 → app_payout_sync_status
 *   handleSellerChanged(data) · handlePayoutChanged(data)      웹훅 — 본문은 id 만 쓰고 **재조회 결과로만** 적는다(서명 없음)
 *   deleteTossSeller(payeeType, id)         운영 스크립트 — 토스 셀러 삭제 + 로컬 id/상태 비움
 */
import type { Json } from "@sellery/db/database.types";
import { createAdminClient, type Admin } from "@sellery/db/server/admin";
import {
  buildTossPayoutItem,
  buildTossSellerPayload,
  chunkPayouts,
  isTossPayoutStatus,
  isTossSellerStatus,
  nextBusinessDay,
  payoutRequestable,
  todayKst,
  tossRefId,
  tossSellerReady,
  type TossPayout,
  type TossPayoutItem,
  type TossScheduleType,
  type TossSeller,
  type TossSellerError,
} from "../payout-rules";
import { payoutsConfigured } from "./config.server";
import {
  cancelPayout,
  deleteSeller,
  getPayout,
  getPayoutBalance,
  getSeller,
  isUncertainPayout,
  registerSeller,
  requestPayouts,
  updateSeller,
  type TossBalance,
  type TossPayoutsApi,
} from "./toss-payouts.server";

export type PayeeType = "seller" | "brand";
export type PayoutMode = "manual" | "toss";

type J = Record<string, unknown>;
const obj = (v: unknown): J | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const defaultApi: TossPayoutsApi = { registerSeller, updateSeller, deleteSeller, getSeller, listSellers: () => Promise.reject(new Error("unused")), getPayoutBalance, requestPayouts, cancelPayout, getPayout };

/* ---------------- 모드 ---------------- */

export async function getPayoutMode(admin: Admin = createAdminClient()): Promise<PayoutMode> {
  const { data, error } = await admin.rpc("payout_mode");
  if (error) {
    console.error("[payouts] payout_mode failed:", error.message);
    return "manual";
  }
  return data === "toss" ? "toss" : "manual";
}

export type SetPayoutModeResult = { ok: true; previous: PayoutMode; mode: PayoutMode; released: number; held: number } | { ok: false; code: string };

export async function setPayoutMode(mode: PayoutMode, admin: Admin = createAdminClient()): Promise<SetPayoutModeResult> {
  const { data, error } = await admin.rpc("app_payout_mode_set", { p_mode: mode });
  if (error) {
    console.error("[payouts] app_payout_mode_set failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const o = obj(data);
  if (!o || o.ok !== true) return { ok: false, code: str(o?.code) ?? "DB_ERROR" };
  return { ok: true, previous: o.previous === "toss" ? "toss" : "manual", mode: o.mode === "toss" ? "toss" : "manual", released: Number(o.released) || 0, held: Number(o.held) || 0 };
}

/* ---------------- 파트너 상태 ---------------- */

export type PayeeTossStatus = {
  configured: boolean;
  toss_seller_id: string | null;
  status: string | null;
  error: TossSellerError;
  synced_at: string | null;
  /** 개인 인플루언서 본인인증 번호(settle_phone) · 브랜드 manager_phone 등록 여부 */
  phone_set: boolean;
  phone_masked: string | null;
};

const maskPhone = (d: string | null | undefined): string | null => {
  const s = String(d ?? "").replace(/\D/g, "");
  return s ? "*".repeat(Math.max(s.length - 4, 0)) + s.slice(-4) : null;
};

export async function getPayeeTossStatus(payeeType: PayeeType, id: string, admin: Admin = createAdminClient()): Promise<PayeeTossStatus | null> {
  if (!UUID_RE.test(id)) return null;
  const base = { configured: payoutsConfigured() };
  if (payeeType === "seller") {
    const { data, error } = await admin.from("sellers").select("toss_seller_id, toss_seller_status, toss_seller_error, toss_seller_synced_at, settle_phone").eq("id", id).maybeSingle();
    if (error || !data) return null;
    const e = obj(data.toss_seller_error);
    return { ...base, toss_seller_id: data.toss_seller_id, status: data.toss_seller_status, error: e ? { code: str(e.code), message: str(e.message), at: str(e.at) } : null, synced_at: data.toss_seller_synced_at, phone_set: !!data.settle_phone, phone_masked: maskPhone(data.settle_phone) };
  }
  const { data, error } = await admin.from("brands").select("toss_seller_id, toss_seller_status, toss_seller_error, toss_seller_synced_at, manager_phone").eq("id", id).maybeSingle();
  if (error || !data) return null;
  const e = obj(data.toss_seller_error);
  return { ...base, toss_seller_id: data.toss_seller_id, status: data.toss_seller_status, error: e ? { code: str(e.code), message: str(e.message), at: str(e.at) } : null, synced_at: data.toss_seller_synced_at, phone_set: !!data.manager_phone, phone_masked: maskPhone(data.manager_phone) };
}

/** 인플루언서 본인인증 번호 저장 (app_set_settle_phone) — 빈 값이면 지운다 */
export async function saveSettlePhone(sellerId: string, phone: string, admin: Admin = createAdminClient()): Promise<{ ok: true; phone_masked: string | null } | { ok: false; code: string }> {
  const { data, error } = await admin.rpc("app_set_settle_phone", { p_seller_id: sellerId, p_phone: phone });
  if (error) {
    console.error("[payouts] app_set_settle_phone failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const o = obj(data);
  if (!o || o.ok !== true) return { ok: false, code: str(o?.code) ?? "DB_ERROR" };
  return { ok: true, phone_masked: str(o.phone_masked) };
}

/* ---------------- 셀러 동기화 ---------------- */

export type SyncPayeeResult =
  | { ok: true; toss_seller_id: string; status: string; created: boolean }
  | { ok: false; code: string; message?: string; field?: string };

export type SyncPayeeOptions = { admin?: Admin; api?: TossPayoutsApi; actor?: string };

async function recordSync(admin: Admin, payeeType: PayeeType, id: string, tossSellerId: string | null, status: string | null, raw: Json | null): Promise<void> {
  const { error } = await admin.rpc("app_partner_seller_sync", { p_payee_type: payeeType, p_payee_id: id, p_toss_seller_id: tossSellerId, p_status: status, p_raw: raw ?? undefined });
  if (error) console.error("[payouts] app_partner_seller_sync failed:", error.message);
}

/**
 * 정산 정보(계좌 원문) → 토스 셀러 등록 또는 수정. 호출자는 정산 정보 저장이 끝난 뒤 부르고 결과를 기다리되 실패해도 저장 흐름을 되돌리지 않는다.
 *   NOT_CONFIGURED  키 없음(로컬 · Preview) — DB 에 아무것도 적지 않는다
 *   PAYLOAD:<code>  본문을 만들 수 없음(계좌 · 은행 코드 · 연락처 · 사업자번호) — toss_seller_error 에 기록(파트너 화면 "계좌 오류")
 *   TOSS:<code>     토스 4xx — 토스 메시지를 toss_seller_error 에 기록
 *   UNCERTAIN       네트워크 · 5xx — 기록하지 않음(다음 저장 · 스크립트 toss-seller-sync 로 재시도)
 */
export async function syncPayeeWithToss(payeeType: PayeeType, id: string, opts: SyncPayeeOptions = {}): Promise<SyncPayeeResult> {
  if (!payoutsConfigured() && !opts.api) return { ok: false, code: "NOT_CONFIGURED" };
  if (!UUID_RE.test(id)) return { ok: false, code: "NOT_FOUND" };
  const admin = opts.admin ?? createAdminClient();
  const api = opts.api ?? defaultApi;
  const actor = opts.actor ?? "toss-payouts";

  let input: Parameters<typeof buildTossSellerPayload>[0];
  let existingId: string | null;
  if (payeeType === "seller") {
    const { data: s, error } = await admin
      .from("sellers")
      .select("id, code, name, email, settle_type, bank_info, biz_no, tax_info, settle_phone, toss_seller_id")
      .eq("id", id)
      .maybeSingle();
    if (error) return { ok: false, code: "DB_ERROR" };
    if (!s) return { ok: false, code: "NOT_FOUND" };
    const bank = obj(s.bank_info);
    const tax = obj(s.tax_info);
    input = {
      payeeType: "seller",
      payeeId: s.id,
      settleType: s.settle_type,
      name: s.name,
      email: s.email ?? str(tax?.email),
      phone: s.settle_phone,
      bizNo: s.biz_no,
      company: str(tax?.company),
      ceo: str(tax?.ceo),
      bank: bank ? { bank: str(bank.bank), account: str(bank.account), holder: str(bank.holder) } : null,
    };
    existingId = s.toss_seller_id;
    await admin.from("sensitive_access_log").insert({ seller_id: s.id, field: "bank_info", actor, purpose: "토스 지급대행 셀러 등록" });
  } else {
    const { data: b, error } = await admin.from("brands").select("id, code, name, email, manager_name, manager_phone, bank_info, biz_no, tax_info, toss_seller_id").eq("id", id).maybeSingle();
    if (error) return { ok: false, code: "DB_ERROR" };
    if (!b) return { ok: false, code: "NOT_FOUND" };
    const bank = obj(b.bank_info);
    const tax = obj(b.tax_info);
    input = {
      payeeType: "brand",
      payeeId: b.id,
      settleType: "biz",
      name: b.name,
      email: b.email ?? str(tax?.email),
      phone: b.manager_phone,
      bizNo: b.biz_no,
      company: str(tax?.company) ?? b.name,
      ceo: str(tax?.ceo) ?? b.manager_name,
      bank: bank ? { bank: str(bank.bank), account: str(bank.account), holder: str(bank.holder) } : null,
    };
    existingId = b.toss_seller_id;
    await admin.from("sensitive_access_log").insert({ brand_id: b.id, field: "bank_info", actor, purpose: "토스 지급대행 셀러 등록" });
  }

  const built = buildTossSellerPayload(input);
  if (!built.ok) {
    await recordSync(admin, payeeType, id, null, null, { code: `PAYLOAD_${built.code}`, message: PAYLOAD_MESSAGES[built.code] ?? built.code, field: built.field ?? null });
    return { ok: false, code: `PAYLOAD:${built.code}`, message: PAYLOAD_MESSAGES[built.code], field: built.field };
  }

  let res = existingId ? await api.updateSeller(existingId, built.body) : await api.registerSeller(built.body);
  let created = !existingId;
  if (!res.ok && existingId && res.status === 404) {
    // 토스에 없는 셀러 id(테스트 상점 초기화 등) → 새로 등록
    res = await api.registerSeller(built.body);
    created = true;
  }
  if (!res.ok) {
    if (isUncertainPayout(res)) return { ok: false, code: "UNCERTAIN", message: res.body.message };
    await recordSync(admin, payeeType, id, existingId, null, { code: res.body.code, message: res.body.message, http: res.status });
    return { ok: false, code: `TOSS:${res.body.code}`, message: res.body.message };
  }
  const seller: TossSeller = res.body;
  const status = isTossSellerStatus(seller.status) ? seller.status : null;
  await recordSync(admin, payeeType, id, seller.id, status, { eventType: created ? "seller.registered" : "seller.updated", seller: sanitizeSeller(seller) });
  return { ok: true, toss_seller_id: seller.id, status: seller.status, created };
}

const PAYLOAD_MESSAGES: Record<string, string> = {
  BANK_MISSING: "정산 계좌가 없어요",
  BANK_CODE_UNKNOWN: "토스 지급대행이 지원하지 않는 은행이에요 — 운영팀에 알려주세요",
  BAD_ACCOUNT: "계좌번호 형식이 맞지 않아요(숫자 8~14자리)",
  HOLDER_REQUIRED: "예금주가 없어요",
  NAME_REQUIRED: "이름(활동명·상호)이 없어요",
  EMAIL_REQUIRED: "계정 이메일이 없어요",
  PHONE_MISSING: "본인인증 휴대폰 번호가 없어요",
  BIZ_NO_REQUIRED: "사업자등록번호가 없거나 형식이 맞지 않아요",
  BAD_REF: "식별자 오류",
};

/** 토스 셀러 응답에서 계좌 원문을 뺀다(payout_events 에는 마스킹만) */
function sanitizeSeller(s: TossSeller): Json {
  const acct = s.account && typeof s.account === "object" ? s.account : null;
  const num = acct?.accountNumber ? String(acct.accountNumber) : "";
  const { account: _a, company: _c, individual: _i, ...rest } = s as Record<string, unknown>;
  return {
    ...(rest as Record<string, Json>),
    account: acct ? { bankCode: acct.bankCode ?? null, holderName: acct.holderName ?? null, accountMasked: num ? "*".repeat(Math.max(num.length - 4, 0)) + num.slice(-4) : null } : null,
  } as Json;
}

/** 토스 셀러 삭제 + 로컬 비움 (운영 스크립트 · 테스트 정리) */
export async function deleteTossSeller(payeeType: PayeeType, id: string, opts: SyncPayeeOptions = {}): Promise<{ ok: true; toss_seller_id: string | null } | { ok: false; code: string; message?: string }> {
  const admin = opts.admin ?? createAdminClient();
  const api = opts.api ?? defaultApi;
  const table = payeeType === "seller" ? "sellers" : "brands";
  const { data, error } = await admin.from(table).select("toss_seller_id").eq("id", id).maybeSingle();
  if (error) return { ok: false, code: "DB_ERROR" };
  if (!data) return { ok: false, code: "NOT_FOUND" };
  if (data.toss_seller_id) {
    const res = await api.deleteSeller(data.toss_seller_id);
    if (!res.ok && res.status !== 404) return { ok: false, code: `TOSS:${res.body.code}`, message: res.body.message };
  }
  const { error: uErr } = await admin.from(table).update({ toss_seller_id: null, toss_seller_status: null, toss_seller_error: null, toss_seller_synced_at: new Date().toISOString() }).eq("id", id);
  if (uErr) return { ok: false, code: "DB_ERROR" };
  await admin.from("payout_events").insert({ source: "seller_sync", event_type: "seller.deleted", toss_seller_id: data.toss_seller_id, payload: { payee_type: payeeType, payee_id: id }, handled: true, result: "deleted" });
  return { ok: true, toss_seller_id: data.toss_seller_id };
}

/* ---------------- 관리자: 큐 · 잔액 ---------------- */

export type TossQueueRow = {
  payout_id: string;
  settlement_id: string;
  campaign_code: string;
  title: string | null;
  payee_type: "seller" | "brand" | "referrer";
  payee_id: string | null;
  payee_code: string | null;
  payee_name: string | null;
  amount: number;
  status: string;
  hold_code: string | null;
  toss_seller_id: string | null;
  toss_seller_status: string | null;
  toss_seller_error: TossSellerError;
  toss_payout_id: string | null;
  toss_payout_status: string | null;
  toss_schedule_date: string | null;
  toss_requested_at: string | null;
  toss_error: { code?: string | null; message?: string | null; status?: string | null; at?: string | null } | null;
  requestable: boolean;
  reason: string | null;
};

export type PayoutTossOverview = { mode: PayoutMode; configured: boolean; balance: TossBalance | null; balanceError: string | null; rows: TossQueueRow[] };

export function parseTossQueue(raw: unknown): { mode: PayoutMode; rows: TossQueueRow[] } | null {
  const o = obj(raw);
  if (!o || o.ok !== true) return null;
  const rows: TossQueueRow[] = (Array.isArray(o.rows) ? o.rows : []).map((x) => {
    const r = obj(x) ?? {};
    const se = obj(r.toss_seller_error);
    const pe = obj(r.toss_error);
    const pt = r.payee_type;
    return {
      payout_id: str(r.payout_id) ?? "",
      settlement_id: str(r.settlement_id) ?? "",
      campaign_code: str(r.campaign_code) ?? "",
      title: str(r.title),
      payee_type: pt === "brand" || pt === "referrer" ? pt : "seller",
      payee_id: str(r.payee_id),
      payee_code: str(r.payee_code),
      payee_name: str(r.payee_name),
      amount: Number(r.amount) || 0,
      status: str(r.status) ?? "pending",
      hold_code: str(r.hold_code),
      toss_seller_id: str(r.toss_seller_id),
      toss_seller_status: str(r.toss_seller_status),
      toss_seller_error: se ? { code: str(se.code), message: str(se.message), at: str(se.at) } : null,
      toss_payout_id: str(r.toss_payout_id),
      toss_payout_status: str(r.toss_payout_status),
      toss_schedule_date: str(r.toss_schedule_date),
      toss_requested_at: str(r.toss_requested_at),
      toss_error: pe ? { code: str(pe.code), message: str(pe.message), status: str(pe.status), at: str(pe.at) } : null,
      requestable: r.requestable === true,
      reason: str(r.reason),
    };
  });
  return { mode: o.mode === "toss" ? "toss" : "manual", rows };
}

export async function payoutTossOverview(opts: { admin?: Admin; api?: TossPayoutsApi; withBalance?: boolean } = {}): Promise<PayoutTossOverview | null> {
  const admin = opts.admin ?? createAdminClient();
  const api = opts.api ?? defaultApi;
  const { data, error } = await admin.rpc("app_admin_payouts_toss_queue");
  if (error) {
    console.error("[payouts] app_admin_payouts_toss_queue failed:", error.message);
    return null;
  }
  const q = parseTossQueue(data);
  if (!q) return null;
  const configured = payoutsConfigured() || !!opts.api;
  let balance: TossBalance | null = null;
  let balanceError: string | null = null;
  if (configured && (opts.withBalance ?? true)) {
    const b = await api.getPayoutBalance();
    if (b.ok) balance = b.body;
    else balanceError = `${b.body.message} (${b.body.code})`;
  }
  return { mode: q.mode, configured, balance, balanceError, rows: q.rows };
}

/* ---------------- 관리자: 지급 요청 ---------------- */

export type RequestPayoutsInput = {
  /** 비우면 requestable 전부 */
  ids?: readonly string[];
  scheduleType: TossScheduleType;
  /** SCHEDULED 기본값 = 다음 영업일(KST) */
  payoutDate?: string | null;
  actor?: string | null;
};

export type RequestPayoutsResult = {
  ok: boolean;
  mode: PayoutMode;
  requested: { payout_id: string; toss_payout_id: string; status: string; amount: number; payee_name: string | null }[];
  skipped: { payout_id: string; reason: string }[];
  errors: { code: string; message: string; payout_ids: string[] }[];
};

async function idempotencyKeyOf(ids: readonly string[], scheduleType: string, date: string | null): Promise<string> {
  const text = `${scheduleType}|${date ?? ""}|${[...ids].sort().join(",")}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return `slry-po-${Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function requestDuePayouts(input: RequestPayoutsInput, opts: { admin?: Admin; api?: TossPayoutsApi } = {}): Promise<RequestPayoutsResult> {
  const admin = opts.admin ?? createAdminClient();
  const api = opts.api ?? defaultApi;
  const out: RequestPayoutsResult = { ok: false, mode: "manual", requested: [], skipped: [], errors: [] };
  if (!payoutsConfigured() && !opts.api) {
    out.errors.push({ code: "NOT_CONFIGURED", message: "지급대행 키(TOSS_PAYOUT_SECRET_KEY · TOSS_PAYOUT_SECURITY_KEY)가 없어요", payout_ids: [] });
    return out;
  }
  const { data, error } = await admin.rpc("app_admin_payouts_toss_queue");
  if (error) {
    out.errors.push({ code: "DB_ERROR", message: error.message, payout_ids: [] });
    return out;
  }
  const q = parseTossQueue(data);
  if (!q) {
    out.errors.push({ code: "DB_ERROR", message: "큐를 읽지 못했어요", payout_ids: [] });
    return out;
  }
  out.mode = q.mode;
  if (q.mode !== "toss") {
    out.errors.push({ code: "MODE_MANUAL", message: "payout_mode 가 manual 이에요 — 토스 지급은 toss 모드에서만", payout_ids: [] });
    return out;
  }
  const wanted = input.ids && input.ids.length ? new Set(input.ids) : null;
  const payoutDate = input.scheduleType === "SCHEDULED" ? (input.payoutDate?.trim() || nextBusinessDay(todayKst())) : null;

  const items: { row: TossQueueRow; item: TossPayoutItem }[] = [];
  for (const row of q.rows) {
    if (wanted && !wanted.has(row.payout_id)) continue;
    if (!row.requestable || !payoutRequestable(row.toss_payout_status) || !tossSellerReady(row.toss_seller_status)) {
      if (wanted) out.skipped.push({ payout_id: row.payout_id, reason: row.reason ?? "NOT_REQUESTABLE" });
      continue;
    }
    const built = buildTossPayoutItem({
      payoutId: row.payout_id,
      tossSellerId: row.toss_seller_id ?? "",
      amount: row.amount,
      scheduleType: input.scheduleType,
      payoutDate,
      metadata: { campaign: row.campaign_code, payee: `${row.payee_type}:${row.payee_code ?? ""}` },
    });
    if (!built.ok) {
      out.skipped.push({ payout_id: row.payout_id, reason: built.code });
      continue;
    }
    items.push({ row, item: built.item });
  }
  if (!items.length) {
    out.ok = out.errors.length === 0;
    return out;
  }

  for (const chunk of chunkPayouts(items)) {
    const ids = chunk.map((c) => c.row.payout_id);
    const key = await idempotencyKeyOf(ids, input.scheduleType, payoutDate);
    const res = await api.requestPayouts(chunk.map((c) => c.item), { idempotencyKey: key });
    if (!res.ok) {
      out.errors.push({ code: isUncertainPayout(res) ? `UNCERTAIN:${res.body.code}` : res.body.code, message: res.body.message, payout_ids: ids });
      await admin.from("payout_events").insert({
        source: "request",
        event_type: "request.failed",
        payload: { code: res.body.code, message: res.body.message, http: res.status, payout_ids: ids, scheduleType: input.scheduleType, payoutDate, actor: input.actor ?? null },
        handled: true,
        result: `error: ${res.body.code}`,
      });
      continue;
    }
    const byRef = new Map<string, TossPayout>();
    for (const p of res.body) if (p.refPayoutId) byRef.set(p.refPayoutId, p);
    for (const c of chunk) {
      const p = byRef.get(c.row.payout_id);
      if (!p) {
        out.skipped.push({ payout_id: c.row.payout_id, reason: "NO_RESPONSE_ROW" });
        continue;
      }
      const status = isTossPayoutStatus(p.status) ? p.status : "REQUESTED";
      const { data: mk, error: mkErr } = await admin.rpc("app_payout_mark_requested", {
        p_payout_id: c.row.payout_id,
        p_toss_payout_id: p.id,
        p_status: status,
        p_schedule_date: p.payoutDate ?? payoutDate ?? undefined,
        p_raw: { ...(p as unknown as Record<string, Json>), actor: input.actor ?? null } as Json,
      });
      const mo = obj(mk);
      if (mkErr || !mo || mo.ok !== true) {
        console.error("[payouts] app_payout_mark_requested failed:", mkErr?.message ?? str(mo?.code));
        out.errors.push({ code: "RECORD_FAILED", message: `토스에는 요청됐지만 기록 실패 — toss payout ${p.id}`, payout_ids: [c.row.payout_id] });
        continue;
      }
      out.requested.push({ payout_id: c.row.payout_id, toss_payout_id: p.id, status, amount: c.row.amount, payee_name: c.row.payee_name });
    }
  }
  out.ok = out.errors.length === 0;
  return out;
}

/* ---------------- 취소 · 재조회 · 웹훅 ---------------- */

export type PayoutSyncResult = { ok: true; status: string; paid: boolean; changed: boolean } | { ok: false; code: string; message?: string };

async function syncPayoutRow(admin: Admin, p: TossPayout, raw: Json): Promise<PayoutSyncResult> {
  const status = isTossPayoutStatus(p.status) ? p.status : null;
  if (!status) return { ok: false, code: "BAD_STATUS", message: String(p.status) };
  const { data, error } = await admin.rpc("app_payout_sync_status", { p_toss_payout_id: p.id, p_status: status, p_raw: raw });
  if (error) {
    console.error("[payouts] app_payout_sync_status failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const o = obj(data);
  if (!o || o.ok !== true) return { ok: false, code: str(o?.code) ?? "DB_ERROR" };
  return { ok: true, status, paid: o.paid === true, changed: o.changed === true };
}

/** 토스에 재조회해 상태를 맞춘다(웹훅을 놓쳤을 때 · 스크립트) */
export async function refreshTossPayout(payoutId: string, opts: { admin?: Admin; api?: TossPayoutsApi } = {}): Promise<PayoutSyncResult> {
  const admin = opts.admin ?? createAdminClient();
  const api = opts.api ?? defaultApi;
  const { data, error } = await admin.from("payouts").select("toss_payout_id").eq("id", payoutId).maybeSingle();
  if (error) return { ok: false, code: "DB_ERROR" };
  if (!data?.toss_payout_id) return { ok: false, code: "NOT_REQUESTED" };
  const res = await api.getPayout(data.toss_payout_id);
  if (!res.ok) return { ok: false, code: `TOSS:${res.body.code}`, message: res.body.message };
  return syncPayoutRow(admin, res.body, { eventType: "payout.refreshed", ...(res.body as unknown as Record<string, Json>) });
}

/** REQUESTED 상태만 취소된다(IN_PROGRESS 부터는 토스가 거절) */
export async function cancelTossPayout(payoutId: string, opts: { admin?: Admin; api?: TossPayoutsApi; actor?: string | null } = {}): Promise<PayoutSyncResult> {
  const admin = opts.admin ?? createAdminClient();
  const api = opts.api ?? defaultApi;
  const { data, error } = await admin.from("payouts").select("toss_payout_id, toss_payout_status, status").eq("id", payoutId).maybeSingle();
  if (error) return { ok: false, code: "DB_ERROR" };
  if (!data?.toss_payout_id) return { ok: false, code: "NOT_REQUESTED" };
  if (data.status === "paid") return { ok: false, code: "ALREADY_PAID" };
  const res = await api.cancelPayout(data.toss_payout_id);
  if (!res.ok) return { ok: false, code: `TOSS:${res.body.code}`, message: res.body.message };
  await admin.from("payout_events").insert({ source: "cancel", event_type: "cancel", payout_id: payoutId, toss_payout_id: data.toss_payout_id, payload: { actor: opts.actor ?? null }, handled: true, result: res.body.status });
  return syncPayoutRow(admin, res.body, { eventType: "payout.canceled", ...(res.body as unknown as Record<string, Json>) });
}

export type WebhookHandleResult = { result: string; status: number };

/** seller.changed — 본문의 id 로 재조회한 셀러만 믿는다. 모르는 셀러(다른 상점 · 삭제됨)는 ignored */
export async function handleSellerChanged(data: { id: string }, opts: { admin?: Admin; api?: TossPayoutsApi } = {}): Promise<WebhookHandleResult> {
  const admin = opts.admin ?? createAdminClient();
  const api = opts.api ?? defaultApi;
  const res = await api.getSeller(data.id);
  if (!res.ok) {
    if (isUncertainPayout(res)) return { result: "error: lookup failed", status: 502 };
    return { result: `ignored: lookup ${res.body.code}`, status: 200 };
  }
  const seller = res.body;
  const status = isTossSellerStatus(seller.status) ? seller.status : null;
  if (!status) return { result: `ignored: status ${String(seller.status)}`, status: 200 };
  // 로컬 행 찾기 — toss_seller_id, 없으면 refSellerId 접두 + uuid 앞 18자
  let payeeType: PayeeType | null = null;
  let payeeId: string | null = null;
  const { data: s } = await admin.from("sellers").select("id").eq("toss_seller_id", seller.id).maybeSingle();
  if (s) {
    payeeType = "seller";
    payeeId = s.id;
  } else {
    const { data: b } = await admin.from("brands").select("id").eq("toss_seller_id", seller.id).maybeSingle();
    if (b) {
      payeeType = "brand";
      payeeId = b.id;
    } else if (seller.refSellerId && /^[sb][0-9a-f]{18}$/i.test(seller.refSellerId)) {
      const table = seller.refSellerId[0] === "b" ? "brands" : "sellers";
      const { data: rows } = await admin.from(table).select("id").is("toss_seller_id", null).limit(2000);
      const hit = (rows ?? []).find((r) => tossRefId(table === "brands" ? "b" : "s", r.id) === seller.refSellerId);
      if (hit) {
        payeeType = table === "brands" ? "brand" : "seller";
        payeeId = hit.id;
      }
    }
  }
  if (!payeeType || !payeeId) {
    await admin.from("payout_events").insert({ source: "webhook", event_type: "seller.changed", toss_seller_id: seller.id, payload: { id: seller.id, status, refSellerId: seller.refSellerId }, handled: true, result: "ignored: unknown seller" });
    return { result: "ignored: unknown seller", status: 200 };
  }
  await recordSync(admin, payeeType, payeeId, seller.id, status, { eventType: "seller.changed", seller: sanitizeSeller(seller) });
  return { result: `synced ${payeeType} ${status}`, status: 200 };
}

/** payout.changed — 본문의 id 로 재조회한 지급 상태만 적는다 */
export async function handlePayoutChanged(data: { id: string }, opts: { admin?: Admin; api?: TossPayoutsApi } = {}): Promise<WebhookHandleResult> {
  const admin = opts.admin ?? createAdminClient();
  const api = opts.api ?? defaultApi;
  const res = await api.getPayout(data.id);
  if (!res.ok) {
    if (isUncertainPayout(res)) return { result: "error: lookup failed", status: 502 };
    return { result: `ignored: lookup ${res.body.code}`, status: 200 };
  }
  const r = await syncPayoutRow(admin, res.body, { eventType: "payout.changed", ...(res.body as unknown as Record<string, Json>) });
  if (!r.ok) return { result: r.code === "NOT_FOUND" ? "ignored: unknown payout" : `error: ${r.code}`, status: r.code === "DB_ERROR" ? 502 : 200 };
  return { result: `${r.status}${r.paid ? " → paid" : ""}`, status: 200 };
}
