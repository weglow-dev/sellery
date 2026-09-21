# 배포 · 운영 — Vercel 프로젝트 5개 · `sellery.life`

작성 2026-09-21 (S4 PR-7 초안) · 기준 커밋 `aaac06f`(S3 완료) · 설계 원본 [`monorepo-migration.md`](monorepo-migration.md) §0 결정 2·9·10 · §1 · §6 · §7 S4~S5 · §8.

**정본 관계.** S4(도메인 전환) 부터 이 문서가 배포·운영의 정본이고 [`web/DEPLOY.md`](../web/DEPLOY.md) 는 `sellery-app`(Next, S5 까지만 남는 인플루언서 콘솔) 에 한해 참고한다. 외부 서비스의 대시보드 설정(Supabase Auth · 카카오 · 토스 위젯 · Resend SMTP · 이메일 템플릿 3종)과 DB 마이그레이션 절차는 아직 `web/DEPLOY.md §3 · §4` 에 있고 **S5 PR-11(`web/` 삭제) 에서 이 문서로 옮긴다** — 그때까지 여기서는 링크만 한다(§5 · §6). 정책·API·DB 계약은 [`app-plan.md`](app-plan.md) · [`inf-console-plan.md`](inf-console-plan.md) · [`data-model.md`](data-model.md).

값(키)은 이 문서·코드·PR 어디에도 쓰지 않는다 — 루트 `.env.local`(gitignored) 과 Vercel 프로젝트 환경변수에만. 아래 표는 **이름**만이다.

읽는 순서: §0 그림 → 도메인을 옮기는 사람은 §3 체크리스트 → 로컬 개발은 §7 → 운영은 §8.

---

## 0. 한눈에

```
브라우저 ── https://sellery.life ─────────────────────────────────────────────────────────┐
                                                                                        │
   Vercel sellery-shop (Root apps/shop · SvelteKit adapter-vercel · base '')  ← S4 부터 도메인  │
   ├─ /  /s/[handle]/[code]  /c/[code]  /login  /checkout*  /account/*  /terms  /privacy  │ SSR + +server.ts
   ├─ /auth/{callback,confirm,signout}  /api/{checkout,payments/*,cron/reconcile,health,me}  │ (콘솔의 /auth/* 착지도 여기)
   ├─ /assets/*  /email/celery.png  /favicon.svg  /robots.txt                  (static/)   │
   └─ apps/shop/vercel.json rewrites (프록시 — 브라우저 오리진은 sellery.life 그대로)          │
        /influencer, /influencer/:path*  ─→ sellery-app.vercel.app        (S4 임시 · Next 콘솔 · S5 에서 sellery-influencer 로)
        /_next/:path*                    ─→ sellery-app.vercel.app        (S4 임시 · Next 정적 자산 · S5 에서 제거)
        /brand, /brand/:path*            ─→ sellery-brand.vercel.app      (데모 · 데모 띠 · noindex)
        /admin, /admin/:path*            ─→ sellery-admin.vercel.app      (데모 · 데모 띠 · noindex)

   sellery-app        (Root web · Next 16)               ── S4~S5 사이 /influencer/* 만 · 경로 모드 · 도메인 없음
   sellery-influencer (Root apps/influencer · /influencer) ── 지금은 데모(데모 띠) · S5 에서 콘솔 SSR
   sellery-brand      (Root apps/brand · /brand)         ── 데모 SPA(ssr=false) + hooks(세션만)
   sellery-admin      (Root apps/admin · /admin)         ── 데모 SPA(ssr=false) + hooks(세션만)

   Supabase sellery (ocxppeuoiysnkwwujvko · Seoul) ── 5 프로젝트가 같은 URL · anon · service_role
   토스페이먼츠 NHN_shingoonk ── 웹훅 URL https://sellery.life/api/payments/webhook (불변 · S4 부터 shop 이 받는다)
```

세션 쿠키 `sb-ocxppeuoiysnkwwujvko-auth-token*` 은 host-only(`sellery.life`) 이고 Vercel 리라이트가 요청 헤더(쿠키 포함)와 응답 `Set-Cookie` 를 그대로 옮기므로 shop · Next 콘솔 · 데모 앱이 같은 세션을 본다(`monorepo-migration.md §1.5`). `web/` 도 같은 `@supabase/ssr` · 같은 쿠키 이름이라 S4~S5 사이 호환.

---

