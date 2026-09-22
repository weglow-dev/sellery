# 배포 · 운영 — Vercel 프로젝트 4개(+동결 1) · `sellery.life`

작성 2026-09-21 (S4 PR-7 초안) · **갱신 2026-09-21 S5 PR-11**(도메인 전환 완료 · `web/` 삭제 · `web/DEPLOY.md` §3 · §4 · §6 · §8 통합) · 설계 원본 [`monorepo-migration.md`](monorepo-migration.md) §0 결정 2·9·10 · §1 · §6 · §7 S4~S5 · §8.

**정본 관계.** 이 문서가 배포·운영의 정본이다. 옛 `web/DEPLOY.md`(Next `sellery-app` 용)는 S5 PR-11 에서 삭제됐고 외부 서비스 설정(§5) · DB 절차(§6) · 도메인·DNS(§3.8) · 배포 후 확인(§10)은 여기로 옮겼다. 정책·API·DB 계약은 [`app-plan.md`](app-plan.md) · [`inf-console-plan.md`](inf-console-plan.md) · [`data-model.md`](data-model.md)(역사 문서 — 파일 경로는 `web/` 기준이라 §3 이식 표로 읽는다).

값(키)은 이 문서·코드·PR 어디에도 쓰지 않는다 — 루트 `.env.local`(gitignored) 과 Vercel 프로젝트 환경변수에만. 아래 표는 **이름**만이다.

읽는 순서: §0 그림 → 외부 서비스 대시보드는 §5 → DB 는 §6 → 로컬 개발은 §7 → 운영은 §8 → 배포 뒤 확인은 §10. 도메인 전환 기록은 §3.

---

## 0. 한눈에

```
브라우저 ── https://sellery.life ─────────────────────────────────────────────────────────┐
                                                                                        │
   Vercel sellery-shop (Root apps/shop · SvelteKit adapter-vercel · base '')  ← 도메인(2026-09-21 부터) │
   ├─ /  /s/[handle]/[code]  /c/[code]  /login  /checkout*  /account/*  /terms  /privacy  │ SSR + +server.ts
   ├─ /auth/{callback,confirm,signout}  /api/{checkout,payments/*,cron/reconcile,health,me}  │
   ├─ /assets/*  /email/celery.png  /favicon.svg  /robots.txt                  (static/)   │
   └─ apps/shop/vercel.json rewrites (프록시 — 브라우저 오리진은 sellery.life 그대로)          │
        /influencer, /influencer/, /influencer/:path*  ─→ sellery-influencer.vercel.app  (콘솔 SSR · 1~5단계)
        /brand, /brand/, /brand/:path*                 ─→ sellery-brand.vercel.app       (콘솔 SSR · 1~5단계 · 데모는 (demo) 그룹 PUBLIC_DEMO=1)
        /admin, /admin/, /admin/:path*                 ─→ sellery-admin.vercel.app       (데모 · 데모 띠 · noindex)

   sellery-influencer (Root apps/influencer · /influencer) ── 콘솔 SSR(가입 · 이메일 인증 · 로그인 · 홈 · 내 정보 · 채널 인증)
                                                             + (demo) 그룹(dev 또는 PUBLIC_DEMO=1) · 자기 /influencer/auth/{confirm,signout}
   sellery-brand      (Root apps/brand · /brand)           ── 콘솔 SSR(가입 · 로그인 · 홈 · 상품 · 캠페인 · 주문 · CS · 매출 · 정산 · 내 정보 — 2026-09-22 5단계) + (demo) 그룹 · 자기 /brand/auth/{confirm,signout}
   sellery-admin      (Root apps/admin · /admin)           ── 데모 SPA(ssr=false) + hooks(세션만)
   (sellery-app · Next 16 · Root web)                     ── 2026-09-21 삭제됨 — 도메인 전환 당일 정리(§1.1 · §3.6)

   Supabase sellery (ocxppeuoiysnkwwujvko · Seoul) ── 4 프로젝트가 같은 URL · anon · service_role
   토스페이먼츠 NHN_shingoonk ── 웹훅 URL https://sellery.life/api/payments/webhook (불변 · shop 이 받는다)
```

세션 쿠키 `sb-ocxppeuoiysnkwwujvko-auth-token*` 은 host-only(`sellery.life`) 이고 Vercel 리라이트가 요청 헤더(쿠키 포함)와 응답 `Set-Cookie` 를 그대로 옮기므로 shop · 콘솔 · 데모 앱이 같은 세션을 본다(`monorepo-migration.md §1.5`).

---

## 1. Vercel 프로젝트 (team `weglow-team` · 저장소 `weglow-dev/sellery`)

### 1.1 설정 표

| 항목 | `sellery-shop` | `sellery-influencer` | `sellery-brand` | `sellery-admin` | `sellery-app` (Next · **2026-09-21 삭제됨** — 기록용) |
|---|---|---|---|---|---|
| 역할 | 고객 사이트 + 도메인 루트 + 리라이트 출발점 | 인플루언서 콘솔 1~2단계(리라이트 대상) | 브랜드 센터 데모 | 관리자 데모 | **롤백 전용** — 빌드하지 않는다. 마지막 Production 배포 `sellery-lhpqlxil7-weglow-team.vercel.app`(커밋 `e6ccd1f`) 을 유지 |
| Root Directory | `apps/shop` | `apps/influencer` | `apps/brand` | `apps/admin` | `web`(저장소에서 삭제됨 — 배포는 남아 있다) |
| Include source files outside of the Root Directory | **ON**(`packages/*` · 루트 `package-lock.json`) | ON | ON | ON | off |
| Framework Preset | SvelteKit(자동) | 〃 | 〃 | 〃 | Next.js |
| Install / Build | 기본 — `npm install` 은 워크스페이스 루트 · `vite build` | 〃 | 〃 | 〃 | — |
| Node.js Version | **22.x** | 22.x | 22.x | 22.x | — |
| Region | `icn1`(`apps/shop/vercel.json` `regions` + `svelte.config.js`) | 〃 | 〃 | 〃 | `icn1` |
| **Domains** | **`sellery.life` · `www.sellery.life`(→ apex 308)** — 2026-09-21 이동(§3) | 없음(`sellery-influencer.vercel.app` — 리라이트 대상) | 없음 | 없음 | 없음(2026-09-21 제거 · `inf.sellery.life` 도 제거) |
| Deployment Protection | Preview **Off**(토스 `successUrl` 복귀 · 카카오 콜백 · 웹훅 테스트) · Production Off | Preview Off(콘솔 Preview 의 이메일 링크 착지) | Off | Off | Off |
| Ignored Build Step | `git diff --quiet HEAD^ HEAD -- . ../../packages ../../package.json ../../package-lock.json` | 〃 | 〃 | 〃 | **`exit 0`**(항상 스킵 — 다시는 빌드하지 않는다) |
| Git | 같은 저장소 · Production Branch `main` · PR = Preview(앱별 URL 댓글) | 〃 | 〃 | 〃 | 연결은 남아 있으나 위 스킵으로 무효 |
| 삭제 시점 | — | — | — | — | **2026-09-21 삭제 완료**(전환 당일 — 결제·환불·가입·채널 인증까지 실서비스 확인 뒤 1주 대기 없이 정리). 같은 날 옛 Supabase secret key(`default`) 삭제 · Redirect URLs 에서 `https://sellery-app.vercel.app/**` 제거 |

Preview 주소는 `sellery-<앱>-git-<branch>-weglow-team.vercel.app`(앱별 자기 base). shop Preview 의 리라이트는 **프로덕션** 콘솔·데모를 가리킨다(결정 H). 정적 자산(`/assets/*`)은 shop 만 응답하므로 다른 앱 Preview 에서는 이미지 대신 이모지 폴백. Preview 의 결제 테스트는 브랜치 고정 도메인(`sellery-shop-git-<branch>-weglow-team.vercel.app`)을 쓰면 Supabase Redirect URL(와일드카드) · 토스 웹훅 URL 을 매번 바꾸지 않아도 된다.

### 1.2 환경변수 (이름만 · Production + Preview 둘 다 · 비밀은 "Sensitive")

