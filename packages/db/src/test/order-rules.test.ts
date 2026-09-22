// 브랜드 주문 · 운송장 · 발주서 규칙 — packages/db/src/brand/order-rules.ts (docs/brand-console-plan.md §4 "0018" · §5 /brand/orders)
import { describe, expect, it } from "vitest";
import {
  BULK_SHIP_MAX_ROWS,
  PO_COLUMNS,
  brandRefundFailMessage,
  bulkShipSummary,
  bulkShipTemplateCsv,
  csvEscape,
  normalizeCourierCell,
  orderRowLabel,
  orderShipState,
  parseBrandOrders,
  parseBulkShipCsv,
  parseBulkShipResult,
  parsePoRows,
  parseShipOrderInput,
  parseShipOrderResult,
  poCsv,
  poFileName,
  shipOrderFailMessage,
  splitCsvLine,
  toCsv,
} from "../brand/order-rules";

const BOM = String.fromCharCode(0xfeff);

const row = {
  id: "54a7ea49-24ce-4337-5cd0-95a49dad02c8",
  code: "o131",
  status: "PAID",
  buyer_name: "이*아",
  buyer_phone: null,
  buyer_email: "k***@example.com",
  qty: 1,
  unit_price: 29900,
  amount: 29900,
  option_name: null,
  order_name: null,
  is_sample: false,
  shipping: { recipient: "이서아", phone: "01012345678", postcode: "06236", address1: "서울 강남구", address2: "101호", memo: "문 앞" },
  courier: null,
  tracking_no: null,
  shipped_at: null,
  shipped: false,
  payment_method: null,
  paid_at: "2026-09-16T00:00:00+00:00",
  refunded_at: null,
  refund_amount: null,
  refund_actor: null,
  refund_reason: null,
  campaign: {
    id: "c0000000-0000-4000-8000-000000000001",
    code: "c1",
    status: "LIVE",
    start_date: "2026-09-13",
    end_date: "2026-09-17",
    product: { id: "d0000000-0000-4000-8000-000000000001", code: "p1", name: "버닝온", emoji: "🔥", thumb_url: null },
    seller: { id: "a0000000-0000-4000-8000-000000000001", code: "s1", name: "지유", handle: "@jiyu_beauty" },
  },
};

describe("parseBrandOrders", () => {
  it("app_brand_orders jsonb → rows · totals", () => {
    const r = parseBrandOrders({
      ok: true,
      filter: "unshipped",
      rows: [row, { ...row, id: "x", code: "o132", shipping: null }, { bad: true }],
      totals: { count: 1053, unshipped: 39, shipped: 985, refunded: 29, paid_amount: 39373500, refund_amount: 1124000 },
    });
    expect(r).not.toBeNull();
    expect(r!.filter).toBe("unshipped");
    expect(r!.rows).toHaveLength(2);
    expect(r!.rows[0].shipping?.recipient).toBe("이서아");
    expect(r!.rows[1].shipping).toBeNull();
    expect(r!.totals).toEqual({ count: 1053, unshipped: 39, shipped: 985, refunded: 29, paid_amount: 39373500, refund_amount: 1124000 });
  });
  it("ok:false · 계약 위반은 null", () => {
    expect(parseBrandOrders({ ok: false, code: "BAD_FILTER" })).toBeNull();
    expect(parseBrandOrders(null)).toBeNull();
  });
  it("알 수 없는 filter 는 all", () => {
    expect(parseBrandOrders({ ok: true, filter: "zzz", rows: [], totals: {} })!.filter).toBe("all");
  });
});

describe("orderShipState · orderRowLabel", () => {
  it("0004 판정 규칙", () => {
    expect(orderShipState({ status: "PAID", tracking_no: null })).toBe("unshipped");
    expect(orderShipState({ status: "PAID", tracking_no: "123456" })).toBe("shipped");
    expect(orderShipState({ status: "REFUNDED", tracking_no: "123456" })).toBe("refunded");
    expect(orderShipState({ status: "CANCELED", tracking_no: null })).toBe("refunded");
  });
  it("발송 행은 택배사 표시", () => {
    expect(orderRowLabel({ status: "PAID", tracking_no: "1", courier: "CJ대한통운" })).toEqual({ label: "CJ대한통운 발송", tone: "green" });
    expect(orderRowLabel({ status: "PAID", tracking_no: null })).toEqual({ label: "미발송", tone: "amber" });
  });
});

