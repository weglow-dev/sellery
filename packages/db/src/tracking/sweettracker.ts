/**
 * 스마트택배(SweetTracker · info.sweettracker.co.kr) 배송 조회 — 순수 모듈 (0049 · docs/deploy.md §5.8).
 *   요청 조립 · 응답 파싱 · 택배사 코드 · 화면 문구. 네트워크·DB 는 server/tracking.server.ts.
 * 브라우저·서버 양쪽에서 import 된다 — 순수 상수·함수만.
 *
 * API(전부 **POST + JSON 본문** — GET 은 2026-10-30 14:00 에 종료(405) · 폼 인코딩은 companylist/key-usage 가 415 — 실키로 확인 2026-10-08)
 *   POST /api/v1/trackingInfo  {t_key, t_code, t_invoice}
 *     성공 { complete:boolean, level:1..6, invoiceNo, itemName, receiverName, trackingDetails:[{time, timeString, where, kind, level}], lastDetail }
 *       level 1 배송준비중 · 2 집화완료 · 3 배송중 · 4 지점도착 · 5 배송출발 · 6 배송완료
 *     실패 { status:false, msg:'유효하지 않은 운송장번호 이거나 택배사 코드 입니다.', code:'104' } (키 오류·한도 초과도 같은 모양)
 *   POST /api/v1/companylist   {t_key}   택배사 코드 표
 *   POST /api/v1/key/usage     {t_key}   이번 달 호출량(요금제 월 5,000회 · 다른 서비스와 공유)
 * 호출량 절약: 조회 대상·간격은 DB `app_tracking_due` 가 고른다(발송 ≤14일 · 배송 중 소포당 3시간 1회(하루 ≤8회) · NOT_FOUND 6시간).
 */
import { COURIERS, type Courier } from "../carriers";

export const SWEETTRACKER_API_BASE = "https://info.sweettracker.co.kr";

export type SweettrackerEndpoint = "/api/v1/trackingInfo" | "/api/v1/companylist" | "/api/v1/key/usage";

export type SweettrackerRequest = { url: string; init: { method: "POST"; headers: Record<string, string>; body: string } };

/**
 * 요청 인코더 — 모든 엔드포인트가 이 하나를 거친다(POST · `application/json`).
 * 2026-10-08 실키 확인: 폼 인코딩(`application/x-www-form-urlencoded`)은 trackingInfo 만 받고 companylist · key/usage 는 415 → JSON 으로 통일.
 */
export function sweettrackerRequest(endpoint: SweettrackerEndpoint, body: Record<string, string>, base: string = SWEETTRACKER_API_BASE): SweettrackerRequest {
  const url = new URL(endpoint, base.endsWith("/") ? base : `${base}/`).toString();
  return { url, init: { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) } };
}

/**
 * 셀러리 `COURIERS`(한글명 enum · 0004) → 스마트택배 `t_code`.
 * 코드 표 출처: `POST /api/v1/companylist {t_key}` — 실키로 확인(2026-10-08):
 *   01 우체국택배 · 04 CJ대한통운 · 05 한진택배 · 06 로젠택배 · 08 롯데택배.
 * 다시 대조하려면 `partner-admin.mjs tracking-companies`(docs/deploy.md §5.8).
 */
export const SWEETTRACKER_CODES: Readonly<Record<Courier, string>> = {
  우체국택배: "01",
  CJ대한통운: "04",
  한진택배: "05",
  로젠택배: "06",
  롯데택배: "08",
};

export function sweettrackerCode(courier: string | null | undefined): string | null {
  const k = (courier ?? "").trim();
  return (COURIERS as readonly string[]).includes(k) ? SWEETTRACKER_CODES[k as Courier] : null;
}

/** 조회 요청 — 택배사를 모르거나 송장에 숫자가 없으면 null. 송장은 숫자만(하이픈 제거 — 조회 링크 trackingUrlOf 와 같은 규칙). */
export function trackingInfoRequest(apiKey: string, courier: string | null | undefined, trackingNo: string | null | undefined, base: string = SWEETTRACKER_API_BASE): SweettrackerRequest | null {
  const code = sweettrackerCode(courier);
  const digits = (trackingNo ?? "").replace(/\D/g, "");
  if (!apiKey || !code || !digits) return null;
  return sweettrackerRequest("/api/v1/trackingInfo", { t_key: apiKey, t_code: code, t_invoice: digits }, base);
}

export function companyListRequest(apiKey: string, base: string = SWEETTRACKER_API_BASE): SweettrackerRequest {
  return sweettrackerRequest("/api/v1/companylist", { t_key: apiKey }, base);
}

export function keyUsageRequest(apiKey: string, base: string = SWEETTRACKER_API_BASE): SweettrackerRequest {
  return sweettrackerRequest("/api/v1/key/usage", { t_key: apiKey }, base);
}