| 이름 | `sellery-shop` | `sellery-influencer` | `sellery-brand` · `sellery-admin` | 비고 |
|---|---|---|---|---|
| `PUBLIC_SUPABASE_URL` | 필수 | 필수 | 필수 | `$env/static/public` — 빌드 시 인라인. **이름이 없으면 빌드 실패**(hooks.server.ts 가 import). Supabase → Project `sellery` → Settings → API |
| `PUBLIC_SUPABASE_ANON_KEY` | 필수 | 필수 | 필수 | 〃 |
| `PUBLIC_SITE_URL` | **Production `https://sellery.life`** · Preview `https://sellery-shop.vercel.app` | Production `https://sellery.life` · Preview `https://sellery-shop.vercel.app` | Production `https://sellery.life` · Preview `https://sellery-shop.vercel.app` | og · canonical · 메일 링크 절대 URL(2026-09-21 4 프로젝트 모두 반영 · 재배포). OAuth `redirectTo` · 토스 `successUrl` 은 `window.location.origin` 이라 Preview 마다 바꿀 필요 없다 |
| `PUBLIC_TOSS_CLIENT_KEY` | 필수 — Production `live_gck_…`(실판매 직전) · Preview `test_gck_…` | **필수(4단계 샘플 결제 · 2026-09-21 PR-B 부터)** — shop 과 **같은 값**(같은 상점 · Production/Preview 짝 동일) | — | 결제위젯 연동 키 클라이언트 키. `TOSS_SECRET_KEY` 와 **짝**(gck ↔ gsk) — §5.3. 빌드 시 인라인이라 값 변경은 Redeploy |
| `PUBLIC_TOSS_WIDGET_VARIANT` | 선택 | 선택(shop 과 같은 값) | — | 상점관리자에서 확인한 결제수단 UI 변형 이름 · 비우면 `DEFAULT-2` |
| `PUBLIC_DEV_LOGIN` | Preview 선택(`1`) | — | — | 개발용 이메일 로그인 폼 — dev 또는 `VERCEL_ENV=preview` 에서만 렌더, Production 은 값이 있어도 안 뜬다 |
| `PUBLIC_DEMO` | — | 선택(`1` 이면 `(demo)` 그룹 노출) | **brand: `1` 을 Production 에 둔다(2단계 병합까지 — 그 전엔 데모가 브랜드에게 보여줄 유일한 화면, brand-console-plan §6) · 없으면 `/brand/demo` 등 데모 경로 404** · admin: 예약 | `monorepo-migration.md` 결정 8 · C · §1.2 · brand-console-plan §2.1 |
| `SUPABASE_SERVICE_ROLE_KEY` | **비밀** | **비밀**(Production + Preview) | **brand: 비밀(Production + Preview) — 브랜드 콘솔 1단계부터 `requireBrand()` · `create_brand_from_signup` 이 쓴다** · admin: — | RLS 우회 — `$lib/server/env.ts` → `configureDb()` 에서만 읽는다 |
| `TOSS_SECRET_KEY` | **비밀** | **비밀(4단계 · shop 과 같은 값 · Production + Preview)** | **brand: 비밀(브랜드 콘솔 4단계 브랜드 환불 = 토스 취소 · shop 과 같은 값 · Production + Preview)** · **admin: 선택(관리자 환불 · 0020 PR-A · `$lib/server/money.ts` 가 주입 · 없으면 CANCEL_FAILED)** | 〃 → `configurePayments()` — influencer 는 `apps/influencer/src/lib/server/env.ts`. 없으면 `/pay/success` 확정이 CONFIG_ERROR 로 실패(돈은 잡히지 않음 — 위젯 승인 전) |
| `CRON_SECRET` | **비밀** | — | — | `/api/cron/reconcile` · `/api/cron/campaign-tick` Bearer(`openssl rand -hex 32` 로 생성 · Preview 는 별도 값). 없으면 라우트가 503. **Vercel Cron 은 이 이름의 env 가 있으면 `Authorization: Bearer <값>` 을 자동으로 붙인다**(§8.2) |
| `SLACK_WEBHOOK_URL` | 선택 | 선택 | brand: 선택 · admin: — | `/auth/confirm` 가입 알림 · 채널 [인증 확인] · 브랜드 가입·정지 한 줄(이메일·핸들·사업자번호 없이) |
| `RRN_ENC_KEY` | — | **비밀(5단계 0013 · Production + Preview 는 서로 다른 값)** | brand: — · **admin: 선택(지급명세서 자료 `exportRrn` · 0020 · `money.ts` 가 주입 · 인플루언서 앱과 같은 값 · 없으면 RRN_KEY_MISSING)** | 주민등록번호 `pgp_sym_encrypt` 키 → `configureDb({ rrnEncKey })`. **DB·코드·마이그레이션에 없다.** 없으면 `/settle` 의 주민번호 저장만 `RRN_KEY_MISSING`(다른 화면 정상). 생성·회전·백업은 §6.4 |

앱 환경변수가 **아닌** 것(대시보드에만 입력): 카카오 REST API 키 · Client Secret → Supabase Authentication → Providers → Kakao(§5.2). `NEXT_PUBLIC_INF_HOST` · `NEXT_PUBLIC_BRAND_HOST`(호스트 모드)는 폐기 — 경로 모드만(결정 11). 4 SvelteKit 앱은 `kit.env.dir: '../..'` 로 로컬에서 **루트 `.env.local` 하나**를 읽는다(§7). 비밀은 `$env/dynamic/private`(런타임)라 빌드·CI 에 불필요 — 빌드가 실제 키를 요구하면 설계 위반. `sellery-app` 의 환경변수는 동결 상태 그대로 두고 건드리지 않는다(롤백 시 그대로 쓰인다). 대시보드에서 저장이 실패할 때는 §8.3.

---

## 2. rewrite (`apps/shop/vercel.json`)

