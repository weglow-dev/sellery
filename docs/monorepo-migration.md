# 이식 계획 — `web/`(Next) 의 서비스 기능을 `apps/*`(SvelteKit 모노레포) 로

작성 2026-09-18 · 기준 커밋 `fb17f5a`(`main`) · 사용자 결정 2026-09-18: **같은 저장소 · SvelteKit 앱 4개 + 한 도메인 경로 rewrite · 하나의 Supabase · 기존 기능·UI/UX 동일 유지 · 순서 골격 → shop 동일 재현 → 인플루언서 → 브랜드 → 관리자 · `sellery.life` 는 apps/shop 이 같은 수준이 될 때까지 `web/` 가 계속 서비스.**

이 문서는 **어디로 어떻게 옮기는가**만 다룬다. 정책·API·DB 계약의 원본은 `docs/app-plan.md`(고객 사이트) · `docs/inf-console-plan.md`(인플루언서 콘솔) · `web/DEPLOY.md`(현 배포) 이고 그대로 유지한다(결정 J). 여기 적힌 파일 경로·시그니처는 전부 2026-09-18 의 코드(`web/src/**` · `apps/**` · `packages/**` · `node_modules/@supabase/ssr@0.12.7` · `node_modules/@sveltejs/kit@2.70.3`)를 읽고 쓴 것이다.

읽는 순서: §0 결정 → §7 단계 → 자기 파티션(§9)의 절.

---

## 0. 결정 요약

| # | 결정 | 근거 |
|---|---|---|
| 1 | **배포 = 앱별 `@sveltejs/adapter-vercel` + Vercel 프로젝트 4개** `sellery-shop` `sellery-influencer` `sellery-brand` `sellery-admin`(Root Directory 각 앱 폴더 · "Include source files outside of the Root Directory" ON). `adapter-static` 은 버린다. | 결제 승인·Supabase SSR·웹훅은 서버 라우트(`+server.ts`)가 필요하다. 지금의 `scripts/build.mjs`(정적 4개를 `dist/` 하나로) 는 서버 함수를 담을 수 없다. 한 프로젝트에 SvelteKit 앱 4개를 넣는 방법은 없다(Build Output 1개 = 앱 1개). |
| 2 | **한 도메인 = `sellery.life` 는 `sellery-shop` 이 받고, shop 의 `apps/shop/vercel.json` `rewrites` 가 `/influencer/*` `/brand/*` `/admin/*` 를 각 프로젝트의 프로덕션 URL 로 프록시**(§1.3). `apps/shop` 의 `paths.base` 는 `''`(루트) 로 바뀐다(지금 `/shop`). | 브라우저에는 항상 `sellery.life` 한 오리진 → 세션 쿠키(host-only) 4 앱 공유(결정 I). 고객 URL(`/`, `/s/…`, `/c/…`, `/checkout`, `/account/…`, `/auth/*`, `/api/*`) 은 지금 `web/` 과 **한 글자도 다르지 않다**. |
| 3 | S1 에서 제거: `scripts/build.mjs` · `scripts/serve-dist.mjs` · `hub/` · 루트 `vercel.json` · `api/auth/kakao.js`. `scripts/vite-root-assets.mjs` 는 dev 전용으로 남고 DIR 를 `apps/shop/static` 으로 바꾼다. 루트 `assets/` 와 `web/public/*` 는 **`apps/shop/static/`** 한 곳으로 모은다(`/assets/*` `/email/celery.png` `/favicon.svg` — URL 불변). | 정적 자산은 도메인 루트(`/assets/…`)로 참조되므로 루트를 받는 shop 프로젝트가 서빙한다. 다른 앱은 프로덕션(같은 도메인)에서 그대로 보이고, 앱별 Preview URL 에서는 이미지 대신 이모지 폴백(§1.4 — 결정 H 와 같은 성격의 수용). 허브는 README "로컬 개발" 절의 포트 표로 대체. |
| 4 | **패키지 경계**: `packages/db`(Supabase 클라이언트 · auth · campaign · orders · customers · linkctx · legal · company · partner) · `packages/payments`(toss · checkout-sync · money · checkout-rules) 를 새로 만들고, `packages/core` 는 `constants` `util` `icons` `types` 만 공용 — 데모 상태(`state.svelte` · `actions` · `seed` · `storage` · `ui.svelte` · `helpers`)는 brand·admin 이식 때까지 **데모 전용**(SSR 앱의 `+page.svelte`·`+*.server.ts` 에서 import 금지). `packages/ui` 에는 props-only 사이트 컴포넌트(`src/site/**`)와 `css/site.css` 를 추가하고 기존 데모 modals/views 는 유지(§3). | `@sellery/core` 의 `S` 는 **모듈 수준 `$state` 싱글턴**으로 import 즉시 `loadData()`(localStorage/시드) 가 돈다(`packages/core/src/state.svelte.ts` L27-38). SSR 에서 이 모듈을 건드리면 서버 프로세스마다 시드가 만들어지고 요청 간 상태가 샌다. |
| 5 | **서버 전용 표시 = `packages/*/src/server/<name>.server.ts` + 패키지 `exports` `./server/*` + 앱의 `$lib/server/*.ts` 배럴 + `scripts/check-boundaries.mjs`**(§3.3). | SvelteKit 의 가드(`node_modules/@sveltejs/kit/src/exports/vite/index.js` L729-741)는 `*.server.*` 파일을 **앱 cwd 안**에서만 서버 전용으로 본다(`is_internal`) — 워크스페이스 패키지 파일은 검사 대상이 아니다. `$lib/server/` 는 항상 가드되므로 앱은 그 배럴을 통해서만 서버 모듈을 쓴다. `import "server-only"` 의 대체다. |
| 6 | **인증 = `@supabase/ssr` 의 SvelteKit 패턴**(§2): 앱마다 `src/hooks.server.ts` 에서 `createServerClient(url, anon, { cookies: { getAll, setAll } })` 1회 → `event.locals.supabase` · `event.locals.safeGetSession()`; 브라우저는 `createBrowserClient` 를 로그인 화면에서만. `cookieOptions` 미지정(host-only, 결정 I). | Next 의 `proxy.ts`/`lib/supabase/middleware.ts` 와 같은 자리(요청마다 세션 회전)가 SvelteKit 에서는 `hooks.server.ts` 다. |
| 7 | **apps/shop = `web/src/app/(customer)/**` + `api/**` + `auth/**` 1:1**(§4). 프로토타입 전용 화면 `cart` `influencers` `about` 은 S2 에서 제거(결정 B). | 결정 "기존 기능·UI/UX 동일 유지" 의 기준은 **지금 서비스 중인 sellery.life(`web/`)** 다. |
| 8 | **apps/influencer = 콘솔 1~2단계 라우트**(login · signup · verify-sent · password · password/new · apply · home · my · suspended · `auth/{confirm,signout}`) + 기존 데모 화면은 `(demo)` 라우트 그룹(dev·`PUBLIC_DEMO=1` 에서만, 결정 C). 서버 액션은 SvelteKit form actions 로(§5). | |
| 9 | **brand · admin 은 데모 유지** + `hooks.server.ts`(세션만) + S4 부터 프로덕션 경로에 노출(`noindex` + 데모 띠, 결정 D). | |
| 10 | **S4(도메인 전환) 에서 `/influencer/*` 는 임시로 `sellery-app`(Next) 로 리라이트**하고, S5(콘솔 이식) 에서 `sellery-influencer` 로 바꾼다. `web/` 삭제와 `web-ci.yml` 제거는 **S5 뒤**, `sellery-app` 프로젝트 삭제는 그 뒤 1주. | 사용자 순서(shop → 인플루언서)를 지키면서 이미 서비스 중인 콘솔(`sellery.life/influencer/*`)이 S4 에서 끊기지 않게 한다 — 결정 A 의 "S4 뒤 1주" 는 §0 표의 A 행대로 "S5 뒤 1주" 로 고치기를 권한다. |
| 11 | **환경변수**: `NEXT_PUBLIC_*` → `PUBLIC_*`(`$env/static/public`, 빌드 시 인라인 · CI 는 더미), 비밀은 `$env/dynamic/private`(런타임 · 빌드에 불필요). 4 앱이 `kit.env.dir: '../..'` 로 **루트 `.env.local` 하나**를 읽는다. `NEXT_PUBLIC_INF_HOST`/`BRAND_HOST`(호스트 모드)는 폐기 — 경로 모드만. | `web-ci.yml` 의 원칙("빌드가 실제 키를 요구하면 설계 위반")을 그대로 잇는다. |
| 12 | **CSS**: `web/src/app/globals.css` 를 `packages/ui/css/site.css` 로 옮겨 shop·influencer(콘솔)가 쓰고, brand·admin 데모는 `theme.css`(legacy base+skin) 를 유지. 폰트는 `app.html` 의 Google Fonts `<link>`(결정 G) — shop·콘솔은 Galmuri 를 적재하지 않는다(`web/` 와 동일). | `globals.css` 는 `theme.css` 에 없는 클래스 30개(`console-*` 19 · `legal*` 4 · `site-footer` `site-main` `skip` `store-body` `total-v`)를 갖고 토큰 값도 다르다(`--color-surface #ffffff` vs `#f8faee`). 두 파일을 합치면 데모 화면이 바뀐다 — 통일은 brand/admin 이식 때. |
| 13 | **테스트 = vitest, 순수 규칙만**(결정 E): `packages/db` 의 `safeNext` `linkCtxFromCard` `custVisible` `order-status` `campaign` `signup-rules`, `packages/payments` 의 `checkout-rules` `money`. 브라우저·결제 시나리오는 사람이(§8). | |
| 14 | **Node 22**(결정 F): CI `node-version: '22'`(이미), Vercel 프로젝트 Node 22.x, `adapter-vercel({ runtime: 'nodejs22.x' })`, 루트 `engines.node: '>=22'`. | |
| 15 | **auth 라우트 소유**: shop 이 `/auth/{callback,confirm,signout}` 를 1:1 로 갖고, influencer 는 콘솔 전용 사본 `/influencer/auth/{confirm,signout}` 를 갖는다(가입 메일 `emailRedirectTo` 는 `${origin}/influencer/auth/confirm?next=…`). | 앱별 Preview 가 자족한다(콘솔 Preview 에서 가입·로그아웃이 되려면 같은 오리진에 라우트가 있어야 한다 — SvelteKit 은 다른 오리진의 form POST 를 403 으로 막는다). 이메일 템플릿은 `{{ .RedirectTo }}` 를 쓰므로 바꿀 것이 없다(결정 K). |

### 사용자가 결정해야 하는 것

| 항목 | 권장 | 이유 | 결정 전 진행 |
|---|---|---|---|
| **A** Vercel 프로젝트 4개 이름 · `sellery-app` 삭제 시점 | `sellery-shop` `sellery-influencer` `sellery-brand` `sellery-admin`. `sellery-app` 삭제는 **S5 뒤 1주**(S4 뒤가 아니라 — 결정 10) | 이름은 §1.3 리라이트 대상 URL(`https://sellery-<app>.vercel.app`)에 박힌다. S4~S5 사이에는 `sellery-app` 이 `/influencer/*` 를 계속 받는다 | S1 착수 전 필요(프로젝트 생성은 사용자 몫, §7 S1) |
| **B** shop 의 프로토타입 전용 화면(`cart` `influencers` `about`) | S2 에서 제거 | `web/` 에 없는 화면 — "동일 유지" 기준 밖. 장바구니 없이 `구매하기`(full width) 가 현행 | 가능(S1 은 손대지 않음) |
| **C** influencer 데모 화면 | `(demo)` 라우트 그룹, dev 와 `PUBLIC_DEMO=1` 에서만 | 콘솔 3단계(상품 갤러리 · 캠페인)를 만들 때 원본 화면을 옆에 두고 옮길 수 있다 | 가능 |
| **D** brand · admin 프로덕션 노출 시점 | S4 부터 `sellery.life/brand` `sellery.life/admin` — `noindex` + 상단 데모 띠("데모 데이터 · 이 브라우저에만 저장") | 프로토타입 데모 URL(제안서 PDF 의 옛 저장소 주소는 그대로 유지) 대체 | 가능(S4 리라이트 표에 넣을지만 결정) |
| **E** 테스트 | vitest, 순수 규칙만 | 결제·세션은 실키 없이 검증 불가 — 사람 시나리오(§8.2) | 가능 |
| **F** Node | 22 | CI 가 이미 22, Vite 8 · TS 6 · svelte-check 4.7 모두 22 지원 | 가능 |
| **G** 폰트 | `app.html` Google Fonts `<link>` 유지(IBM Plex Sans KR 300–700 · Plex Mono 400/500/700 · Archivo 500–900) | `next/font` 셀프호스트(`web/src/app/fonts.ts`)는 Next 전용. 시각 차이는 폰트 파일 출처뿐 | 가능 |
| **H** shop Preview 의 콘솔 링크 | 프로덕션(`https://sellery.life/influencer/…`)으로 — 수용 | shop Preview 의 `vercel.json` 리라이트는 프로덕션 콘솔을 가리킨다. Preview 마다 콘솔 Preview 를 짝짓는 것은 리라이트를 브랜치별로 바꾸는 일이라 하지 않는다 | 가능 |
| **I** 쿠키 | host-only(`cookieOptions` 미지정) | `docs/inf-console-plan.md` 결정 10. 경로 모드 + 리라이트라 브라우저 오리진이 하나 | 가능 |
| **J** 설계서 | `docs/app-plan.md` · `docs/inf-console-plan.md` · `web/DEPLOY.md` 유지(이 문서가 "위치 변경" 만 덧붙임). `web/` 삭제 시 `DEPLOY.md` 는 `docs/deploy.md` 로 이동 | 계약(§6·§7 표)이 그대로 유효하다 | 가능 |
| **K** 메일 템플릿 · 로고 | `web/emails/*` → `docs/emails/`, `web/public/email/celery.png` → `apps/shop/static/email/celery.png`(URL `https://sellery.life/email/celery.png` 불변) | Supabase 대시보드에 붙여넣는 원본은 코드가 아니라 문서 | 가능 |

---

## 1. 배포 토폴로지

### 1.1 그림

