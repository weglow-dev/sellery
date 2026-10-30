// MYR 샵 상품 운영 스크립트 — 인플루언서 콘솔(M2) · 운영 콘솔(M3) 전까지 상품 투입·검수를 여기서 (docs/myr.md §7 S1 · S8 · 0056). service role · production 허용.
//
//   node packages/db/scripts/myr-products.mjs <cmd> [args]   (저장소 루트에서 · .env.local 의 PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY)
//
//   ⚠ 루트 .env.local 이 **로컬 Supabase(127.0.0.1:54321)** 를 가리키면 이 스크립트도 로컬 DB 에 넣는다(2026-10-29 에 그랬다).
//     클라우드(운영)에 넣으려면 env 를 덮어쓴다: PUBLIC_SUPABASE_URL=https://ocxppeuoiysnkwwujvko.supabase.co SUPABASE_SERVICE_ROLE_KEY=<운영 키> node … import …
//     service role 키가 없으면 CLI 의 DB 연결로 SQL 을 직접 넣어도 된다(0056 시드 투입 때 그렇게 했다 — docs/myr.md §3 "S1 적용").
//
//   import <file.json> [--listed]     creators[] 를 sellers 에 handle 기준 upsert(없으면 생성 · user_id 없는 "운영팀이 미리 만든 셀러 행" — 나중에 partner-admin.mjs invite --link 로 계정 연결)
//                                     → products[] 를 myr_products 에 code 기준 upsert(creator 는 handle). 기본 status 는 pending(검수 대기) · --listed 면 바로 listed.
//                                     상세(story_title · story · ingredient_rows · howto_steps · faq)가 없으면 기본 템플릿을 채운다(샵 lib/data.ts genericDetail 과 같은 문구).
//                                     파일 형식은 myr-products.seed.json 참고.
//   list [--status pending|listed|paused|rejected] [--creator <@handle>]   상품 표(최신순 · 삭제 제외)
//   review <code> approve|reject|pause ["<사유>"]   myr_app_admin_review_product — approve → listed · reject → rejected(사유 필수) · pause: listed → paused
//   delete <code>                     소프트 삭제(deleted_at) — 주문이 생긴 뒤(M4)에는 상품 행을 지우지 않고 paused 로
//   creators                          MYR 상품이 있는 크리에이터 표(sellers · 상품 수 · 계정 연결 여부)
//
// 값(키·시크릿)은 출력하지 않는다. 두 번 실행해도 같은 결과(upsert · 멱등 RPC).

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { normHandle, toRow, validateProduct } from "./lib/myr-products-plan.mjs";

function loadEnv() {
  if (process.env.PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const p = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".env.local");
  if (!existsSync(p) || typeof process.loadEnvFile !== "function") return;
  try {
    process.loadEnvFile(p);
  } catch {
    /* 아래에서 누락 안내 */
  }
}
loadEnv();

const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("[myr-products] PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (.env.local)");
  process.exit(2);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const argv = process.argv.slice(2);
const cmd = argv[0];
const args = [];
const flags = {};
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[a.slice(2)] = next;
      i++;
    } else flags[a.slice(2)] = true;
  } else args.push(a);
}

function fail(msg) {
  console.error(`[myr-products] ${msg}`);
  process.exit(1);
}

async function sellerByHandle(handle) {
  const { data, error } = await db.from("sellers").select("id, name, handle, user_id, active").eq("handle", handle).maybeSingle();
  if (error) fail(`sellers 조회 실패: ${error.message}`);
  return data;
}