/** key/usage 응답 — 필드명이 문서에 고정돼 있지 않아 숫자 필드를 이름으로 추정한다(used · remain · limit). raw 는 그대로 돌려준다. */
export type KeyUsage = { used: number | null; remaining: number | null; limit: number | null; raw: unknown; error: string | null };

export function parseKeyUsage(json: unknown): KeyUsage {
  const o = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  if (!o) return { used: null, remaining: null, limit: null, raw: json, error: "응답이 JSON 객체가 아닙니다" };
  if (o.status === false) return { used: null, remaining: null, limit: null, raw: json, error: typeof o.msg === "string" ? o.msg : "스마트택배 오류" };
  // 중첩(예: {data:{…}}) 1단계까지 평탄화
  const flat: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === "object" && !Array.isArray(v)) for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) flat[k2] = v2;
    else flat[k] = v;
  }
  const pick = (re: RegExp): number | null => {
    for (const [k, v] of Object.entries(flat)) {
      if (!re.test(k)) continue;
      const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : Number.NaN;
      if (Number.isFinite(n)) return n;
    }
    return null;
  };
  const used = pick(/^(use|used|usage|count|calls?|call_count|current|사용)/i);
  const limit = pick(/^(limit|max|total|quota|allow|한도|total_count)/i);
  let remaining = pick(/^(remain|left|rest|잔여|available)/i);
  if (remaining === null && used !== null && limit !== null) remaining = limit - used;
  // 실측(2026-10-08): 응답은 { key, totalAmount, leftAmount, startDate, endDate } — used 는 total − left 로 만든다
  const usedFinal = used !== null ? used : limit !== null && remaining !== null ? limit - remaining : null;
  return { used: usedFinal, remaining, limit, raw: json, error: null };
}

/** DB `tracking_status` (0049 check 제약과 같은 집합 — TIMEOUT 은 DB 가 붙인다) */
export type TrackingStatus = "IN_TRANSIT" | "DELIVERED" | "NOT_FOUND" | "ERROR" | "TIMEOUT";

/** 마지막 배송 이벤트 — DB `tracking_last` jsonb 와 같은 모양 */
export type TrackingEvent = { at: string | null; where: string | null; kind: string | null; level: number | null };

export type TrackingSnapshot = {
  status: Exclude<TrackingStatus, "TIMEOUT">;
  delivered: boolean;
  /** 1..6 (응답에 없으면 null) */
  level: number | null;
  /** 배송 완료 이벤트 시각(ISO · +09:00) — 완료가 아니거나 시각을 못 읽으면 null */
  deliveredAt: string | null;
  lastEvent: TrackingEvent | null;
  /** 실패 응답의 msg · 네트워크 오류 메시지 */
  error: string | null;
  /** 실패 응답의 code ('104' …) */
  errorCode: string | null;
};

export const SWEETTRACKER_LEVEL_DELIVERED = 6;