## 1. Vercel 프로젝트 5개 (team `weglow-team` · 저장소 `weglow-dev/sellery`)

### 1.1 설정 표

| 항목 | `sellery-app` (Next · **S5 까지**) | `sellery-shop` | `sellery-influencer` | `sellery-brand` | `sellery-admin` |
|---|---|---|---|---|---|
| 역할 | S4~S5 사이 **`/influencer/*` 만**(리라이트 대상). S4 전에는 `sellery.life` 전체 | 고객 사이트 + 도메인 루트 + 리라이트 출발점 | 데모(지금) → 콘솔(S5) | 브랜드 센터 데모 | 관리자 데모 |
| Root Directory | `web` | `apps/shop` | `apps/influencer` | `apps/brand` | `apps/admin` |
| Include source files outside of the Root Directory | off | **ON**(`packages/*` · 루트 `package-lock.json`) | ON | ON | ON |
| Framework Preset | Next.js | SvelteKit(자동) | 〃 | 〃 | 〃 |
| Install / Build | 기본(`npm install` / `next build`) | 기본 — `npm install` 은 워크스페이스 루트 · `vite build` | 〃 | 〃 | 〃 |
| Node.js Version | Vercel 기본(20.x 이상) | **22.x** | 22.x | 22.x | 22.x |
| Region | `icn1`(`web/vercel.json`) | `icn1`(`apps/shop/vercel.json` `regions` + `svelte.config.js`) | 〃 | 〃 | 〃 |
| **Domains** | S4 전: `sellery.life` · `www.sellery.life` → **S4 에서 제거**(§3.1). 뒤에는 `sellery-app.vercel.app` 만 | S4 전: 없음(`sellery-shop.vercel.app`) → **S4 부터 `sellery.life` · `www.sellery.life`(→ apex 308)** | 없음(`sellery-influencer.vercel.app` — 리라이트 대상) | 없음 | 없음 |
| Deployment Protection | Preview **Off** · Production Off | Preview **Off**(토스 `successUrl` 복귀 · 카카오 콜백 · 웹훅 테스트) · Production Off | Preview Off(콘솔 Preview 의 이메일 링크 착지) | Off | Off |
| Ignored Build Step | 설정 안 함(`web/DEPLOY.md §1` 그대로 — Root Directory `web` 밖만 바뀐 커밋을 Vercel 이 스킵하는지는 Settings → Git 에서 확인) | `git diff --quiet HEAD^ HEAD -- . ../../packages ../../package.json ../../package-lock.json` | 〃 | 〃 | 〃 |
| Git | 같은 저장소 · Production Branch `main` · PR = Preview(앱별 URL 댓글) | 〃 | 〃 | 〃 | 〃 |
| 삭제 시점 | **S5 뒤 1주**(결정 10 · A) — 그 전에 Supabase Redirect URLs 에서 `sellery-app.vercel.app/**` 제거 | — | — | — | — |

Preview 주소는 `sellery-<앱>-git-<branch>-weglow-team.vercel.app`(앱별 자기 base). shop Preview 의 리라이트는 **프로덕션** 콘솔·데모를 가리킨다(결정 H). 정적 자산(`/assets/*`)은 shop 만 응답하므로 다른 앱 Preview 에서는 이미지 대신 이모지 폴백(§1.4).

### 1.2 환경변수 (이름만 · Production + Preview 둘 다 · 비밀은 "Sensitive")