```
브라우저 ── https://sellery.life ──────────────────────────────────────────────┐
                                                                            │
   Vercel 프로젝트 sellery-shop (Root apps/shop · adapter-vercel · base '')    │
   ├─ /  /s/[handle]/[code]  /c/[code]  /login  /checkout*  /account/*      │ SvelteKit SSR + +server.ts
   ├─ /auth/{callback,confirm,signout}  /api/{checkout,payments/*,cron/*,health,me}
   ├─ /assets/*  /email/celery.png  /favicon.svg  /robots.txt   (static/)
   └─ vercel.json rewrites (프록시 · 브라우저 오리진은 sellery.life 그대로)
        /influencer/:path* ─→ https://sellery-influencer.vercel.app/influencer/:path*   (S4 동안은 sellery-app.vercel.app)
        /brand/:path*      ─→ https://sellery-brand.vercel.app/brand/:path*             (S4 부터 · 데모)
        /admin/:path*      ─→ https://sellery-admin.vercel.app/admin/:path*             (S4 부터 · 데모)

   sellery-influencer (Root apps/influencer · base /influencer)  ── 콘솔 SSR · form actions · /influencer/auth/*
   sellery-brand      (Root apps/brand · base /brand)            ── 데모 SPA(ssr=false) + hooks(세션만)
   sellery-admin      (Root apps/admin · base /admin)            ── 데모 SPA(ssr=false) + hooks(세션만)

   Supabase sellery(ocxppeuoiysnkwwujvko) ── 4 프로젝트가 같은 URL·anon·service_role
   Toss(NHN_shingoonk) ── 웹훅 URL https://sellery.life/api/payments/webhook (불변)
```

세션 쿠키 `sb-ocxppeuoiysnkwwujvko-auth-token*` 은 브라우저가 `sellery.life` 에 보내고, Vercel 리라이트가 요청 헤더(쿠키 포함)와 응답의 `Set-Cookie` 를 그대로 옮기므로 4 앱이 같은 세션을 본다 — Next 의 경로 모드(`inf-console-plan.md` "콘솔 URL 표기" 결정 변경 2026-09-18)와 같은 성질이다.

### 1.2 앱별 Vercel 설정

| 항목 | `sellery-shop` | `sellery-influencer` | `sellery-brand` | `sellery-admin` |
|---|---|---|---|---|
| Root Directory | `apps/shop` | `apps/influencer` | `apps/brand` | `apps/admin` |
| Include source files outside of the Root Directory | **ON**(`packages/*` · 루트 `package-lock.json` · `.env` 없음) | ON | ON | ON |
| Framework Preset | SvelteKit(자동) | 〃 | 〃 | 〃 |
| Install / Build | 기본(`npm install` 은 워크스페이스 루트에서 실행됨 / `vite build`) | 〃 | 〃 | 〃 |
| Node.js Version | 22.x | 〃 | 〃 | 〃 |
| Region | `icn1` — `svelte.config.js` `adapter({ regions: ['icn1'] })` + 앱 `vercel.json` `"regions": ["icn1"]` | 〃 | 〃 | 〃 |
| Domains | `sellery.life` · `www.sellery.life`(→ apex) — **S4 에서 `sellery-app` 으로부터 이동** | 없음(`sellery-influencer.vercel.app` 만 · 리라이트 대상) | 없음 | 없음 |
| Deployment Protection | Preview **Off**(토스 `successUrl` 복귀 · 카카오 콜백 · 웹훅 테스트) · Production Off | Preview Off(리라이트 대상은 Production 이라 필수는 아님 — 콘솔 Preview 의 이메일 링크 착지를 위해 Off) | Off | Off |
| 환경변수(Production + Preview) | `PUBLIC_SUPABASE_URL` `PUBLIC_SUPABASE_ANON_KEY` `PUBLIC_TOSS_CLIENT_KEY` `PUBLIC_TOSS_WIDGET_VARIANT` `PUBLIC_SITE_URL` `SUPABASE_SERVICE_ROLE_KEY`(비밀) `TOSS_SECRET_KEY`(비밀) `CRON_SECRET`(비밀) `SLACK_WEBHOOK_URL`(선택 — `/auth/confirm` 가입 알림) | `PUBLIC_SUPABASE_URL` `PUBLIC_SUPABASE_ANON_KEY` `PUBLIC_SITE_URL` `SUPABASE_SERVICE_ROLE_KEY` `SLACK_WEBHOOK_URL`(선택) | `PUBLIC_SUPABASE_URL` `PUBLIC_SUPABASE_ANON_KEY` `PUBLIC_SITE_URL` `PUBLIC_DEMO=1` | 〃 |
| Ignored Build Step | `git diff --quiet HEAD^ HEAD -- . ../../packages ../../package.json ../../package-lock.json` | 〃 | 〃 | 〃 |
| Git | 같은 저장소 `weglow-dev/sellery` · Production Branch `main` · PR = Preview(앱별 URL 댓글) | 〃 | 〃 | 〃 |

값(키)은 이 문서·코드·PR 어디에도 쓰지 않는다 — 루트 `.env.local`(gitignored) 과 Vercel 환경변수에만(`web/DEPLOY.md §2` 표의 이름만 `NEXT_PUBLIC_` → `PUBLIC_` 로).

`svelte.config.js`(shop 예 — 나머지는 `base` 만 다르다):

```js
import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
export default {
	preprocess: vitePreprocess(),
	compilerOptions: { runes: true },
	kit: {
		adapter: adapter({ runtime: 'nodejs22.x', regions: ['icn1'] }),
		paths: { base: '' },                       // influencer '/influencer' · brand '/brand' · admin '/admin'
		env: { dir: '../..' },                     // 루트 .env.local 하나 (결정 11)
		csrf: { trustedOrigins: [] }               // influencer·brand·admin 은 ['https://sellery.life'] — §8.3 리라이트 오리진 위험
	}
};
```

라우트 단위 함수 옵션은 `+server.ts` 의 `export const config: Config = { maxDuration: 60 }`(`import type { Config } from '@sveltejs/adapter-vercel'`) — Next 의 `export const maxDuration` 자리(§4.2).

### 1.3 rewrite 규칙 (`apps/shop/vercel.json`)

```json
{
	"$schema": "https://openapi.vercel.sh/vercel.json",
	"regions": ["icn1"],
	"rewrites": [
		{ "source": "/influencer", "destination": "https://sellery-influencer.vercel.app/influencer" },
		{ "source": "/influencer/:path*", "destination": "https://sellery-influencer.vercel.app/influencer/:path*" },
		{ "source": "/brand", "destination": "https://sellery-brand.vercel.app/brand" },
		{ "source": "/brand/:path*", "destination": "https://sellery-brand.vercel.app/brand/:path*" },
		{ "source": "/admin", "destination": "https://sellery-admin.vercel.app/admin" },
		{ "source": "/admin/:path*", "destination": "https://sellery-admin.vercel.app/admin/:path*" }
	]
}
```

| 시점 | `/influencer*` 목적지 | `/brand*` `/admin*` |
|---|---|---|
| S1~S3 | (shop 에 도메인이 없으므로 무의미 — 파일은 S1 에 만들어 둔다) | 〃 |
| **S4** | `https://sellery-app.vercel.app/influencer/:path*`(Next 콘솔 — 결정 10) | `sellery-brand` · `sellery-admin`(결정 D) |
| **S5** | `https://sellery-influencer.vercel.app/influencer/:path*` | 〃 |

규칙:
- shop 앱에는 `/influencer` `/brand` `/admin` 으로 시작하는 라우트를 두지 않는다(리라이트가 앱 라우트보다 뒤에 평가되면 가려진다). `robots.txt` 는 이 셋을 disallow(지금과 같음).
- 리라이트 대상 앱의 `_app/immutable/*` 도 같은 규칙으로 흘러가므로 별도 항목이 없다. 각 앱의 `paths.base` 가 프로젝트 자기 URL 과 `sellery.life` 양쪽에서 같은 경로다.
- **S1 검증 항목**: adapter-vercel 은 Build Output API 로 `.vercel/output/config.json` 을 내고 Vercel 이 프로젝트의 `vercel.json` 을 합친다 — `curl -sI https://sellery-shop.vercel.app/influencer/login` 이 콘솔(또는 S1 시점의 데모) HTML 을 돌려주는지 확인한다. 합쳐지지 않으면 대안은 `apps/shop/src/hooks.server.ts` 에서 `/influencer/*` 요청을 `fetch` 로 프록시(헤더·`Set-Cookie` 그대로 전달)하는 것 — §8.3 위험 표.

### 1.4 Preview · 로컬

| 환경 | 주소 | 다른 앱 링크 | 정적 자산(`/assets/*`) |
|---|---|---|---|
| 로컬 dev | shop `http://localhost:5176/`(base `''`) · influencer `:5173/influencer` · brand `:5174/brand` · admin `:5175/admin`(`apps/*/vite.config.ts` 의 `strictPort`) | 절대 경로 `/influencer/…` 는 shop dev 서버에 없다 → 앱별 포트로 직접 연다(README "로컬 개발" 포트 표 — `hub/` 대체) | `scripts/vite-root-assets.mjs`(DIR = `apps/shop/static`) 가 4 앱 dev 서버에서 `/assets/*` `/email/*` `/favicon.svg` 를 서빙 |
| Vercel Preview(PR) | `sellery-<app>-git-<branch>-weglow-team.vercel.app` — 앱별 자기 base | shop Preview 의 리라이트는 **프로덕션** 콘솔로(결정 H). 콘솔 Preview 의 "← 셀러리 고객 사이트" 는 `PUBLIC_SITE_URL`(프로덕션) | shop 만 응답. 다른 앱 Preview 에서는 `<img>` 404 → 이모지 폴백(`imageSrc()` 결과가 비면 emoji) — 수용 |
| Production | `https://sellery.life` + 리라이트 | 전부 같은 오리진 | shop `static/` |

### 1.5 쿠키

| 쿠키 | 설정 주체 | 속성 | 읽는 곳 |
|---|---|---|---|
| `sb-ocxppeuoiysnkwwujvko-auth-token`(분할 시 `.0` `.1` …) | `@supabase/ssr`(각 앱 `hooks.server.ts` 의 `setAll`, 브라우저 클라이언트) | `Path=/` · `SameSite=Lax` · `Secure` · `httpOnly:false`(`DEFAULT_COOKIE_OPTIONS` — 브라우저 클라이언트가 읽는다) · `Max-Age` 400일 · **domain 없음(host-only)** | 4 앱 전부(같은 오리진). `web/` 도 같은 라이브러리·같은 이름이라 S4~S5 사이 `sellery-app` 리라이트와 호환 |
| `slry_linkctx` | shop `hooks.server.ts` 규칙 6(§2.5) | `HttpOnly` · `SameSite=Lax` · `Secure(prod)` · `Path=/` · `Max-Age=7776000` | shop `readLinkCtx(event)` 만 |
| localStorage `sellery-proto-v30` `sellery-session` `sellery-cust` `sellery-cart` `slry-linkctx` | 데모(`@sellery/core/storage`) | — | brand · admin · influencer `(demo)` 만. 프로덕션 shop·콘솔은 쓰지 않는다 |

### 1.6 `sellery-app` → `sellery-shop` 전환 절차 (S4)

1. `sellery-shop` Production 환경변수 확정(`PUBLIC_SITE_URL=https://sellery.life` · 토스 **라이브** 짝은 실판매 직전까지 테스트 짝 유지 — `web/DEPLOY.md §3.3` 그대로).
2. `apps/shop/vercel.json` 의 `/influencer*` 목적지를 `https://sellery-app.vercel.app/…` 로 두고 병합 → `sellery-shop.vercel.app` 에서 §8.2 curl 전부 통과.
3. Vercel → `sellery-app` → Settings → Domains 에서 `sellery.life` · `www.sellery.life` 제거 → `sellery-shop` 에 추가(같은 팀이라 DNS 변경 없음 — A `76.76.21.21` 그대로). 인증서가 멈추면 `vercel certs issue sellery.life --scope weglow-team`.
4. Supabase URL Configuration: Site URL · Redirect URLs 는 이미 `https://sellery.life/**`(변경 없음). 토스 웹훅 URL `https://sellery.life/api/payments/webhook` 변경 없음.
5. 확인: `curl -sI https://sellery.life/` 의 `server`/`x-vercel-id` 가 `sellery-shop` 배포인지 · `/influencer/login` 200(Next 콘솔) · `/api/health` 200 · 카카오 로그인 → 체크아웃 테스트 결제 1건.
6. 롤백: 도메인을 `sellery-app` 으로 되돌린다(`web/` 는 S5 까지 그대로 배포되고 있다).

---

## 2. 인증

### 2.1 `hooks.server.ts` (4 앱 공통 골격 — shop 은 링크 쿠키, influencer 는 세션 게이트가 추가)

`@supabase/ssr@0.12.7` 의 시그니처(`dist/main/createServerClient.d.ts` · `types.d.ts`):

- `createServerClient<Database>(supabaseUrl, supabaseKey, options: SupabaseClientOptions & { cookies: CookieMethodsServer; cookieOptions?; cookieEncoding? })`
- `CookieMethodsServer = { getAll: () => {name,value}[] | null; setAll?: (cookies: {name,value,options}[], headers: Record<string,string>) => void }` — **`setAll` 의 두 번째 인자 `headers`** 는 `Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0` · `Expires: 0` · `Pragma: no-cache` 로, 쿠키를 쓴 응답에 반드시 실어야 한다(CDN 이 남의 세션을 캐시하지 않게).
- `event.cookies.set(name, value, opts: CookieSerializeOptions & { path: string })` — SvelteKit `Cookies` 타입(`types/index.d.ts` L237-300)은 **`path` 필수**, `httpOnly`·`secure` 기본 `true`. `@supabase/ssr` 가 넘기는 `options` 에 `httpOnly:false` `path:'/'` 가 명시돼 있으므로 스프레드하면 된다.

