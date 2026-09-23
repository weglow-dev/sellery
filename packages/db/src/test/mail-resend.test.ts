// Resend 전송기 — packages/db/src/mail/resend.ts (비활성 · 멱등 가드 · 요청 형식 · 실패 흡수). fetch 를 주입해 네트워크 없이 검사한다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { GUARD_TTL_MS, createMailer, isEmailAddress, type MailMessage } from "../mail/resend";

const MSG: MailMessage = { to: "buyer@sellery.life", subject: "제목", html: "<p>hi</p>", text: "hi", tag: "order_paid", idempotencyKey: "order_paid:customer:o1" };

type Call = { url: string; init: RequestInit };

function fakeFetch(status = 200, body: unknown = { id: "re_123" }) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("비활성 (API 키 없음)", () => {
  it("fetch 를 부르지 않고 disabled — 안내 로그는 프로세스당 한 번", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { fn, calls } = fakeFetch();
    const m = createMailer({ apiKey: "", fetch: fn });
    expect(m.enabled).toBe(false);
    expect(await m.send(MSG)).toEqual({ ok: false, reason: "disabled" });
    expect(await m.send({ ...MSG, idempotencyKey: "other" })).toEqual({ ok: false, reason: "disabled" });
    expect(calls.length).toBe(0);
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(info.mock.calls[0][0])).toContain("RESEND_API_KEY");
  });
});

describe("전송", () => {
  it("POST {apiUrl}/emails · Bearer · Idempotency-Key · from 기본값 · to 배열 · tags", async () => {
    const { fn, calls } = fakeFetch();
    const m = createMailer({ apiKey: "re_test", fetch: fn, apiUrl: "http://127.0.0.1:9/" });
    expect(m.enabled).toBe(true);
    expect(await m.send(MSG)).toEqual({ ok: true, id: "re_123" });
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("http://127.0.0.1:9/emails");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer re_test");
    expect(headers["idempotency-key"]).toBe("order_paid:customer:o1");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.from).toBe("Sellery <noreply@sellery.life>");
    expect(body.to).toEqual(["buyer@sellery.life"]);
    expect(body.subject).toBe("제목");
    expect(body.html).toBe("<p>hi</p>");
    expect(body.text).toBe("hi");
    expect(body.tags).toEqual([{ name: "event", value: "order_paid" }]);
  });

  it("같은 멱등 키는 24시간 안에 다시 보내지 않는다(duplicate) — 지나면 다시 보낸다", async () => {
    let now = 1_000_000;
    const { fn, calls } = fakeFetch();
    const m = createMailer({ apiKey: "k", fetch: fn, now: () => now });
    expect((await m.send(MSG)).ok).toBe(true);
    expect(await m.send(MSG)).toEqual({ ok: false, reason: "duplicate" });
    expect(calls.length).toBe(1);
    now += GUARD_TTL_MS + 1;
    expect((await m.send(MSG)).ok).toBe(true);
    expect(calls.length).toBe(2);
  });

  it("받는 주소가 형식에 안 맞으면 invalid · 키가 없으면 invalid (fetch 없음)", async () => {
    const { fn, calls } = fakeFetch();
    const m = createMailer({ apiKey: "k", fetch: fn });
    expect(await m.send({ ...MSG, to: "" })).toEqual({ ok: false, reason: "invalid", message: "recipient" });
    expect(await m.send({ ...MSG, to: "not-an-email" })).toEqual({ ok: false, reason: "invalid", message: "recipient" });
    expect(await m.send({ ...MSG, idempotencyKey: "" })).toEqual({ ok: false, reason: "invalid", message: "idempotencyKey" });
    expect(calls.length).toBe(0);
  });

  it("4xx/5xx 는 http 로 흡수(throw 없음) 하고 가드를 풀어 다음 훅이 재시도할 수 있게 한다", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { fn, calls } = fakeFetch(500, { message: "boom" });
    const m = createMailer({ apiKey: "k", fetch: fn });
    expect(await m.send(MSG)).toEqual({ ok: false, reason: "http", status: 500, message: "boom" });
    expect(await m.send(MSG)).toEqual({ ok: false, reason: "http", status: 500, message: "boom" });
    expect(calls.length).toBe(2);
    expect(err).toHaveBeenCalled();
  });

  it("409(같은 키 · 다른 본문) 는 이미 보낸 것으로 — duplicate", async () => {
    const { fn } = fakeFetch(409, { message: "idempotency" });
    const m = createMailer({ apiKey: "k", fetch: fn });
    expect(await m.send(MSG)).toMatchObject({ ok: false, reason: "duplicate", status: 409 });
  });

  it("네트워크 예외는 network 로 흡수", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fn = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const m = createMailer({ apiKey: "k", fetch: fn });
    expect(await m.send(MSG)).toEqual({ ok: false, reason: "network", message: "ECONNREFUSED" });
  });

  it("한글이 섞인 멱등 키도 Idempotency-Key 헤더는 ASCII 로 나간다 — fetch 가 ByteString 오류로 throw 하지 않는다", async () => {
    const { fn, calls } = fakeFetch();
    const m = createMailer({ apiKey: "k", fetch: fn });
    expect((await m.send({ ...MSG, idempotencyKey: "order_shipped:o1:CJ대한통운:123" })).ok).toBe(true);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["idempotency-key"]).toMatch(/^[\x21-\x7e]+$/);
    expect(headers["idempotency-key"]).toBe("order_shipped:o1:CJ_b300__d55c__d1b5__c6b4_:123");
    expect(await m.send({ ...MSG, idempotencyKey: "order_shipped:o1:CJ대한통운:123" })).toEqual({ ok: false, reason: "duplicate" });
  });

  it("isEmailAddress", () => {
    expect(isEmailAddress("a@b.co")).toBe(true);
    expect(isEmailAddress("partner@vyneherb.example")).toBe(true);
    expect(isEmailAddress("a@b")).toBe(false);
    expect(isEmailAddress(null)).toBe(false);
  });
});

describe("isEmailAddress — 예약 도메인 차단", () => {
  it("시드·예약 도메인은 형식이 맞아도 false", () => {
    for (const a of ["official@glohealth.example", "partner@vyneherb.example", "a@b.test", "x@y.invalid", "q@localhost.localhost", "jiyu@sellery.demo", "z@example.com"]) {
      expect(isEmailAddress(a)).toBe(false);
    }
  });
  it("실제 주소는 true", () => {
    for (const a of ["shingoonk@weglow.biz", "orangebear851011@gmail.com", "user@example-shop.co.kr", "buyer@sellery.life"]) expect(isEmailAddress(a)).toBe(true);
  });
});