/** level → 화면 단계 문구 (스마트택배 공식 표) */
export const SWEETTRACKER_LEVEL_LABELS: Readonly<Record<number, string>> = {
  1: "배송 준비 중",
  2: "집화 완료",
  3: "배송 중",
  4: "지점 도착",
  5: "배송 출발",
  6: "배송 완료",
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const int = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

/**
 * 스마트택배 시각 → ISO. `timeString` 은 'YYYY-MM-DD HH:mm:ss'(KST · 초가 없을 수도) · `time` 은 epoch ms.
 * timeString 을 우선한다(택배사 원문) · 둘 다 못 읽으면 null.
 */
export function parseSweetTime(timeString: unknown, time?: unknown): string | null {
  const s = str(timeString);
  if (s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
    if (m) {
      const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}+09:00`;
      if (!Number.isNaN(Date.parse(iso))) return iso;
    }
  }
  const t = typeof time === "number" && Number.isFinite(time) && time > 0 ? time : null;
  return t ? new Date(t).toISOString() : null;
}

function parseEvent(v: unknown): TrackingEvent | null {
  const o = obj(v);
  if (!o) return null;
  const ev: TrackingEvent = { at: parseSweetTime(o.timeString, o.time), where: str(o.where), kind: str(o.kind), level: int(o.level) };
  return ev.at || ev.where || ev.kind || ev.level !== null ? ev : null;
}

/** 실패 msg 가 "송장을 모른다" 는 뜻이면 NOT_FOUND(택배사 미등록 — 발송 직후 흔함 · 6시간 뒤 재조회), 그 외(키·한도·서버)는 ERROR */
function classifyError(msg: string | null): "NOT_FOUND" | "ERROR" {
  if (!msg) return "ERROR";
  return /운송장|송장|배송\s*정보|조회\s*결과|없습니다|존재하지/.test(msg) ? "NOT_FOUND" : "ERROR";
}

/** 응답 JSON → 스냅샷. 모양이 낯설면 ERROR(절대 throw 하지 않는다). */
export function parseTrackingInfo(json: unknown): TrackingSnapshot {
  const base: TrackingSnapshot = { status: "ERROR", delivered: false, level: null, deliveredAt: null, lastEvent: null, error: null, errorCode: null };
  const o = obj(json);
  if (!o) return { ...base, error: "응답이 JSON 객체가 아닙니다" };
  if (o.status === false || (typeof o.msg === "string" && !("level" in o) && !("trackingDetails" in o))) {
    const msg = str(o.msg) ?? "스마트택배 오류";
    return { ...base, status: classifyError(msg), error: msg, errorCode: str(o.code) };
  }
  const details = Array.isArray(o.trackingDetails) ? o.trackingDetails.map(parseEvent).filter((e): e is TrackingEvent => !!e) : [];
  // 마지막 이벤트: lastDetail 우선 · 없으면 details 의 마지막(시간순 정렬은 응답을 믿는다)
  const last = parseEvent(o.lastDetail) ?? (details.length ? details[details.length - 1] : null);
  const level = int(o.level) ?? last?.level ?? null;
  const delivered = o.complete === true || level === SWEETTRACKER_LEVEL_DELIVERED;
  let deliveredAt: string | null = null;
  if (delivered) {
    const done = [...details].reverse().find((e) => e.level === SWEETTRACKER_LEVEL_DELIVERED) ?? (last?.level === SWEETTRACKER_LEVEL_DELIVERED ? last : null);
    deliveredAt = done?.at ?? last?.at ?? null;
  }
  return { ...base, status: delivered ? "DELIVERED" : "IN_TRANSIT", delivered, level, deliveredAt, lastEvent: last };
}

/** 화면이 받는 스냅샷 컬럼 — orders · campaigns 공통(0049) */
export type TrackingFields = {
  tracking_status: string | null;
  tracking_last: unknown;
  tracking_checked_at: string | null;
  /** orders.delivered_at · campaigns.sample_delivered_at */
  delivered_at: string | null;
};

export function parseTrackingFields(o: Record<string, unknown> | null | undefined, deliveredKey: "delivered_at" | "sample_delivered_at" = "delivered_at"): TrackingFields | null {
  if (!o) return null;
  return {
    tracking_status: str(o.tracking_status),
    tracking_last: o.tracking_last ?? null,
    tracking_checked_at: str(o.tracking_checked_at),
    delivered_at: str(o[deliveredKey]),
  };
}

/** ISO → 'M/D HH:mm' (Asia/Seoul) · 못 읽으면 null */
export function kstShort(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const parts = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(t));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const h = get("hour") === "24" ? "00" : get("hour");
  return `${Number(get("month"))}/${Number(get("day"))} ${h}:${get("minute")}`;
}

/**
 * 스냅샷 한 줄 — 캠페인 상세(두 콘솔) · 주문 상세 · 브랜드 주문 표.
 *   DELIVERED  '배송 완료 10/8 18:02'
 *   IN_TRANSIT '배송 중 · 간선상차 · 서울집중 (10/8 14:00)'  (level 라벨 + kind + where)
 *   NOT_FOUND  '택배사에 아직 등록되지 않은 송장이에요 (10/8 14:00 조회)'
 *   ERROR      '배송 조회 실패 (10/8 14:00 조회) — 송장 조회 링크로 확인해주세요'
 *   TIMEOUT    '자동 추적 종료(발송 14일 경과) — 송장 조회 링크로 확인해주세요'
 *   null       null (아직 조회 전 — 호출자가 "다음 정시에 조회" 안내)
 */
export function trackingStatusLine(t: TrackingFields | null | undefined, maxAgeDays = 14): string | null {
  if (!t || !t.tracking_status) return null;
  const last = obj(t.tracking_last);
  const checked = kstShort(t.tracking_checked_at);
  switch (t.tracking_status) {
    case "DELIVERED": {
      const at = kstShort(t.delivered_at) ?? kstShort(last ? (last.at as string) : null);
      return at ? `배송 완료 ${at}` : "배송 완료";
    }
    case "IN_TRANSIT": {
      const level = last ? int(last.level) : null;
      const label = (level && SWEETTRACKER_LEVEL_LABELS[level]) || "배송 중";
      const bits = [label, last ? str(last.kind) : null, last ? str(last.where) : null].filter((x): x is string => !!x && x !== label);
      const at = kstShort(last ? (last.at as string) : null) ?? checked;
      return `${[label, ...bits].join(" · ")}${at ? ` (${at})` : ""}`;
    }
    case "NOT_FOUND":
      return `택배사에 아직 등록되지 않은 송장이에요${checked ? ` (${checked} 조회)` : ""}`;
    case "ERROR":
      return `배송 조회 실패${checked ? ` (${checked} 조회)` : ""} — 송장 조회 링크로 확인해주세요`;
    case "TIMEOUT":
      return `자동 추적 종료(발송 ${maxAgeDays}일 경과) — 송장 조회 링크로 확인해주세요`;
    default:
      return null;
  }
}