```ts
// apps/shop/src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { createServerClient } from '@supabase/ssr';
import { dev } from '$app/environment';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { env } from '$env/dynamic/private';
import type { Database } from '@sellery/db/database.types';
import { LINKCTX_COOKIE, LINKCTX_MAX_AGE, LINK_CODE_RE } from '@sellery/db/linkctx';
import { configureDb } from '$lib/server/db';            // $lib/server 배럴 (§3.3)
import { configurePayments } from '$lib/server/payments';

configureDb({ url: PUBLIC_SUPABASE_URL, anonKey: PUBLIC_SUPABASE_ANON_KEY, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY });
configurePayments({ secretKey: env.TOSS_SECRET_KEY });    // 없으면 호출 시점에만 throw (web lib/toss.ts · admin.ts 와 동일)

const supabase: Handle = async ({ event, resolve }) => {
	let authHeaders: Record<string, string> = {};
	event.locals.supabase = createServerClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookiesToSet, headers) => {
				for (const { name, value, options } of cookiesToSet) event.cookies.set(name, value, { ...options, path: '/' });
				authHeaders = headers;
			}
		}
	});
	// glo·web 과 같은 규칙: createServerClient 와 getUser() 사이에 코드를 넣지 않는다 — safeGetSession 이 그 자리
	event.locals.safeGetSession = async () => {
		const { data: { session } } = await event.locals.supabase.auth.getSession();
		if (!session) return { session: null, user: null };
		const { data: { user }, error } = await event.locals.supabase.auth.getUser();   // JWT 검증 — 쿠키 값만 믿지 않는다
		if (error || !user) return { session: null, user: null };
		return { session, user };
	};
	const response = await resolve(event, {
		filterSerializedResponseHeaders: (name) => name === 'content-range' || name === 'x-supabase-api-version'
	});
	for (const [k, v] of Object.entries(authHeaders)) response.headers.set(k, v);
	return response;
};

/** app-plan §8 규칙 6 — GET/HEAD /s/:handle/:code, 새 유입(sec-fetch-site ≠ same-origin)일 때만 (§2.5) */
const STORE_RE = /^\/s\/[^/]+\/([^/]+)$/;
const linkCtx: Handle = async ({ event, resolve }) => {
	if (event.request.method === 'GET' || event.request.method === 'HEAD') {
		const code = STORE_RE.exec(event.url.pathname)?.[1];
		if (code && LINK_CODE_RE.test(code) && event.request.headers.get('sec-fetch-site') !== 'same-origin') {
			event.cookies.set(LINKCTX_COOKIE, code, { httpOnly: true, sameSite: 'lax', secure: !dev, path: '/', maxAge: LINKCTX_MAX_AGE });
		}
	}
	return resolve(event);
};

export const handle = sequence(supabase, linkCtx);
```

`src/app.d.ts`:

```ts
declare global {
	namespace App {
		interface Locals {
			supabase: import('@supabase/supabase-js').SupabaseClient<import('@sellery/db/database.types').Database>;
			safeGetSession(): Promise<{ session: import('@supabase/supabase-js').Session | null; user: import('@supabase/supabase-js').User | null }>;
			/** 요청당 메모 — fetchCampaignCard · getSellerContext 가 쓴다 (React cache() 대체, §3.4) */
			memo: Map<string, unknown>;
		}
	}
}
```

### 2.2 Next → SvelteKit 대응표

| 관심사 | Next(`web/`) | SvelteKit | 비고 |
|---|---|---|---|
| 요청마다 세션 회전 | `src/proxy.ts` → `lib/supabase/middleware.ts updateSession()` | `hooks.server.ts` `supabase` 핸들(§2.1) | `matcher` 는 없다 — 정적 자산은 SvelteKit 이 hooks 전에 처리한다 |
| 서버 클라이언트 | `lib/supabase/server.ts createClient()`(`cookies()` 기반, 요청마다 새로) | `event.locals.supabase`(hooks 가 만든 하나를 load · action · `+server.ts` 가 공유) | "요청마다 새 클라이언트" 규칙은 hooks 가 요청마다 도니 그대로 만족 |
| 세션 사용자 | `lib/auth.ts getSessionUser()` | `const { user } = await event.locals.safeGetSession()` | `packages/db/src/server/auth.server.ts` 에 `getSessionUser(event)` 래퍼 |
| service role | `lib/supabase/admin.ts createAdminClient()`(`import "server-only"`) | `@sellery/db/server/admin` `createAdminClient()` — `configureDb()` 가 넣은 키, 없으면 호출 시 throw | `$lib/server/db.ts` 를 통해서만 import(§3.3) |
| 브라우저 클라이언트 | `lib/supabase/client.ts createBrowserClient()` | `@sellery/db/browser` `createBrowserSupabase(url, anonKey)` — 호출자는 `$env/static/public` 값을 넘긴다 | 쓰는 곳: shop `/login`(`signInWithOAuth` · DEV 폼 `signInWithPassword`), 홈 카드 인증 확인(anon `rpc('campaign_card')`), 콘솔 `login` `signup` `verify-sent`(resend) `password`(resetPasswordForEmail) `password/new`(updateUser) |
| 네비 persona | `(customer)/layout.tsx navUser()` | `routes/+layout.server.ts` → `{ user: { name } \\| null }`(`depends('supabase:auth')`) | 실패는 로그아웃 상태로(try/catch) — 레이아웃이 죽으면 전 페이지가 죽는다(web 주석 그대로) |
| 카카오 로그인 시작 | `login-client.tsx signInWithKakao()` | `routes/login/+page.svelte` — `redirectTo: \`${location.origin}/auth/callback?next=${encodeURIComponent(data.next)}\``, `scopes` 지정 금지 | `next` 는 `+page.server.ts` 가 `safeNext` 로 정규화해 넘긴다 |
| 카카오 콜백 | `app/auth/callback/route.ts`(PKCE `exchangeCodeForSession` → `ensureCustomer` best-effort → `?welcome=1`) | `routes/auth/callback/+server.ts` GET: `locals.supabase.auth.exchangeCodeForSession(code)` → 파트너면(`isPartnerUser \\|\\| linkSellerIdOf`) `createSellerFromSignup` 분기 그대로 → `redirect(303, dest)` | `redirect()` 는 throw 다(`types/index.d.ts` L2930 `never`) — try 밖에서 부른다 |
| token_hash 확인 | `app/auth/confirm/route.ts`(`verifyOtp({ type, token_hash })`) | shop `routes/auth/confirm/+server.ts` + influencer `routes/auth/confirm/+server.ts`(결정 15) — `loginUrlFor` 의 호스트 분기는 경로 모드 한 줄로 | `type=recovery` → `/influencer/password/new` |
| 로그아웃 | `app/auth/signout/route.ts` POST 303 | shop `routes/auth/signout/+server.ts` · influencer `routes/auth/signout/+server.ts` — `await locals.supabase.auth.signOut()` → `redirect(303, next ?? '/')` | `<form method="post">` 그대로. SvelteKit 내장 CSRF(`kit.csrf`)가 다른 오리진의 form POST 를 403 으로 막는다 |
| 콘솔 게이트(세션만) | `proxy.ts` 규칙 5 | influencer `hooks.server.ts` `gate` 핸들: `rel = url.pathname.slice(base.length) \\|\\| '/'`; `CONSOLE_PUBLIC_PATHS`·`/auth/`·`/api/`·`(demo)` 밖에서 `user` 없으면 `redirect(302, \`${base}/login?next=${encodeURIComponent(pathname+search)}\`)` | DB 조회 없음(web 과 동일). 보조 가드 — 모든 page 는 `requireSeller()` |
| 역할 게이트 | `lib/partner/seller.ts getSellerContext()`(`React cache`) · `requireSeller()` | `@sellery/db/server/partner/seller` `getSellerContext(event)`(`event.locals.memo` 로 요청당 1회) · `requireSeller(event, { next })` — ok 아니면 `redirect(303, …)` throw | 상태 `anon · foreign · guest · suspended · ok` 그대로. `consolePath('seller', p)` = `'/influencer' + p`(경로 모드 고정 — 호스트 표 삭제) |
| foreign(고객 카카오 세션으로 콘솔 진입) | `login/page.tsx` "다른 계정으로" 안내 · `requireSeller` → `/login?switch=1` | 같음 — `routes/login/+page.server.ts` 가 `foreign` 이면 redirect 하지 않고 안내 렌더 | 경로 모드에서만 생기는 상태 — 리라이트 구조라 반드시 유지 |
| 서버 액션 CSRF | `assertSameSiteAction()`(`sec-fetch-site`) | SvelteKit 내장(`Origin` 대조, `kit.csrf.trustedOrigins`) + 기존 `rejectCrossSite(request)` 는 JSON API(`+server.ts`)에 그대로 | §8.3 리라이트 오리진 위험 |
| rate limit | `rateLimit(key)` 프로세스 메모리 30분 20건 | 같은 함수(`seller.server.ts`) — 서버리스 인스턴스마다 따로 센다(web 과 동일) | |
| `next` 검증 | `safeNext()` | `@sellery/db/auth` `safeNext()`(순수 · vitest) | |

### 2.3 `+layout.server.ts` · `+page.server.ts` 패턴

```ts
// apps/shop/src/routes/+layout.server.ts
import type { LayoutServerLoad } from './$types';
import { displayName } from '@sellery/db/auth';
export const load: LayoutServerLoad = async ({ locals, depends }) => {
	depends('supabase:auth');
	try { const { user } = await locals.safeGetSession(); return { user: user ? { name: displayName(user) } : null }; }
	catch { return { user: null }; }
};
```

```ts
// apps/influencer/src/routes/home/+page.server.ts  (web (partner)/influencer/home/page.tsx)
import type { PageServerLoad } from './$types';
import { requireSeller } from '$lib/server/partner';
export const load: PageServerLoad = async (event) => {
	const { seller, balance } = await requireSeller(event, { next: '/home' });
	return { seller, balance };
};
```

Next 의 `export const dynamic = "force-dynamic"` 은 SvelteKit 기본(SSR · prerender 없음)과 같다. 정적이었던 `/terms` `/privacy` 만 `export const prerender = true`. 세션·주문을 읽는 페이지는 `event.setHeaders({ 'cache-control': 'private, no-store' })`.

### 2.4 form actions (Next 서버 액션 대체)

| Next(`"use server"`) | SvelteKit | 응답 |
|---|---|---|
| `apply/actions.ts completeSignup(prev, formData)` + `useActionState` | `routes/apply/+page.server.ts` `export const actions = { default: async (event) => { … } }` + `+page.svelte` `<form method="post" use:enhance>` | 실패 `return fail(400, { error })`(`fail()` `types/index.d.ts` L2952) · 성공 `redirect(303, '/influencer/home')` |
| `my/actions.ts issueVerifyCode · confirmVerify · setPrimaryCh · saveChannel · deleteChannel` | `routes/my/+page.server.ts` `actions = { issueVerifyCode, confirmVerify, setPrimaryCh, saveChannel, deleteChannel }` — 폼은 `action="?/issueVerifyCode"` | 전부 `redirect(303, \`/influencer/my?msg=<code>\`)`(web 의 `back(ctx, query)`) — `MY_MESSAGES` 표 그대로 |
| `assertSameSiteAction()` | 제거(내장 CSRF) | |
| `redirect()` from `next/navigation`(throw) | `redirect()` from `@sveltejs/kit`(throw · 상태 코드 명시 303) | |

### 2.5 링크 유입 보호 쿠키 규칙 6 (app-plan §8 이식)

| 항목 | web | apps/shop |
|---|---|---|
| 설정 위치 | `proxy.ts` 규칙 6(`updateSession` 응답에 `response.cookies.set`) | `hooks.server.ts` `linkCtx` 핸들 — `resolve` **전에** `event.cookies.set`(응답 `Set-Cookie` 로 나간다) |
| 조건 | GET/HEAD · `^\/s\/[^/]+\/([^/]+)$` · `LINK_CODE_RE` · `sec-fetch-site !== 'same-origin'` | 동일 |
| 읽기 | `lib/linkctx.ts readLinkCtx()`(`cookies()` + anon `campaign_card`) | `@sellery/db/server/linkctx` `readLinkCtx(event)` — `event.cookies.get(LINKCTX_COOKIE)` + `event.locals.supabase.rpc('campaign_card', { p_code })` |
| 필터·문구·★ 추천 해제 | `custVisible(c, L)` · `featOf()` | `@sellery/db/linkctx custVisible`(순수) · `routes/+page.server.ts` |
| 확인 | `curl -D - https://…/s/jiyu_beauty/c1` 에 `set-cookie: slry_linkctx=c1; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=7776000` · 같은 요청에 `Sec-Fetch-Site: same-origin` 을 붙이면 없음 | 동일 |

---

## 3. 데이터 계층

### 3.1 `packages/db` (`@sellery/db`)

`web/src/lib/**` → 새 위치. "순수" = 브라우저·서버·vitest 어디서나 import 가능(Next/Supabase 클라이언트를 import 하지 않음), "서버" = `src/server/<name>.server.ts`.

