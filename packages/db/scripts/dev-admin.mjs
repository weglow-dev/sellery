// 개발용 관리자 계정 — 확인된(email_confirm) 계정 생성 + `profiles.role='admin'` 승격을 한 번에 (docs/deploy.md §5.6). production 거부.
//
//   node --env-file=.env.local packages/db/scripts/dev-admin.mjs --email admin@local.test [--password sellery2026] [--pending-channel]
//
// - auth.admin.createUser(email_confirm:true) → 0001 트리거(handle_new_user)가 profiles(role='customer') 를 만든다 → 여기서 role='admin' 으로 update.
//   `admin` 을 넣는 코드 경로는 이 스크립트뿐이다 — 가입 트리거는 customer, 파트너는 create_{seller,brand}_from_signup 이 seller/brand 로 바꾼다.
// - 같은 이메일이 이미 있으면 계정을 재사용하고 **비밀번호·email_confirm·role 을 모두 맞춘다** — 두 번 실행해도 결과가 같고, 비밀번호를 잊으면 같은 한 줄로 되돌린다.
// - `--pending-channel`: 시드 채널 1건을 "인증 대기"(verified=false · vcode='SLRY-TEST' · vcode_confirmed_at=now()) 로 만든다.
//   관리자 콘솔의 채널 인증 승인 화면을 검증할 큐가 시드에는 없기 때문. 이미 대기 건이 있으면 건너뛴다.
// - 저장소 루트 .env.local 을 자동으로 읽는다(값 미출력 — PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY). 키·비밀번호는 출력하지 않는다.
// - 로그인: 콘솔 /admin/login 에 이메일·비밀번호. **운영 관리자 계정은 이 스크립트로 만들지 않는다** — docs/deploy.md §5.6 절차를 따른다.
// - dev-seller.mjs · dev-brand.mjs 의 관리자 판. 표준 로컬 계정은 admin@local.test.

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  if ((process.env.PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const p = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".env.local"); // 저장소 루트 (4 앱 공용, 결정 11)
  if (!existsSync(p) || typeof process.loadEnvFile !== "function") return;
  try {
    process.loadEnvFile(p);
  } catch {
    /* 아래에서 누락 안내 */
  }
}
loadEnv();

if (process.env.NODE_ENV === "production") {
  console.error("[dev-admin] production 환경에서는 실행하지 않습니다 — 운영 관리자 계정은 docs/deploy.md §5.6 절차로 만드세요.");
  process.exit(1);
}

const argv = process.argv.slice(2);
const flags = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[a.slice(2)] = next;
      i++;
    } else flags[a.slice(2)] = true;
  }
}
const email = typeof flags.email === "string" ? flags.email.trim().toLowerCase() : "";
const password = typeof flags.password === "string" ? flags.password : "sellery2026";
const wantPending = flags["pending-channel"] === true;
if (!email || !email.includes("@")) {
  console.error("usage: node --env-file=.env.local packages/db/scripts/dev-admin.mjs --email <email> [--password <pw>] [--pending-channel]");
  process.exit(2);
}
if (password.length < 8) {
  console.error("[dev-admin] 비밀번호는 8자 이상 (Supabase 최소 길이 설정과 동일)");
  process.exit(2);
}

const url = process.env.PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("[dev-admin] PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다 — 루트 .env.local 을 확인하세요.");
  process.exit(1);
}
// 로컬 Supabase 가 아니면 한 번 경고한다 — .env.local 이 클라우드를 가리키는 상태로 실행되는 사고를 막는다(값은 출력하지 않는다).
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) {
  console.warn("[dev-admin] ⚠ 로컬 Supabase 가 아닙니다 — 이 계정은 원격 프로젝트에 만들어집니다. 의도한 것이 아니면 중단하세요(Ctrl+C). 3초 뒤 계속합니다.");
  await new Promise((r) => setTimeout(r, 3000));
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

// 같은 이메일이 있으면 재사용 (dev-user.mjs · dev-seller.mjs 와 같은 페이지 스캔)
async function findExisting() {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

let user = await findExisting();
if (user) {
  // 비밀번호를 항상 맞춘다 — 재실행으로 비밀번호를 되돌릴 수 있어야 한다(로컬은 잊어버리면 그만큼 시간을 잃는다).
  // email_confirm 도 같이 확정한다(수동으로 만든 계정이 미확인 상태일 수 있다).
  const { error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
  if (error) {
    console.error("[dev-admin] updateUserById failed:", error.message);
    process.exit(1);
  }
  console.log(`[dev-admin] 기존 계정 재사용: ${email} (id ${user.id}) · 비밀번호 ${flags.password ? "(지정값)으로 갱신" : "sellery2026(기본값)으로 갱신"}`);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { dev_login: true },
  });
  if (error) {
    console.error("[dev-admin] createUser failed:", error.message);
    process.exit(1);
  }
  user = data.user;
  console.log(`[dev-admin] 계정 생성: ${email} (id ${user.id}) · 비밀번호 ${flags.password ? "(지정값)" : "sellery2026(기본값)"}`);
}

// profiles 행은 0001 트리거가 만든다(role='customer'). 아직 없으면 트리거가 도는 중일 수 있어 한 번 더 본다.
let role = null;
for (let i = 0; i < 3; i++) {
  const { data, error } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (error) {
    console.error("[dev-admin] profiles read failed:", error.message);
    process.exit(1);
  }
  if (data) {
    role = data.role;
    break;
  }
  await new Promise((r) => setTimeout(r, 300));
}
if (role === null) {
  console.error("[dev-admin] profiles 행이 없습니다 — 0001 handle_new_user 트리거를 확인하세요.");
  process.exit(1);
}
if (role !== "admin") {
  const { error } = await admin.from("profiles").update({ role: "admin" }).eq("id", user.id);
  if (error) {
    console.error("[dev-admin] role 승격 실패:", error.message);
    process.exit(1);
  }
}
const { data: after, error: afterErr } = await admin.from("profiles").select("role").eq("id", user.id).single();
if (afterErr || after.role !== "admin") {
  console.error("[dev-admin] role 확인 실패:", afterErr?.message ?? `role=${after?.role}`);
  process.exit(1);
}
console.log(`[dev-admin] profiles.role: ${role} → admin · 로그인 /admin/login`);

if (wantPending) {
  const { count, error: cErr } = await admin
    .from("seller_channels")
    .select("*", { count: "exact", head: true })
    .eq("verified", false)
    .not("vcode_confirmed_at", "is", null);
  if (cErr) {
    console.error("[dev-admin] seller_channels read failed:", cErr.message);
    process.exit(1);
  }
  if (count > 0) {
    console.log(`[dev-admin] 인증 대기 채널이 이미 ${count}건 — 건너뜁니다.`);
  } else {
    const { data: ch, error: chErr } = await admin.from("seller_channels").select("id, code, handle").eq("verified", true).order("code").limit(1).maybeSingle();
    if (chErr || !ch) {
      console.error("[dev-admin] 대기로 바꿀 채널이 없습니다:", chErr?.message ?? "verified 채널 0건");
      process.exit(1);
    }
    const { error: uErr } = await admin
      .from("seller_channels")
      .update({ verified: false, vcode: "SLRY-TEST", vcode_confirmed_at: new Date().toISOString() })
      .eq("id", ch.id);
    if (uErr) {
      console.error("[dev-admin] 채널 대기 전환 실패:", uErr.message);
      process.exit(1);
    }
    console.log(`[dev-admin] 인증 대기 채널 1건 생성: ${ch.code ?? ch.id} ${ch.handle} (vcode SLRY-TEST)`);
  }
}