| 이름 | `sellery-app` | `sellery-shop` | `sellery-influencer` | `sellery-brand` · `sellery-admin` | 비고 |
|---|---|---|---|---|---|
| `PUBLIC_SUPABASE_URL` | (`NEXT_PUBLIC_SUPABASE_URL`) | 필수 | 필수 | 필수 | `$env/static/public` — 빌드 시 인라인. **이름이 없으면 빌드 실패**(hooks.server.ts 가 import) |
| `PUBLIC_SUPABASE_ANON_KEY` | (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) | 필수 | 필수 | 필수 | 〃 |
| `PUBLIC_SITE_URL` | (`NEXT_PUBLIC_SITE_URL` — **`https://sellery.life` 그대로 둔다**, §3.2) | **Production `https://sellery.life`** · Preview `https://sellery-shop.vercel.app` | Production `https://sellery.life`(S5) | 선택 | og · canonical · 메일 링크 절대 URL. OAuth `redirectTo` · 토스 `successUrl` 은 `window.location.origin` |
| `PUBLIC_TOSS_CLIENT_KEY` | (`NEXT_PUBLIC_TOSS_CLIENT_KEY`) | 필수 — Production `live_gck_…`(실판매 직전) · Preview `test_gck_…` | — | — | 결제위젯 연동 키. `TOSS_SECRET_KEY` 와 **짝**(gck ↔ gsk) |
| `PUBLIC_TOSS_WIDGET_VARIANT` | (`NEXT_PUBLIC_TOSS_WIDGET_VARIANT`) | 선택 | — | — | 비우면 `DEFAULT-2` |
| `PUBLIC_DEV_LOGIN` | (`NEXT_PUBLIC_DEV_LOGIN`) | Preview 선택(`1`) | — | — | 개발용 이메일 로그인 폼 — dev 또는 `VERCEL_ENV=preview` 에서만 렌더, Production 은 값이 있어도 안 뜬다 |
| `PUBLIC_DEMO` | — | — | (S5 `(demo)` 그룹 · `1`) | `1`(예약 — 지금 코드는 읽지 않는다) | `monorepo-migration.md` 결정 8 · §1.2 |
| `SUPABASE_SERVICE_ROLE_KEY` | 비밀 | **비밀** | 비밀(S5) | — | RLS 우회 — `$lib/server/env.ts` → `configureDb()` 에서만 읽는다 |
| `TOSS_SECRET_KEY` | 비밀 | **비밀** | — | — | 〃 → `configurePayments()` |
| `CRON_SECRET` | 비밀 | **비밀** | — | — | `/api/cron/reconcile` Bearer. 없으면 라우트가 503 |
| `SLACK_WEBHOOK_URL` | 선택 | 선택 | 선택(S5) | — | `/auth/confirm` 가입 알림 한 줄(이메일·핸들 없이) |

`NEXT_PUBLIC_INF_HOST` · `NEXT_PUBLIC_BRAND_HOST`(호스트 모드)는 **넣지 않는다** — 경로 모드만(결정 11). 4 SvelteKit 앱은 `kit.env.dir: '../..'` 로 로컬에서 **루트 `.env.local` 하나**를 읽는다(§7). 비밀은 `$env/dynamic/private`(런타임)라 빌드·CI 에 불필요 — 빌드가 실제 키를 요구하면 설계 위반.

---

## 2. rewrite (`apps/shop/vercel.json`)

JSON 이라 주석을 못 넣으므로 각 줄의 뜻과 시점별 값은 여기에 둔다. 규칙(`monorepo-migration.md §1.3`): shop 앱에는 `/influencer` `/brand` `/admin` `/_next` 로 시작하는 라우트를 두지 않는다 · shop `/robots.txt` 는 이 셋을 disallow(이미) · 리라이트 대상 SvelteKit 앱의 `_app/immutable/*` 은 자기 base 아래라 별도 항목이 없다.

| `source` | **S4(지금 파일)** | S5 PR-10 뒤 | 이유 |
|---|---|---|---|
| `/influencer` · `/influencer/:path*` | `https://sellery-app.vercel.app/influencer…` | `https://sellery-influencer.vercel.app/influencer…` | 결정 10 — 서비스 중인 Next 콘솔이 S4 에서 끊기지 않게. 리라이트를 통과한 Next 는 host `sellery-app.vercel.app` 을 보고 **경로 모드**로 동작한다(`web/src/proxy.ts` 규칙 3 이 `*.vercel.app` 이면 308 을 건너뛴다) |
| `/_next/:path*` | `https://sellery-app.vercel.app/_next/:path*` | **삭제** | Next 는 정적 자산(`/_next/static/*` — JS 청크 · CSS · `next/font` 파일)을 **도메인 루트**에서 찾는다(`web/next.config.ts` 에 `assetPrefix`/`basePath` 없음). 이 줄이 없으면 도메인 이동 순간 콘솔이 스타일 없이 뜨고 하이드레이션·서버 액션이 깨진다. SvelteKit shop 에 `/_next` 라우트는 없으므로 충돌 없음. **`monorepo-migration.md §1.3` 표에 없던 항목**(PR-7 에서 추가) |
| `/brand` · `/brand/:path*` | `https://sellery-brand.vercel.app/brand…` | 같음 | 결정 D — S4 부터 데모 노출(데모 띠 + `noindex` + `/brand/robots.txt` disallow) |
| `/admin` · `/admin/:path*` | `https://sellery-admin.vercel.app/admin…` | 같음 | 〃 |