| Next 파일 | 새 파일 | 구분 | 변경점 |
|---|---|---|---|
| `lib/database.types.ts` | `packages/db/src/database.types.ts` | 순수(타입) | `gen:types` 출력 위치(§3.5) |
| `lib/supabase/server.ts` · `lib/supabase/middleware.ts` | (앱 `hooks.server.ts` 로 흡수 — §2.1) + `src/server/auth.server.ts` `getSessionUser(event)` | 서버 | `cookies()` · `NextResponse` 제거 |
| `lib/supabase/client.ts` | `src/browser.ts` `createBrowserSupabase(url, anonKey)` | 브라우저 | 환경변수는 호출자가 넘긴다 |
| `lib/supabase/admin.ts` | `src/server/admin.server.ts` `createAdminClient()` + `src/server/config.server.ts` `configureDb({ url, anonKey, serviceKey })` | 서버 | `import "server-only"` → 파일명 + `$lib/server` 배럴(§3.3) |
| `lib/auth.ts` | `src/auth.ts`(`AppRole` `displayName` `safeNext` `isPartnerUser`) + `src/server/auth.server.ts`(`getRole(supabase, user)`) | 순수 / 서버 | `getRole` 은 `locals.supabase` 를 인자로 |
| `lib/linkctx.ts` | `src/linkctx.ts`(`LINKCTX_COOKIE` `LINK_CODE_RE` `LINKCTX_MAX_AGE` `LinkCtx` `linkCtxFromCard` `custVisible`) + `src/server/linkctx.server.ts`(`readLinkCtx(event)`) | 순수 / 서버 | |
| `lib/hosts.ts` | `src/console-paths.ts`(`ConsoleRole` `PREFIX_OF` `CONSOLE_PUBLIC_PATHS` `isConsolePublicPath` `consolePath(role, path)` `consoleUrl(role, path)` = `PUBLIC_SITE_URL + consolePath`) | 순수 | 호스트 모드(`HOST_PREFIX` `consoleRoleOf` `schemeFor` `stripPrefix` `isRewriteExcluded` `isConsoleBlockedPath` `hostsMode`) 삭제 — 경로 모드만 |
| `lib/customers.ts` | `src/server/customers.server.ts` `ensureCustomer(admin, user)` | 서버 | 그대로 |
| `lib/campaign.ts` | `src/campaign.ts` | 순수 | 그대로(`CampaignCard` `HomeCard` `parseCampaignCard` `normalizeHandle` `canonicalStoreUrl` `storeUrl` `displayStoreUrl` `isEnded` `ddayLabel*` `badgeTone` `stockLeft` `isBuyable` `isHomeFeat` `fmtNum` `won` `fmtKR` `discountPct` `imageSrc` `ogImageSrc` `viewersOf` `CATS` `CAT_INFO` `isCat` `DEFAULT_SETTINGS` `CAMPAIGN_CODE_RE`) |
| `lib/campaign-server.ts` | `src/server/campaign.server.ts` `fetchCampaignCard(event, code)` `fetchHomeCampaigns(event)` `fetchSellerOtherCampaigns(event, sellerId, exceptId)` `fetchPublicSellers(event)` `fetchPublicStats()` | 서버 | `React cache()` → `event.locals.memo`(§3.4) · `unstable_cache(60s)` → 모듈 메모 `{ at, value }` · anon 조회는 `event.locals.supabase`(쿠키 없으면 anon) |
| `lib/orders-server.ts` | `src/server/orders.server.ts`(`MyOrder` `ORDER_CODE_RE` `fetchMyOrders` `fetchMyOrder` `fetchOrderSettings` `MyAccount` `fetchMyAccount`) | 서버 | 그대로(service role) |
| `lib/order-status.ts` `lib/carriers.ts` `lib/dates.ts` `lib/text.ts` `lib/types.ts` `lib/legal.ts` `lib/company.ts` | `src/order-status.ts` `src/carriers.ts` `src/dates.ts` `src/text.ts` `src/types.ts` `src/legal.ts` `src/company.ts` | 순수 | `company.ts` 의 `warnIfCompanyPending()` 은 서버 콘솔 1회 — 그대로 |
| `content/legal/{terms,privacy}.ts` | `src/legal/{terms,privacy}.ts` | 순수(데이터) | 비개발자 편집 대상 — `docs/editing-guide.md` 에 경로 추가 |
| `lib/partner/seller.ts` | `src/server/partner/seller.server.ts`(`SellerSummary` `SellerContext` `SellerReady` `getSellerContext(event)` `sellerPath(path)` `consoleNextOf(raw)` `requireSeller(event, opts)` `rateLimit` `RATE_LIMIT_MESSAGE`) | 서버 | `headers()` → `event`; `assertSameSiteAction` 삭제 |
| `lib/partner/signup.ts` | `src/server/partner/signup.server.ts`(`SignupResult` `linkSellerIdOf` `createSellerFromSignup(user, form?)`) | 서버 | 그대로(`create_seller_from_signup` RPC · Slack) |
| `lib/partner/signup-rules.ts` | `src/partner/signup-rules.ts` | 순수 | 그대로(`PLATFORMS` `PASSWORD_RE` `HANDLE_RE` `parseSignupMeta` `SIGNUP_FAIL_MESSAGES` …) |
| `lib/partner/slack.ts` | `src/server/partner/slack.server.ts` `notifySlack(text)` | 서버 | `SLACK_WEBHOOK_URL` 은 `configureDb({ slackWebhookUrl })` 로 주입 |
| `scripts/gen-types.mjs` `partner-admin.mjs` `dev-seller.mjs` `dev-user.mjs` | `packages/db/scripts/*.mjs` | Node | `.env.local` 경로를 **저장소 루트**로(§5.4) |

`packages/db/package.json`:

```json
{
  "name": "@sellery/db", "private": true, "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./*": "./src/*.ts",
    "./partner/*": "./src/partner/*.ts",
    "./legal/*": "./src/legal/*.ts",
    "./server/*": "./src/server/*.server.ts",
    "./server/partner/*": "./src/server/partner/*.server.ts"
  },
  "dependencies": { "@supabase/ssr": "^0.12.7", "@supabase/supabase-js": "^2.116.0" },
  "scripts": { "gen:types": "node scripts/gen-types.mjs", "test": "vitest run" }
}
```

`src/index.ts` 는 **순수 모듈만** re-export 한다(`server/*` 없음).

### 3.2 `packages/payments` (`@sellery/payments`)

| Next 파일 | 새 파일 | 구분 | 변경점 |
|---|---|---|---|
| `lib/toss.ts` | `src/server/toss.server.ts`(`TossPayment` `TossError` `TossResult` `isTossError` `isUncertain` `tossCanceledTotal` `tossConfirm` `tossCancel` `tossGetPayment`) + `src/server/config.server.ts` `configurePayments({ secretKey })` | 서버 | `process.env.TOSS_SECRET_KEY` → 주입값 |
| `lib/checkout-sync.ts` | `src/server/checkout-sync.server.ts` | 서버 | `NextResponse` → `Response`: `apiError()` · `rejectCrossSite()` 는 `json()`(`@sveltejs/kit`) 으로 `{ ok:false, code, message }` · 상태코드. `Admin` 타입은 `@sellery/db/database.types` 기준. 나머지(`FAIL_MESSAGES` `failMessage` `SessionLite` `parseClaimResult` `parseConfirmResult` `parsePrecheckResult` `parseRefundRecordResult` `logPaymentEvent` `markPaymentEvent` `failSession` `resolveCancelPending` `cancelAndFail` `retryCancelPending` `confirmDone` `recordRefundFromToss` `syncFromPayment` `readCampaignGate` `gateIsLive` `softStockLeft` `TOSS_KEY_RE` `SESSION_LITE_COLS` `ORDER_LITE_COLS`)는 그대로 |
| `lib/money.ts` | `src/money.ts`(`formatKRW` `generateOrderId`) | 순수 | |
| `components/checkout/rules.ts` | `src/checkout-rules.ts`(`QTY_MIN/MAX` `parseCheckoutParams` `checkoutHref` `ShippingDraft` `EMPTY_DRAFT` `validateShipping` `mediatorText` `thirdPartyText` `PRIVACY_THIRD_PARTY_HREF` `TOSS_KEY_RE` `parseSuccessParams` `FAIL_TEXT` `failText` `failPageReason` `RETURN_KEY` `parseCheckoutReturn`) | 순수 | `@/lib/campaign` `@/lib/text` `@/lib/types` → `@sellery/db/*` |

`@tosspayments/tosspayments-sdk` 는 **apps/shop 의 devDependency** 이고 `packages/ui/src/site/checkout/PaymentWidget.svelte` 가 `onMount` 안에서 동적 import 한다(브라우저 전용 — SSR 번들에 들어가지 않게).

### 3.3 경계 표 · server-only 대체

| 모듈 | `+page.svelte` · `.svelte` · `+page.ts` · `+layout.ts`(브라우저 도달) | `+*.server.ts` · `+server.ts` · `hooks.server.ts` | `(demo)` · brand · admin(ssr=false) |
|---|---|---|---|
| `@sellery/core/{constants,util,icons,types}` | 허용 | 허용 | 허용 |
| `@sellery/core`(bare — `state.svelte` `actions` `seed` `storage` `ui.svelte` `helpers` 포함) | **금지**(shop · influencer 콘솔) | **금지** | 허용(데모 전용) |
| `@sellery/db`(순수) · `@sellery/db/{auth,campaign,linkctx,order-status,…}` · `@sellery/db/partner/signup-rules` · `@sellery/db/legal/*` | 허용 | 허용 | 허용 |
| `@sellery/db/browser` | 허용(로그인·인증 확인만) | 금지 | — |
| `@sellery/db/server/*` · `@sellery/payments/server/*` | **금지** | 허용 — **`$lib/server/*.ts` 배럴을 통해서만** | 금지 |
| `@sellery/payments`(순수 `money` `checkout-rules`) | 허용 | 허용 | — |
| `@sellery/ui`(데모 컴포넌트 · `AppShell` `ModalHost` `Store` …) | 금지(shop · 콘솔) | — | 허용 |
| `@sellery/ui/site`(props-only) | 허용 | — | 허용 |
| `$env/static/public` | 허용 | 허용 | 허용 |
| `$env/dynamic/private` | SvelteKit 이 빌드 실패시킴 | 허용(`hooks.server.ts` 에서만 읽어 `configure*` 로 주입) | — |

`server-only` 대체 세 겹:

1. **파일명·폴더** — `packages/*/src/server/<name>.server.ts`. `exports` 의 `./server/*` 서브패스로만 노출된다.
2. **앱 배럴** — 각 앱 `src/lib/server/db.ts` · `payments.ts` · `partner.ts`(influencer) 가 `export * from '@sellery/db/server/…'` 만 한다. SvelteKit 은 `$lib/server/` 를 **항상** 서버 전용으로 본다(`vite/index.js` L740 `normalized.startsWith('$lib/server/')`) — 브라우저 도달 파일이 배럴을 import 하면 dev·build 에서 `Cannot import $lib/server/db.ts into client-side code` 로 죽는다. 이것이 `import "server-only"` 의 등가물이다.
3. **`scripts/check-boundaries.mjs`**(CI) — `apps/*/src/**` 를 훑어 (a) `(demo)` 밖의 shop·influencer 파일이 `@sellery/core` 를 bare 로, 또는 `@sellery/core/{state.svelte,actions,seed,storage,ui.svelte,helpers}` 를 import 하면 실패, (b) `.svelte` · `+page.ts` · `+layout.ts` · `src/lib/(server 밖)` 이 `@sellery/db/server/` `@sellery/payments/server/` `$lib/server/` 를 import 하면 실패, (c) `packages/{db,payments}/src/**` 의 `.server.ts` 가 아닌 파일이 `server/` 를 import 하면 실패, (d) `packages/ui/src/site/**` 가 `@sellery/core` bare 를 import 하면 실패. 앱 cwd 밖의 `.server.ts` 를 SvelteKit 이 검사하지 않는 빈틈을 이 스크립트가 메운다.

### 3.4 Next 전용 API 의 대체

| Next | SvelteKit | 위치 |
|---|---|---|
| `cache(fn)`(요청당 1회 — `fetchCampaignCard` `getSellerContext`) | `event.locals.memo: Map`(hooks 가 요청마다 새 Map) — `memo.get(key) ?? memo.set(key, await fn())` | `@sellery/db/server/*` |
| `unstable_cache(fn, key, { revalidate: 60 })`(`public_stats`) | 모듈 수준 `{ at, value }` 60초 메모(서버리스 인스턴스별) — 쿠키 없는 anon 클라이언트(`createClient(url, anon)`) 로 조회 | `campaign.server.ts` |
| `headers()` `cookies()`(전역) | `event.request.headers` `event.cookies` — 서버 함수는 **`event` 를 첫 인자로** 받는다. `getRequestEvent()`(`$app/server`, kit ≥2.20) 도 있지만 패키지가 SvelteKit 에 묶이지 않도록 쓰지 않는다 | 전부 |
| `NextResponse.json / redirect` | `json()` `redirect()` `error()`(`@sveltejs/kit`) | `+server.ts` |
| `notFound()` | `error(404, { message })` → 가장 가까운 `+error.svelte`(고객 셸 안) | `+page.server.ts` |
| `permanentRedirect(url)` | `redirect(308, url)` | `/s/[handle]/[code]` · `/c/[code]` |
| `generateMetadata` | `+page.server.ts` 가 `meta` 를 데이터로 돌려주고 `+page.svelte` `<svelte:head>` 가 렌더 | |
| `router.refresh()` | `invalidateAll()`(`$app/navigation`) | 환불 버튼 |
| `useSearchParams` `usePathname` | `page.url`(`$app/state`) | |
| `next/link` | `<a href>`(`data-sveltekit-preload-data="hover"` 는 `app.html` body 에 이미) | |
| `"use client"` 조각 | `.svelte` 컴포넌트(기본 SSR + hydrate). 브라우저 전용은 `onMount`/`browser`(`$app/environment`) | |
| `export const maxDuration` | `export const config: Config = { maxDuration }` | `+server.ts` |
| `process.env.NEXT_PUBLIC_X` | `PUBLIC_X`(`$env/static/public`) | |
| `process.env.SECRET` | `env.SECRET`(`$env/dynamic/private`, hooks 에서만) | |
| `Buffer`(웹훅 64KB 검사) | 그대로(Node 런타임) | |

### 3.5 `gen:types` 위치

`packages/db/scripts/gen-types.mjs`(`web/scripts/gen-types.mjs` 그대로, 출력만 `packages/db/src/database.types.ts`). 루트에서 `npm run gen:types -w packages/db`. 절차는 `web/DEPLOY.md §4.1` 그대로: `npx supabase db push --linked` → `gen:types` → `npm run check` → 같은 PR.

---

## 4. apps/shop — `web/(customer)` 동일 재현 명세

### 4.1 라우트 1:1 매핑