describe("parseShipOrderInput", () => {
  it("정상 — 송장 공백 제거", () => {
    const r = parseShipOrderInput({ order_code: "O2001", courier: "CJ대한통운", tracking_no: " 6890 1234 5678 " });
    expect(r).toEqual({ ok: true, orderCode: "O2001", courier: "CJ대한통운", trackingNo: "689012345678" });
  });
  it("FormData 도 받는다", () => {
    const fd = new FormData();
    fd.set("order_code", "o2001");
    fd.set("courier", "한진택배");
    fd.set("tracking_no", "1234-5678-90");
    expect(parseShipOrderInput(fd)).toMatchObject({ ok: true, trackingNo: "1234-5678-90" });
  });
  it("실패 필드 순서 — order_code → courier → tracking_no", () => {
    expect(parseShipOrderInput({ order_code: "", courier: "x", tracking_no: "x" })).toMatchObject({ ok: false, field: "order_code" });
    expect(parseShipOrderInput({ order_code: "o1", courier: "택배", tracking_no: "123456" })).toMatchObject({ ok: false, field: "courier" });
    expect(parseShipOrderInput({ order_code: "o1", courier: "롯데택배", tracking_no: "abcdef" })).toMatchObject({ ok: false, field: "tracking_no" });
    expect(parseShipOrderInput({ order_code: "o1", courier: "롯데택배", tracking_no: "12345" })).toMatchObject({ ok: false, field: "tracking_no" });
    expect(parseShipOrderInput({ order_code: "o1", courier: "롯데택배", tracking_no: "1".repeat(31) })).toMatchObject({ ok: false, field: "tracking_no" });
  });
});

describe("CSV 공용", () => {
  it("splitCsvLine — 따옴표 · 이스케이프 · 탭", () => {
    expect(splitCsvLine('"O2001","CJ대한통운","6890-1234"')).toEqual(["O2001", "CJ대한통운", "6890-1234"]);
    expect(splitCsvLine('a,"b,c","d""e"')).toEqual(["a", "b,c", 'd"e']);
    expect(splitCsvLine("a\tb\tc")).toEqual(["a", "b", "c"]);
    expect(splitCsvLine(" a , b ")).toEqual(["a", "b"]);
  });
  it("toCsv — BOM + 셀 따옴표 + CRLF (프로토타입 dlCSV)", () => {
    const s = toCsv([
      ["주문번호", "금액"],
      ["O1", 100],
    ]);
    expect(s.startsWith(BOM)).toBe(true);
    expect(s).toBe(`${BOM}"주문번호","금액"\r\n"O1","100"\r\n`);
    expect(csvEscape('a"b')).toBe('"a""b"');
    expect(csvEscape(null)).toBe('""');
  });
});

describe("parseBulkShipCsv", () => {
  it("헤더 · BOM · CRLF · 따옴표 · 3열", () => {
    const text = `${BOM}주문번호,택배사,운송장번호\r\n"O2001","CJ대한통운","6890-1234-5678"\r\no2002,한진,123456789\r\n\r\n`;
    const r = parseBulkShipCsv(text);
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { line: 2, order_code: "O2001", courier: "CJ대한통운", tracking_no: "6890-1234-5678" },
      { line: 3, order_code: "o2002", courier: "한진택배", tracking_no: "123456789" },
    ]);
  });
  it("2열(옛 양식)은 defaultCourier — 없으면 courier 오류", () => {
    expect(parseBulkShipCsv("O2001,123456\n", { defaultCourier: "롯데택배" }).rows[0]).toMatchObject({ courier: "롯데택배", tracking_no: "123456" });
    expect(parseBulkShipCsv("O2001,123456\n").errors[0]).toMatchObject({ line: 1 });
  });
  it("형식 오류 행은 errors 로, 나머지는 rows 로", () => {
    const r = parseBulkShipCsv("주문번호,택배사,운송장번호\nO1,CJ대한통운,abc\nO2,없는택배,123456\n!!,CJ,123456\nO3,CJ,123456\nO4\n");
    expect(r.rows.map((x) => x.order_code)).toEqual(["O3"]);
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4, 6]);
  });
  it("500행 초과는 잘라내고 line 0 오류", () => {
    const text = Array.from({ length: BULK_SHIP_MAX_ROWS + 3 }, (_, i) => `O${i + 1},CJ대한통운,${100000 + i}`).join("\n");
    const r = parseBulkShipCsv(text);
    expect(r.rows).toHaveLength(BULK_SHIP_MAX_ROWS);
    expect(r.errors[0].line).toBe(0);
  });
  it("normalizeCourierCell — 정확명 · 접두 · 대소문자", () => {
    expect(normalizeCourierCell("우체국")).toBe("우체국택배");
    expect(normalizeCourierCell("cj")).toBe("CJ대한통운");
    expect(normalizeCourierCell("로젠 택배")).toBe("로젠택배");
    expect(normalizeCourierCell("")).toBeNull();
    expect(normalizeCourierCell("경동")).toBeNull();
  });
  it("bulkShipTemplateCsv — 대문자 주문번호 + 빈 열 2개", () => {
    expect(bulkShipTemplateCsv([{ code: "o2001" }])).toBe(`${BOM}"주문번호","택배사","운송장번호"\r\n"O2001","",""\r\n`);
  });
});