콘솔이 도메인 루트에서 쓰는 경로는 리라이트 없이 **shop 의 SvelteKit 포트**가 받는다(1:1 이식 — 결정 15): 가입 메일 착지 `GET /auth/confirm?token_hash=…&type=signup&next=/influencer/home`(파트너면 `createSellerFromSignup` 뒤 `/influencer/home` 302) · 콘솔 로그아웃 폼 `POST /auth/signout?next=/influencer/login`(303 `next`) · `/api/health`. S5 에서 콘솔 전용 사본 `/influencer/auth/{confirm,signout}` 이 생긴다.

---

## 3. 도메인 전환 절차 (S4 — `monorepo-migration.md §1.6` 의 실행 체크리스트)

코드는 이 PR(PR-7) 로 끝나고, 아래는 **대시보드·CLI 작업**이다. 순서대로. 한 사람이 30분 안에 끝나며, 6 의 롤백은 1분.

### 3.0 사전 준비 (PR-7 병합 뒤 · 도메인 이동 **전**)

- [ ] PR-7 병합 → `sellery-shop` Production 배포 성공(Vercel Deployments 초록). `sellery-brand` · `sellery-admin` · `sellery-influencer` 도 데모 띠가 든 배포가 Production 인지(`https://sellery-brand.vercel.app/brand/` 맨 위 띠).
- [ ] `sellery-shop` **Production 환경변수** 확정(§1.2 표): `PUBLIC_SITE_URL=https://sellery.life` · `PUBLIC_SUPABASE_*` · `SUPABASE_SERVICE_ROLE_KEY` · `PUBLIC_TOSS_CLIENT_KEY`/`TOSS_SECRET_KEY`(실판매 전까지 **테스트 짝** — `web/DEPLOY.md §3.3` 그대로) · `CRON_SECRET`. `PUBLIC_*` 를 바꿨으면 **Redeploy**(빌드 시 인라인).
- [ ] `sellery-shop.vercel.app` 에서 S3 검증 (c)~(g) 를 다시: `curl -s https://sellery-shop.vercel.app/api/health` → 200 `{"ok":true,…}` · `curl -sI https://sellery-shop.vercel.app/account/orders` 에 `cache-control: private, no-store` · 토스 테스트 상점 "웹훅 테스트 전송"(URL `https://sellery-shop.vercel.app/api/payments/webhook`) → 200 + `payment_events` 1행.
- [ ] 리라이트 통과 확인(도메인 없이도 된다): `curl -sI https://sellery-shop.vercel.app/influencer/login` → 200 이고 응답이 Next(`x-powered-by: Next.js` 또는 본문에 `/_next/`) · `curl -sI https://sellery-shop.vercel.app/influencer/home` → 302 `location: /influencer/login?next=%2Finfluencer%2Fhome`(Next 콘솔 게이트 · 경로 모드) · 그 HTML 이 참조하는 `/_next/static/...` 하나를 `curl -sI https://sellery-shop.vercel.app/_next/static/<경로>` → 200 · `curl -sI https://sellery-shop.vercel.app/brand/` 와 `/admin/` → 200(SvelteKit) · `/brand/robots.txt` → `Disallow: /`.
- [ ] Supabase → Authentication → URL Configuration: Site URL `https://sellery.life` · Redirect URLs 에 `https://sellery.life/**` · `https://sellery-shop.vercel.app/**` · `https://*-weglow-team.vercel.app/**` · `https://sellery-app.vercel.app/**`(S5 뒤 1주까지) 전부 있는지 — **이미 있으면 변경 없음**.
- [ ] 토스 웹훅 URL 은 **`https://sellery.life/api/payments/webhook` 그대로**(테스트 · 라이브 상점) — 호스트가 같으므로 바꿀 것이 없고, 도메인이 옮겨지는 순간부터 shop 이 받는다(§8.3 "웹훅 URL 불변").
- [ ] 로컬에 Vercel CLI 로그인(`vercel whoami` → weglow-team) — 인증서가 멈출 때 `vercel certs issue` 용.

### 3.1 Vercel Domains 이동 (`sellery-app` → `sellery-shop`)

같은 팀 안의 이동이라 **DNS 는 손대지 않는다**(호스팅케이알 `@` · `www` 의 `A 76.76.21.21` 그대로 — `web/DEPLOY.md §6`).