| 경로 | Next 파일 | SvelteKit 파일 | 데이터 / 서버 | 완료 기준 |
|---|---|---|---|---|
| 셸 | `(customer)/layout.tsx` · `components/{app-bar,sub-nav,footer,toast}.tsx` · `app/fonts.ts` | `src/app.html`(폰트 `<link>` · favicon · `<html lang="ko">`) · `routes/+layout.server.ts`(§2.3) · `routes/+layout.svelte`(`SiteHeader` `SubNav` `SiteFooter` `ToastHost` from `@sellery/ui/site`) | `safeGetSession` | skip link(`#main`) · persona(`{name}님 · 로그아웃` / `카카오 로그인 → /login?next=<현재>`) · 푸터 3행 · `?welcome=1`/`?bye=1` 토스트 1회 후 `replaceState` |
| `/` | `(customer)/page.tsx` | `routes/+page.server.ts` + `routes/+page.svelte` | anon `fetchHomeCampaigns` · `fetchPublicSellers` · `fetchPublicStats`(60초) · `readLinkCtx(event)` · 링크 캠페인 `fetchCampaignCard` · `safeGetSession` | `?cat=`·`?seller=` 가 URL 상태(데모의 `S.ui.custCat` 아님) · 링크 보호 `.notice` 문구 · 순위 5 · 보호 중 타 인플루언서 ★ 상단 고정 해제 · 통계 4칸 |
| `/s/[handle]/[code]` | `s/[handle]/[code]/page.tsx` + `store-client.tsx` + `components/store/*` + `trust-band.tsx` + `tilt.tsx` | `routes/s/[handle]/[code]/+page.server.ts` + `+page.svelte`(`StoreView` from `@sellery/ui/site`) | anon `fetchCampaignCard` → null → `error(404)` · `params.handle !== normalizeHandle(card.seller.handle)` → `redirect(308, canonicalStoreUrl(card))` · `fetchSellerOtherCampaigns` · `safeGetSession` | `<svelte:head>` title `"{product} · {seller}"` · description · canonical · og(image 있으면) · 종료면 `noindex, follow` · 8 블록 순서(상단 행 · 인증 띠 · 상품 카드 · 상세 · 배송/교환/환불 · 판매자 정보 · 다른 판매 · `.store-foot`) 동일 |
| `/c/[code]` | `c/[code]/page.tsx` | `routes/c/[code]/+page.server.ts`(load 에서 `redirect(308)` 또는 `error(404)`) + 빈 `+page.svelte` | anon | `curl -sI /c/c1` → `308 location: /s/jiyu_beauty/c1`; 없는 코드 404(고객 셸) |
| `/login` | `login/{page,layout}.tsx` · `login-client.tsx` | `routes/login/+page.server.ts`(`next = safeNext(url.searchParams.get('next'))` · 로그인 상태면 `redirect(303, next)` · `authError = error === 'auth'`) + `+page.svelte`(카카오 버튼 → `createBrowserSupabase().auth.signInWithOAuth({ provider: 'kakao', options: { redirectTo } })`) | `safeGetSession` | `<meta name="robots" content="noindex, nofollow">` · 약관/처리방침 링크 · `PUBLIC_DEV_LOGIN==='1' && dev` 일 때만 개발용 이메일 폼(`signInWithPassword` → `location.assign(next+?welcome=1)`) |
| `/auth/callback` | `auth/callback/route.ts` | `routes/auth/callback/+server.ts` GET | §2.2 | 카카오 로그인 → `next` 복귀 + `?welcome=1`; 실패 → `/login?error=auth` |
| `/auth/confirm` | `auth/confirm/route.ts` | `routes/auth/confirm/+server.ts` GET | `verifyOtp` · 파트너 분기 | `/auth/confirm?token_hash=…&type=signup&next=/influencer/home` → 세션 + `sellers` 행 + 302 |
| `/auth/signout` | `auth/signout/route.ts` | `routes/auth/signout/+server.ts` POST | `signOut()` → `redirect(303, safeNext(next) \\|\\| '/')` | 쿠키 삭제 `set-cookie` 확인 |
| `/checkout` | `checkout/{page,layout}.tsx` · `checkout-client.tsx` · `components/checkout/*` | `routes/checkout/+page.server.ts`(`parseCheckoutParams` 실패 → `redirect(303, /c/<c> \\| /)` · `!user` → `redirect(303, /login?next=<checkoutHref>)` · card null → `error(404)` · `optionIndex` 범위 → `redirect(303, storeUrl)` · `isBuyable` 실패 → `{ blocked: message }` · user 클라이언트로 `customers(address, phone)` 프리필) + `+page.svelte`(`PaymentWidget` `AddressFields` `OrderSummary` `PayBar` from `@sellery/ui/site/checkout`) | user + anon | `<meta robots noindex>` · 결제하기: `validateShipping` → 통신판매중개자 체크 → `POST /api/checkout` → `widgets.setAmount(서버 amount)` → `requestPayment({ successUrl: \`${origin}/checkout/success\`, failUrl: \`${origin}/checkout/fail?c&o&q\` })` · 진입 시 `sessionStorage[RETURN_KEY] = { store, retry }` · 401 → `/login?next=<retry>` · `NOT_LIVE/SOLD_OUT/NOT_FOUND` → 위젯 대신 안내 |
| `/checkout/success` | `success/page.tsx` + `success-client.tsx` | `routes/checkout/success/+page.ts`(`export const ssr = false` — 전부 브라우저) + `+page.svelte` | 브라우저: `parseSuccessParams` → `POST /api/payments/confirm` **정확히 1회**(`let confirmed` 가드) · 409 → 1.5초 뒤 1회 재시도 · 401 → `/login?next=<here>` · 실패 `code` → `failText` 표 | 주문 완료 뷰(`orderDoneModal` 원문 · 주문번호 대문자 · 카드) · 실패 뷰(pending 이면 "결제 확인 중" + 내 주문) · 새로고침 → `already:true`, 주문 중복 없음 |
| `/checkout/fail` | `fail/page.tsx` | `routes/checkout/fail/+page.server.ts`(`failPageReason(code, message)` · `TOSS_KEY_RE` 통과한 `orderId` 만 · `parseCheckoutParams` → `fetchCampaignCard` → `storeHref` `retryHref`) + `+page.svelte` | anon | `PAY_PROCESS_CANCELED` 문구 · "다시 시도" → `/checkout?c&o&q` |
| `/account/orders` | `account/{layout}.tsx` · `orders/page.tsx` · `sign-out-button.tsx` · `components/orders/order-row.tsx` | `routes/account/orders/+page.server.ts`(미로그인 → `{ user: null }` 카드 렌더, 로그인 → service `fetchMyOrders` `fetchOrderSettings` `fetchMyAccount`) + `+page.svelte`(`OrderRow` `SignOutButton`) | user → service | `<meta robots noindex>` · `cache-control: private, no-store` · 행 문구(`{CODE} · {md(paid_at)} 주문 · {brand} 직배송 · {ship}`) · 계정 카드(이름 · 이메일 · 카카오 계정 · 가입일 · 로그아웃) |
| `/account/orders/[code]` | `[code]/page.tsx` · `refund-button.tsx` · `not-found.tsx` · `components/orders/ship-info.tsx` · `status-chip.tsx` · `cs-modal.tsx` | `routes/account/orders/[code]/+page.server.ts`(`!user` → `redirect(303, /login?next=)` · `ORDER_CODE_RE` · service `fetchMyOrder` → null → `error(404)`) + `+page.svelte`(`ShipInfo` `RefundButton` `CsModal` `StatusChip`) + `routes/account/orders/+error.svelte`("주문을 찾을 수 없습니다 · ← 내 주문") | user → service | 4 카드(주문 상품 · 주문 정보 · 배송 정보 · 교환/환불) · 환불 가능(`isRefundable`) 일 때만 버튼 · `POST /api/payments/cancel` → 토스트 → `invalidateAll()` → 칩 `환불 완료` |
| `/terms` `/privacy` | `terms/page.tsx` `privacy/page.tsx` · `components/legal-doc.tsx` · `content/legal/*` | `routes/terms/+page.svelte` `routes/privacy/+page.svelte`(`export const prerender = true` in `+page.ts`) + `LegalDoc` from `@sellery/ui/site` + 데이터 `@sellery/db/legal/*` | 없음 | 목차 · `h2#<id>` 앵커(`/privacy#third-party`) · 마크다운 링크 1종만 · `dangerouslySetInnerHTML` 없음 → `{@html}` 도 쓰지 않는다 |
| 404 | `(customer)/not-found.tsx` · `[...rest]/page.tsx` · `global-not-found.tsx` | `routes/+error.svelte`(고객 셸 안 — `page.status === 404` 이면 "판매 페이지를 찾을 수 없습니다"(경로 `/s/` `/c/`) 또는 "페이지를 찾을 수 없습니다", `← 셀러리 홈`) | — | `/없는경로` → 404 + 헤더·푸터 있음(catch-all 불필요 — SvelteKit 은 미매치도 루트 `+error.svelte` 로) |
| `/robots.txt` | `app/robots.ts` | `routes/robots.txt/+server.ts`(`prerender = true`) | — | `allow: / /s/ /c/ /terms /privacy` · `disallow: /api/ /checkout /account /login /auth/ /influencer /brand /admin`(콘솔 호스트 분기 삭제) |
| 정적 | `public/{assets,email,favicon.svg}` | `apps/shop/static/{assets,email,favicon.svg}`(루트 `assets/` 도 여기로 이동) | — | `https://sellery.life/email/celery.png` 200(결정 K) |

### 4.2 API 1:1 매핑

| 경로 · 메서드 | Next 파일 | SvelteKit 파일 | 서버 로직(변경 없음) | `config` |
|---|---|---|---|---|
| `GET /api/health` | `api/health/route.ts` | `routes/api/health/+server.ts` | service HEAD `checkout_sessions` + `tossGetPayment('health_probe_not_a_real_payment')` 404 → ok · `hosts` 필드 삭제 | — |
| `GET /api/me` | `api/me/route.ts` | `routes/api/me/+server.ts` | `safeGetSession` → `{ user: { name, avatar } \\| null }` · `Cache-Control: no-store` | — |
| `POST /api/checkout` | `api/checkout/route.ts` | `routes/api/checkout/+server.ts` | `rejectCrossSite` → 401 → `fetchCampaignCard` → LIVE·today·qty·optionIndex → 소프트 예약 → 배송지 `cleanText`/`normalizePhone` → `ensureCustomer` → 기존 PENDING `SUPERSEDED` → insert(`link_code` = `event.cookies.get(LINKCTX_COOKIE)` 형식 통과값) → `saveAddress` · 30분 20건 429 | — |
| `POST /api/payments/confirm` | `api/payments/confirm/route.ts`(`maxDuration 60`) | `routes/api/payments/confirm/+server.ts` | app-plan §7.1 순서 그대로(`app_claim_checkout` → 소유자 → amount → 게이트 → `tossConfirm` → `app_confirm_checkout` → `confirmDone`) | `{ maxDuration: 60 }` |
| `POST /api/payments/cancel` | `api/payments/cancel/route.ts`(30) | `routes/api/payments/cancel/+server.ts` | RLS 본인 주문 → `app_refund_precheck` → `tossCancel`(Idempotency-Key order.id) → `app_refund_record` → `payment_events` | `{ maxDuration: 30 }` |
| `POST /api/payments/webhook` | `api/payments/webhook/route.ts`(30) | `routes/api/payments/webhook/+server.ts` | 64KB · JSON · `eventType` · 키 형식 → 매칭 → `payment_events` → `tossGetPayment` 재조회 → `syncFromPayment` · 항상 200, 재조회 실패만 502 | `{ maxDuration: 30 }` — JSON 본문이라 SvelteKit CSRF 검사 대상이 아니다(form 콘텐츠 타입만 검사) |
| `GET\\|POST /api/cron/reconcile` | `api/cron/reconcile/route.ts`(60) | `routes/api/cron/reconcile/+server.ts` | `CRON_SECRET`(`Authorization: Bearer` 또는 `x-cron-secret`) · `expire_checkout_sessions` · `stale_checkout_sessions` · §7.5 표 | `{ maxDuration: 60 }` |

세 결제 라우트와 웹훅은 `web/` 코드를 **그대로** 옮기고 import 경로와 응답 헬퍼(`NextResponse` → `json`)만 바꾼다 — 검증 순서·상태 전이·에러 코드는 `docs/app-plan.md §6.2·§6.3·§7` 이 원본이고 이 이식에서 바꾸지 않는다.

### 4.3 Next 판에서 추가된 UI 요소(프로토타입에 없던 것 — 반드시 옮긴다)

| 요소 | Next 파일 | SvelteKit 위치 | 동작 · 문구 |
|---|---|---|---|
| 인증 확인 모달(인증 띠 · 홈 카드 "인증 확인") | `components/trust-band.tsx` · `verify-modal.tsx`(`VerifyModal` `VerifyLauncher`) | `packages/ui/src/site/{TrustBand,VerifyLauncher,VerifyModal}.svelte`(export `SiteVerifyModal` — 기존 `modals/VerifyModal.svelte` 는 채널 인증 데모라 이름 충돌 회피) | `card` 가 있으면 즉시, 없으면 브라우저 anon `rpc('campaign_card')` 후 `parseCampaignCard` · 표(링크 ID · 인플루언서 · 인증 채널 · 브랜드 · 기간 · 상태) · "유효" = RPC 응답이 null 이 아님 |
| 브랜드 사업자 정보 카드(판매자 정보) | `s/[handle]/[code]/page.tsx` `SellerInfoCard` | `packages/ui/src/site/SellerInfoCard.svelte` | `biz_no` · `mail_order_no` null 이면 행 생략 · "통신판매중개 (주)위글로우 · 셀러리 — 사업자 정보는 페이지 하단 참조" |
| 통신판매중개자 고지 · 사업자 정보 푸터 | `components/footer.tsx` · `lib/company.ts` | `packages/ui/src/site/SiteFooter.svelte` + `@sellery/db/company` | 3행(중개자 고지 · 고객센터 이메일 · `sellery.life` / 위글로우 사업자 정보 / 약관 · 처리방침) · `warnIfCompanyPending()` |
| 체크아웃 통신판매중개자 확인 체크 + 제3자 제공 고지 | `checkout-client.tsx` `agreementExtra` · `rules.mediatorText/thirdPartyText` | `site/checkout/PaymentWidget.svelte` `agreementExtra` 스니펫 | 체크 없으면 토스트 "통신판매중개자 확인에 동의해주세요" · `자세히` → `/privacy#third-party` 새 창 |
| 약관 링크 | `login-client.tsx` · `footer.tsx` · `legal-doc.tsx` | `login/+page.svelte` · `SiteFooter` · `site/LegalDoc.svelte` | "로그인하면 이용약관과 개인정보처리방침에 동의한 것으로 봅니다" |
| 환불 신청 버튼 · 모달 | `account/orders/[code]/refund-button.tsx` | `site/orders/RefundButton.svelte`(`Modal` + `REFUND_REASONS` 선택 + 상세 ≤ 200자 합산) | 성공 토스트 "환불 신청 완료 — 결제수단으로 3영업일 내 환급"(`afterShip` 이면 "· 이미 발송된 상품은 회수 후 처리돼요") → `invalidateAll()` · 낡은 화면 코드(`SETTLED/SHIPPED/REFUNDED/CANCELED/NOT_FOUND`) → 닫고 `invalidateAll()` |
| 성공 · 실패 · fail 페이지 | `success-client.tsx`(`DoneView` `FailView` `Confirming`) · `fail/page.tsx` | `routes/checkout/success/+page.svelte` · `routes/checkout/fail/+page.svelte` | §4.1 · `FAIL_TEXT` 표(app-plan §6.3) · "문의하기" = `COMPANY.csUrl`(mailto) |
| sessionStorage 복귀 키 | `rules.RETURN_KEY = 'slry_checkout_return'` `{ store, retry }` | `@sellery/payments/checkout-rules`(같은 키) — `/checkout` 진입 시 저장, success 가 다음 틱에 읽는다 | 저장 불가(프라이빗 모드)면 홈으로 |
| robots · noindex | `robots.ts` · `login/layout.tsx` `checkout/layout.tsx` `account/layout.tsx` 의 `metadata.robots` | `routes/robots.txt/+server.ts` · 각 페이지 `<svelte:head><meta name="robots" content="noindex, nofollow"></svelte:head>` | |
| 토스트 버스 · URL 플래그 | `components/toast.tsx`(`showToast` `useToast` `ToastHost` — `?welcome=1` → `/api/me` 이름 · `?bye=1`) | `packages/ui/src/site/toast.svelte.ts`(`$state` 목록 · `showToast(msg)`) + `site/ToastHost.svelte` | 2.6초 · 하단 중앙 · `history.replaceState` 로 파라미터 제거 |
| 카테고리 칩 · 인플루언서 필터 = URL | `page.tsx qs()` | `+page.svelte` `<a href={qs({cat})}>` | `aria-current="page"` |
| ★ 추천 정렬 · 링크 보호 중 타 인플루언서 상단 고정 해제 | `page.tsx featOf()` | `+page.server.ts` | |
| "보는 중" 20초 갱신 | `campaign-card.tsx` `Viewers` `ViewersSum` | `site/Viewers.svelte`(`viewersOf(code, now)` 순수) | 의사난수 유지(열린 결정) |
| 3D 틸트 | `components/tilt.tsx` | `site/tilt.ts`(`use:tilt` 액션 — `.ph`/`.store-hero` 호스트 · `(hover: none)` · reduced-motion 무동작) | |
| OG · canonical 메타 | `generateMetadata` | `<svelte:head>` in `+page.svelte`(데이터는 `+page.server.ts`) | 종료 판매 `noindex, follow` |
| 판매 카드 · 상품 아이콘 · 아바타 | `campaign-card.tsx`(`CampaignCard` `ProductIcon` `SellerAvatar` `NOTIFY_TOAST`) | `site/{CampaignCard,ProductIcon,SellerAvatar}.svelte` | 링크는 정식 URL `/s/{handle}/{code}` — 내부 이동은 쿠키를 덮지 않는다 |
| 상태별 CTA(구매하기 full width · 오픈 알림 · 종료) | `components/store/{buy-cta,option-picker,qty-stepper}.tsx` | `site/store/{BuyCta,OptionPicker,QtyStepper}.svelte`(`StoreView` 가 조합) | 🛒 장바구니 없음(슬라이스 1) · `buyNow`: 미로그인 → `/login?next=/checkout?c&o&q` |
| 문의하기 모달(고객센터 안내) | `components/cs-modal.tsx`(`CS_TYPES` · 주문번호 복사) | `site/CsModal.svelte`(export `SiteCsModal` — 기존 `modals/CSModal.svelte` 는 데모) | `/api/cs` 없음 — 채널 안내만 |
| 개발용 로그인 폼 | `login-client.tsx DevLoginForm`(`NEXT_PUBLIC_DEV_LOGIN`) | `login/+page.svelte` `{#if PUBLIC_DEV_LOGIN === '1' && dev}` | 프로덕션 번들에서 접힘 |
| `/c/[code]` 308 · 정규 핸들 308 | `permanentRedirect` | `redirect(308, canonicalStoreUrl(card))` | `@` 없는 핸들 |
| 폰트 | `app/fonts.ts`(next/font) | `app.html` Google Fonts `<link>`(결정 G) · Galmuri 미적재 | `font-synthesis: none` · `-webkit-font-smoothing` 금지(CLAUDE.md 타이포 규칙) 는 `site.css` `@layer base` 가 그대로 |

