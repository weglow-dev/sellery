/**
 * 택배 자동 추적 스윕 — 순수 모듈 (0049). 네트워크(fetch)와 DB(rpc)를 **주입**받아 돈다 — 테스트는 둘 다 메모리로(mail/resend.ts 와 같은 패턴).
 * 서버 진입점은 server/tracking.server.ts(runTrackingSweep(admin) · 운영용 조회), 크론은 shop `/api/cron/tracking`.
 *
 *   trackParcel(courier, trackingNo, {apiKey, fetch, timeoutMs})   API 1회(POST JSON) — 8초 타임아웃 · 절대 throw 하지 않는다(ERROR 스냅샷)
 *   fetchKeyUsage({apiKey, fetch})                                  POST /api/v1/key/usage — 이번 달 호출량(월 5,000회 공유)
 *   sweepTracking(db, {apiKey, limit, dryRun, fetch})               app_tracking_due → 소포마다 trackParcel → app_tracking_record
 *       샘플 DELIVERED → SAMPLE_SHIPPED→TESTING(actor system · sample_received{auto:true}) · 주문 DELIVERED → orders.delivered_at
 *       멱등: 간격(배송 중 3시간 · NOT_FOUND 6시간 · 14일 TIMEOUT)은 DB app_tracking_due 가 판정 — 매시 크론이어도 소포당 하루 ≤8회
 *       키가 없으면 {skipped:'NO_KEY'} — 호출 0회. dryRun 은 조회만 하고 기록하지 않는다(API 는 호출한다 — 호출량 주의)
 */
import { keyUsageRequest, parseKeyUsage, parseTrackingInfo, trackingInfoRequest, type KeyUsage, type SweettrackerRequest, type TrackingSnapshot } from "./sweettracker";

export type TrackOptions = {
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** 테스트·목 서버 오리진 — 기본 https://info.sweettracker.co.kr */
  apiUrl?: string;
};

const DEFAULT_TIMEOUT_MS = 8_000;

type PostResult = { ok: true; status: number; body: unknown } | { ok: false; error: string };

/** POST JSON 1회 — 타임아웃·네트워크·비JSON 은 {ok:false} (throw 없음) */
async function postJson(req: SweettrackerRequest, opts: Pick<TrackOptions, "fetch" | "timeoutMs">): Promise<PostResult> {
  const f = opts.fetch ?? fetch;
  const ctrl = new AbortController();
  const ms = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await f(req.url, { ...req.init, signal: ctrl.signal });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      return { ok: false, error: `응답이 JSON 이 아닙니다 (HTTP ${res.status})` };
    }
    if (!res.ok) {
      const o = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
      return { ok: false, error: `HTTP ${res.status}${o && typeof o.msg === "string" ? ` · ${o.msg}` : ""}` };
    }
    return { ok: true, status: res.status, body };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    return { ok: false, error: name === "AbortError" ? `시간 초과 (${ms}ms)` : e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** 이번 달 호출량 — 실패해도 throw 하지 않는다(error 에 사유) */
export async function fetchKeyUsage(opts: TrackOptions): Promise<KeyUsage> {
  const r = await postJson(keyUsageRequest(opts.apiKey, opts.apiUrl), opts);
  if (!r.ok) return { used: null, remaining: null, limit: null, raw: null, error: r.error };
  return parseKeyUsage(r.body);
}

/** 스마트택배 1회 조회 — 네트워크·타임아웃·JSON 오류는 전부 ERROR 스냅샷으로(throw 없음). 택배사·송장이 비정상이면 NOT_FOUND. */
export async function trackParcel(courier: string | null | undefined, trackingNo: string | null | undefined, opts: TrackOptions): Promise<TrackingSnapshot> {
  const req = trackingInfoRequest(opts.apiKey, courier, trackingNo, opts.apiUrl);
  const err = (status: "ERROR" | "NOT_FOUND", error: string): TrackingSnapshot => ({ status, delivered: false, level: null, deliveredAt: null, lastEvent: null, error, errorCode: null });
  if (!req) return err("NOT_FOUND", `지원하지 않는 택배사이거나 송장에 숫자가 없습니다: ${courier ?? "-"} ${trackingNo ?? "-"}`);
  const r = await postJson(req, opts);
  if (!r.ok) return err("ERROR", r.error);
  return parseTrackingInfo(r.body);
}

export type DueParcel = {
  kind: "sample" | "order";
  id: string;
  code: string;
  courier: string | null;
  tracking_no: string;
  shipped_at: string | null;
  tracking_status: string | null;
};

export type TrackingDue = { timedOut: { samples: number; orders: number }; samples: DueParcel[]; orders: DueParcel[] };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function parseParcel(v: unknown, kind: "sample" | "order"): DueParcel | null {
  const o = obj(v);
  if (!o || typeof o.id !== "string" || typeof o.tracking_no !== "string") return null;
  return {
    kind,
    id: o.id,
    code: typeof o.code === "string" ? o.code : "",
    courier: typeof o.courier === "string" ? o.courier : null,
    tracking_no: o.tracking_no,
    shipped_at: typeof o.shipped_at === "string" ? o.shipped_at : null,
    tracking_status: typeof o.tracking_status === "string" ? o.tracking_status : null,
  };
}

export function parseTrackingDue(json: unknown): TrackingDue | null {
  const o = obj(json);
  if (!o || o.ok !== true) return null;
  const to = obj(o.timed_out);
  const list = (v: unknown, kind: "sample" | "order") => (Array.isArray(v) ? v.map((x) => parseParcel(x, kind)).filter((x): x is DueParcel => !!x) : []);
  return { timedOut: { samples: num(to?.samples), orders: num(to?.orders) }, samples: list(o.samples, "sample"), orders: list(o.orders, "order") };
}

export type TrackingRecordResult =
  | { ok: true; kind: "sample" | "order"; code: string; status: string; delivered: boolean; newlyDelivered: boolean; transitioned: boolean; already: boolean; testDue: string | null }
  | { ok: false; code: "NOT_FOUND" | "BAD_STATUS" | "BAD_KIND" | "DB_ERROR" };

export function parseTrackingRecord(json: unknown): TrackingRecordResult {
  const o = obj(json);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok !== true) {
    const code = o.code === "NOT_FOUND" || o.code === "BAD_STATUS" || o.code === "BAD_KIND" ? o.code : "DB_ERROR";
    return { ok: false, code };
  }
  return {
    ok: true,
    kind: o.kind === "sample" ? "sample" : "order",
    code: typeof o.code === "string" ? o.code : "",
    status: typeof o.status === "string" ? o.status : "",
    delivered: o.delivered === true,
    newlyDelivered: o.newly_delivered === true,
    transitioned: o.transitioned === true,
    already: o.already === true,
    testDue: typeof o.test_due === "string" ? o.test_due : null,
  };
}