- [ ] Vercel → `sellery-app` → Settings → Domains → `www.sellery.life` **Remove** → `sellery.life` **Remove**. (제거 순간부터 `sellery.life` 는 어느 프로젝트에도 없어 Vercel 404 — 다음 단계까지 1~2분 공백. 트래픽이 있는 시간대를 피한다.)
- [ ] Vercel → `sellery-shop` → Settings → Domains → **Add** `sellery.life` → Add `www.sellery.life` → `www` 는 "Redirect to `sellery.life`"(308). Vercel 이 "Valid Configuration" 을 보이면 끝.
- [ ] 인증서가 "being generated" 에서 멈추면 `vercel certs issue sellery.life www.sellery.life --scope weglow-team`.
- [ ] `sellery-app` 은 도메인 없이 `sellery-app.vercel.app` 으로 계속 배포된다 — 건드리지 않는다(리라이트 대상 · 롤백 대상).

### 3.2 환경변수 확인 (이동 뒤)

- [ ] `sellery-shop` Production `PUBLIC_SITE_URL` 이 `https://sellery.life` 인지(3.0 에서 확정) — 아니면 고치고 Redeploy.
- [ ] `sellery-app` 의 `NEXT_PUBLIC_SITE_URL` 은 **`https://sellery.life` 그대로 둔다**: Next 콘솔이 만드는 절대 URL(`emailRedirectTo` 는 `window.location.origin` 이라 어차피 `sellery.life`) 과 `proxy.ts` 의 `customerHost` 판정은 바뀌지 않아야 하고, 리라이트된 요청의 host 는 `sellery-app.vercel.app` 이라 규칙 3(308)이 건너뛴다.

### 3.3 Supabase

- [ ] URL Configuration 은 3.0 에서 확인한 대로 **변경 없음**(`https://sellery.life/**` 가 이미 있다). 콘솔 가입 메일의 `RedirectTo` 는 `https://sellery.life/auth/confirm?next=…` — S4 부터 shop 의 `/auth/confirm` 이 받는다(§2 마지막 단락).
- [ ] 카카오 개발자 앱 Redirect URI 는 Supabase 콜백(`…supabase.co/auth/v1/callback`) 이라 **무관**.

### 3.4 토스페이먼츠

- [ ] 웹훅 URL 변경 없음(3.0). 이동 뒤 토스 콘솔 "웹훅 테스트 전송" 1회 → Vercel `sellery-shop` Logs 에 `/api/payments/webhook` 200 · `payment_events` 1행.
- [ ] 실판매 시점이면 Production 에 **라이브 짝**(`live_gck_` + `live_gsk_`) — 둘을 함께, Redeploy.

### 3.5 확인 (curl · 브라우저)

| 확인 | 명령 | 기대 |
|---|---|---|
| 도메인이 shop | `curl -sI https://sellery.life/` | 200 · `x-vercel-id` 있음 · `x-powered-by: Next.js` **없음**(SvelteKit) · `www.sellery.life` → 308 `https://sellery.life/` |
| 헬스 | `curl -s https://sellery.life/api/health` | 200 `{"ok":true,"checks":{"supabaseAdmin":"ok","toss":"ok"}}` — 503 이면 Logs `[health]` |
| 판매 링크 | `curl -sD - -o /dev/null https://sellery.life/s/jiyu_beauty/c1` · `curl -sI https://sellery.life/c/c1` | 200 + `set-cookie: slry_linkctx=c1; …HttpOnly; SameSite=Lax; Secure` · `/c/c1` → 308 |
| 캐시 헤더 | `curl -sI https://sellery.life/account/orders` | `cache-control: private, no-store` |
| robots | `curl -s https://sellery.life/robots.txt` | `/api/` `/checkout` `/account` `/login` `/auth/` `/influencer` `/brand` `/admin` disallow · `/s/` `/c/` allow |
| 콘솔(Next) | `curl -sI https://sellery.life/influencer/login` · `curl -sI https://sellery.life/influencer/home` | 200(Next) · 302 `/influencer/login?next=%2Finfluencer%2Fhome` |
| 콘솔 자산 | 브라우저로 `https://sellery.life/influencer/login` — 스타일이 입혀지고 폼이 동작(DevTools Network 에 `/_next/static/*` 200) | `/_next` 리라이트(§2) 확인 |
| 콘솔 로그인 | 파트너 계정으로 로그인 → `/influencer/home` · 마이페이지 · 로그아웃(`POST /auth/signout?next=/influencer/login` → 303) | 같은 브라우저에서 `sellery.life/` 고객 홈 persona 가 **로그아웃 상태가 아님**(같은 세션 — web 경로 모드와 동일 · 콘솔 `foreign` 안내로 이어짐) |
| 카카오 → 결제 | `/login` 카카오 → `next` 복귀 → LIVE 캠페인 `구매하기` → 테스트 결제 1건 → `/checkout/success` → `/account/orders` 1건 → 환불 → `환불 완료` | `app-plan §11.3` |
| 데모 | `curl -sI https://sellery.life/brand/` · `/admin/` · `curl -s https://sellery.life/brand/robots.txt` | 200(SvelteKit) + 맨 위 **데모 띠** · 응답 HTML 에 `<meta name="robots" content="noindex, nofollow">` · robots `Disallow: /` |
| 세션 공유 | 콘솔 로그인 뒤 DevTools `document.cookie` 에 `sb-ocxppeuoiysnkwwujvko-auth-token` · 로그아웃 뒤 고객 홈 persona 즉시 해제 | `§8.3` 쿠키 공유 |
| 로그 | Vercel `sellery-shop` Logs 5분 | `permission denied` · env 누락 · `CONFIG_ERROR` 없음 |

