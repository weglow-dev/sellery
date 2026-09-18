# 셀러리 앱 (`web/`)

셀러리(Sellery)의 실서비스 앱 — Next.js 16 App Router + Supabase + 토스페이먼츠 결제위젯 v2. 저장소 루트의 프로토타입(`index.html` · `css/` · `js/`)은 설계 원본이며 그대로 두고, 이 앱은 프로토타입의 문구·토큰·규칙을 옮겨 오되 프로토타입 js/css 를 import 하지 않는다.

**설계서 = [`docs/app-plan.md`](../docs/app-plan.md)** — 결정·디렉터리 트리·환경변수·인증·데이터 계약·라우트/API·결제 시퀀스·링크 쿠키·UI 시스템·파티션 표·검증 계획. 이 README 는 그 요약과 실행 방법이다. 배포는 [`DEPLOY.md`](DEPLOY.md), 스키마는 [`docs/data-model.md`](../docs/data-model.md).

## 슬라이스 1 범위 (돈이 흐르는 고객 경로)

| 경로 | 화면 |
|---|---|
| `/s/[handle]/[code]` · `/c/[code]` | 판매 링크 페이지 (`/c/` 는 정식 URL 로 308) |
| `/` | 고객 홈 (최소판 — 진행 중 · 오픈 예정 · 링크 유입 보호 필터) |
| `/login` · `/auth/callback` · `/auth/signout` | 카카오 로그인 (Supabase Auth) |
| `/checkout` · `/checkout/success` · `/checkout/fail` | 토스 결제위젯 → 서버 승인 |
| `/account/orders` · `/account/orders/[code]` | 내 주문 · 환불 신청 |
| `/api/checkout` · `/api/payments/{confirm,cancel,webhook}` · `/api/cron/reconcile` · `/api/me` | 서버 API (§6.2) |

파트너 센터(브랜드 · 인플루언서 · 관리자)는 다음 슬라이스 — `docs/app-plan.md §12`.

## 요구 사항

- Node **20.9 이상** (Vercel · CI 는 20, 로컬은 24 도 됨) · npm
- Supabase 프로젝트 `sellery`(ref `ocxppeuoiysnkwwujvko`) 의 URL · 키 — 마이그레이션 `supabase/migrations/0001~0008` 은 이미 적용돼 있다
- 토스페이먼츠 **결제위젯 연동 키** 테스트 짝(`test_gck_…` / `test_gsk_…`) — API 개별연동 키(`test_ck_/sk_`)를 섞으면 위젯이 뜨지 않는다

## 로컬 실행

```bash
cd web
npm install
cp .env.example .env.local        # 이름만 있는 템플릿 — 값은 docs/app-plan.md §3 표에서 얻어 채운다 (커밋 금지)
npm run dev                       # http://localhost:3000
```

- 값(키)은 `.env.local` 과 Vercel 환경변수에만 둔다. 코드·문서·PR 에 값을 쓰지 않는다.
- 카카오 로그인은 Supabase Auth 의 Kakao provider 와 Redirect URL(`http://localhost:3000/**`) 설정이 필요하다 — `DEPLOY.md` 의 외부 서비스 절. 카카오 없이 개발할 때는 `.env.local` 에 `NEXT_PUBLIC_DEV_LOGIN=1` 을 두면 `/login` 에 개발용 이메일 로그인 폼이 뜬다(production 빌드에서는 렌더되지 않음). 계정은 `node --env-file=.env.local scripts/dev-user.mjs <email> <password>` 로 만든다(파일 머리 주석).
- 결제는 테스트 키로 실제 토스 결제창이 뜬다(테스트 카드). 웹훅을 로컬에서 받으려면 터널(`npx cloudflared tunnel --url http://localhost:3000`) — `docs/app-plan.md §11.4`.
- 시드 기준 오늘(KST) LIVE 캠페인이 하나 이상 있어야 결제까지 눌러볼 수 있다 — `supabase/seed.sql` 의 상대 날짜 절.

## 스크립트

