// 스마트택배 순수 모듈 — packages/db/src/tracking/sweettracker.ts (0049): 요청 조립(POST JSON) · 택배사 코드 · 응답 파싱 · 화면 문구.
import { describe, expect, it } from "vitest";
import { COURIERS } from "../carriers";
import {
  SWEETTRACKER_CODES,
  companyListRequest,
  keyUsageRequest,
  kstShort,
  parseKeyUsage,
  parseSweetTime,
  parseTrackingFields,
  parseTrackingInfo,
  sweettrackerCode,
  trackingInfoRequest,
  trackingStatusLine,
} from "../tracking/sweettracker";

/** 실키 응답 모양(2026-10-08 확인) — 배송 완료 */
const DELIVERED = {
  adUrl: null,
  complete: true,
  invoiceNo: "689012345678",
  itemName: "버닝온",
  level: 6,
  receiverName: "지*",
  trackingDetails: [
    { kind: "집화처리", level: 2, time: 1759900800000, timeString: "2026-10-08 14:00:00", where: "서울집중" },
    { kind: "간선상차", level: 3, time: 1759904400000, timeString: "2026-10-08 15:00:00", where: "서울집중" },
    { kind: "배송완료", level: 6, time: 1759915320000, timeString: "2026-10-08 18:02:00", where: "강남2" },
  ],
  lastDetail: { kind: "배송완료", level: 6, time: 1759915320000, timeString: "2026-10-08 18:02:00", where: "강남2" },
};

const IN_TRANSIT = {
  complete: false,
  invoiceNo: "689012345678",
  level: 3,
  trackingDetails: [
    { kind: "집화처리", level: 2, timeString: "2026-10-08 13:10", where: "서울집중" },
    { kind: "간선상차", level: 3, timeString: "2026-10-08 14:00", where: "서울집중" },
  ],
  lastDetail: { kind: "간선상차", level: 3, timeString: "2026-10-08 14:00", where: "서울집중" },
};

const ERR_INVOICE = { status: false, msg: "유효하지 않은 운송장번호 이거나 택배사 코드 입니다.", code: "104" };
const ERR_KEY = { status: false, msg: "유효하지 않은 API KEY 입니다.", code: "101" };

describe("택배사 코드", () => {
  it("COURIERS 5개 전부 코드가 있다 — 01 우체국 · 04 CJ · 05 한진 · 06 로젠 · 08 롯데 (companylist 2026-10-08 확인)", () => {
    for (const c of COURIERS) expect(SWEETTRACKER_CODES[c]).toMatch(/^\d{2}$/);
    expect(sweettrackerCode("우체국택배")).toBe("01");
    expect(sweettrackerCode("CJ대한통운")).toBe("04");
    expect(sweettrackerCode("한진택배")).toBe("05");
    expect(sweettrackerCode("로젠택배")).toBe("06");
    expect(sweettrackerCode("롯데택배")).toBe("08");
    expect(sweettrackerCode("경동택배")).toBeNull();
    expect(sweettrackerCode(null)).toBeNull();
  });
});

describe("요청 조립 — 전부 POST + application/json (GET 은 2026-10-30 종료)", () => {
  it("trackingInfo: 본문 {t_key, t_code, t_invoice} · 송장은 숫자만", () => {
    const r = trackingInfoRequest("KEY", "CJ대한통운", "6890-1234-5678");
    expect(r).not.toBeNull();
    expect(r!.url).toBe("https://info.sweettracker.co.kr/api/v1/trackingInfo");
    expect(r!.init.method).toBe("POST");
    expect(r!.init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(r!.init.body)).toEqual({ t_key: "KEY", t_code: "04", t_invoice: "689012345678" });
    // 키가 URL 에 실리지 않는다
    expect(r!.url).not.toContain("KEY");
  });
  it("택배사 미지원 · 숫자 없는 송장 · 빈 키 → null", () => {
    expect(trackingInfoRequest("KEY", "경동택배", "123")).toBeNull();
    expect(trackingInfoRequest("KEY", "CJ대한통운", "abc")).toBeNull();
    expect(trackingInfoRequest("", "CJ대한통운", "123")).toBeNull();
  });
  it("companylist · key/usage: {t_key} · 목 서버 오리진 치환", () => {
    expect(JSON.parse(companyListRequest("K").init.body)).toEqual({ t_key: "K" });
    expect(companyListRequest("K").url).toBe("https://info.sweettracker.co.kr/api/v1/companylist");
    expect(keyUsageRequest("K", "http://127.0.0.1:9").url).toBe("http://127.0.0.1:9/api/v1/key/usage");
    expect(keyUsageRequest("K", "http://127.0.0.1:9/").url).toBe("http://127.0.0.1:9/api/v1/key/usage");
  });
});

describe("시각", () => {
  it("timeString(KST) 우선 · 초 생략 허용 · 없으면 epoch ms · 둘 다 없으면 null", () => {
    expect(parseSweetTime("2026-10-08 18:02:00")).toBe("2026-10-08T18:02:00+09:00");
    expect(parseSweetTime("2026-10-08 14:00")).toBe("2026-10-08T14:00:00+09:00");
    expect(parseSweetTime(null, Date.parse("2026-10-08T09:22:00Z"))).toBe("2026-10-08T09:22:00.000Z");
    expect(parseSweetTime("", 0)).toBeNull();
    expect(parseSweetTime("언제", undefined)).toBeNull();
  });
  it("kstShort — 'M/D HH:mm' (Asia/Seoul)", () => {
    expect(kstShort("2026-10-08T18:02:00+09:00")).toBe("10/8 18:02");
    expect(kstShort("2026-10-08T15:30:00Z")).toBe("10/9 00:30");
    expect(kstShort("x")).toBeNull();
    expect(kstShort(null)).toBeNull();
  });
});

