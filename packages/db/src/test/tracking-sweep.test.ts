// 택배 자동 추적 스윕 — packages/db/src/tracking/sweep.ts (0049 · 서버 어댑터는 server/tracking.server.ts). fetch 와 rpc 를 주입해 네트워크·DB 없이
//   키 없음(NO_KEY · 호출 0회) · 배송 완료 → 샘플 TESTING 전이 / 주문 delivered_at · 타임아웃 · ERROR 흡수 · dry-run 을 검사한다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchKeyUsage, parseTrackingDue, parseTrackingRecord, sweepTracking, trackParcel, type TrackingDb } from "../tracking/sweep";

const DELIVERED = {
  complete: true,
  level: 6,
  trackingDetails: [{ kind: "배송완료", level: 6, timeString: "2026-10-08 18:02:00", where: "강남2" }],
  lastDetail: { kind: "배송완료", level: 6, timeString: "2026-10-08 18:02:00", where: "강남2" },
};
const IN_TRANSIT = { complete: false, level: 3, lastDetail: { kind: "간선상차", level: 3, timeString: "2026-10-08 14:00:00", where: "서울집중" } };
const ERR_INVOICE = { status: false, msg: "유효하지 않은 운송장번호 이거나 택배사 코드 입니다.", code: "104" };

type Call = { url: string; body: Record<string, string> };

/** 송장번호 → 응답 (t_invoice 로 분기) · key/usage 는 고정 */
function fakeFetch(byInvoice: Record<string, unknown>, usage: unknown = { used_count: 42, limit: 5000 }) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, string>;
    calls.push({ url: String(url), body });
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["content-type"]).toBe("application/json");
    if (String(url).endsWith("/api/v1/key/usage")) return new Response(JSON.stringify(usage), { status: 200 });
    const r = byInvoice[body.t_invoice];
    if (r === "boom") throw new TypeError("fetch failed");
    if (r === "html") return new Response("<html>", { status: 200 });
    if (r === "500") return new Response(JSON.stringify({ msg: "server" }), { status: 500 });
    return new Response(JSON.stringify(r ?? ERR_INVOICE), { status: 200 });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

type Parcel = { kind: "sample" | "order"; id: string; code: string; courier: string; tracking_no: string; shipped_at: string; tracking_status: string | null };

/** DB 흉내 — app_tracking_due 1회 · app_tracking_record 는 샘플/주문 상태를 메모리로 */
function fakeAdmin(samples: Parcel[], orders: Parcel[], state: { campaignStatus: Record<string, string>; delivered: Record<string, string | null> }) {
  const records: Array<Record<string, unknown>> = [];
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    if (name === "app_tracking_due") return { data: { ok: true, timed_out: { samples: 1, orders: 2 }, samples, orders }, error: null };
    if (name === "app_tracking_record") {
      records.push(args ?? {});
      const kind = args?.p_kind as string;
      const id = args?.p_id as string;
      const status = args?.p_status as string;
      const p = [...samples, ...orders].find((x) => x.id === id);
      if (!p) return { data: { ok: false, code: "NOT_FOUND" }, error: null };
      const delivered = status === "DELIVERED";
      if (kind === "order") {
        const newly = delivered && !state.delivered[id];
        if (newly) state.delivered[id] = args?.p_delivered_at as string;
        return { data: { ok: true, kind, code: p.code, status, delivered, newly_delivered: newly, transitioned: false, already: false }, error: null };
      }
      if (!delivered) return { data: { ok: true, kind, code: p.code, status, delivered: false, newly_delivered: false, transitioned: false, already: false }, error: null };
      const already = state.campaignStatus[id] !== "SAMPLE_SHIPPED";
      if (!already) state.campaignStatus[id] = "TESTING";
      return { data: { ok: true, kind, code: p.code, status, delivered: true, newly_delivered: !already, transitioned: !already, already, test_due: "2026-10-22" }, error: null };
    }
    return { data: null, error: { message: `unknown rpc ${name}` } };
  });
  return { admin: { rpc } as unknown as TrackingDb, rpc, records };
}