### 3.6 롤백

- [ ] `sellery-shop` Domains 에서 `sellery.life` · `www.sellery.life` Remove → `sellery-app` Domains 에 Add(1분). `web/` 는 S5 까지 그대로 배포되고 있어 즉시 이전 상태. DB 는 변경이 없으니 되돌릴 것이 없다.
- [ ] shop 앱 자체의 문제면 도메인은 두고 Vercel → `sellery-shop` → Deployments → 이전 배포 "Promote to Production"(Instant Rollback).

### 3.7 전환 뒤 정리 (같은 날)

- [ ] README "현재 서비스 상태" · CLAUDE.md 같은 절 · 이 문서 §0 의 `<!-- S4 -->` 로 표시한 "S4 완료 전에는 …" 문장 삭제 PR.
- [ ] `web/DEPLOY.md §6` 도메인 표는 손대지 않는다(S5 PR-11 에서 문서째 정리).

---

## 4. S5 이후 바뀌는 것 (참고 — 이 PR 범위 밖)

| 시점 | 변경 | 근거 |
|---|---|---|
| S5 PR-10 | `apps/shop/vercel.json` `/influencer*` → `sellery-influencer.vercel.app` · `/_next/:path*` 줄 **삭제** | `monorepo-migration.md §7 S5` |
| S5 PR-11 | `web/` 삭제 · `.github/workflows/web-ci.yml` 삭제 · `web/DEPLOY.md §3 · §4 · §6` 을 이 문서 §5 · §6 으로 이동 · `web/emails/*` → `docs/emails/` | 결정 J · K |
| PR-11 병합 **직후** | `main` 보호 규칙 required check 에서 `web-ci` 제거(먼저 하면 PR-11 이 영원히 대기) | §7 S5 |
| S5 뒤 1주 | Vercel `sellery-app` 프로젝트 삭제 · Supabase Redirect URLs 에서 `sellery-app.vercel.app/**` 제거 | 결정 10 · A |

---

## 5. 외부 서비스 (대시보드) — S5 PR-11 까지 `web/DEPLOY.md §3`

이름만 여기 두고 절차는 `web/DEPLOY.md` 의 해당 절을 따른다(S4 로 바뀌는 것은 없다 — 전부 `sellery.life` 호스트 기준이라 프로젝트 이동과 무관):

- Supabase `sellery`(`ocxppeuoiysnkwwujvko`) — Kakao provider · URL Configuration · 키 → `§3.1`. 파트너 이메일 인증(Email provider · Custom SMTP Resend · 템플릿 3종 token_hash) → `§3.5`.
- 카카오 개발자 앱 — Redirect URI = Supabase 콜백 · 동의 항목 → `§3.2`.
- 토스페이먼츠 `NHN_shingoonk` — 결제위젯 연동 키 짝 · 위젯 설정(가상계좌·계좌이체 비활성) · 웹훅 URL(`https://sellery.life/api/payments/webhook`) · Vercel Firewall 레이트리밋 · 운영 규칙(부분취소 금지) → `§3.3`.
- 다음 우편번호 API(`t1.daumcdn.net`) → `§3.4`.

---

## 6. 데이터베이스 — S5 PR-11 까지 `web/DEPLOY.md §4`

