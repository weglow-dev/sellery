import { describe, expect, it } from "vitest";
import { outreachFit } from "../admin/outreach-rules";
import { modashAudience, modashSearchBody, parseModashSearch, pickKoreaLocationId } from "../admin/outreach-providers";

describe("modashSearchBody — 대표 조건을 검색 필터로", () => {
  it("팔로워 5만 · 한국 80% · 여성 60% · 20~40대 밴드 · 성장률 ≥ 0", () => {
    const b = modashSearchBody({ krLocationId: 123, page: 2 }) as { page: number; filter: { influencer: Record<string, unknown>; audience: Record<string, unknown> } };
    expect(b.page).toBe(2);
    expect(b.filter.influencer.followers).toEqual({ min: 50000 });
    expect(b.filter.audience.location).toEqual([{ id: 123, weight: 0.8 }]);
    expect(b.filter.audience.gender).toEqual({ id: "FEMALE", weight: 0.6 });
    expect((b.filter.audience.age as unknown[]).length).toBe(3);
  });
});

describe("parseModashSearch — profile.* / 평면 키 둘 다 · audience 가 오면 비율까지", () => {
  it("directs 먼저, 핸들 없는 항목은 버림, 성장률 → 추세", () => {
    const r = parseModashSearch({
      error: false,
      total: 2,
      directs: [{ userId: "1", profile: { username: "Jiyu_Beauty", fullname: "지유", followers: 120000, engagementRate: 0.031, followersGrowthRate: 0.05 }, audience: { genders: [{ code: "FEMALE", weight: 0.72 }], ages: [{ code: "18-24", weight: 0.3 }, { code: "25-34", weight: 0.4 }, { code: "35-44", weight: 0.15 }], geoCountries: [{ code: "KR", weight: 0.91 }] } }],
      lookalikes: [{ username: "somin", followers: 60000, followersGrowthRate: -0.1 }, { fullname: "no-handle" }],
    });
    expect(r.error).toBeNull();
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ handle: "jiyu_beauty", ig_user_id: "1", name: "지유", followers: 120000, engagement_rate: 0.031, trend: "up" });
    expect(r.rows[0].audience).toEqual({ source: "modash", filtered_by: "modash", female_pct: 72, age_20_40_pct: 85, kr_pct: 91 });
    expect(r.rows[1]).toMatchObject({ handle: "somin", trend: "down" });
    expect(r.rows[1].audience).toEqual({ source: "modash", filtered_by: "modash" });
  });
  it("제공사 오류 · 빈 응답", () => {
    expect(parseModashSearch({ error: true, message: "Unauthorized" }).error).toBe("Unauthorized");
    expect(parseModashSearch(null).rows).toEqual([]);
  });
  it("filtered_by 가 있으면 비율이 없어도 팔로워 구성 3개는 충족", () => {
    const f = outreachFit({ followers: 60000, trend: "flat", audience: modashAudience(null) });
    expect(f.met).toBe(5);
    expect(f.ok).toBe(true);
  });
});

describe("pickKoreaLocationId", () => {
  it("North Korea 는 건너뛴다", () => {
    expect(pickKoreaLocationId([{ id: 1, name: "North Korea" }, { id: 2, name: "South Korea", title: "Korea, Republic of" }])).toBe(2);
    expect(pickKoreaLocationId({ locations: [{ id: 9, name: "Korea" }] })).toBe(9);
    expect(pickKoreaLocationId([])).toBeNull();
  });
});