const S1: Parcel = { kind: "sample", id: "c-1", code: "c7", courier: "CJ대한통운", tracking_no: "1111", shipped_at: "2026-10-07T00:00:00Z", tracking_status: null };
const S2: Parcel = { kind: "sample", id: "c-2", code: "c8", courier: "한진택배", tracking_no: "2222", shipped_at: "2026-10-07T00:00:00Z", tracking_status: "IN_TRANSIT" };
const O1: Parcel = { kind: "order", id: "o-1", code: "o400", courier: "우체국택배", tracking_no: "3333", shipped_at: "2026-10-06T00:00:00Z", tracking_status: null };
const O2: Parcel = { kind: "order", id: "o-2", code: "o401", courier: "롯데택배", tracking_no: "4444", shipped_at: "2026-10-06T00:00:00Z", tracking_status: null };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("키 없음", () => {
  it("NO_KEY — fetch · rpc 모두 0회 · 안내 로그 1회", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { fn, calls } = fakeFetch({});
    const { admin, rpc } = fakeAdmin([], [], { campaignStatus: {}, delivered: {} });
    const r = await sweepTracking(admin, { apiKey: "", fetch: fn });
    expect(r).toMatchObject({ ok: true, skipped: "NO_KEY", checked: 0 });
    expect(calls.length).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(info.mock.calls[0][0])).toContain("SWEETTRACKER_API_KEY");
  });
});

describe("스윕", () => {
  it("배송 완료 → 샘플 TESTING(actor system 경로) · 주문 delivered_at · 배송 중은 스냅샷만 · 카운트 · usage", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { fn, calls } = fakeFetch({ "1111": DELIVERED, "2222": IN_TRANSIT, "3333": DELIVERED, "4444": ERR_INVOICE });
    const state = { campaignStatus: { "c-1": "SAMPLE_SHIPPED", "c-2": "SAMPLE_SHIPPED" }, delivered: {} as Record<string, string | null> };
    const { admin, records } = fakeAdmin([S1, S2], [O1, O2], state);
    const changed: string[] = [];
    const r = await sweepTracking(admin, { apiKey: "KEY", fetch: fn, onCampaignChanged: (id, code) => void changed.push(`${id}:${code}`) });

    expect(r.ok).toBe(true);
    expect(r.skipped).toBeUndefined();
    expect(r.timedOut).toEqual({ samples: 1, orders: 2 });
    expect(r.due).toEqual({ samples: 2, orders: 2 });
    expect(r.checked).toBe(4);
    expect(r.delivered).toEqual({ samples: 1, orders: 1 });
    expect(r.transitioned).toEqual(["c7"]);
    expect(r.notFound).toBe(1);
    expect(r.errors).toBe(0);
    expect(r.usage).toEqual({ used: 42, remaining: 4958, limit: 5000, error: null });
    expect(changed).toEqual(["c-1:c7"]);

    // 전이 경로: 샘플 c-1 → TESTING · 주문 o-1 delivered_at = 택배사 완료 시각
    expect(state.campaignStatus["c-1"]).toBe("TESTING");
    expect(state.campaignStatus["c-2"]).toBe("SAMPLE_SHIPPED");
    expect(state.delivered["o-1"]).toBe("2026-10-08T18:02:00+09:00");
    expect(state.delivered["o-2"]).toBeUndefined();

    // 기록 인자 — 스냅샷 · source
    const rec1 = records.find((x) => x.p_id === "c-1")!;
    expect(rec1).toMatchObject({ p_kind: "sample", p_status: "DELIVERED", p_source: "sweettracker", p_delivered_at: "2026-10-08T18:02:00+09:00" });
    expect(rec1.p_last).toEqual({ at: "2026-10-08T18:02:00+09:00", where: "강남2", kind: "배송완료", level: 6 });
    const rec2 = records.find((x) => x.p_id === "c-2")!;
    expect(rec2).toMatchObject({ p_status: "IN_TRANSIT", p_delivered_at: undefined });
    expect(records.find((x) => x.p_id === "o-2")).toMatchObject({ p_status: "NOT_FOUND", p_last: undefined });

    // 호출: 소포 4 + usage 1 — 전부 POST JSON · 택배사 코드
    expect(calls.length).toBe(5);
    expect(calls.find((c) => c.body.t_invoice === "1111")?.body.t_code).toBe("04");
    expect(calls.find((c) => c.body.t_invoice === "3333")?.body.t_code).toBe("01");
    expect(calls[4].url).toContain("/api/v1/key/usage");
  });

  it("수동 [수령 확인] 이 먼저였으면 already — 전이 0 · onCampaignChanged 호출 없음", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { fn } = fakeFetch({ "1111": DELIVERED });
    const state = { campaignStatus: { "c-1": "TESTING" }, delivered: {} };
    const { admin } = fakeAdmin([S1], [], state);
    const changed: string[] = [];
    const r = await sweepTracking(admin, { apiKey: "KEY", fetch: fn, onCampaignChanged: (id) => void changed.push(id), reportUsage: false });
    expect(r.delivered.samples).toBe(1);
    expect(r.transitioned).toEqual([]);
    expect(r.items[0]).toMatchObject({ code: "c7", status: "DELIVERED", already: true, transitioned: false });
    expect(changed).toEqual([]);
    expect(r.usage).toBeNull();
  });

  it("네트워크 오류 · 비JSON · HTTP 500 은 ERROR 로 기록하고 다른 소포를 막지 않는다", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { fn } = fakeFetch({ "1111": "boom", "2222": "html", "3333": "500", "4444": DELIVERED });
    const state = { campaignStatus: { "c-1": "SAMPLE_SHIPPED", "c-2": "SAMPLE_SHIPPED" }, delivered: {} as Record<string, string | null> };
    const { admin, records } = fakeAdmin([S1, S2], [O1, O2], state);
    const r = await sweepTracking(admin, { apiKey: "KEY", fetch: fn, reportUsage: false, concurrency: 2 });
    expect(r.checked).toBe(4);
    expect(r.errors).toBe(3);
    expect(r.delivered.orders).toBe(1);
    expect(state.delivered["o-2"]).toBeTruthy();
    expect(records.filter((x) => x.p_status === "ERROR").length).toBe(3);
    expect(r.items.find((i) => i.code === "c7")?.error).toContain("fetch failed");
    expect(r.items.find((i) => i.code === "c8")?.error).toContain("JSON");
    expect(r.items.find((i) => i.code === "o400")?.error).toContain("HTTP 500");
  });

  it("dry-run — API 는 호출하지만 app_tracking_record 는 부르지 않는다", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { fn, calls } = fakeFetch({ "1111": DELIVERED });
    const state = { campaignStatus: { "c-1": "SAMPLE_SHIPPED" }, delivered: {} };
    const { admin, rpc, records } = fakeAdmin([S1], [], state);
    const r = await sweepTracking(admin, { apiKey: "KEY", fetch: fn, dryRun: true, reportUsage: false });
    expect(r.dryRun).toBe(true);
    expect(r.items[0]).toMatchObject({ status: "DELIVERED", transitioned: false });
    expect(calls.length).toBe(1);
    expect(records.length).toBe(0);
    expect(rpc).toHaveBeenCalledTimes(1); // due 만
    expect(state.campaignStatus["c-1"]).toBe("SAMPLE_SHIPPED");
  });

  it("app_tracking_due 오류는 throw (크론 500)", async () => {
    const { fn } = fakeFetch({});
    const admin = { rpc: vi.fn(async () => ({ data: null, error: { message: "boom" } })) } as unknown as TrackingDb;
    await expect(sweepTracking(admin, { apiKey: "KEY", fetch: fn })).rejects.toThrow("app_tracking_due failed");
  });
});