describe("응답 파싱", () => {
  it("배송 완료 — complete/level 6 · 완료 이벤트 시각 · 마지막 이벤트", () => {
    const s = parseTrackingInfo(DELIVERED);
    expect(s.status).toBe("DELIVERED");
    expect(s.delivered).toBe(true);
    expect(s.level).toBe(6);
    expect(s.deliveredAt).toBe("2026-10-08T18:02:00+09:00");
    expect(s.lastEvent).toEqual({ at: "2026-10-08T18:02:00+09:00", where: "강남2", kind: "배송완료", level: 6 });
    expect(s.error).toBeNull();
  });
  it("배송 중 — level 3 · 마지막 이벤트 · deliveredAt null", () => {
    const s = parseTrackingInfo(IN_TRANSIT);
    expect(s.status).toBe("IN_TRANSIT");
    expect(s.delivered).toBe(false);
    expect(s.level).toBe(3);
    expect(s.deliveredAt).toBeNull();
    expect(s.lastEvent).toEqual({ at: "2026-10-08T14:00:00+09:00", where: "서울집중", kind: "간선상차", level: 3 });
  });
  it("lastDetail 이 없으면 trackingDetails 마지막 · complete 만 true 여도 DELIVERED", () => {
    const s = parseTrackingInfo({ complete: true, trackingDetails: IN_TRANSIT.trackingDetails });
    expect(s.status).toBe("DELIVERED");
    expect(s.lastEvent?.kind).toBe("간선상차");
    expect(s.deliveredAt).toBe("2026-10-08T14:00:00+09:00");
  });
  it("실패 — 운송장/택배사 오류(104)는 NOT_FOUND · 키 오류는 ERROR · msg/code 보존", () => {
    const a = parseTrackingInfo(ERR_INVOICE);
    expect(a.status).toBe("NOT_FOUND");
    expect(a.error).toBe(ERR_INVOICE.msg);
    expect(a.errorCode).toBe("104");
    expect(a.delivered).toBe(false);
    const b = parseTrackingInfo(ERR_KEY);
    expect(b.status).toBe("ERROR");
    expect(b.errorCode).toBe("101");
  });
  it("낯선 모양은 ERROR (throw 없음)", () => {
    expect(parseTrackingInfo(null).status).toBe("ERROR");
    expect(parseTrackingInfo("x").status).toBe("ERROR");
    expect(parseTrackingInfo([]).status).toBe("ERROR");
    expect(parseTrackingInfo({}).status).toBe("IN_TRANSIT"); // 빈 객체 = 아직 이벤트 없음
  });
});

describe("key/usage", () => {
  it("숫자 필드 이름 추정 · 중첩 1단계 · remaining 계산 · 실패", () => {
    expect(parseKeyUsage({ used_count: "120", limit: 5000 })).toMatchObject({ used: 120, limit: 5000, remaining: 4880, error: null });
    expect(parseKeyUsage({ data: { use: 7, remain: 4993 } })).toMatchObject({ used: 7, remaining: 4993 });
    expect(parseKeyUsage(ERR_KEY)).toMatchObject({ used: null, error: ERR_KEY.msg });
    expect(parseKeyUsage("no")).toMatchObject({ used: null, remaining: null });
  });
});

describe("화면 문구 trackingStatusLine", () => {
  const checked = "2026-10-08T05:00:00Z"; // KST 14:00
  it("null/미조회 → null", () => {
    expect(trackingStatusLine(null)).toBeNull();
    expect(trackingStatusLine({ tracking_status: null, tracking_last: null, tracking_checked_at: checked, delivered_at: null })).toBeNull();
  });
  it("배송 중 · 단계 라벨 + kind + where (이벤트 시각)", () => {
    const line = trackingStatusLine({
      tracking_status: "IN_TRANSIT",
      tracking_last: { at: "2026-10-08T14:00:00+09:00", where: "서울집중", kind: "간선상차", level: 3 },
      tracking_checked_at: checked,
      delivered_at: null,
    });
    expect(line).toBe("배송 중 · 간선상차 · 서울집중 (10/8 14:00)");
  });
  it("배송 완료 시각 · NOT_FOUND · ERROR · TIMEOUT", () => {
    expect(trackingStatusLine({ tracking_status: "DELIVERED", tracking_last: null, tracking_checked_at: checked, delivered_at: "2026-10-08T18:02:00+09:00" })).toBe("배송 완료 10/8 18:02");
    expect(trackingStatusLine({ tracking_status: "NOT_FOUND", tracking_last: null, tracking_checked_at: checked, delivered_at: null })).toBe("택배사에 아직 등록되지 않은 송장이에요 (10/8 14:00 조회)");
    expect(trackingStatusLine({ tracking_status: "ERROR", tracking_last: null, tracking_checked_at: null, delivered_at: null })).toBe("배송 조회 실패 — 송장 조회 링크로 확인해주세요");
    expect(trackingStatusLine({ tracking_status: "TIMEOUT", tracking_last: null, tracking_checked_at: checked, delivered_at: null })).toBe("자동 추적 종료(발송 14일 경과) — 송장 조회 링크로 확인해주세요");
  });
  it("parseTrackingFields — 캠페인은 sample_delivered_at 을 delivered_at 으로", () => {
    expect(parseTrackingFields({ tracking_status: "DELIVERED", tracking_last: { level: 6 }, tracking_checked_at: checked, sample_delivered_at: "2026-10-08T09:02:00Z" }, "sample_delivered_at")).toEqual({
      tracking_status: "DELIVERED",
      tracking_last: { level: 6 },
      tracking_checked_at: checked,
      delivered_at: "2026-10-08T09:02:00Z",
    });
    expect(parseTrackingFields(null)).toBeNull();
  });
});
