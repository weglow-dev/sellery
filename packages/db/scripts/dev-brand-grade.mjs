#!/usr/bin/env node
/**
 * 로컬 전용 — 브랜드 등급을 바꾼다. 갤러리의 "등급 혜택 · 월 5회 무료 열람"(다이아·블랙) 확인용.
 *
 *   node --env-file=.env.local packages/db/scripts/dev-brand-grade.mjs b2 다이아
 *   node --env-file=.env.local packages/db/scripts/dev-brand-grade.mjs b2 플래티넘   # 되돌리기
 *
 * production 거부 — 다른 dev-*.mjs 와 같은 가드.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("[dev-brand-grade] PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (--env-file=.env.local)");
  process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(url)) {
  console.error(`[dev-brand-grade] 로컬 Supabase 가 아닙니다 — 중단합니다 (${url})`);
  process.exit(1);
}

const [code, grade] = process.argv.slice(2);
if (!code || !grade) {
  console.error("사용법: dev-brand-grade.mjs <브랜드코드> <등급>   예: b2 다이아");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const { data: tier } = await db.from("brand_grade_tiers").select("name, free_ref_per_month").eq("name", grade).maybeSingle();
if (!tier) {
  const { data: all } = await db.from("brand_grade_tiers").select("name").order("sort_order");
  console.error(`[dev-brand-grade] 없는 등급: ${grade} — 가능: ${(all ?? []).map((t) => t.name).join(" · ")}`);
  process.exit(1);
}

const { data: b, error } = await db.from("brands").update({ grade }).eq("code", code).select("code, name, grade").maybeSingle();
if (error || !b) {
  console.error(`[dev-brand-grade] 실패: ${error?.message ?? `브랜드 ${code} 없음`}`);
  process.exit(1);
}

const { data: left } = await db.rpc("brand_free_ref_left", { p_brand_id: (await db.from("brands").select("id").eq("code", code).single()).data.id });
console.log(`[dev-brand-grade] ${b.code} ${b.name} → ${b.grade} · 이번 달 무료 열람 ${left}회 (등급 한도 ${tier.free_ref_per_month})`);