describe("RPC 결과 파서", () => {
  it("parseShipOrderResult", () => {
    expect(parseShipOrderResult({ ok: true, already: false, replaced: true, order_id: "x", order_code: "o1", courier: "한진택배", tracking_no: "1", shipped_at: "t" })).toEqual({
      ok: true,
      already: false,
      replaced: true,
      orderId: "x",
      orderCode: "o1",
      courier: "한진택배",
      trackingNo: "1",
      shippedAt: "t",
    });
    expect(parseShipOrderResult({ ok: false, code: "NOT_PAID", status: "REFUNDED" })).toEqual({ ok: false, code: "NOT_PAID", status: "REFUNDED" });
    expect(parseShipOrderResult({ ok: false, code: "???" })).toMatchObject({ ok: false, code: "DB_ERROR" });
    expect(parseShipOrderResult({ ok: true })).toMatchObject({ ok: false, code: "DB_ERROR" });
  });
  it("shipOrderFailMessage — NOT_PAID 는 상태 표시", () => {
    expect(shipOrderFailMessage({ code: "NOT_PAID", status: "REFUNDED" })).toContain("환불됨");
    expect(shipOrderFailMessage({ code: "BAD_COURIER" })).toContain("택배사");
    expect(shipOrderFailMessage({ code: "zzz" })).toBe("잠시 후 다시 시도해주세요");
  });
  it("parseBulkShipResult · bulkShipSummary", () => {
    const r = parseBulkShipResult({
      ok: true,
      applied: 2,
      already: 0,
      failed: 2,
      results: [
        { order_code: "o137", ok: true, already: false, courier: "롯데택배", tracking_no: "1" },
        { order_code: "o999999", ok: false, code: "NOT_FOUND" },
        { order_code: "o102", ok: false, code: "BAD_COURIER" },
        "junk",
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.results).toHaveLength(3);
    expect(bulkShipSummary(r, 1)).toBe("송장 업로드 — 2건 적용 · 3건 실패");
    expect(parseBulkShipResult({ ok: false, code: "BAD_ROWS" })).toEqual({ ok: false, code: "BAD_ROWS" });
  });
});

describe("발주서", () => {
  const po = {
    ok: true,
    exported_at: "2026-09-22T01:00:00+00:00",
    campaigns: [{ id: "c", code: "c1", product_name: "버닝온", seller_handle: "@jiyu_beauty", first_export: true }],
    rows: [
      {
        order_code: "o104",
        paid_at: "2026-09-13T00:00:00+00:00",
        recipient: "정*수",
        phone: "01012345678",
        postcode: "06236",
        address1: "서울 강남구 \"테헤란로\"",
        address2: null,
        memo: null,
        product_name: "버닝온",
        option_name: null,
        qty: 1,
        unit_price: 29900,
        amount: 29900,
        campaign_code: "c1",
        seller_handle: "@jiyu_beauty",
        courier: "CJ대한통운",
        tracking_no: "6890-1148-1212",
      },
    ],
  };
  it("parsePoRows · poCsv 열 순서 · BOM · CRLF · 따옴표 이스케이프", () => {
    const p = parsePoRows(po)!;
    expect(p.campaigns[0].first_export).toBe(true);
    const csv = poCsv(p.rows);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(BOM + PO_COLUMNS.map((c) => `"${c}"`).join(","));
    expect(lines[1]).toBe('"O104","2026-09-13","정*수","01012345678","06236","서울 강남구 ""테헤란로""","","","버닝온","","1","29900","29900","C1","@jiyu_beauty","CJ대한통운","6890-1148-1212"');
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(parsePoRows({ ok: false, code: "NOT_FOUND" })).toBeNull();
  });
  it("poFileName — 프로토타입 형식 · 파일명 금지 문자 제거", () => {
    expect(poFileName("바인허브", "2026-09-22")).toBe("발주서_바인허브_2026-09-22.csv");
    expect(poFileName('a/b:c"', "2026-09-22")).toBe("발주서_abc_2026-09-22.csv");
  });
});

describe("brandRefundFailMessage", () => {
  it("코드 → 문구 · 모르는 코드는 DB_ERROR", () => {
    expect(brandRefundFailMessage("SHIPPED")).toContain("교환·반품");
    expect(brandRefundFailMessage("NO_PAYMENT_KEY")).toContain("결제 정보");
    expect(brandRefundFailMessage("nope")).toBe("잠시 후 다시 시도해주세요");
  });
});