### 4.4 제거하는 프로토타입 전용 화면(S2, 결정 B)

| 현재 apps/shop | 처리 | 대체 |
|---|---|---|
| `routes/cart/+page.svelte` · 서브내비 "장바구니" · `cartN()` 배지 | 삭제 | 장바구니 없음 — `구매하기` 만(web 과 동일) |
| `routes/influencers/+page.svelte` · "인플루언서" 탭 | 삭제 | 홈 우측 "인플루언서" 칩(`?seller=<code>`) |
| `routes/about/+page.svelte` · "셀러리 소개" 탭 | 삭제 | 서브내비는 `진행 중인 판매` · `내 주문`(로그인 시) 만 |
| `routes/orders/+page.svelte`(데모 내 주문) | 삭제 | `/account/orders` |
| `routes/s/[cid]/+page.svelte`(데모 링크 · `setLinkCtx`) | 삭제 | `/s/[handle]/[code]` + 쿠키 |
| `+layout.ts`(`ssr=false` · `S.role='customer'`) · `@sellery/core` import 전부 | 삭제 | SSR on · `@sellery/db` |

---

## 5. apps/influencer — 콘솔 1~2단계 이식 명세

### 5.1 라우트 매핑 (`base = '/influencer'` — 아래 경로는 base 뒤 경로)

| 경로 | Next 파일 | SvelteKit 파일 | 서버 | 완료 기준(`inf-console-plan.md §7` 2단계 (a)~(i) 그대로) |
|---|---|---|---|---|
| 셸 | `(partner)/layout.tsx` · `partner-shell.tsx` · `console-tabs.tsx` | `routes/+layout.server.ts`(`getSellerContext(event)` 표시용 — `ok` 면 `{ name, grade, balance }`, `suspended` 면 이름만) + `routes/+layout.svelte`(`ConsoleShell` `ConsoleTabs` from `@sellery/ui/site/console`) + `app.html` | 게이트 아님 | 상단 바(워드마크 → `/influencer/home` · "인플루언서 콘솔" · 활동명 · 등급 · 🥬 · 로그아웃 폼 `action="/influencer/auth/signout?next=/influencer/login"`) · 하단 탭 5(홈 · 상품 · 캠페인 · 매출 · 내 정보 — 없는 탭은 콘솔 404) · `<meta robots noindex>` · 400px 가로 스크롤 없음 |
| `/` | `influencer/page.tsx` | `routes/+page.server.ts` `redirect(303, '/influencer/home')` | | |
| `/login` | `(public)/login/page.tsx` · `login-form.tsx` | `routes/login/+page.server.ts`(`next = consoleNextOf(url.searchParams.get('next'))` · `foreign` 이면 안내, 파트너 세션이면 `redirect(303, next)` · `?error=auth\\|expired` 문구) + `+page.svelte`(`signInWithPassword` → `location.assign(next)` · `messageFor(code)` 3종) | `safeGetSession` · `isPartnerUser` `linkSellerIdOf` | "← 셀러리 고객 사이트" = `PUBLIC_SITE_URL` |
| `/signup` | `signup/page.tsx` · `signup-form.tsx` | `routes/signup/+page.server.ts`(로그인 상태 → home) + `+page.svelte`(`signUp({ email, password, options: { emailRedirectTo: \`${origin}/influencer/auth/confirm?next=${encodeURIComponent('/influencer/home')}\`, data: { partner_role:'seller', display_name, platform, handle, referral_code, terms_agreed_at } } })` → `/influencer/verify-sent?email=`) | | 활동명 · 이메일 · 비밀번호(`PASSWORD_RE`) · 플랫폼 · 핸들(`HANDLE_RE`) · 추천 코드 · 약관(고객 사이트 절대 URL) |
| `/verify-sent` | `verify-sent/page.tsx` · `resend-button.tsx` | `routes/verify-sent/+page.svelte`(+ `ResendButton` — `auth.resend({ type:'signup', email, options:{ emailRedirectTo } })` 60초 쿨다운) | | 발신 `no-reply@sellery.life` 안내 |
| `/password` | `password/page.tsx` · `password-form.tsx` | `routes/password/+page.svelte`(`resetPasswordForEmail(email, { redirectTo: \`${origin}/influencer/auth/confirm?next=${encodeURIComponent('/influencer/password/new')}\` })`) | | 계정 존재 여부 비노출 |
| `/password/new` | `password/new/page.tsx` · `new-password-form.tsx` | `routes/password/new/+page.server.ts`(`user`) + `+page.svelte`(`updateUser({ password })` → `/influencer/home`) | | 세션 없으면 "재설정 메일 다시 받기" |
| `/apply` | `apply/page.tsx` · `apply-form.tsx` · `actions.ts` | `routes/apply/+page.server.ts`(load: `getSellerContext` 분기 anon/ok/suspended/foreign → redirect, guest → `createSellerFromSignup` 멱등 재시도 → 성공 시 home, 실패 시 `reason` + `user_metadata` 프리필; `actions.default` = `completeSignup`) + `+page.svelte`(`use:enhance` · `form?.error`) | rate limit `apply:<uid>` | `NO_FORM` 코드(`LINK_TARGET_NOT_FOUND` `LINK_TARGET_TAKEN` `NOT_CONFIRMED`)는 안내만 |
| `/home` | `home/page.tsx` | `routes/home/+page.server.ts`(`requireSeller`) + `+page.svelte` | service | 활동명 · 등급 · 🥬 · "지금 할 일" 3장(채널 인증 → `/my` · 계좌 5단계 예고 · 상품 3단계 예고) |
| `/my` | `my/page.tsx` · `my-client.tsx` · `actions.ts` | `routes/my/+page.server.ts`(load: `requireSeller` + `seller_channels` 목록 + `?verify=` `?edit=` `?add=1` `?msg=`; `actions` 5개 §2.4) + `+page.svelte` + `site/console/{CopyButton,DeleteChannelForm}.svelte` | service + `seller_id` 필터 | 칩 규칙(✓ 인증됨 / 인증 대기 / 미인증) · 인증 패널(코드 `SLRY-XXXX` · 방법 1·2) · 메인 SNS · 정산 정보 미등록 칩 |
| `/suspended` | `suspended/page.tsx` | `routes/suspended/+page.server.ts` + `+page.svelte` | `getSellerContext` 직접 | 폼 없음 · `COMPANY.email` |
| `/auth/confirm` | `app/auth/confirm/route.ts` | `routes/auth/confirm/+server.ts`(결정 15 — shop 사본과 동일 로직, `loginUrlFor` 는 `/influencer/login?error=`) | `verifyOtp` → `createSellerFromSignup` | 링크를 다른 기기에서 열어도 `/influencer/home` · 재클릭 → `?error=expired` |
| `/auth/signout` | `app/auth/signout/route.ts` | `routes/auth/signout/+server.ts` POST → `redirect(303, safeNext(next) \\|\\| '/influencer/login')` | | |
| 콘솔 404 | `influencer/not-found.tsx` · `[...rest]/page.tsx` | `routes/+error.svelte`(셸 안 · "페이지를 찾을 수 없습니다 · ← 콘솔 홈") | | `/influencer/products` 404 셸 안 |
| 데모 화면 | `apps/influencer/src/routes/{camps,dm,explore,rank,ref,sales,settle,shop,c/[cid],s/[cid],login}` · `+page.svelte`(홈) | `routes/(demo)/…`(홈은 `(demo)/demo/+page.svelte`, 데모 로그인은 `(demo)/demo-login/+page.svelte`) + `(demo)/+layout.ts`(`ssr = false` · `S.role='seller'`) + `(demo)/+layout.server.ts`(`if (!dev && env.PUBLIC_DEMO !== '1') error(404)`) + `(demo)/+layout.svelte`(기존 `AppShell` 탭 레이아웃) | — | 프로덕션 404 · dev 에서 `/influencer/demo` |

### 5.2 서버 액션 → form actions (§2.4 표) · 라우트 핸들러

| web | apps/influencer | 비고 |
|---|---|---|
| `completeSignup` | `apply/+page.server.ts actions.default` | `fail(400, { error })` → `form.error` |
| `issueVerifyCode` `confirmVerify` `setPrimaryCh` `saveChannel` `deleteChannel` | `my/+page.server.ts actions.*` | `<form method="post" action="?/saveChannel">` · 삭제는 `confirm()` 뒤 제출(`DeleteChannelForm`) |
| `notifySlack` 두 곳(가입 완료 · 인증 확인) | 그대로(`@sellery/db/server/partner/slack`) | 이메일·핸들·URL 없이 |
| `rateLimit` | 그대로 | |

### 5.3 hooks (influencer)

`hooks.server.ts` = `supabase`(§2.1 공통) → `gate`(§2.2 "콘솔 게이트") 의 `sequence`. `(demo)` 경로와 `CONSOLE_PUBLIC_PATHS`(`/login` `/signup` `/verify-sent` `/password` `/password/new`) · `/auth/` 는 게이트 밖.

### 5.4 스크립트 · 메일 템플릿 · 정적 자산

| web | 새 위치 | 변경 |
|---|---|---|
| `web/scripts/partner-admin.mjs`(list · suspend · reactivate · link · invite · channels · verify-channel · unverify-channel) | `packages/db/scripts/partner-admin.mjs` | `.env.local` 을 **저장소 루트**에서 읽는다(`resolve(scriptDir, '../../..', '.env.local')`) · 이름 `NEXT_PUBLIC_SUPABASE_URL` → `PUBLIC_SUPABASE_URL` · `invite` 의 `redirectTo` = `${PUBLIC_SITE_URL}/influencer/auth/confirm?next=/influencer/password/new` |
| `web/scripts/dev-seller.mjs` | `packages/db/scripts/dev-seller.mjs` | 같음(production 거부 가드 유지) |
| `web/scripts/dev-user.mjs` | `packages/db/scripts/dev-user.mjs` | 같음 |
| `web/scripts/gen-types.mjs` | `packages/db/scripts/gen-types.mjs` | 출력 `packages/db/src/database.types.ts` |
| `web/emails/{README,confirm-signup,reset-password,invite}` | `docs/emails/`(결정 K) | 링크 `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=…` 그대로 — 대시보드 값 변경 없음 |
| `web/public/email/celery.png` | `apps/shop/static/email/celery.png` | URL 불변 |
| `web/DEPLOY.md` | `docs/deploy.md`(S5, `web/` 삭제 시) | §1 표를 이 문서 §1.2 로 대체, §3~§4·§7~§8 유지 |

### 5.5 브랜드 콘솔을 위해 남겨 두는 것

`ConsoleShell` 의 `role` prop(`seller \| brand`) · `TABS[role]` · `consolePath(role, path)` · `partner_identity_confirmed` 위의 `create_brand_from_signup`(새 번호 마이그레이션, `inf-console-plan.md §9`) — apps/brand 이식 때 같은 골격을 복사한다.

---

## 6. brand · admin

| 항목 | 지금 | 이식 후(S1~S4) | 이후 |
|---|---|---|---|
| `apps/brand` `apps/admin` | adapter-static SPA · `ssr=false` · `@sellery/core` 데모 상태 · `LoginPage`(데모 계정) | adapter-vercel 로만 바꾼다(`+layout.ts` `ssr=false` 유지) + `hooks.server.ts`(§2.1 `supabase` 핸들만 — 세션 회전 · 요청당 클라이언트, 화면은 안 쓴다) + `routes/+layout.svelte` 에 `DemoBanner`("데모 데이터 · 이 브라우저에만 저장 · 관리자 대시보드에서 초기화") + `<meta robots noindex>` + `routes/robots.txt/+server.ts`(`disallow: /`) | S4 부터 `sellery.life/brand` `sellery.life/admin` 노출(결정 D) |
| 로그인 | 데모 `sellery-session` | 그대로 | 브랜드 콘솔 이식 시 `create_brand_from_signup` + 이메일 로그인(`inf-console-plan.md §9`) |
| 데이터 | localStorage `sellery-proto-v30` | 그대로 | 브랜드 이식 = `packages/db` 에 `partner/brand.server.ts` · 관리자 = 스크립트(`partner-admin.mjs`) → 화면 |