describe("trackParcel · fetchKeyUsage · 파서", () => {
  it("타임아웃은 ERROR 스냅샷(throw 없음)", async () => {
    const fn = vi.fn((_u: string, init?: RequestInit) => new Promise<Response>((_, rej) => init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })))));
    const s = await trackParcel("CJ대한통운", "1111", { apiKey: "K", fetch: fn as unknown as typeof fetch, timeoutMs: 5 });
    expect(s.status).toBe("ERROR");
    expect(s.error).toContain("시간 초과");
  });
  it("미지원 택배사는 호출 없이 NOT_FOUND", async () => {
    const { fn, calls } = fakeFetch({});
    const s = await trackParcel("경동택배", "1111", { apiKey: "K", fetch: fn });
    expect(s.status).toBe("NOT_FOUND");
    expect(calls.length).toBe(0);
  });
  it("fetchKeyUsage 실패는 error 만", async () => {
    const fn = vi.fn(async () => new Response("nope", { status: 403 })) as unknown as typeof fetch;
    const u = await fetchKeyUsage({ apiKey: "K", fetch: fn });
    expect(u.used).toBeNull();
    expect(u.error).toContain("JSON");
  });
  it("parseTrackingDue · parseTrackingRecord 모양 방어", () => {
    expect(parseTrackingDue({ ok: false })).toBeNull();
    expect(parseTrackingDue({ ok: true, samples: [{ id: "x" }], orders: "no" })).toEqual({ timedOut: { samples: 0, orders: 0 }, samples: [], orders: [] });
    expect(parseTrackingRecord(null)).toEqual({ ok: false, code: "DB_ERROR" });
    expect(parseTrackingRecord({ ok: false, code: "BAD_STATUS" })).toEqual({ ok: false, code: "BAD_STATUS" });
    expect(parseTrackingRecord({ ok: true, kind: "sample", code: "c1", status: "DELIVERED", transitioned: true, test_due: "2026-10-22" })).toMatchObject({ ok: true, transitioned: true, testDue: "2026-10-22" });
  });
});