- 마이그레이션은 저장소 루트 `supabase/migrations/0001~0010`(클라우드 적용 완료). 변경은 **새 번호**로 → PR → 병합 → 링크된 PC 에서 `npx supabase db push --linked` → **`npm run gen:types`(루트 — `packages/db/scripts/gen-types.mjs` → `packages/db/src/database.types.ts`)** → `npm run check` → 같은 PR. 절차·주의는 `web/DEPLOY.md §4.1` · `data-model.md §8 · §10`.
- **DB 마이그레이션은 앱 배포보다 먼저**, 컬럼 삭제는 앱이 안 쓰게 된 **다음**.
- 적용 후 스모크(anon 가시성 · 0008 함수 grant) → `web/DEPLOY.md §4.2`.

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
| 인플루언서 | `npm run dev:influencer` | http://localhost:5173/influencer | 데모(데모 띠) · `/influencer/robots.txt` |
| 브랜드 | `npm run dev:brand` | http://localhost:5174/brand | 데모(데모 띠) · `/brand/robots.txt` |
| 관리자 | `npm run dev:admin` | http://localhost:5175/admin | 데모(데모 띠) · `/admin/robots.txt` · [데이터 초기화] |

포트는 `apps/*/vite.config.ts` 의 `strictPort`. 개발 서버는 포트가 달라 localStorage 가 앱별로 분리되고, 다른 앱 링크(`/influencer/…`)는 shop dev 서버에 없으니 위 포트로 직접 연다. 공용 이미지·파비콘(`/assets/*` `/favicon.svg` `/email/*`)은 `apps/shop/static/` 한 곳 — `scripts/vite-root-assets.mjs` 가 4 앱 dev 서버에서 서빙.

**`.env.local`(루트 하나 · gitignored)** — 4 앱이 `kit.env.dir: '../..'` 로 읽는다. `vercel env pull` 은 앱 폴더가 아니라 루트로(`vercel env pull ../../.env.local`; `apps/<앱>/.env.local` 은 읽히지 않는다).

| 이름 | 로컬 | 비고 |
|---|---|---|
| `PUBLIC_SUPABASE_URL` · `PUBLIC_SUPABASE_ANON_KEY` | 비워도 됨(이름은 필수) | 비면 데모 4 앱은 Supabase 없이 뜨고, shop 은 빈 목록 |
| `PUBLIC_SITE_URL` | 비우면 `http://localhost:5176` | |
| `PUBLIC_TOSS_CLIENT_KEY` | `test_gck_…`(이름 필수) | |
| `PUBLIC_TOSS_WIDGET_VARIANT` · `PUBLIC_DEV_LOGIN` | 선택 | `PUBLIC_DEV_LOGIN=1` 이면 `/login` 에 개발용 이메일 폼(dev 만) — 계정은 §8 `dev-user.mjs` |
| `SUPABASE_SERVICE_ROLE_KEY` · `TOSS_SECRET_KEY` · `CRON_SECRET` · `SLACK_WEBHOOK_URL` | 결제·가입을 눌러볼 때만 | 런타임 비밀 — check·build 에 불필요 |

카카오 로그인은 Supabase Redirect URLs 에 `http://localhost:5176/**` 가 있어야 한다. 웹훅을 로컬에서 받으려면 터널(`npx cloudflared tunnel --url http://localhost:5176`) — `app-plan.md §11.4`. 시드 기준 오늘(KST) LIVE 캠페인이 있어야 결제까지 눌러볼 수 있다(`supabase/seed.sql` 상대 날짜 절).

> **Windows**: `npm run build` 는 adapter-vercel 이 `.vercel/output` 안에 심링크를 만들어 `EPERM` 으로 실패할 수 있다 — 설정 → 개발자 모드(개발자용 → "개발자 모드") 를 켜거나 관리자 터미널, 또는 WSL 에서 빌드. CI(ubuntu) · Vercel 은 영향 없고 `npm run check` · `npm test` · `npm run dev:*` 는 Windows 에서 그대로 된다. 줄바꿈은 `.gitattributes` 가 LF 로 강제.

---

## 8. 운영 스크립트 · 수동 잡

전부 **저장소 루트**에서 실행하고 루트 `.env.local`(`PUBLIC_SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` · 스크립트에 따라 `PUBLIC_SITE_URL`)을 읽는다. 값은 출력하지 않는다. 파일 머리 주석이 사용법의 정본.