로드맵 한 단락: 인플루언서 콘솔 3~5단계(`inf-console-plan.md §7`: 상품 갤러리 · 무상 샘플 · 캠페인 · 샘플 구매 결제 · 매출/정산 자료)를 `apps/influencer` 에서 이어 가고, 그 골격(셸 · `requireSeller` · form actions · `partner_payments`)을 그대로 복사해 `apps/brand` 를 데모에서 콘솔로 바꾼다(브랜드 가입 · 상품 등록 · 검수 대기 · 발주 CSV · 운송장). `apps/admin` 은 가장 나중 — 그 전까지 관리 작업은 `packages/db/scripts/partner-admin.mjs` 와 `npx supabase db query --linked` 다. 데모 상태(`@sellery/core` state/actions/seed)는 마지막 데모 화면이 사라질 때 함께 지운다.

---

## 7. 단계별 계획

각 단계 = PR 1개 이상, `프로토타입 점검`(ci.yml) + (S5 까지) `web-ci` 초록 + 리뷰 코멘트 해결 후 squash. **S1 은 공유 파일(패키지 · CI · 루트)을 만지므로 다른 PR 이 없을 때 먼저 병합**하고, S2 이후는 파티션(§9) 안에서만 움직인다.

| 단계 | 범위 | PR 단위 | 산출물 | 완료 기준 | 사용자가 할 일 | 위험 |
|---|---|---|---|---|---|---|
| **S1 골격** | 배포 방식 전환 · 패키지 뼈대 · 인증 hooks · CI | PR-1 `chore: adapter-vercel + Vercel 4 프로젝트 골격` · PR-2 `feat: packages/db · packages/payments (web/lib 이동, 화면 없음)` | 4 앱 `svelte.config.js`(adapter-vercel · `env.dir` · shop `base ''`) · `apps/*/vercel.json`(`regions`; shop 은 §1.3 rewrites) · `apps/*/src/hooks.server.ts` · `app.d.ts` · `$lib/server/*.ts` 배럴 · `packages/db` `packages/payments`(§3 표 전부 이동 + `configure*`) · `packages/db/scripts/*` · 루트 `.env.example`(이름 표) · `scripts/check-boundaries.mjs` · `vitest` 설정 + 순수 규칙 테스트 · `.github/workflows/ci.yml`(job 이름 `프로토타입 점검` 유지 — 내용: `npm ci` → `npm run check` → `npm test` → `node scripts/check-boundaries.mjs` → `npm run build:apps`(더미 `PUBLIC_*`)) · 삭제: `scripts/build.mjs` `scripts/serve-dist.mjs` `hub/` 루트 `vercel.json` `api/` · 루트 `assets/` → `apps/shop/static/assets` · `scripts/vite-root-assets.mjs` DIR 변경 · README "로컬 개발" 포트 표 · `engines.node >=22` | (a) `npm run check` · `npm test` · `node scripts/check-boundaries.mjs` · `npm run build:apps` 초록(`.vercel/output` 4개) (b) 4 프로젝트 Preview/Production 배포 성공 — `https://sellery-shop.vercel.app/`(데모 고객 홈, base `''`) · `sellery-influencer.vercel.app/influencer/` · `sellery-brand.vercel.app/brand/` · `sellery-admin.vercel.app/admin/` 각 200 + `/assets/burningon.webp` 는 shop 만 200 (c) **`curl -sI https://sellery-shop.vercel.app/influencer/login` 이 influencer 앱 응답**(리라이트 합쳐짐 — §1.3 검증) (d) `curl -sD - https://sellery-shop.vercel.app/ -H 'cookie: sb-ocxppeuoiysnkwwujvko-auth-token=x'` 응답에 세션 관련 오류 없음(hooks 동작) (e) 로컬 `npm run dev:*` 4개 동시 기동 · `/assets/*` 응답 (f) `sellery.life` 무영향(`web/` 그대로) | **Vercel 프로젝트 4개 생성**(§1.2 표: Root Directory · outside root ON · Node 22 · Preview Protection Off · Ignored Build Step) · 앱별 환경변수 입력(§1.2) · Supabase Redirect URLs 에 `https://sellery-shop.vercel.app/**` · `https://*-weglow-team.vercel.app/**`(이미 있으면 확인) 추가 · A 결정 확정 | adapter-vercel 최신판의 Vite 8 지원(설치 시 peer 경고 확인) · `vercel.json` 리라이트 병합(§8.3) · `Include source files outside root` 를 안 켜면 `packages/*` 를 못 찾는다 |
| **S2 shop 공개 화면** | `/` `/s/*` `/c/*` `/terms` `/privacy` 셸 · 404 · robots · 링크 쿠키 · 정적 자산 | PR-3 `feat(shop): 고객 홈·판매 페이지 동일 재현` · PR-4 `feat(ui): site 컴포넌트·site.css` (PR-4 먼저) | `packages/ui/css/site.css`(globals.css 이식) · `packages/ui/src/site/**`(§4.3 표의 컴포넌트 전부 — `checkout/*` `orders/*` 는 S3) · `apps/shop/src/app.html` · `routes/{+layout.server.ts,+layout.svelte,+error.svelte,+page.server.ts,+page.svelte}` · `s/[handle]/[code]` · `c/[code]` · `terms` `privacy` · `robots.txt` · `apps/shop/static/{email,favicon.svg}` · 삭제 §4.4 | (a) `sellery-shop.vercel.app` 과 `sellery.life` 를 나란히: `/` · `/s/jiyu_beauty/c1` · `/c/c1` · `/terms` · `/privacy` · `/없는경로` 를 400px · 1200px 에서 스크린샷 비교 — 문구 · 순서 · 색 · 폰트 굵기 동일 (b) `curl -sI /c/c1` 308 · `/s/@jiyu_beauty/c1` 308(정규 핸들) · 없는 코드 404 (c) `curl -sD - /s/jiyu_beauty/c1` 에 `set-cookie: slry_linkctx=c1; …HttpOnly; SameSite=Lax; Secure` · `-H 'sec-fetch-site: same-origin'` 이면 없음 (d) 쿠키를 들고 `/` 요청 → 링크 보호 안내 문구 + 타 카테고리만 노출 (e) `/robots.txt` allow/disallow 동일 (f) 홈 카드 "인증 확인" 모달이 anon RPC 로 열림 (g) `check-boundaries` 초록(shop 에 `@sellery/core` bare import 0) | 없음 | `site.css` 와 `theme.css` 의 클래스명 겹침(`.card` `.st` …) — 앱당 하나만 import 하므로 충돌 없음, 단 `packages/ui/src/site/**` 는 `site.css` 만 가정 |
| **S3 shop 로그인 · 체크아웃 · 결제 API · 내 주문** | `/login` `/auth/*` `/checkout*` `/account/*` `/api/*` | PR-5 `feat(shop): 카카오 로그인·auth 라우트·내 주문` · PR-6 `feat(shop): 체크아웃·결제 API·웹훅·reconcile`(PR-5 먼저) | `routes/login` · `auth/{callback,confirm,signout}` · `account/orders(+error)` · `account/orders/[code]` · `checkout` · `checkout/{success,fail}` · `api/{health,me,checkout,payments/*,cron/reconcile}` · `packages/ui/src/site/{checkout,orders}/*` · `ToastHost` URL 플래그 | (a) `app-plan §11.2` 브라우저 시나리오 전부(카카오 로그인 → `next` 복귀 · 미로그인 `/checkout` → `/login?next=` · `/account/orders` 카드) (b) `app-plan §11.3` 토스 테스트 결제 시나리오(Preview · 테스트 키): 결제창 → 성공 페이지 → 내 주문 1건 → 환불 → `환불 완료` · 성공 페이지 새로고침 → 주문 중복 없음 · `amount` 변조 → `AMOUNT_MISMATCH` (c) 토스 콘솔 "웹훅 테스트 전송"(URL = `https://sellery-shop.vercel.app/api/payments/webhook`) → 200 + `payment_events` 1행 · `curl -X POST …/webhook -d '{}'` → 400 (d) `POST /api/cron/reconcile` Bearer → 200 (e) `/api/health` 200 (f) 다른 오리진에서 `POST /api/checkout` → 403 `BAD_ORIGIN` (g) `curl -sI /account/orders` 에 `cache-control: private, no-store` | 토스 테스트 상점 웹훅 URL 에 `sellery-shop.vercel.app` 추가 · Supabase Redirect URLs 확인 · Preview Protection Off 확인 · 테스트 결제 카드로 (b) 실행 | `successUrl` 오리진 = `window.location.origin`(Preview 마다 다름 — Deployment Protection Off 필수) · 토스 SDK 는 브라우저 전용(동적 import) · `maxDuration` 이 `config` 로 실리는지 Vercel 함수 설정에서 확인 |
| **S4 도메인 전환** | `sellery.life` → `sellery-shop` | PR-7 `chore(shop): 프로덕션 리라이트·env` | `apps/shop/vercel.json` `/influencer*` → `sellery-app.vercel.app`(임시) · `/brand*` `/admin*` → 데모 프로젝트 · brand/admin `DemoBanner` · `noindex` · `docs/deploy.md` 초안 | §1.6 절차 1~5 전부 · (추가) `curl -sI https://sellery.life/influencer/home` → 302 `/influencer/login?next=…`(Next 콘솔 게이트) · 파트너 계정으로 `sellery.life/influencer/login` 로그인 → `/home`(Next) · 같은 브라우저에서 `sellery.life/` 고객 홈 persona 는 로그아웃 상태 아님(같은 세션 — web 경로 모드와 동일 · 콘솔 `foreign` 안내로 이어짐) · `sellery.life/brand` `sellery.life/admin` 데모 띠 + `robots.txt` disallow | 도메인 이동(§1.6-3) · Production env 확인 · (실판매 시점이면) 토스 라이브 키 짝 | 리라이트를 통과한 Next 콘솔이 `sellery-app.vercel.app` host 를 보고 `customerHost` 불일치로 **경로 모드** 로 동작해야 한다(`proxy.ts` 규칙 3 은 `*.vercel.app` 면 스킵 — 안전) · 롤백 = 도메인 되돌리기 |
| **S5 influencer 1~2단계** | 콘솔 이식 · `web/` 삭제 | PR-8 `feat(ui): 콘솔 셸` · PR-9 `feat(influencer): 로그인·가입·auth·홈·내 정보 + (demo) 그룹` · PR-10 `chore(shop): 리라이트 → sellery-influencer` · PR-11 `chore: web/ 삭제 · web-ci 제거 · docs/deploy.md` | §5 표 전부 · `apps/shop/vercel.json` 목적지 교체 · `docs/emails/` · `docs/deploy.md` · `.github/workflows/web-ci.yml` 삭제 | `inf-console-plan.md §7` 2단계 (a)~(i) 를 `sellery.life/influencer/…` 에서 전부 재실행(실제 외부 이메일 · 다른 기기에서 링크 · `db query` 확인 · `suspend` → `/suspended` · `/password` · 카카오 세션 브라우저에서 콘솔 → `foreign` 안내 · `dev-seller.mjs` · `invite --link s2` · 추천 코드) · `curl -sI https://sellery.life/influencer/login` 응답 헤더로 SvelteKit 앱임을 확인 · 콘솔 Preview(`sellery-influencer-git-*.vercel.app/influencer/signup`) 에서 가입 메일 링크가 같은 Preview 로 착지 | `main` 보호 규칙에서 required check `web-ci` 제거(PR-11 병합 전에 하면 PR-11 이 영원히 대기 — **병합 직후**) · 1주 뒤 `sellery-app` 프로젝트 삭제(A) · Supabase Redirect URLs 에서 `sellery-app.vercel.app/**` 제거 | 리라이트된 요청의 `event.url.origin`(§8.3) — form actions CSRF · `trustedOrigins` |
| **이후** | 콘솔 3~5단계 · brand 콘솔 · admin · 데모 상태 제거 | `inf-console-plan.md §7` 3~6 · §9 | | | | |

---

## 8. 검증 계획 · 위험 · 롤백

### 8.1 정적(모든 PR)

| 검사 | 명령 | 통과 기준 |
|---|---|---|
| 타입·템플릿 | `npm run check`(`svelte-check` 4 앱 + `tsc --noEmit` packages) | 0 errors |
| 순수 규칙 | `npm test`(vitest — `packages/db` `packages/payments`) | `safeNext` 오픈 리다이렉트 케이스(`//evil` `/\evil` 탭 삽입 `/auth/` `/login`) · `linkCtxFromCard` 보호 기간 · `custVisible` 3분기 · `orderStatusLabel/shipLabel/isRefundable` · `parseCheckoutParams` `validateShipping` `parseSuccessParams`(`'1e4'` 거부) `failText` · `generateOrderId` 형식 · `parseSignupMeta` |
| 경계 | `node scripts/check-boundaries.mjs` | §3.3 (a)~(d) 위반 0 |
| 빌드 | `npm run build:apps`(더미 `PUBLIC_*` — 비밀 없이) | 4 앱 `.vercel/output` 생성. 빌드가 비밀키를 요구하면 설계 위반 |

### 8.2 curl · 브라우저

| 대상 | 명령 · 시나리오 | 기대 |
|---|---|---|
| 리라이트 | `curl -sI https://sellery.life/influencer/login` | 200 · 응답이 influencer(또는 S4 동안 Next) |
| 세션 쿠키 통과 | 로그인 쿠키로 `curl -sD - https://sellery.life/influencer/home` | 200 + (만료 임박이면) `set-cookie: sb-…` 회전 |
| 링크 쿠키 | §2.5 | |
| 캐시 헤더 | `curl -sI https://sellery.life/account/orders`(쿠키 없이) | `cache-control: private, no-store` · `x-vercel-cache: MISS`(SSR 함수) |
| CSRF | 다른 오리진에서 `POST https://sellery.life/auth/signout`(form) | 403 |
| 결제 | `app-plan §11.3` 전부 · `inf-console-plan §8.4` 는 콘솔 결제 단계 때 | |
| 콘솔 | `inf-console-plan §8.2`(호스트 관련 행 제외) · `§8.3` | |
| 회귀 | S2·S3 완료 시 `sellery.life`(web) 와 `sellery-shop.vercel.app` 를 같은 시드로 나란히 비교 | 화면 동일 |

### 8.3 위험