export type SweepOptions = {
  /** 비어 있으면 호출 없이 {skipped:'NO_KEY'} */
  apiKey: string | null | undefined;
  /** 한 번에 조회할 최대 소포 수(샘플 우선) — 기본 50 */
  limit?: number;
  /** 조회만 · DB 기록·전이 없음(API 는 호출한다) */
  dryRun?: boolean;
  /** 동시 호출 수 — 기본 5 */
  concurrency?: number;
  fetch?: typeof fetch;
  apiUrl?: string;
  timeoutMs?: number;
  /** 발송 뒤 이 날수가 지나면 TIMEOUT — 기본 14 */
  maxAgeDays?: number;
  /** campaign_events.payload.source — 기본 'sweettracker' */
  source?: string;
  /** 샘플이 TESTING 으로 넘어간 뒤 호출(라이브 갱신 알림 등) — 실패는 삼킨다 */
  onCampaignChanged?: (campaignId: string, campaignCode: string) => void | Promise<void>;
  /** 스윕 끝에 key/usage 를 한 번 더 불러 남은 호출량을 응답에 싣는다 — 기본 true(조회한 소포가 있을 때만) */
  reportUsage?: boolean;
};

export type SweepItem = {
  kind: "sample" | "order";
  code: string;
  courier: string | null;
  tracking_no: string;
  status: string;
  delivered: boolean;
  transitioned: boolean;
  already: boolean;
  error: string | null;
};

export type SweepResult = {
  ok: true;
  skipped?: "NO_KEY";
  dryRun: boolean;
  timedOut: { samples: number; orders: number };
  due: { samples: number; orders: number };
  checked: number;
  delivered: { samples: number; orders: number };
  /** 이번 스윕에서 TESTING 으로 넘어간 캠페인 코드 */
  transitioned: string[];
  notFound: number;
  errors: number;
  items: SweepItem[];
  /** 이번 달 호출량(used/remaining/limit) — reportUsage 가 꺼졌거나 조회 0건이면 null · 실패면 error 만 */
  usage: { used: number | null; remaining: number | null; limit: number | null; error: string | null } | null;
};

/**
 * DB 접점 — 서버 어댑터(server/tracking.server.ts)가 supabase admin 을 이 모양으로 감싼다. 테스트는 메모리 구현을 넣는다.
 *   app_tracking_due(p_limit, p_max_age_days) · app_tracking_record(p_kind, p_id, p_status, p_last?, p_delivered_at?, p_source) — 0049
 */
