/**
 * 택배사 → 배송 조회 URL (app-plan §2 `lib/carriers.ts` · reuse-map §1.5). 소유: F.
 *
 * 셀러리 `orders.courier` 는 한글명 enum(0004: 'CJ대한통운' · '우체국택배' · '한진택배' · '롯데택배' · '로젠택배')이라
 * glo 의 영문 코드 대신 한글명이 그대로 키다. 스마트택배(smartCode)·경동택배는 쓰지 않는다.
 * 브라우저·서버 양쪽에서 import 된다 — 순수 상수·함수만.
 */

export const COURIERS = ["CJ대한통운", "우체국택배", "한진택배", "롯데택배", "로젠택배"] as const;
export type Courier = (typeof COURIERS)[number];

export type Carrier = {
  name: Courier;
  /** 송장번호(숫자만)를 넣으면 조회 페이지 URL */
  trackingUrl: (n: string) => string;
};

export const CARRIERS: readonly Carrier[] = [
  { name: "CJ대한통운", trackingUrl: (n) => `https://trace.cjlogistics.com/next/tracking.html?wblNo=${n}` },
  {
    name: "우체국택배",
    trackingUrl: (n) => `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=${n}`,
  },
  {
    name: "한진택배",
    trackingUrl: (n) =>
      `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=${n}`,
  },
  { name: "롯데택배", trackingUrl: (n) => `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${n}` },
  { name: "로젠택배", trackingUrl: (n) => `https://www.ilogen.com/web/personal/trace/${n}` },
];

export function isCourier(v: string | null | undefined): v is Courier {
  return (COURIERS as readonly string[]).includes(v ?? "");
}

export function getCarrier(courier: string | null | undefined): Carrier | null {
  return CARRIERS.find((c) => c.name === courier) ?? null;
}

/** 화면 표기 — 모르는 값이면 값 그대로, 비어 있으면 '택배' */
export function carrierName(courier: string | null | undefined): string {
  return courier && courier.trim() ? courier.trim() : "택배";
}

/** 조회 URL — 택배사를 모르거나 송장에 숫자가 없으면 null */
export function trackingUrlOf(courier: string | null | undefined, trackingNo: string | null | undefined): string | null {
  const c = getCarrier(courier);
  if (!c || !trackingNo) return null;
  const digits = trackingNo.replace(/\D/g, "");
  return digits ? c.trackingUrl(digits) : null;
}