| 명령 | 내용 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run typecheck` | `tsc --noEmit` — 라우트 타입 헬퍼(`PageProps` 등)를 쓰는 파일이 있으면 `npx next typegen` 을 먼저 |
| `npm run lint` | `eslint` (flat config, `eslint-config-next`) |
| `npm run build` | `next build` — 더미 env 로도 통과해야 한다(§11.1) |
| `npm run gen:types` | 저장소 루트에서 `supabase gen types typescript --linked` → `src/lib/database.types.ts` (UTF-8 · LF, CLI 실패 시 파일 보존). 사전 조건 `npx supabase login` + `link` |

올리기 전: `npm run typecheck && npm run lint && npm run build`. PR 의 `web-ci`(`.github/workflows/web-ci.yml`)가 같은 순서를 Node 20 · 더미 env 로 돌린다.

## 구조 · 파티션

`docs/app-plan.md §2` 트리를 §10.1 의 소유 파티션(A~H)으로 표시했다. **자기 파티션 밖 파일은 만들지도 고치지도 않고**, 다른 파티션 모듈은 §10.0 계약 시그니처대로 import 만 한다.

```
web/
├─ package.json · next.config.ts · tsconfig.json · eslint.config.mjs · postcss.config.mjs · vercel.json   A
├─ .env.example · .gitignore · AGENTS.md(Next 16 안내, 유지) · README.md · DEPLOY.md                    A / H
├─ public/favicon.svg                                                                                     A
├─ scripts/gen-types.mjs (`npm run gen:types` — G 의 타입 산출용) · scripts/dev-user.mjs (B, 개발용 계정)
└─ src/
   ├─ proxy.ts                         updateSession + 링크 유입 쿠키 slry_linkctx (§8) + 콘솔 호스트 리라이트·세션 게이트 (inf-console-plan §3.2)   B
   ├─ app/                             root layout 둘 — (customer)/layout.tsx 고객 · (partner)/layout.tsx 콘솔. 최상위 layout.tsx 없음
   │  ├─ globals.css · fonts.ts · global-not-found.tsx · robots.ts                                        A
   │  ├─ (customer)/  layout.tsx · not-found.tsx · [...rest]/ — 고객 라우트는 전부 이 그룹 안 (URL 불변)      A
   │  │  ├─ (customer)/page.tsx · (customer)/s/[handle]/[code]/ · (customer)/c/[code]/                   C
   │  │  ├─ (customer)/login/ · (customer)/account/sign-out-button.tsx                                   B
   │  │  ├─ (customer)/checkout/ (page · checkout-client · success · fail)                               D
   │  │  └─ (customer)/account/layout.tsx · (customer)/account/orders/                                   F
   │  ├─ (partner)/   layout.tsx · partner-shell.tsx · console-tabs.tsx · influencer/** (inf.sellery.life 리라이트 착지 · docs/inf-console-plan.md)   I
   │  ├─ auth/callback/ · auth/signout/ · api/me/  (app/ 직속 — 어느 호스트에서도 같은 경로, 리라이트 제외)      B
   │  └─ api/checkout/ · api/payments/{confirm,cancel,webhook}/ · api/cron/reconcile/                    E
   ├─ lib/
   │  ├─ supabase/{client,server,middleware,admin}.ts · auth.ts · customers.ts · linkctx.ts · hosts.ts    B
   │  ├─ campaign.ts · campaign-server.ts · dates.ts · types.ts                                           C
   │  ├─ toss.ts · money.ts · text.ts                                                                     E
   │  ├─ orders-server.ts · order-status.ts · carriers.ts                                                 F
   │  ├─ company.ts                                                                                       A
   │  └─ database.types.ts             supabase gen types 산출 — G 만 만진다                              G
   └─ components/
      ├─ wordmark · app-bar · sub-nav · footer · toast · modal · icons · grade-box · status-chip · platform-handle   A
      ├─ campaign-card · trust-band · verify-modal · tilt · store/*                                       C
      ├─ checkout/*                                                                                       D
      └─ orders/* · cs-modal                                                                              F
```

`supabase/`(마이그레이션 · 시드)는 **저장소 루트**에 있다 — `web/supabase` 는 만들지 않는다. CLI 는 루트에서 실행(`npx supabase db push --linked`).

## 지켜야 할 것

- **Next 16 은 학습 데이터와 다르다** — `AGENTS.md` 대로 `node_modules/next/dist/docs/` 를 먼저 읽는다. `middleware` 가 아니라 `src/proxy.ts`(함수 `proxy`), `cookies()` / `headers()` / `params` / `searchParams` 는 전부 `await`.
- **모든 쓰기는 service role + DB 함수**(`app_claim_checkout` · `app_confirm_checkout` · `app_refund_precheck` · `app_refund_record`, 0008). 라우트·웹훅·reconcile 은 검증을 반복하지 않는다. 승인 전 주문은 `orders` 가 아니라 `checkout_sessions`.
- **비밀키는 서버 전용 모듈에서만** `process.env` 로 읽는다. `lib/supabase/admin.ts` 와 `lib/toss.ts` 첫 줄은 `import "server-only"` — Client Component 에서 실수로 import 하면 빌드가 실패한다.
- **금액은 서버가 계산**하고 confirm 은 `session.amount` 로 대조한다. 클라이언트가 보낸 금액은 대조용일 뿐이다. 가상계좌·계좌이체는 지원하지 않는다(`status==='DONE'` 만 인정).
- 웹훅(`/api/payments/webhook`)은 서명이 없는 공개 엔드포인트 — 본문 상태를 믿지 않고 `paymentKey` 재조회가 유일한 인증이다(§7.3).
- 사용자 노출 문구는 한국어, 프로토타입 원문 우선. 타이포: IBM Plex Sans KR 은 **700 이 최대**, `font-synthesis: none`, `word-break: keep-all`, `-webkit-font-smoothing: antialiased` · Tailwind `antialiased` 금지.
- 파일은 UTF-8(BOM 없음) · LF. 워드마크는 `components/wordmark.tsx` 로만 렌더한다.

## 검증

- 정적: `npm run typecheck && npm run lint && npm run build` (CI 동일).
- 브라우저 시나리오 · 토스 테스트 결제 시나리오 · 웹훅 로컬 테스트: `docs/app-plan.md §11.2 ~ §11.4`.
- DB 스모크(anon / authenticated / service 권한): `docs/data-model.md §8.4 · §10.4`.