| 스크립트 | 용도 | 예 |
|---|---|---|
| `packages/db/scripts/partner-admin.mjs` | 인플루언서 운영(관리자 화면 없음) — `list [--inactive]` · `suspend <seller> ["사유"]` · `reactivate` · `link <seller> <user_id>` · `invite <email> --link <seller>`(초대 메일 → `${PUBLIC_SITE_URL}/influencer/auth/confirm?next=/influencer/password/new` — S5 전에는 Next 콘솔 착지) · `channels [--pending]` · `verify-channel <ch>` · `unverify-channel`. production 허용 | `node packages/db/scripts/partner-admin.mjs channels --pending` |
| `packages/db/scripts/dev-seller.mjs` | 개발용 인플루언서 계정(확인 완료) + 시드 `sellers` 행 연결. **production 거부** | `node packages/db/scripts/dev-seller.mjs --email dev-seller@sellery.test --seller s1` |
| `packages/db/scripts/dev-user.mjs` | 개발용 고객 이메일/비밀번호 계정(`PUBLIC_DEV_LOGIN=1` 폼용) | `node --env-file=.env.local packages/db/scripts/dev-user.mjs <email> <password>` |
| `packages/db/scripts/gen-types.mjs` | Supabase 타입 → `packages/db/src/database.types.ts`(UTF-8 · LF). `supabase link` 전제 | `npm run gen:types` |

수동 잡(슬라이스 1 — 크론 없음 · `web/DEPLOY.md §4.3` 과 같음, 호스트만 `sellery.life`):

| 잡 | 방법 | 주기 |
|---|---|---|
| reconcile — CONFIRMING 고착 · `CANCEL_PENDING` 종결 | `curl -X POST https://sellery.life/api/cron/reconcile -H "Authorization: Bearer $CRON_SECRET"` | 결제 테스트 뒤 · 하루 1회 |
| 세션 만료 | `npx supabase db query --linked "select expire_checkout_sessions()"` | 하루 1회 |
| PII 파기 | `npx supabase db query --linked "select purge_checkout_pii()"` | 주 1회 |
| 운영 큐 | `select id, source, result, received_at from payment_events where handled = false order by received_at desc` | 매일 |
| 채널 인증 대기 | `partner-admin.mjs channels --pending` → bio / `@sellery.official` DM 에서 코드 확인 → `verify-channel` | 매일 |

---

## 9. CI · 브랜치 보호

- `.github/workflows/ci.yml` — job **`프로토타입 점검`**(이름이 required check 컨텍스트): `npm ci` → `npm run check` → `npm test` → `node scripts/check-boundaries.mjs` → `npm run build`(더미 `PUBLIC_*` — 비밀 없음). 앱·패키지 PR 전부.
- `.github/workflows/web-ci.yml` — job **`web-ci`**(`web/` Next): S5 PR-11 까지 required. 제거 시점은 §4.
- `main` 보호: PR 필수 · 위 두 check · 대화 해결 · 관리자 예외 없음. squash 병합(`gh pr merge --squash --delete-branch`).
- Vercel GitHub 연동: `main` 병합 = 5 프로젝트 Production(Ignored Build Step 으로 무관한 앱은 스킵) · PR = 앱별 Preview 댓글.

---

## 10. 배포 후 확인 (매 배포 · Production)

0. `curl -s https://sellery.life/api/health` → 200 `{"ok":true,…}`.
1. `/` 200 — 헤더 · 푸터 · 사업자 정보 · 배경 `#eef3dc`.
2. `/s/<handle>/<code>` 200 + `slry_linkctx` 쿠키 · `/c/<code>` 308 · 없는 코드 404.
3. `/login` → 카카오 → `next` 복귀 · 미로그인 `/checkout` → `/login?next=`.
4. (Preview · 테스트 키) 결제 → 성공 페이지 → 내 주문 → 환불 → `환불 완료` · 성공 페이지 새로고침 → 중복 없음.
5. 토스 "웹훅 테스트 전송" → 200 · `curl -X POST …/api/payments/webhook -d '{}'` → 400.
6. `/robots.txt` · `/brand/robots.txt` · `/admin/robots.txt` 내용(§3.5).
7. `/influencer/login` 200 · `/influencer/home` 302(S5 전 Next · S5 뒤 SvelteKit — 응답 헤더로 구분).
8. Vercel Logs — `permission denied for table`(0007 미적용) · env 누락 · `CONFIG_ERROR` 없음.