JSON 이라 주석을 못 넣으므로 각 줄의 뜻은 여기에 둔다. 규칙(`monorepo-migration.md §1.3`): shop 앱에는 `/influencer` `/brand` `/admin` 으로 시작하는 라우트를 두지 않는다 · shop `/robots.txt` 는 이 셋을 disallow · 리라이트 대상 SvelteKit 앱의 `_app/immutable/*` 은 자기 base 아래라 별도 항목이 없다. `:path*` 는 빈 경로와 트레일링 슬래시를 못 잡아 `/influencer` · `/influencer/` 를 따로 둔다(#18).

| `source` | `destination` | 이유 |
|---|---|---|
| `/influencer` · `/influencer/` · `/influencer/:path*` | `https://sellery-influencer.vercel.app/influencer…` | 인플루언서 콘솔(SvelteKit · S5 PR-10 #20 부터). 콘솔 전용 `/influencer/auth/{confirm,signout}` 도 이 줄로 간다(결정 15) |
| `/brand` · `/brand/` · `/brand/:path*` | `https://sellery-brand.vercel.app/brand…` | **브랜드 콘솔(SvelteKit SSR · 1단계부터)** — 콘솔 전용 `/brand/auth/{confirm,signout}` 도 이 줄로 간다. 데모 화면은 `(demo)` 그룹(`/brand/demo` · `/brand/demo-*` · `/brand/camps` …)으로 옮겨져 `PUBLIC_DEMO=1` 일 때만 열린다(데모 띠 + `noindex` + `/brand/robots.txt` disallow 는 그대로) |
| `/admin` · `/admin/` · `/admin/:path*` | `https://sellery-admin.vercel.app/admin…` | 결정 D — 데모 노출(데모 띠 + `noindex` + `/admin/robots.txt` disallow) |

콘솔이 도메인 루트에서 쓰는 경로는 리라이트 없이 **shop 의 SvelteKit 포트**가 받는다(1:1 이식 — 결정 15): 옛 가입 메일 착지 `GET /auth/confirm?token_hash=…&type=signup&next=/influencer/home`(파트너면 `createSellerFromSignup` 뒤 `/influencer/home` 302) · `/api/health`. S5 부터 콘솔은 자기 사본 `/influencer/auth/{confirm,signout}` 을 쓴다(가입 메일 `emailRedirectTo` 는 `${origin}/influencer/auth/confirm?next=…`).

`/_next/:path*` 규칙(S4 임시 · Next 정적 자산)은 PR-10 에서 삭제됐다. 리라이트 대상 프로젝트 이름을 바꾸면 이 파일도 같이.

---

## 3. 도메인 전환 (S4 — 2026-09-21 완료)

`monorepo-migration.md §1.6` 의 실행 체크리스트. 코드는 PR-7(#17) · PR-10(#20) 으로 끝났고 아래는 2026-09-21 에 Vercel API 로 실행한 대시보드·CLI 작업의 **기록**이다.

### 3.0 사전 준비

- [x] PR-7 병합 → `sellery-shop` Production 배포 성공. `sellery-brand` · `sellery-admin` · `sellery-influencer` 도 데모 띠가 든 배포가 Production.
- [x] `sellery-shop` **Production 환경변수** 확정(§1.2 표) — `PUBLIC_SITE_URL=https://sellery.life` · `PUBLIC_SUPABASE_*` · `SUPABASE_SERVICE_ROLE_KEY` · `PUBLIC_TOSS_CLIENT_KEY`/`TOSS_SECRET_KEY`(실판매 전까지 **테스트 짝** — §5.3) · `CRON_SECRET`. 재배포 완료.
- [x] `sellery-shop.vercel.app` 에서 S3 검증 재실행 — `/api/health` 200 `ok:true` · `/account/orders` `cache-control: private, no-store` · 토스 테스트 카드 결제 + 환불(shop Preview 에서 확인).
- [x] 리라이트 통과 확인 — `/influencer/login` 200 · `/influencer/home` 302 · `/brand/` `/admin/` 200(SvelteKit) · `/brand/robots.txt` `Disallow: /`.
- [x] Supabase → Authentication → URL Configuration: Site URL `https://sellery.life` · Redirect URLs 에 `https://sellery.life/**` · `https://sellery-shop.vercel.app/**` · `https://*-weglow-team.vercel.app/**` · `https://sellery-app.vercel.app/**`(2026-09-28 삭제 시 제거) — 변경 없음.
- [x] 토스 웹훅 URL **`https://sellery.life/api/payments/webhook` 그대로**(테스트 · 라이브 상점) — 호스트가 같으므로 바꿀 것이 없고, 도메인이 옮겨지는 순간부터 shop 이 받는다.

### 3.1 Vercel Domains 이동 (`sellery-app` → `sellery-shop`)

같은 팀 안의 이동이라 **DNS 는 손대지 않았다**(호스팅케이알 `@` · `www` 의 `A 76.76.21.21` 그대로 — §3.8).

- [x] `sellery-app` Domains 에서 `www.sellery.life` · `sellery.life` 제거 → `sellery-shop` Domains 에 `sellery.life` · `www.sellery.life`(→ apex 308) 추가 — Vercel API 로 실행, 인증서 정상 발급.
- [x] `inf.sellery.life` 는 더 이상 쓰지 않아 `sellery-app` 에서 제거(호스트 모드 폐기 · 결정 11).
- [x] `sellery-app` 은 도메인 없이 **동결**(§1.1) — Ignored Build Step `exit 0`, 마지막 Production 배포를 롤백 대상으로 유지.

### 3.2 환경변수 확인 (이동 뒤)

- [x] 4 프로젝트 Production `PUBLIC_SITE_URL=https://sellery.life` · Preview `https://sellery-shop.vercel.app` → 4 프로젝트 모두 재배포(§8.3 의 재배포 주의 참고).
- [x] `sellery-app` 의 `NEXT_PUBLIC_SITE_URL` 은 `https://sellery.life` 그대로(동결 — 롤백 시 그대로 쓰인다).

### 3.3 Supabase

- [x] URL Configuration 변경 없음(`https://sellery.life/**` 가 이미 있다). 콘솔 가입 메일의 `RedirectTo` 는 `https://sellery.life/influencer/auth/confirm?next=…` — 리라이트로 `sellery-influencer` 가 받는다(§2).
- [x] 카카오 개발자 앱 Redirect URI 는 Supabase 콜백(`…supabase.co/auth/v1/callback`) 이라 **무관**.

### 3.4 토스페이먼츠

- [x] 웹훅 URL 변경 없음. 토스 테스트 카드 결제 + 환불을 shop Preview 에서 확인.
- [ ] 실판매 시점이면 Production 에 **라이브 짝**(`live_gck_` + `live_gsk_`) — 둘을 함께, Redeploy(§5.3). 아직 테스트 짝.

### 3.5 확인 (curl · 브라우저)

| 확인 | 명령 | 기대 | ✅ 2026-09-21 |
|---|---|---|---|
| 도메인이 shop | `curl -sI https://sellery.life/` | 200 · `x-vercel-id` 있음 · `x-powered-by: Next.js` **없음**(SvelteKit) · `www.sellery.life` → 308 `https://sellery.life/` | ✅ 200 SvelteKit · www 308 |
| 헬스 | `curl -s https://sellery.life/api/health` | 200 `{"ok":true,"checks":{"supabaseAdmin":"ok","toss":"ok"}}` — 503 이면 Logs `[health]` | ✅ `ok:true` |
| 판매 링크 | `curl -sD - -o /dev/null https://sellery.life/s/jiyu_beauty/c1` · `curl -sI https://sellery.life/c/c1` | 200 + `set-cookie: slry_linkctx=c1; …HttpOnly; SameSite=Lax; Secure` · `/c/c1` → 308 | ✅ 쿠키 설정 · 308 |
| 캐시 헤더 | `curl -sI https://sellery.life/account/orders` | `cache-control: private, no-store` | ✅ |
| robots | `curl -s https://sellery.life/robots.txt` | `/api/` `/checkout` `/account` `/login` `/auth/` `/influencer` `/brand` `/admin` disallow · `/s/` `/c/` allow | ✅ |
| 콘솔(SvelteKit) | `curl -sI https://sellery.life/influencer/login` · `curl -sI https://sellery.life/influencer/home` | 200(SvelteKit · title `로그인 — 셀러리 파트너`) · 302 `/influencer/login?next=%2Finfluencer%2Fhome` | ✅ 200 · 302 |
| 콘솔 로그인 | 파트너 계정으로 로그인 → `/influencer/home` · 내 정보 · 로그아웃(`POST /influencer/auth/signout` → 303) | 같은 브라우저에서 `sellery.life/` 고객 홈 persona 가 **로그아웃 상태가 아님**(같은 세션 · 콘솔 `foreign` 안내로 이어짐) | (브라우저 시나리오 — `inf-console-plan.md §7` 2단계 재실행 시) |
| 카카오 → 결제 | `/login` 카카오 → `next` 복귀 → LIVE 캠페인 `구매하기` → 테스트 결제 1건 → `/checkout/success` → `/account/orders` 1건 → 환불 → `환불 완료` | `app-plan §11.3` | ✅ shop Preview 에서 테스트 카드 결제 + 환불 |
| 데모 | `curl -sI https://sellery.life/brand/` · `/admin/` · `curl -s https://sellery.life/brand/robots.txt` | 200(SvelteKit) + 맨 위 **데모 띠** · 응답 HTML 에 `<meta name="robots" content="noindex, nofollow">` · robots `Disallow: /` | ✅ 200 · noindex · Disallow |
| 약관 | `curl -sI https://sellery.life/terms` · `/privacy` | 200 | ✅ |
| 세션 공유 | 콘솔 로그인 뒤 DevTools `document.cookie` 에 `sb-ocxppeuoiysnkwwujvko-auth-token` · 로그아웃 뒤 고객 홈 persona 즉시 해제 | §0 쿠키 공유 | (브라우저 시나리오) |
| 로그 | Vercel `sellery-shop` Logs 5분 | `permission denied` · env 누락 · `CONFIG_ERROR` 없음 | ✅ |

### 3.6 롤백

- ~~`sellery-app` 도메인 되돌리기~~ — `sellery-app` 은 2026-09-21 삭제됐다(동결 배포 `sellery-lhpqlxil7…` 포함). 도메인 롤백 대상은 없다.
- **현재 롤백 수단**: shop 앱 자체의 문제면 도메인은 두고 Vercel → `sellery-shop` → Deployments → 이전 배포 "Promote to Production"(Instant Rollback). 콘솔 문제면 `sellery-influencer` 에서 같은 방법.

### 3.7 전환 뒤 정리 (같은 날)

- [x] README "현재 서비스 상태" · CLAUDE.md 같은 절 · 이 문서 §0 의 `<!-- S4 -->` 문장 삭제 — S5 PR-11.
- [x] `web/DEPLOY.md §6` 도메인 표 → 이 문서 §3.8 로 이동(S5 PR-11).

### 3.8 도메인 · DNS 현황 (2026-09-21)

등록기관 **호스팅케이알**, 네임서버 `ns1~4.hosting.co.kr`. DNS 레코드는 호스팅케이알 → 도메인 → "DNS 레코드 관리". Vercel 쪽 도메인은 전부 `sellery-shop`(§1.1). **호스팅케이알 주의**: 레코드 목록에 보여도 네임서버 4대에 실리기까지 20~40분, 서버마다 시차가 있다(`nslookup -type=A <host> ns1.hosting.co.kr` 로 서버별 확인). 로컬 KT 리졸버는 더 늦으니 `8.8.8.8`/`1.1.1.1` 로 본다. Vercel 인증서가 "being generated" 에서 멈추면 `vercel certs issue sellery.life www.sellery.life --scope weglow-team`.

| 호스트 | 레코드 | 용도 | 상태 |
|---|---|---|---|
| `@` | `A 76.76.21.21` | `sellery.life` → `sellery-shop` | 연결 완료(2026-09-18 인증서 발급 · 2026-09-21 프로젝트 이동) |
| `www` | `A 76.76.21.21` 권장 (CNAME `cname.vercel-dns.com` 은 호스팅케이알이 존에 싣지 않았다 — 2026-09-18) | apex 로 308(Vercel Domains 에서 설정) | 2026-09-21 308 확인 |
| `inf` | (미사용) | 호스트 모드 폐기(결정 11) — Vercel 도메인 2026-09-21 제거. 호스팅케이알의 `inf` A 레코드는 지워도 된다 | 해제 |
| `brand` | (미사용 — 경로 모드 `sellery.life/brand`) | — | — |
| (메일) | Resend 가 보여 주는 DKIM(TXT 또는 CNAME) · SPF(TXT) · DMARC(TXT) | `noreply@sellery.life` 발신(§5.5) | §5.5 표에 기록 |

---

## 4. S5 진행표

| 시점 | 변경 | 상태 |
|---|---|---|
| S5 PR-10 | `apps/shop/vercel.json` `/influencer*` → `sellery-influencer.vercel.app` · `/_next/:path*` 줄 **삭제** | ✅ #20 (2026-09-21) |
| S4 도메인 이동 | `sellery.life` · `www` → `sellery-shop` · `PUBLIC_SITE_URL` 4 프로젝트 · `sellery-app` 동결 | ✅ 2026-09-21 (§3) |
| S5 PR-11 | `web/` 삭제 · `.github/workflows/web-ci.yml` 삭제 · `web/DEPLOY.md §3 · §4 · §6 · §8` 을 이 문서 §5 · §6 · §3.8 · §10 으로 이동 · README/CLAUDE.md 서비스 상태 갱신 | ✅ 이 PR (2026-09-21) |
| 브랜치 보호 | required check 는 `프로토타입 점검` 뿐(`web-ci` 는 required 가 아니었다) — 제거할 것 없음 | ✅ 확인 2026-09-21 |
| 뒷정리 | Supabase Redirect URLs 에서 `https://sellery-app.vercel.app/**` 제거 · 옛 secret key `default` 삭제(2026-09-21 대화 노출로 회전) → Vercel `sellery-app` 프로젝트 삭제(결정 10 · A — 1주 대기 없이 당일) | ✅ 2026-09-21 |
| 이후 | 인플루언서 콘솔 3~6단계(`inf-console-plan.md §7`) → `apps/brand` → `apps/admin` | ☐ |

---

## 5. 외부 서비스 설정 (코드 밖 · 대시보드)

전부 `sellery.life` 호스트 기준이라 Vercel 프로젝트 이동과 무관했다. 값은 대시보드에만.

### 5.1 Supabase (`sellery`, ref `ocxppeuoiysnkwwujvko`)

- **Authentication → Providers → Kakao**: Enabled, Client ID = 카카오 REST API 키, Client Secret = 카카오 Client Secret(§5.2). 콜백 URL 은 Supabase 가 보여 주는 `https://ocxppeuoiysnkwwujvko.supabase.co/auth/v1/callback`.
- **Authentication → URL Configuration**:
  - Site URL: `https://sellery.life`
  - Redirect URLs (전부 있어야 한다): `https://sellery.life/**` · `https://sellery-shop.vercel.app/**` · `https://*-weglow-team.vercel.app/**`(Preview) · `http://localhost:5176/**`(shop dev).
  - 여기 없는 `redirectTo` 는 Site URL 로 떨어져 `next` 를 잃는다 — Preview 브랜치 도메인도 와일드카드로 포함시킬 것. Next 시절의 `http://localhost:3000/**` · `https://inf.sellery.life/**` 는 더 쓰지 않는다.
- **키**: Settings → API 의 URL · anon · service_role 을 §1.2 표대로. service_role 은 서버 전용.
- 스키마·권한: §6.

### 5.2 카카오 개발자 앱

- 카카오 로그인 활성화, **Redirect URI** 에 `https://ocxppeuoiysnkwwujvko.supabase.co/auth/v1/callback` (앱 도메인이 아니라 Supabase 콜백 — 도메인 이전과 무관).
- 동의 항목: 닉네임 · 이메일. **이메일을 필수 동의로 받으려면 비즈 앱 전환**이 필요 — 미전환이면 선택 동의라 `user.email` 이 null 일 수 있고 앱은 이미 optional 로 다룬다(`app-plan.md §4.1`).
- 앱은 `signInWithOAuth` 에 `scopes` 를 지정하지 않는다 — 동의 항목은 카카오 콘솔이 결정.

### 5.3 토스페이먼츠 (상점 `NHN_shingoonk`)

- **키**: 개발자센터 → 내 개발정보 → **결제위젯 연동 키**. 테스트 짝(`test_gck_`/`test_gsk_`)은 루트 `.env.local` 과 Vercel `sellery-shop` Preview, 라이브 짝(`live_gck_`/`live_gsk_`)은 실판매 직전 Vercel Production. 라이브 전환은 **둘을 함께**(`PUBLIC_TOSS_CLIENT_KEY` 는 빌드 시 인라인이라 Redeploy). API 개별연동 키(`ck_/sk_`)를 섞으면 위젯이 안 뜨거나 승인 실패.
- **위젯 설정**(상점관리자 → 결제위젯): 결제수단에서 **가상계좌 · 계좌이체 비활성화**(카드 · 간편결제만 — 승인 응답이 200 이어도 `WAITING_FOR_DEPOSIT` 이면 돈이 없는 상태, glo 실사고 · 앱은 `status==='DONE'` 만 인정). UI 변형 이름 2개(결제수단 · 약관)를 확인해 결제수단 값을 `PUBLIC_TOSS_WIDGET_VARIANT` 에, 약관은 `AGREEMENT` 인지 확인(다르면 `packages/ui/src/site/checkout/PaymentWidget.svelte` 의 `AGREEMENT_VARIANT_KEY` 수정).
- **웹훅 URL** (개발자센터 → 웹훅, 테스트 상점 · 라이브 상점 각각):

  | 시점 | 웹훅 URL |
  |---|---|
  | 프로덕션 | `https://sellery.life/api/payments/webhook` |
  | shop Preview 로 테스트할 때 | `https://sellery-shop.vercel.app/api/payments/webhook`(또는 브랜치 고정 도메인) |
  | 로컬 테스트 | 터널 URL + `/api/payments/webhook` (`app-plan.md §11.4` · §7) |

  이벤트 `PAYMENT_STATUS_CHANGED` (`DEPOSIT_CALLBACK` 은 무관 — 켜 두어도 무해). 웹훅은 **서명이 없는 공개 엔드포인트**다 — 앱(`apps/shop/src/routes/api/payments/webhook/+server.ts` → `@sellery/payments` `checkout-sync`)은 본문을 믿지 않고 `paymentKey` 재조회로만 상태를 바꾸며(`app-plan.md §7.3`), 그 위에 **Vercel Firewall(Custom Rules → Rate Limit) 로 `/api/payments/webhook` 에 IP 기준 레이트리밋(예: 분당 60)** 을 건다(플랜에 없으면 upstash ratelimit 을 라우트 앞에 — 다음 슬라이스). 콘솔의 "웹훅 테스트 전송" 으로 등록을 확인한다(§10).
- **운영 규칙**: 토스 콘솔에서 **부분취소를 하지 않는다**(슬라이스 1 은 전액 취소만 정식 지원 — 부분취소는 `payment_events handled=false` 큐로 남아 수동 정산 조정). 정산 완료 캠페인 · 샘플 주문의 콘솔 취소도 같은 큐(`orders.status='CANCELED'`)로 간다(§8.2 운영 큐).

### 5.4 다음 우편번호 API

외부 스크립트 `t1.daumcdn.net` — 체크아웃 배송지 입력에 쓴다. CSP 를 두면 허용 목록에 추가.

### 5.5 파트너 이메일 인증 (Supabase Auth — 인플루언서 콘솔 2단계, `inf-console-plan.md §4.1 · §4.8`)

인플루언서(나중에 브랜드) 계정은 **이메일/비밀번호 + 인증 메일**이다(고객 카카오 계정과 별개). 인증 메일 링크를 누르는 요청(`/influencer/auth/confirm` — `apps/influencer/src/routes/(console)/auth/confirm/+server.ts`; shop 의 `/auth/confirm` 도 같은 일을 한다)이 `sellers` 행을 만들고 바로 콘솔에 들여보낸다 — 수동 심사 없음. 아래 값은 저장소로는 확인할 수 없으므로 **대시보드에서 설정한 뒤 "현재값" 열에 기록**한다.

| 항목 | 설정할 값 | 현재값(기록) |
|---|---|---|
| Authentication → Providers → **Email** | Enable **ON** · **Confirm email ON** · Minimum password length **8** (앱 규칙은 영문+숫자 8자 이상 — `packages/db/src/partner/signup-rules.ts`, 클라이언트·서버가 따로 검사) · Secure email change ON(기본) | ☐ 미기록 |
| Authentication → URL Configuration → **Redirect URLs** | §5.1 의 목록. 경로 모드라 `https://sellery.life/**` 하나로 콘솔 착지(`/influencer/auth/confirm?next=…`)까지 덮는다 — 없으면 `emailRedirectTo`/`redirectTo` 가 Site URL 로 떨어져 `next` 를 잃고 콘솔이 아니라 고객 홈에 착지한다 | ☐ |
| Authentication → Emails → **SMTP Settings (Custom SMTP)** | **Resend**: Host `smtp.resend.com` · Port `465` · Username `resend` · Password = **Resend API key**(비밀 — 이 문서·코드·PR 어디에도 쓰지 않는다) · Sender email `noreply@sellery.life` · Sender name `Sellery`. **Sender email 은 반드시 Resend 에서 Verified 된 도메인(`sellery.life`) 주소** — 다른 도메인이면 Auth Logs 에 `550 This API key is not authorized to send emails from <도메인>` 이 찍히고 가입 폼은 "가입 처리에 실패했어요" 만 보인다(2026-09-21 `noreply@weglow.biz` 로 실제 발생). 메일함이 있을 필요는 없다(도메인 소유 확인만). 기본 Supabase SMTP 는 시간당 소량·팀원 주소 위주라 외부 인플루언서에게 가지 않는다 | ☐ |
| Resend 대시보드 → **Domains** | `sellery.life` 추가 → 호스팅케이알 "DNS 레코드 관리" 에 Resend 가 보여 주는 레코드를 그대로 추가 → Verified. 2026-09-21 확인된 레코드: `resend._domainkey` TXT(DKIM) · `send` CNAME `send.forge.rmta.net` · `rsend` CNAME `rsend-apne1.forge.rmta.net`(리전 ap-northeast-1). `_dmarc` TXT 는 아직 없음(권장). 호스팅케이알은 반영에 20~40분(§3.8) | ✅ 2026-09-21 |
| Authentication → **Rate Limits** | 이메일 발송 한도(시간당) 확인 — Custom SMTP 를 켜야 상향할 수 있다. 앱의 [메일 다시 보내기] 는 60초 쿨다운 | ☐ |
| Authentication → Emails → **Templates** | 3종(Confirm signup · Reset password · Invite user)의 링크를 **token_hash 방식**으로 바꾼다 — 본문·제목은 [`docs/emails/`](emails/README.md)(정본 · 그대로 붙여넣기). 문구는 역할 중립('셀러리 파트너') — 템플릿은 프로젝트당 1벌이라 브랜드 가입 메일과 공유한다 | ☐ |

**링크 방식.** 기본 `{{ .ConfirmationURL }}` 은 PKCE(`?code=`) 링크라 **가입한 브라우저에서만** 열리고, 데스크톱에서 가입하고 휴대폰 메일 앱에서 열면 실패한다. `{{ .RedirectTo }}` 는 앱이 넘긴 `emailRedirectTo`(예 `https://sellery.life/influencer/auth/confirm?next=%2Finfluencer%2Fhome`) 그대로이므로 거기에 `&token_hash={{ .TokenHash }}&type=signup|recovery|invite` 만 붙인다(`auth/confirm/+server.ts` 가 `verifyOtp({ type, token_hash })` 로 세션을 만든다). 로고는 `https://sellery.life/email/celery.png`(`apps/shop/static/email/celery.png` · 불변).

- 로컬·Preview 확인(실제 메일 없이): `auth.admin.generateLink({ type:'signup'|'magiclink'|'recovery', email })` 의 `hashed_token` 으로 `GET /influencer/auth/confirm?token_hash=…&type=…&next=/influencer/home` 을 열면 같은 경로를 탄다. 시드 연결은 `node packages/db/scripts/dev-seller.mjs --email … --seller s1`(production 거부), 실제 계약자 초대는 `node packages/db/scripts/partner-admin.mjs invite <email> --link s2`(§8.1).
- 운영 절차(관리자 화면 없음): 가입 완료·채널 [인증 확인] 은 Slack 한 줄(`SLACK_WEBHOOK_URL`, 선택 — 이메일·핸들 없이) → `partner-admin.mjs channels --pending` → 인플루언서 프로필 bio 또는 `@sellery.official` DM 수신함에서 코드 `SLRY-XXXX` 확인 → `verify-channel <ch>`. 정지·복귀는 `suspend`/`reactivate`, 목록은 `list`. **`@sellery.official` DM 수신함 확인 담당자**를 정한다(`inf-console-plan.md §7` 2단계).

### 5.6 관리자 계정 (`profiles.role='admin'`)

`profiles.role` 은 `customer|seller|brand|admin` 을 허용하지만(`0001_init.sql:51`) **`admin` 을 넣는 코드 경로가 없다** — 가입 트리거(`handle_new_user`)는 `customer`, 인플루언서는 `create_seller_from_signup` 이 `seller` 로 바꾼다. 관리자는 수동 생성뿐이다. `app_role()`(`0001_init.sql:87` · security definer · `authenticated` 에만 execute)이 이 값을 읽고, `apps/admin` 의 게이트가 그것으로 판정한다.

| 계정 | 용도 | 비밀번호 | 생성 |
|---|---|---|---|
| `official@weglow.biz` | 공용 1개(운영 결정 2026-09-21). `/admin` 콘솔 | 팀 금고 보관 — 이 문서·코드·PR 에 쓰지 않는다 | ✅ 2026-09-21 |

**생성 절차**(루트에서 · 실 운영 DB 작업이다 · 멱등하지 않으니 중복 생성 주의)

```bash
# 1) auth 계정 — email_confirm:true 라 확인 메일 없이 바로 로그인된다. 같은 이메일이 있으면 skip
node --env-file=.env.local packages/db/scripts/dev-user.mjs <email> <password>

# 2) role 승격 — profiles 행은 1) 직후 트리거가 role='customer' 로 만들어 둔다
npx supabase db query --linked \
  "update public.profiles set role='admin' where id = (select id from auth.users where email='<email>')"
```

CLI 링크가 아직 없으면 2)를 service role 키 + `@supabase/supabase-js` 로 대신할 수 있다(`profiles` 는 `revoke all from anon, authenticated` 라 service role 필요). Step 1 은 CLI 가 필요 없다.

**검증** — 실제 세션에서 확인한다. 대시보드 SQL Editor 에서 `app_role()` 을 호출하면 `auth.uid()` 가 없어 `null` 이 나오는 것이 정상이다.

```
signInWithPassword(email, password) → rpc('app_role') === 'admin'
대시보드: Authentication → Users 에서 Confirmed ✓ · SQL Editor 에서
  select u.email, p.role from auth.users u join public.profiles p on p.id=u.id where u.email='<email>'
```

**주의**

- 아이디가 공개돼 있다 — `official@weglow.biz` 는 전자상거래법상 모든 페이지 푸터·개인정보처리방침에 실리는 고객센터 주소다(`packages/db/src/company.ts`). 공격자에게 아이디는 주어진 값이므로 비밀번호는 서비스 이름이 들어가지 않은 랜덤 문자열이어야 한다. **`apps/admin` 에 실데이터 기능(인플루언서 정지 · 채널 인증 승인 · 정산 실행)을 붙이는 PR 에서 교체한다.**
- `role='admin'` 은 게이트를 통과하는 유일한 조건이고, 관리자 화면은 service role 로 동작해 RLS 를 우회한다. 회수는 같은 방식으로 `role='customer'` 로 내리거나 Authentication → Users 에서 계정 삭제.
- Basic Auth 이중 잠금(`ADMIN_PASSWORD`)은 `app_role()='admin'` **위에** 얹는 선택 항목이며 단독 인증이 아니다(`app-plan.md §3`). glo 의 `/admin` Basic Auth 블록은 복사하지 않는다 — 세션 갱신을 건너뛰는 구조다.

---

## 6. 데이터베이스

### 6.1 마이그레이션 (저장소 루트에서)

`supabase/` 는 **저장소 루트**에 있고 CLI 도 루트에서 실행한다. 클라우드 `sellery` 에 `0001~0013` 적용 완료(`0001~0008` 2026-09-15 · `0010_partner_signup` 2026-09-18 · `0011_sample_request` · `0012_partner_payments` · `0013_partner_settlement` 2026-09-21, `supabase_migrations.schema_migrations` 로 확인). 이후 변경은 이미 적용된 파일을 고치지 말고 **새 번호(`0014_…`)** 로 추가 → PR → 병합 → 로그인 · 링크된 PC 에서:

```bash
npx supabase login
npx supabase link --project-ref ocxppeuoiysnkwwujvko     # DB 비밀번호 필요 (최초 1회)
npx supabase db push --linked --dry-run
npx supabase db push --linked
npm run gen:types                                        # 루트 — packages/db/scripts/gen-types.mjs → packages/db/src/database.types.ts (UTF-8 · LF · 실패 시 파일 보존)
npm run check                                            # 타입 깨짐 확인 → 같은 PR 에 포함
```

시드 재투입은 `npx supabase db query --linked --file supabase/seed.sql`(멱등). 원격 조회는 `npx supabase db query --linked "select …"`. 절차 · 주의(`--include-seed` 가 SQL 을 실행하지 않는 문제, `service_role` grant 0007)는 `data-model.md §8 · §10`.

**DB 마이그레이션은 앱 배포보다 먼저**: 새 컬럼·함수를 쓰는 앱을 먼저 올리면 그 사이 요청이 실패한다. 반대로 컬럼을 지우는 마이그레이션은 앱이 더 이상 쓰지 않는 것을 배포한 **다음** 에. DB 마이그레이션은 되돌리지 않고 앞으로만 고친다.

### 6.2 적용 후 스모크

`data-model.md §8.4`(anon 가시성) · `§10.4`(0008 함수 · grant) 의 쿼리를 `npx supabase db query --linked` 로 문장별 실행. 요지: anon 은 `campaign_card('c1')` 을 읽고 `checkout_sessions` · `app_*` 함수는 permission denied, service_role 은 전부 가능.

### 6.3 크론 · 수동 운영 잡

**Vercel Cron(2026-09-22 · 브랜드 콘솔 4단계 PR-A)** — `apps/shop/vercel.json` `crons`: `/api/cron/campaign-tick` 매시 5분(UTC · 0018 `app_campaign_tick` — KST 자정 직후 첫 실행에서 SCHEDULE_CONFIRMED→LIVE · LIVE→CLEARING) · `/api/cron/reconcile` 10분마다. Production 배포에만 등록되고 Vercel 이 GET + `Authorization: Bearer $CRON_SECRET` 으로 부른다(§8.2). 세션 만료 · PII 파기 · 운영 큐는 §8.2 표대로 손으로.

### 6.4 주민등록번호 암호화 키 `RRN_ENC_KEY` (0013 · 인플루언서 콘솔 5단계)

인플루언서 개인(`settle_type='personal'`)의 3.3% 원천징수 지급명세서에 필요한 주민등록번호는 `sellers.rrn_enc` 에 `pgcrypto` `pgp_sym_encrypt` 로만 저장된다(`inf-console-plan.md §5.9`). **키는 DB 에 없고** 서버 env `RRN_ENC_KEY` 가 RPC 인자(`app_set_seller_rrn(p_key)` · `app_seller_rrn_decrypt(p_key)`)로 흐른다 — 마이그레이션·시드·코드 어디에도 값이 없다.

1. **생성**: `openssl rand -base64 48` (아무 긴 문자열이면 된다 — 32바이트 이상 권장). Production 과 Preview 는 **다른 값**.
2. **등록**: Vercel `sellery-influencer` → Environment Variables → `RRN_ENC_KEY`(Sensitive · Production / Preview 각각) → Redeploy(§8.3). 로컬은 루트 `.env.local`.
3. **백업**: 키를 잃으면 저장된 번호는 복구할 수 없다(운영자 비밀 금고에 별도 보관 — 대시보드만 믿지 않는다). 콘솔은 `has_rrn`/마스크만 보므로 키 없이도 화면은 뜬다.
4. **키 없음 판정**: `app_set_seller_rrn(…, p_key => '')` → `{ok:false, code:'RRN_KEY_MISSING'}`(스모크에서 확인). 앱은 `configureDb({ rrnEncKey })` 가 비면 DB 를 부르지 않고 같은 코드를 돌려준다.
5. **열람(복호)**: 콘솔 함수가 아니다 — 지급명세서 제출 시 운영 스크립트가 `app_seller_rrn_decrypt(seller_id, key, actor, purpose)` 를 호출하고, 호출마다 `sensitive_access_log`(field='rrn' · actor · purpose · at) 1행이 남는다(키 불일치도 로그). `npx supabase db query --linked "select * from sensitive_access_log order by at desc limit 20"` 로 감사.
6. **회전**: 새 키를 발급한 뒤 행마다 `app_seller_rrn_decrypt(옛 키)` → `app_set_seller_rrn(새 키, p_skip_checksum => true)` 를 한 트랜잭션으로 돌리는 스크립트(미작성 — 필요할 때 `packages/db/scripts/`)를 실행하고 env 를 바꾼다. 그 사이의 저장은 새 키로만 되므로 회전은 점검 시간에.
7. 계좌번호(`bank_info`)는 §5.9 의 의도적 결정대로 평문 jsonb(service role 전용 · 콘솔 마스킹)이다 — 정산 지급 수단 확정 때 같은 키로 옮길지 결정.

---

## 7. 로컬 개발

```bash
npm install                  # 처음 한 번 (Node 22+)
cp .env.example .env.local   # 이름 표 — 값은 비워도 4 앱이 뜬다 (hooks.server.ts 가 Supabase 없이 통과)
npm run check                # 앱 4개 svelte-check + packages/{db,payments} tsc (CI 와 동일)
npm test                     # vitest — 순수 규칙
node scripts/check-boundaries.mjs
npm run build                # 앱 4개 vite build → apps/*/.vercel/output (adapter-vercel · CI 와 동일)
```

| 앱 | 명령 | 주소 | 비고 |
|---|---|---|---|
| 고객(shop) | `npm run dev:shop` | http://localhost:5176/ | base `''`(도메인 루트) · `/robots.txt` · `/api/health` |
| 인플루언서 | `npm run dev:influencer` | http://localhost:5173/influencer | 콘솔(`/influencer/login` …) + dev 에서는 `(demo)` 그룹도 · `/influencer/robots.txt` |
| 브랜드 | `npm run dev:brand` | http://localhost:5174/brand | 데모(데모 띠) · `/brand/robots.txt` |
| 관리자 | `npm run dev:admin` | http://localhost:5175/admin | 데모(데모 띠) · `/admin/robots.txt` · [데이터 초기화] |

포트는 `apps/*/vite.config.ts` 의 `strictPort`. 개발 서버는 포트가 달라 localStorage 가 앱별로 분리되고, 다른 앱 링크(`/influencer/…`)는 shop dev 서버에 없으니 위 포트로 직접 연다. 공용 이미지·파비콘(`/assets/*` `/favicon.svg` `/email/*`)은 `apps/shop/static/` 한 곳 — `scripts/vite-root-assets.mjs` 가 4 앱 dev 서버에서 서빙.

**`.env.local`(루트 하나 · gitignored)** — 4 앱이 `kit.env.dir: '../..'` 로 읽는다. `vercel env pull` 은 앱 폴더가 아니라 루트로(`vercel env pull ../../.env.local`; `apps/<앱>/.env.local` 은 읽히지 않는다).

| 이름 | 로컬 | 비고 |
|---|---|---|
| `PUBLIC_SUPABASE_URL` · `PUBLIC_SUPABASE_ANON_KEY` | 비워도 됨(이름은 필수) | 비면 데모 앱은 Supabase 없이 뜨고, shop 은 빈 목록 · 콘솔은 로그인 불가 |
| `PUBLIC_SITE_URL` | 비우면 `http://localhost:5176` | |
| `PUBLIC_TOSS_CLIENT_KEY` | `test_gck_…`(이름 필수) | |
| `PUBLIC_TOSS_WIDGET_VARIANT` · `PUBLIC_DEV_LOGIN` | 선택 | `PUBLIC_DEV_LOGIN=1` 이면 `/login` 에 개발용 이메일 폼(dev 만) — 계정은 §8.1 `dev-user.mjs` |
| `SUPABASE_SERVICE_ROLE_KEY` · `TOSS_SECRET_KEY` · `CRON_SECRET` · `SLACK_WEBHOOK_URL` | 결제·가입을 눌러볼 때만 | 런타임 비밀 — check·build 에 불필요 |

카카오 로그인은 Supabase Redirect URLs 에 `http://localhost:5176/**` 가 있어야 한다(§5.1). 결제는 테스트 키로 실제 토스 결제창이 뜬다(테스트 카드). 웹훅을 로컬에서 받으려면 터널(`npx cloudflared tunnel --url http://localhost:5176`) — `app-plan.md §11.4`. 시드 기준 오늘(KST) LIVE 캠페인이 있어야 결제까지 눌러볼 수 있다(`supabase/seed.sql` 상대 날짜 절). 콘솔 계정은 시드 8명이 실제 메일을 못 받으므로 로컬·Preview 는 `dev-seller.mjs`(§8.1).

> **Windows**: `npm run build` 는 adapter-vercel 이 `.vercel/output` 안에 심링크를 만들어 `EPERM` 으로 실패할 수 있다 — 설정 → 개발자 모드(개발자용 → "개발자 모드") 를 켜거나 관리자 터미널, 또는 WSL 에서 빌드. CI(ubuntu) · Vercel 은 영향 없고 `npm run check` · `npm test` · `npm run dev:*` 는 Windows 에서 그대로 된다. 줄바꿈은 `.gitattributes` 가 LF 로 강제.

---

## 8. 운영 스크립트 · 수동 잡 · Vercel 주의

### 8.1 스크립트

전부 **저장소 루트**에서 실행하고 루트 `.env.local`(`PUBLIC_SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` · 스크립트에 따라 `PUBLIC_SITE_URL`)을 읽는다. 값은 출력하지 않는다. 파일 머리 주석이 사용법의 정본([`packages/db/README.md`](../packages/db/README.md)).

| 스크립트 | 용도 | 예 |
|---|---|---|
| `packages/db/scripts/partner-admin.mjs` | 인플루언서 운영(관리자 화면 없음) — `list [--inactive]` · `suspend <seller> ["사유"]` · `reactivate` · `link <seller> <user_id>` · `invite <email> --link <seller>`(초대 메일 → `${PUBLIC_SITE_URL}/influencer/auth/confirm?next=/influencer/password/new`) · `channels [--pending]` · `verify-channel <ch>` · `unverify-channel` · **4단계** `payments [--pending] [--seller s7]`(결제 표 · 운영 큐) · `refund-sample <payment id | slrp_ orderId> ["사유"]`(브랜드 발송 전 취소 — 토스 전액 취소 → `app_partner_payment_refund`: 🥬 복구 · 캠페인 DECLINED · 주문 CANCELED, 두 번 실행해도 원장 1행 · `TOSS_SECRET_KEY` 필요). production 허용 | `node packages/db/scripts/partner-admin.mjs payments --pending` |
| `packages/db/scripts/dev-seller.mjs` | 개발용 인플루언서 계정(확인 완료) + 시드 `sellers` 행 연결. **production 거부** | `node packages/db/scripts/dev-seller.mjs --email dev-seller@sellery.test --seller s1` |
| `packages/db/scripts/partner-admin.mjs` (브랜드) | 브랜드 운영(브랜드 콘솔 1단계 · 0014) — `brands [--inactive]` · `suspend-brand <b> ["사유"]`(listed 상품은 자동으로 내리지 않고 경고) · `reactivate-brand <b>` · `link-brand <b> <user_id>` · `invite-brand <email> --link <b>`(초대 메일 → `${PUBLIC_SITE_URL}/brand/auth/confirm?next=/brand/password/new`). 시드 b1·b2 는 `*.example` 이라 실제 담당자 메일로. 2단계 `products` · `review-product` · 3단계 `campaign <c>` · **4단계(0018)** `tick`(스케줄러 전체 · 크론 대신 수동) · `tick-campaign <c>` · `orders --campaign <c>\|--brand <b> [--unshipped]` · `cs [--open] [--brand <b>]` | `node packages/db/scripts/partner-admin.mjs brands` |
| `packages/db/scripts/partner-admin.mjs` (정산 · 돈) | 관리자 콘솔 PR-A(0020 · docs/admin-console-plan.md) — 화면(PR-B) 전까지: `settle-preview <c>`(calc 전 라인 · 보류 예고 · 실행 가능) · `settle-run <c> [--force]`(CLEARING · D+21 도래분 · 한 트랜잭션 · SETTLED 면 already) · `settle-due`(도래분 일괄) · `settlements [--status]`(대기 큐 + 스냅샷 + 카운트) · `payouts [--status]` · `payouts-export --purpose "…" [--out f.csv]`(계좌 **원문** CSV · 건마다 `sensitive_access_log` · actor = `ADMIN_ACTOR` env) · `payout-paid <id> ["메모"]` · `payout-hold <id> ["사유"]` · `payout-release <id>`(완비 재검사) · `payments-health` · `admin-orders [--filter] [--q]`. production 허용 | `node packages/db/scripts/partner-admin.mjs settle-preview c5` |
| `packages/db/scripts/dev-brand.mjs` | 개발용 브랜드 계정(확인 완료) + 시드 `brands` 행 연결(`create_brand_from_signup(p_link_id)`). **production 거부**. 표준 테스트 계정 `dev-brand@sellery.test ← b1 바인허브` | `node packages/db/scripts/dev-brand.mjs --email dev-brand@sellery.test --brand b1` |
| `packages/db/scripts/dev-user.mjs` | 개발용 고객 이메일/비밀번호 계정(`PUBLIC_DEV_LOGIN=1` 폼용) | `node --env-file=.env.local packages/db/scripts/dev-user.mjs <email> <password>` |
| `packages/db/scripts/gen-types.mjs` | Supabase 타입 → `packages/db/src/database.types.ts`(UTF-8 · LF). `supabase link` 전제(§6.1) | `npm run gen:types` |

### 8.2 크론 · 수동 잡

**Vercel Cron(`apps/shop/vercel.json` `crons` · Production 만)** — 스케줄은 UTC. Vercel 이 각 `path` 를 GET 으로 호출하고, 프로젝트 env 에 **`CRON_SECRET`** 이 있으면 `Authorization: Bearer <CRON_SECRET>` 을 자동으로 붙인다 — 라우트(`$lib/server/cron` rejectCron)가 이 헤더(또는 `x-cron-secret`)를 상수 시간 비교로 검사하고, env 가 없으면 503(실행 안 함). Hobby 플랜은 크론이 하루 1회로 제한되므로 팀 `weglow-team` 이 Pro 인지 확인(대시보드 → sellery-shop → Settings → Cron Jobs 에 두 잡이 보이고 마지막 실행 로그가 200 이면 정상).

| 크론 | 경로 · 스케줄 | 하는 일 |
|---|---|---|
| 캠페인 스케줄러 | `/api/cron/campaign-tick` · `5 * * * *`(매시 5분 UTC = KST 매시 5분) | 0018 `app_campaign_tick()` — SCHEDULE_CONFIRMED · `start_date ≤ 오늘(KST)` → LIVE(`went_live`) · LIVE · `end_date < 오늘` → CLEARING(`ended{due_on}`). 멱등. 정산(→ SETTLED)은 관리자. 수동: `curl https://sellery.life/api/cron/campaign-tick -H "Authorization: Bearer $CRON_SECRET"` 또는 `partner-admin.mjs tick` |
| reconcile | `/api/cron/reconcile` · `*/10 * * * *` | 아래 표의 reconcile 행과 동일(고객 세션 + 파트너 샘플 결제) |

수동 잡:

| 잡 | 방법 | 주기 |
|---|---|---|
| reconcile — CONFIRMING 고착 · `FAILED(CANCEL_PENDING)` 종결(`app-plan.md §7.5`) + **파트너 샘플 결제**(0012 `app_partner_payments_expire` · `app_partner_payments_stale` → 재조회 종결 · 응답 `partner:{expired,checked,results}`) | `curl -X POST https://sellery.life/api/cron/reconcile -H "Authorization: Bearer $CRON_SECRET"` | 크론 10분 — 수동은 결제 테스트 직후 확인용 |
| 세션 만료 — PENDING · payment_key 없는 CONFIRMING → EXPIRED | `npx supabase db query --linked "select expire_checkout_sessions()"` | 하루 1회 |
| PII 파기 — FAILED/EXPIRED 30일 경과 세션의 실명 · 연락처 · 배송지 | `npx supabase db query --linked "select purge_checkout_pii()"` | 주 1회 |
| 운영 큐 확인(부분취소 · 정산 완료 뒤 취소 등) | `select id, source, result, received_at from payment_events where handled = false order by received_at desc` | 매일 |
| 채널 인증 대기 | `partner-admin.mjs channels --pending` → bio / `@sellery.official` DM 에서 코드 확인 → `verify-channel` | 매일 |

### 8.3 Vercel 환경변수 · 재배포 주의 (2026-09-21 실측)

- **대시보드에서 SvelteKit 프로젝트의 환경변수 저장이 "Failed to verify the project's public environment variable prefix" 로 실패**할 때가 있다 → REST API(`POST /v10/projects/<project>/env?upsert=true&teamId=<team>` · 비밀은 `type: "sensitive"`) 또는 Vercel CLI(`vercel env add`)로 넣는다. 값은 셸 히스토리·문서에 남기지 않는다.
- **환경변수만 바꾼 뒤 `vercel redeploy`(또는 대시보드 Redeploy)가 CANCELED** 된다 — Ignored Build Step 의 `git diff`(`VERCEL_GIT_PREVIOUS_SHA`) 가 비어 "변경 없음" 으로 스킵하기 때문. `PUBLIC_*` 는 빌드 시 인라인이라 재빌드가 필요하므로: `PATCH /v9/projects/<project>` 로 `commandForIgnoringBuildStep` 을 잠시 비움 → redeploy → 원래 명령(§1.1 표)으로 복구. `sellery-app` 의 `exit 0` 은 복구하지 않는다(동결).
- 비밀(`SUPABASE_SERVICE_ROLE_KEY` 등)은 `$env/dynamic/private` 라 재배포 없이도 다음 요청부터 반영된다 — 재배포가 필요한 건 `PUBLIC_*` 뿐.

---

## 9. CI · 브랜치 보호

- `.github/workflows/ci.yml` — job **`프로토타입 점검`**(이름이 required check 컨텍스트): `npm ci` → `npm run check` → `npm test` → `node scripts/check-boundaries.mjs` → `npm run build`(더미 `PUBLIC_*` — 비밀 없음). 앱·패키지 PR 전부.
- `.github/workflows/web-ci.yml`(Next `web/`)은 S5 PR-11 에서 삭제됐다. required check 는 `프로토타입 점검` 하나(2026-09-21 확인).
- `main` 보호: PR 필수 · 위 check · 대화 해결 · 관리자 예외 없음. squash 병합(`gh pr merge --squash --delete-branch`).
- Vercel GitHub 연동: `main` 병합 = 4 프로젝트 Production(Ignored Build Step 으로 무관한 앱은 스킵) · PR = 앱별 Preview 댓글.

---

## 10. 배포 후 확인 (매 배포 · Production)

0. `curl -s https://sellery.life/api/health` → 200 `{"ok":true,"checks":{"supabaseAdmin":"ok","toss":"ok"}}` — 로그인 없이 서버 비밀키 2개(`SUPABASE_SERVICE_ROLE_KEY` · `TOSS_SECRET_KEY`)가 맞는 값인지 확인한다(DB HEAD 조회 1회 + 토스 존재하지 않는 결제 조회 1회). 503 이면 Vercel → `sellery-shop` Logs 의 `[health]` 줄에 원인.
1. `/` 200 — 헤더 · 푸터 · 사업자 정보 · 배경 `#eef3dc`.
2. `/s/<handle>/<code>` 200 + 응답에 `set-cookie: slry_linkctx=<code>; HttpOnly; SameSite=Lax; Secure` · `/c/<code>` → 308 정식 URL · 없는 코드 → 404.
3. `/login` → 카카오 → `/auth/callback` → `next` 복귀 · 미로그인 `/checkout` → `/login?next=`.
4. (Preview · 테스트 키) 결제창 → 성공 페이지 → 내 주문 1건 → 환불 신청 → `환불 완료` · 성공 페이지 새로고침 → 주문 중복 없음.
5. 토스 콘솔 "웹훅 테스트 전송" → 200 · `payment_events` 1행. 임의 본문 `curl -X POST …/api/payments/webhook -d '{}'` → 400 · 행 없음.
6. `/robots.txt` — `/api` `/checkout` `/account` `/login` `/auth` `/influencer` `/brand` `/admin` disallow, `/s` `/c` allow · `/brand/robots.txt` · `/admin/robots.txt` `Disallow: /`.
7. 콘솔: `/influencer/login` 200(이메일 폼 · SvelteKit) · `/influencer/signup` 200 · 미로그인 `/influencer/home` → `/influencer/login?next=%2Finfluencer%2Fhome` 302 · (콘솔을 바꿨을 때) 실제 외부 이메일로 가입 → 인증 메일(발신 `no-reply@sellery.life`) → 링크를 다른 기기에서 열어도 `/influencer/home` 에 활동명·스타터·🥬 3 · `db query` 로 `sellers`·`seller_channels`·`celery_ledger signup_bonus`·`profiles.role='seller'` 확인 · 같은 링크 재클릭 → `/influencer/login?error=expired`(행 1개 유지).
8. Vercel → `sellery-shop` · `sellery-influencer` Logs 에 `permission denied for table`(0007 미적용) · env 누락 · `CONFIG_ERROR` 없음.