async function cmdImport() {
  const file = args[0];
  if (!file) fail("usage: import <file.json> [--listed]");
  const json = JSON.parse(readFileSync(resolve(file), "utf8"));
  const creators = Array.isArray(json.creators) ? json.creators : [];
  const products = Array.isArray(json.products) ? json.products : [];
  const status = flags.listed ? "listed" : "pending";

  // 1) 크리에이터 → sellers (handle 기준). 기존 행이 있으면 이름만 맞춘다(계정·정산 정보는 건드리지 않는다).
  const sellerIds = new Map();
  for (const c of creators) {
    const handle = normHandle(c.handle);
    const name = String(c.name ?? "").trim();
    if (!name) fail(`creator ${handle}: name 필요`);
    const existing = await sellerByHandle(handle);
    if (existing) {
      if (existing.name !== name) await db.from("sellers").update({ name }).eq("id", existing.id);
      sellerIds.set(handle, existing.id);
      console.log(`creator  ${handle}  기존 행 ${existing.id.slice(0, 8)}  ${existing.user_id ? "계정 연결됨" : "계정 미연결"}`);
      continue;
    }
    const { data, error } = await db
      .from("sellers")
      .insert({ name, handle, platform: c.platform ?? "instagram", avatar_url: c.avatar_url ?? null, intro: c.intro ?? null, active: true })
      .select("id")
      .single();
    if (error) fail(`sellers insert 실패(${handle}): ${error.message}`);
    sellerIds.set(handle, data.id);
    console.log(`creator  ${handle}  생성 ${data.id.slice(0, 8)}  (계정 미연결 — partner-admin.mjs invite <email> --link <id> 로 연결)`);
  }

  // 2) 상품 → myr_products (code 기준 upsert). 검증 · 행 조립은 lib/myr-products-plan.mjs(테스트됨) — 하나라도 틀리면 아무것도 넣지 않는다.
  const problems = products.flatMap((p, i) => validateProduct(p).map((m) => `products[${i}] ${p?.code ?? "?"}: ${m}`));
  if (problems.length) fail(`시드 파일 검증 실패\n  ${problems.join("\n  ")}`);
  let n = 0;
  for (const p of products) {
    const handle = normHandle(p.creator);
    let sellerId = sellerIds.get(handle);
    if (!sellerId) {
      const s = await sellerByHandle(handle);
      if (!s) fail(`product ${p.code}: creator ${handle} 가 sellers 에 없음 — creators[] 에 넣거나 먼저 만들 것`);
      sellerId = s.id;
    }
    const row = toRow(p, sellerId, status);
    const { error } = await db.from("myr_products").upsert(row, { onConflict: "code" });
    if (error) fail(`myr_products upsert 실패(${row.code}): ${error.message}`);
    n++;
    console.log(`product  ${row.code.padEnd(28)} ${row.name}  ${status}`);
  }
  console.log(`\n완료 — 크리에이터 ${creators.length} · 상품 ${n} (status ${status})`);
}

async function cmdList() {
  let q = db
    .from("myr_products")
    .select("code, name, category, price, stock, sold_qty, status, reject_reason, created_at, sellers(handle, name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (typeof flags.status === "string") q = q.eq("status", flags.status);
  const { data, error } = await q;
  if (error) fail(error.message);
  const rows = (data ?? []).filter((r) => !flags.creator || r.sellers?.handle === normHandle(flags.creator));
  if (!rows.length) return console.log("(없음)");
  console.log(["code", "상품", "크리에이터", "카테고리", "가격", "재고", "판매", "status", "반려 사유"].join("\t"));
  for (const r of rows) console.log([r.code, r.name, r.sellers?.handle ?? "-", r.category, r.price, r.stock, r.sold_qty, r.status, r.reject_reason ?? ""].join("\t"));
  console.log(`\n${rows.length}건`);
}

async function cmdReview() {
  const [code, decision, reason] = args;
  if (!code || !["approve", "reject", "pause"].includes(decision)) fail("usage: review <code> approve|reject|pause [\"사유\"]");
  const { data: p, error: e1 } = await db.from("myr_products").select("id, name, status").eq("code", code.toLowerCase()).is("deleted_at", null).maybeSingle();
  if (e1) fail(e1.message);
  if (!p) fail(`상품 없음: ${code}`);
  const { data, error } = await db.rpc("myr_app_admin_review_product", { p_product_id: p.id, p_decision: decision, p_reason: reason ?? null });
  if (error) fail(error.message);
  if (!data?.ok) fail(`거부: ${data?.code}${data?.status ? ` (지금 ${data.status})` : ""}`);
  console.log(`${code}  ${p.name}  ${p.status} → ${data.status}`);
}

async function cmdDelete() {
  const [code] = args;
  if (!code) fail("usage: delete <code>");
  const { data, error } = await db.from("myr_products").update({ deleted_at: new Date().toISOString(), status: "paused" }).eq("code", code.toLowerCase()).is("deleted_at", null).select("code").maybeSingle();
  if (error) fail(error.message);
  if (!data) fail(`상품 없음: ${code}`);
  console.log(`${code}  소프트 삭제`);
}

async function cmdCreators() {
  const { data, error } = await db.from("myr_products").select("seller_id, status, sellers(id, name, handle, user_id, active)").is("deleted_at", null);
  if (error) fail(error.message);
  const map = new Map();
  for (const r of data ?? []) {
    const s = r.sellers;
    if (!s) continue;
    const m = map.get(s.id) ?? { ...s, total: 0, listed: 0 };
    m.total++;
    if (r.status === "listed") m.listed++;
    map.set(s.id, m);
  }
  if (!map.size) return console.log("(없음)");
  console.log(["id", "핸들", "이름", "상품(listed/전체)", "active", "계정"].join("\t"));
  for (const m of map.values()) console.log([m.id.slice(0, 8), m.handle, m.name, `${m.listed}/${m.total}`, m.active, m.user_id ? "연결됨" : "미연결"].join("\t"));
}

const commands = { import: cmdImport, list: cmdList, review: cmdReview, delete: cmdDelete, creators: cmdCreators };
if (!cmd || !commands[cmd]) {
  console.error("usage: node packages/db/scripts/myr-products.mjs import <file.json> [--listed] | list [--status s] [--creator @h] | review <code> approve|reject|pause [사유] | delete <code> | creators");
  process.exit(2);
}
await commands[cmd]();
