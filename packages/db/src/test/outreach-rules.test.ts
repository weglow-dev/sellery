import { describe, expect, it } from "vitest";
import { OUTREACH_FILTER, dmDraft, normalizeHandle, outreachFit, parseCsvRows, parseHandleList, parseOutreachCreator } from "../admin/outreach-rules";

describe("normalizeHandle · parseHandleList", () => {
  it("@ · URL · 대소문자 · 끝 슬래시를 정리한다", () => {
    expect(normalizeHandle("@Jiyu_Beauty ")).toBe("jiyu_beauty");
    expect(normalizeHandle("https://www.instagram.com/jiyu.beauty/?hl=ko")).toBe("jiyu.beauty");
    expect(normalizeHandle("instagram.com/somin_beauty")).toBe("somin_beauty");
    expect(normalizeHandle("한글")).toBeNull();
    expect(normalizeHandle("")).toBeNull();
  });
  it("섞어 붙여 넣은 목록 — 중복 제거 · 형식 밖은 bad", () => {
    const r = parseHandleList("@a_b, b.c\n@A_B ; https://instagram.com/c-d bad!");
    expect(r.handles).toEqual(["a_b", "b.c", "c"]);
    expect(r.bad).toEqual(["bad!"]);
  });
});

describe("parseCsvRows", () => {
  it("한글 헤더 · 퍼센트 · k 표기 · 탭 구분", () => {
    const csv = "핸들\t팔로워\t여성\t20~40대\t한국\t추세\t참여율\t카테고리\n@jiyu_beauty\t120k\t72%\t85\t91\t우상향\t3.1%\t이너뷰티\n\t1\t2\t3\t4\n";
    const r = parseCsvRows(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.skipped).toBe(1);
    expect(r.rows[0]).toEqual({ handle: "jiyu_beauty", followers: 120000, female_pct: 72, age_20_40_pct: 85, kr_pct: 91, trend: "up", engagement_rate: 0.031, category: "이너뷰티" });
  });
  it("영문 헤더 쉼표 · 참여율 소수 입력", () => {
    const r = parseCsvRows("handle,followers,engagement_rate,trend\nsomin,48000,0.021,flat");
    expect(r.rows[0]).toEqual({ handle: "somin", followers: 48000, engagement_rate: 0.021, trend: "flat" });
  });
});

describe("outreachFit — 대표 조건(팔로워 5만↑ · 여성 60 · 20~40대 80 · 한국 80 · 추세 up/flat)", () => {
  it("전부 충족이면 ok · 100점", () => {
    const f = outreachFit({ followers: 50000, trend: "flat", audience: { female_pct: 60, age_20_40_pct: 80, kr_pct: 80 } });
    expect(f).toEqual({ ok: true, met: 5, total: 5, score: 100, missing: [], unknown: [] });
    expect(OUTREACH_FILTER.minFollowers).toBe(50000);
  });
  it("미달·미확인을 구분한다", () => {
    const f = outreachFit({ followers: 48000, trend: "down", audience: { female_pct: 72 } });
    expect(f.ok).toBe(false);
    expect(f.met).toBe(1);
    expect(f.missing).toEqual(["팔로워 5만↑", "반응 우상향/유지"]);
    expect(f.unknown).toEqual(["20~40대 80%↑", "한국 80%↑"]);
    expect(f.score).toBe(20);
  });
  it("지표가 하나도 없으면 전부 미확인 · 0점", () => {
    const f = outreachFit({});
    expect(f.score).toBe(0);
    expect(f.unknown).toHaveLength(5);
  });
});

describe("dmDraft · parseOutreachCreator", () => {
  it("이름 없으면 핸들 · 카테고리 · 랜딩 링크", () => {
    const d = dmDraft({ handle: "jiyu_beauty", category: "이너뷰티" });
    expect(d).toContain("@jiyu_beauty님");
    expect(d).toContain("이너뷰티 콘텐츠");
    expect(d).toContain("https://sellery.life/influencer/oem");
    expect(d.length).toBeLessThan(600);
  });
  it("행 파서 — 낯선 상태는 후보로", () => {
    const r = parseOutreachCreator({ id: "x", handle: "a", status: "weird", trend: "sideways", audience: { female_pct: "70" } });
    expect(r?.status).toBe("candidate");
    expect(r?.trend).toBeNull();
    expect(r?.audience?.female_pct).toBe(70);
    expect(parseOutreachCreator({ handle: "a" })).toBeNull();
  });
});