| 위험 | 내용 | 대응 |
|---|---|---|
| 쿠키 공유 | 리라이트를 거친 응답의 `Set-Cookie` 가 브라우저에 `sellery.life` host-only 로 저장되는지 | S1 (d) · S5 로그인 뒤 `document.cookie`(httpOnly:false 라 보인다)에 `sb-…` 확인 · 콘솔 로그아웃 뒤 고객 홈 persona 가 즉시 로그아웃 상태 |
| 웹훅 URL 불변 | 토스 라이브 상점 웹훅은 `https://sellery.life/api/payments/webhook` 그대로 — S4 도메인 이동 순간 shop 이 받는다 | S4 전에 S3 (c) 를 `sellery-shop.vercel.app` 로 통과시켜 둔다. 이동 뒤 토스 "웹훅 테스트 전송" 1회 |
| 토스 `successUrl` 오리진 | `window.location.origin` — Preview 별 오리진 · Deployment Protection 이 켜지면 복귀가 인증 페이지에 막힌다 | §1.2 Preview Off · 브랜치 고정 도메인 사용 |
| 캐시 헤더 | `@supabase/ssr` `setAll` 의 `headers` 를 응답에 안 실으면 CDN 이 세션 응답을 캐시할 수 있다 | §2.1 `authHeaders` → `response.headers.set` · 세션 페이지 `setHeaders({'cache-control':'private, no-store'})` · S3 (g) |
| 리라이트 뒤 `event.url.origin` | adapter-vercel 이 URL 을 `host` 헤더로 만든다면 influencer 앱은 `https://sellery-influencer.vercel.app` 을 자기 오리진으로 본다 → form action POST(`Origin: https://sellery.life`) 가 내장 CSRF 에 403 | (1) 리다이렉트는 전부 **상대 경로**(web 의 `consolePath` 관례 유지) (2) influencer/brand/admin `kit.csrf.trustedOrigins: ['https://sellery.life']` (3) S1 에서 influencer 에 임시 `routes/api/origin/+server.ts`(`{ origin: event.url.origin, host, xfh: request.headers.get('x-forwarded-host') }`) 를 두고 `curl https://sellery-shop.vercel.app/influencer/api/origin` 으로 실측 → 결과를 이 표에 기록 |
| `vercel.json` 리라이트 병합 | Build Output(`.vercel/output/config.json`)과 프로젝트 `vercel.json` 의 병합 여부 | S1 (c). 실패 시 대안: shop `hooks.server.ts` 프록시(`fetch(destination, { headers, body, redirect:'manual' })` → 응답 헤더·`set-cookie` 그대로) — 이 경우 `x-forwarded-host` 를 직접 넣는다 |
| runes `state_unsafe_mutation` | 컴포넌트 init(스크립트 최상위 · `$derived`) 안에서 `$state` 를 바꾸면 던진다(`apps/*/src/routes/+layout.ts` 주석) | SSR 앱은 모듈 수준 `$state` 를 만들지 않는다(§3.3 경계). 사이트 토스트(`site/toast.svelte.ts`)는 이벤트 핸들러·`onMount` 에서만 mutate. `(demo)` 는 `+layout.ts load` 에서 `S.role` 지정 유지 |
| TS 6 | `typescript@6.0.3` + `svelte-check@4.7.6`: `rewriteRelativeImportExtensions` · `moduleResolution: bundler` 이미 사용 | `packages/db` `tsconfig.json` 도 같은 옵션. `@supabase/supabase-js@2.116` 타입은 TS 6 에서 검증됨(web-ci 는 TS 5 — S1 에서 `npm run check` 로 확인) |
| Vite 8 | `@sveltejs/adapter-vercel` 의 지원 범위 | S1 첫 작업: `npm i -D @sveltejs/adapter-vercel@latest -w apps/shop` 후 peer 경고 · `vite build` 통과 여부. 안 되면 `@sveltejs/adapter-node` + Vercel 은 불가하므로 adapter-vercel 버전 고정(`resolutions`) 또는 Vite 7 로 앱만 내린다(위험 낮음 — kit 2.70 은 둘 다 지원) |
| `$env/static/public` 누락 | 없는 변수를 import 하면 빌드 실패 | 루트 `.env.example` 표 + CI `env` 더미(`PUBLIC_SUPABASE_URL=https://example.supabase.co` `PUBLIC_SUPABASE_ANON_KEY=ci` `PUBLIC_TOSS_CLIENT_KEY=test_gck_ci` `PUBLIC_SITE_URL=http://localhost:5176`) |
| Ignored Build Step | `git diff` 기반 스킵이 packages 변경을 놓치면 앱이 낡은 패키지로 남는다 | 명령에 `../../packages ../../package-lock.json` 포함(§1.2) · 의심되면 Vercel "Redeploy" |
| `web/` 와의 이중 배포 | S1~S5 동안 모든 푸시가 5 프로젝트를 빌드 | Ignored Build Step 으로 대부분 스킵. `sellery-app` 은 `web/` 만 본다(Root Directory) |
| DB | 마이그레이션 변경 없음(0001~0010 그대로) | `gen:types` 출력 경로만 바뀐다 |

### 8.4 롤백

| 단계 | 롤백 |
|---|---|
| S1~S3 | `sellery.life` 무관 — PR revert |
| S4 | Vercel Domains 를 `sellery-app` 으로 되돌린다(1분). `web/` 는 그대로 배포 중 |
| S5 | `apps/shop/vercel.json` 목적지를 `sellery-app.vercel.app` 으로 되돌리는 PR(리라이트만) — `web/` 삭제 PR-11 은 S5 검증 (a)~(i) 통과 후에만 병합하므로 그 전까지 되돌릴 대상이 살아 있다 |
| DB | 되돌리지 않는다(변경 없음) |

---

## 9. 파티션(파일 소유) — 팀원 2명 + 에이전트

| 파티션 | 소유 | 파일 | 단계 | 완료 기준 |
|---|---|---|---|---|
| **P1 인프라 · 서버** | 팀원 A | `apps/*/svelte.config.js` `apps/*/vercel.json` `apps/*/src/hooks.server.ts` `apps/*/src/app.d.ts` `apps/*/src/lib/server/*.ts` · `packages/db/**` · `packages/payments/**` · `scripts/check-boundaries.mjs` `scripts/vite-root-assets.mjs` · `.github/workflows/ci.yml` · 루트 `package.json` `.env.example` `vitest.config.ts` · `apps/shop/src/routes/{auth,api}/**` · `apps/influencer/src/routes/auth/**` · `docs/deploy.md` | S1 · S3(PR-6) · S4 · S5(PR-10·11) | §8.1 전부 · S1 (a)~(f) · S3 (c)~(g) |
| **P2 shop 화면 · UI** | 팀원 B | `packages/ui/css/site.css` · `packages/ui/src/site/**`(콘솔 제외) · `packages/ui/package.json`(`./site` export — append) · `apps/shop/src/app.html` `app.css` · `apps/shop/src/routes/**`(`auth` `api` 제외) · `apps/shop/static/**` | S2 · S3(PR-5) | S2 (a)~(g) · S3 (a)(b) |
| **P3 콘솔 · 데모 · 문서 · 테스트** | 에이전트 | `packages/ui/src/site/console/**` · `apps/influencer/src/**`(`hooks.server.ts` `lib/server` `routes/auth` 제외) · `apps/brand/src/routes/+layout.svelte`(`DemoBanner`) `apps/admin/src/routes/+layout.svelte` · `packages/ui/src/site/DemoBanner.svelte` · `packages/db/src/**/*.test.ts` `packages/payments/src/**/*.test.ts` · `packages/db/scripts/**` · `docs/emails/**` · README "로컬 개발" · `docs/editing-guide.md`(법적 문서 경로) · `CLAUDE.md` 파일 표 갱신 | S1(테스트 · 스크립트 · README) · S4(데모 띠) · S5(PR-8·9) | S5 (a)~(i) · vitest 초록 |

규칙:
- 겹치는 파일은 셋: `packages/ui/src/index.ts` 는 건드리지 않고 `packages/ui/src/site/index.ts`(P2) · `site/console/index.ts`(P3) 로 분리. `packages/db/src/index.ts`(P1) 는 append-only.
- P2·P3 는 `@sellery/db/server/*` 를 직접 import 하지 않는다 — `$lib/server/*`(P1) 배럴에 없는 함수가 필요하면 P1 에 한 줄 PR.
- S1 병합 전에는 P2·P3 가 `packages/db` 의 **순수 모듈**(§3.1 "순수")만 상대로 컴포넌트를 만들 수 있다(브랜치에서 `web/src/lib/*.ts` 를 그대로 복사해 임시 사용 — 병합 시 import 만 교체).

---

## 10. 디렉터리 트리(최종 모습 — S5 완료 시점)

```
sellery/
├─ apps/
│  ├─ shop/                              Vercel sellery-shop · base '' · sellery.life
│  │  ├─ svelte.config.js  vercel.json(rewrites · regions)  vite.config.ts  package.json
│  │  ├─ static/                         assets/(webp·svg — 루트 assets/ 이동) · email/celery.png · favicon.svg
│  │  └─ src/
│  │     ├─ app.html(폰트 link) · app.css(@import '@sellery/ui/css/site.css') · app.d.ts · hooks.server.ts
│  │     ├─ lib/server/{db,payments,partner}.ts        ← @sellery/*/server/* 배럴 (SvelteKit 가드)
│  │     └─ routes/
│  │        ├─ +layout.server.ts  +layout.svelte  +error.svelte  +page.server.ts  +page.svelte
│  │        ├─ s/[handle]/[code]/{+page.server.ts,+page.svelte}   c/[code]/{+page.server.ts,+page.svelte}
│  │        ├─ login/{+page.server.ts,+page.svelte}
│  │        ├─ checkout/{+page.server.ts,+page.svelte}  checkout/success/{+page.ts,+page.svelte}  checkout/fail/{+page.server.ts,+page.svelte}
│  │        ├─ account/orders/{+page.server.ts,+page.svelte,+error.svelte}  account/orders/[code]/{+page.server.ts,+page.svelte}
│  │        ├─ terms/{+page.ts,+page.svelte}  privacy/{+page.ts,+page.svelte}  robots.txt/+server.ts
│  │        ├─ auth/{callback,confirm,signout}/+server.ts
│  │        └─ api/{health,me,checkout}/+server.ts  api/payments/{confirm,cancel,webhook}/+server.ts  api/cron/reconcile/+server.ts
│  ├─ influencer/                        Vercel sellery-influencer · base /influencer
│  │  └─ src/
│  │     ├─ app.html · app.css(site.css) · app.d.ts · hooks.server.ts(supabase → gate)
│  │     ├─ lib/server/{db,partner}.ts
│  │     └─ routes/
│  │        ├─ +layout.server.ts  +layout.svelte(ConsoleShell)  +error.svelte  +page.server.ts(→ /home)
│  │        ├─ login/  signup/  verify-sent/  password/  password/new/  apply/  home/  my/  suspended/
│  │        ├─ auth/{confirm,signout}/+server.ts
│  │        └─ (demo)/{+layout.ts(ssr=false),+layout.server.ts(dev·PUBLIC_DEMO),+layout.svelte(AppShell)}  (demo)/{demo,demo-login,camps,dm,explore,rank,ref,sales,settle,shop,c/[cid],s/[cid]}/
│  ├─ brand/                             Vercel sellery-brand · base /brand · 데모(ssr=false) + hooks + DemoBanner + robots disallow
│  └─ admin/                             Vercel sellery-admin · base /admin · 데모(ssr=false) + hooks + DemoBanner + robots disallow
├─ packages/
│  ├─ core/                              데모 상태 · 정책 상수(constants·util·icons·types 만 공용)
│  ├─ db/                                @sellery/db
│  │  ├─ package.json(exports . ./* ./partner/* ./legal/* ./server/* ./server/partner/*) · tsconfig.json · vitest
│  │  ├─ scripts/{gen-types,partner-admin,dev-seller,dev-user}.mjs
│  │  └─ src/
│  │     ├─ index.ts(순수만) · database.types.ts · browser.ts
│  │     ├─ auth.ts  linkctx.ts  console-paths.ts  campaign.ts  order-status.ts  carriers.ts  dates.ts  text.ts  types.ts  legal.ts  company.ts
│  │     ├─ partner/signup-rules.ts · legal/{terms,privacy}.ts
│  │     └─ server/{config,admin,auth,linkctx,customers,campaign,orders}.server.ts · server/partner/{seller,signup,slack}.server.ts
│  ├─ payments/                          @sellery/payments
│  │  └─ src/{money,checkout-rules}.ts · src/server/{config,toss,checkout-sync}.server.ts · *.test.ts
│  └─ ui/                                @sellery/ui
│     ├─ css/{theme.css(데모),site.css(고객·콘솔),legacy/*}
│     └─ src/
│        ├─ index.ts · components/ · modals/ · views/        (데모 — 그대로)
│        └─ site/                        props-only · site.css 가정
│           ├─ index.ts · toast.svelte.ts · tilt.ts
│           ├─ SiteHeader SubNav SiteFooter ToastHost Modal TrustBand VerifyLauncher VerifyModal SellerInfoCard CampaignCard ProductIcon SellerAvatar Viewers GradeBox PlatIcon StatusChip LegalDoc CsModal DemoBanner Wordmark
│           ├─ store/{StoreView,BuyCta,OptionPicker,QtyStepper}.svelte
│           ├─ checkout/{PaymentWidget,AddressFields,Field,OrderSummary,PayBar}.svelte
│           ├─ orders/{OrderRow,ShipInfo,RefundButton,SignOutButton}.svelte
│           └─ console/{index.ts,ConsoleShell,ConsoleTabs,PlatformHandle,CopyButton,DeleteChannelForm}.svelte
├─ scripts/{check-boundaries.mjs,vite-root-assets.mjs}     (build.mjs · serve-dist.mjs 삭제)
├─ supabase/                             migrations 0001~0010 · seed.sql (변경 없음)
├─ docs/                                 app-plan.md · inf-console-plan.md · monorepo-migration.md(이 문서) · deploy.md(← web/DEPLOY.md) · emails/ · 정책 문서
├─ .github/workflows/{ci.yml,claude.yml}                    (web-ci.yml 삭제)
├─ .env.example  .env.local(gitignored — 4 앱 공용, kit.env.dir '../..')
├─ package.json(workspaces apps/* packages/* · engines node >=22 · scripts dev:* check test build:apps gen:types)
└─ README.md · CONTRIBUTING.md · CLAUDE.md
```

삭제되는 것: `web/`(S5) · `hub/` · `api/` · 루트 `vercel.json` · `.vercelignore`(루트 프로젝트가 없어지므로) · `scripts/build.mjs` · `scripts/serve-dist.mjs` · 루트 `assets/`(→ `apps/shop/static/assets`) · `dist/`.