export type TrackingDb = {
  rpc: (fn: "app_tracking_due" | "app_tracking_record", args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/** 조회 대상 — 운영 스크립트의 미리보기용 */
export async function listTrackingDue(db: TrackingDb, limit = 50, maxAgeDays = 14): Promise<TrackingDue> {
  const { data, error } = await db.rpc("app_tracking_due", { p_limit: limit, p_max_age_days: maxAgeDays });
  if (error) throw new Error(`app_tracking_due failed: ${error.message}`);
  const due = parseTrackingDue(data);
  if (!due) throw new Error("app_tracking_due returned an unexpected shape");
  return due;
}

async function recordSnapshot(db: TrackingDb, p: DueParcel, snap: TrackingSnapshot, source: string): Promise<TrackingRecordResult> {
  const { data, error } = await db.rpc("app_tracking_record", {
    p_kind: p.kind,
    p_id: p.id,
    p_status: snap.status,
    p_last: snap.lastEvent ?? undefined,
    p_delivered_at: snap.deliveredAt ?? undefined,
    p_source: source,
  });
  if (error) {
    console.error(`[tracking] app_tracking_record failed (${p.kind} ${p.code}):`, error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parseTrackingRecord(data);
}

/** 매시 스윕 — 서버 어댑터 runTrackingSweep(admin) 이 부른다. DB 오류(due 조회)는 throw · 소포별 오류는 카운트. */
export async function sweepTracking(db: TrackingDb, opts: SweepOptions): Promise<SweepResult> {
  const apiKey = (opts.apiKey ?? "").trim();
  const dryRun = opts.dryRun === true;
  const base: SweepResult = {
    ok: true,
    dryRun,
    timedOut: { samples: 0, orders: 0 },
    due: { samples: 0, orders: 0 },
    checked: 0,
    delivered: { samples: 0, orders: 0 },
    transitioned: [],
    notFound: 0,
    errors: 0,
    items: [],
    usage: null,
  };
  if (!apiKey) {
    console.info("[tracking] SWEETTRACKER_API_KEY 가 없어 택배 자동 추적을 건너뜁니다 (docs/deploy.md §5.8)");
    return { ...base, skipped: "NO_KEY" };
  }

  const due = await listTrackingDue(db, opts.limit ?? 50, opts.maxAgeDays ?? 14);
  base.timedOut = due.timedOut;
  base.due = { samples: due.samples.length, orders: due.orders.length };
  const parcels = [...due.samples, ...due.orders];
  const source = opts.source ?? "sweettracker";
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 5, 20));

  const one = async (p: DueParcel): Promise<SweepItem> => {
    const snap = await trackParcel(p.courier, p.tracking_no, { apiKey, fetch: opts.fetch, apiUrl: opts.apiUrl, timeoutMs: opts.timeoutMs });
    const item: SweepItem = { kind: p.kind, code: p.code, courier: p.courier, tracking_no: p.tracking_no, status: snap.status, delivered: snap.delivered, transitioned: false, already: false, error: snap.error };
    if (dryRun) return item;
    const r = await recordSnapshot(db, p, snap, source);
    if (!r.ok) {
      item.status = "ERROR";
      item.error = item.error ?? `record failed: ${r.code}`;
      return item;
    }
    item.transitioned = r.transitioned;
    item.already = r.already;
    if (r.transitioned && opts.onCampaignChanged) {
      try {
        await opts.onCampaignChanged(p.id, p.code);
      } catch (e) {
        console.error("[tracking] onCampaignChanged failed:", e instanceof Error ? e.message : String(e));
      }
    }
    return item;
  };

  // 동시 N 개씩 — 한 소포의 실패가 다른 소포를 막지 않는다
  for (let i = 0; i < parcels.length; i += concurrency) {
    const batch = parcels.slice(i, i + concurrency);
    const items = await Promise.all(batch.map(one));
    for (const it of items) {
      base.items.push(it);
      base.checked++;
      if (it.status === "DELIVERED") {
        if (it.kind === "sample") base.delivered.samples++;
        else base.delivered.orders++;
      } else if (it.status === "NOT_FOUND") base.notFound++;
      else if (it.status === "ERROR") base.errors++;
      if (it.transitioned) base.transitioned.push(it.code);
    }
  }

  if (base.checked && opts.reportUsage !== false) {
    const u = await fetchKeyUsage({ apiKey, fetch: opts.fetch, apiUrl: opts.apiUrl, timeoutMs: opts.timeoutMs });
    base.usage = { used: u.used, remaining: u.remaining, limit: u.limit, error: u.error };
  }
  if (base.checked || base.timedOut.samples || base.timedOut.orders) {
    const usage = base.usage ? (base.usage.error ? `usage=? (${base.usage.error})` : `usage=${base.usage.used ?? "?"}/${base.usage.limit ?? "?"} remaining=${base.usage.remaining ?? "?"}`) : "";
    console.log(
      `[tracking] ${dryRun ? "(dry-run) " : ""}checked=${base.checked} samples=${base.due.samples} orders=${base.due.orders} delivered=${base.delivered.samples}/${base.delivered.orders} testing=${base.transitioned.join(",") || "-"} notFound=${base.notFound} errors=${base.errors} timedOut=${base.timedOut.samples}/${base.timedOut.orders} ${usage}`.trimEnd(),
    );
  }
  return base;
}
