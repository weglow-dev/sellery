# 셀러리 (Sellery)

> 좋은 브랜드를 만나는 공간, 셀러리

브랜드사와 인플루언서(셀러)를 잇는 **건강·웰니스 전용** 브랜드사 협업판매 중개 플랫폼의 클릭 가능한 UI/UX 프로토타입입니다. (주)위글로우 · 오픈 준비 중.

**정식 서비스** → https://sellery.life (아래 "현재 서비스 상태" 참고). **SvelteKit 데모(apps/*)** 는 로컬에서 앱별 dev 서버로 봅니다(아래 "로컬 개발" 포트 표). (예전 Vercel 데모 주소 sellery-swart.vercel.app 은 2026-09-18 삭제)

| 주소 | 화면 |
|---|---|
| `/` | 고객 판매 페이지 · 장바구니 · 카카오 로그인(데모) · 내 주문 (shop 앱 — 도메인 루트) |
| `/influencer/` | 인플루언서 콘솔 1~2단계 (가입 · 이메일 인증 · 로그인 · 홈 · 내 정보 · 채널 인증 — 실서비스). 프로토타입 화면(캠페인 · DM · 상품 갤러리 · 정산 · 랭킹 · 셀러리 샵 · 추천)은 dev 의 `(demo)` 그룹 `/influencer/demo` |
| `/brand/` | 브랜드 센터 (상품 관리 · 주문·발주 · 고객 문의 · 인플루언서 갤러리 · 정산) |
| `/admin/` | 관리자 (검수 · 매칭·자동 제안 · 매출·순수익 · 정산 실행 · 데이터 초기화) |
| `/s/c1` | 판매 링크 진입 (링크 유입 보호 모드) |
| `/influencer/login` | 인플루언서 콘솔 로그인 (이메일/비밀번호 · Supabase Auth · 실계정) |
| `/brand/login` | 브랜드 로그인 데모 (계정 목록은 화면 안 · 비밀번호 8자 이상 아무거나) |

**제안서에 인쇄된 옛 데모** → https://junho763-dotcom.github.io/sellery-prototype/ (PDF 링크용으로 유지)

## 현재 서비스 상태 (2026-09-21 · S5 완료 · 도메인 전환 완료)

- **정식 주소 https://sellery.life 는 `apps/shop`(Vercel `sellery-shop`) 이 서비스합니다** — 고객 사이트 전부(`/` `/s/*` `/c/*` 판매 링크 · `/login` `/auth/*` 카카오 로그인 · `/checkout*` 토스 결제 · `/account/*` 내 주문 · `/api/*` · `/terms` `/privacy`). 옛 Next.js 앱 `web/` 은 S5 PR-11 에서 저장소에서 삭제됐습니다.
- `/influencer/*` 는 `apps/influencer`(Vercel `sellery-influencer`) 의 **인플루언서 콘솔 1~2단계**(가입 · 이메일 인증 · 로그인 · 홈 · 내 정보 · 채널 인증) 로 리라이트됩니다. `/brand/*` `/admin/*` 는 아직 localStorage 데모 앱(`apps/brand` · `apps/admin`) 으로 리라이트되며 상단 **데모 띠**("데모 화면 · 데이터는 이 브라우저에만 저장됩니다")와 `noindex` 가 붙습니다. Vercel 은 프로젝트 4개 + `sellery-app`(Next · **동결** — 빌드 안 함 · 롤백 전용 · 2026-09-28 경 삭제). 배포·운영은 [docs/deploy.md](docs/deploy.md)(정본), 설계는 [docs/app-plan.md](docs/app-plan.md) · [docs/inf-console-plan.md](docs/inf-console-plan.md) · [docs/monorepo-migration.md](docs/monorepo-migration.md).
- **다음 작업은 인플루언서 콘솔 3~6단계**([docs/inf-console-plan.md](docs/inf-console-plan.md) §7 — 상품 갤러리 · 샘플 · 캠페인 · 결제 · 정산), 이어서 `apps/brand` → `apps/admin` 을 데모에서 실서비스로.
- Supabase 스키마는 `supabase/migrations/0001~0010` 이 클라우드 프로젝트 `sellery` 에 적용돼 있습니다(0007 service_role 권한 · 0008 체크아웃/결제 · 0009 가상계좌 판정 수정 · 0010 파트너 가입). 새 변경은 새 번호로.

## 기술 스택

**SvelteKit 2 · Svelte 5(runes) · TypeScript · Tailwind v4** 모노레포(npm workspaces). 앱 4개가 한 도메인 아래(shop 은 루트 `/`, 나머지는 `/influencer` `/brand` `/admin` 경로 — Vercel rewrite)로 배포되며, 같은 origin 이라 데모 앱(brand · admin)의 localStorage 데이터를 앱끼리 공유합니다. shop 과 influencer 콘솔은 Supabase SSR(`hooks.server.ts`) · 토스페이먼츠 실결제 · 카카오/이메일 실인증이 붙어 있고, brand · admin 은 아직 localStorage 데모입니다.

## 로컬 개발

```bash
npm install                  # 처음 한 번 (Node 22+)
cp .env.example .env.local   # PUBLIC_SUPABASE_URL · PUBLIC_SUPABASE_ANON_KEY — 값은 비워도 됨 (이름이 없으면 check·build 가 실패)
npm run check                # 앱 4개 svelte-check (CI 와 동일)
npm run build                # 앱 4개 vite build → apps/*/.vercel/output (adapter-vercel · CI 와 동일)
```

| 앱 | 명령 | 주소 |
|---|---|---|
| 고객 (shop) | `npm run dev:shop` | http://localhost:5176/ (base `''` — 도메인 루트) |
| 인플루언서 | `npm run dev:influencer` | http://localhost:5173/influencer |
| 브랜드 | `npm run dev:brand` | http://localhost:5174/brand |
| 관리자 | `npm run dev:admin` | http://localhost:5175/admin |

4 앱은 `kit.env.dir: '../..'` 로 **루트 `.env.local` 하나**만 읽습니다 — `vercel env pull` 은 앱 폴더가 아니라 루트 파일로(`vercel env pull ../../.env.local`, `apps/<앱>/.env.local` 은 읽히지 않음). 개발 서버는 포트가 달라 localStorage 가 앱별로 분리되고, 다른 앱 링크(`/influencer/…`)는 shop dev 서버에 없으니 위 포트로 직접 엽니다. 공용 이미지·파비콘(`/assets/*` `/favicon.svg` `/email/*`)은 `apps/shop/static/` 한 곳에 있고 `scripts/vite-root-assets.mjs` 가 4 앱 dev 서버에서 서빙합니다.

> Windows 에서 `npm run build` 는 adapter-vercel 이 만드는 심링크 때문에 `EPERM` 으로 실패할 수 있습니다 — 설정 → 개발자 모드를 켜거나 WSL 에서 빌드하세요. CI(ubuntu)·Vercel 은 영향 없고, `npm run check` 와 `npm run dev:*` 는 Windows 에서 그대로 됩니다.

## 배포

**정본은 [docs/deploy.md](docs/deploy.md)** — Vercel 프로젝트 표 · 환경변수 이름 · 리라이트 표 · 도메인 전환 체크리스트 · 운영 스크립트.

Vercel 프로젝트 4개 — `sellery-shop`(Root Directory `apps/shop`, 도메인 `sellery.life` · `www`) · `sellery-influencer` · `sellery-brand` · `sellery-admin`(각 `apps/<앱>`; "Include source files outside of the Root Directory" ON · Node 22 · `@sveltejs/adapter-vercel` · 리전 `icn1`) + `sellery-app`(옛 Next `web/` — 동결 · 롤백 전용 · 2026-09-28 경 삭제). 브라우저 오리진은 하나 — `apps/shop/vercel.json` 의 rewrites 가 `/influencer/*` 를 `sellery-influencer`(콘솔), `/brand/*` `/admin/*` 를 데모 프로젝트로 프록시하므로 세션 쿠키를 모든 앱이 공유합니다. `main` 병합 = 프로덕션, PR = 앱별 Preview URL. 정적 자산은 shop 만 서빙합니다(다른 앱의 Preview URL 에서는 이미지 대신 이모지). 단계 기록은 [docs/monorepo-migration.md](docs/monorepo-migration.md) §7(S1~S5 완료).

## 구현된 흐름

상품 등록 → 검수 → 샘플 요청·승인·배송·테스트 → 판매 일정 제안·승인 → 기간 한정 판매링크 → 판매(실시간 매출) → 종료 → D+21 교환·환불 기간 → 브랜드·셀러 정산 → 재판매

## 주요 기능

- 캠페인 스레드 — 채팅 + 시스템 이벤트 타임라인, 연락처 유출 감지
- 인플루언서 갤러리 + 브랜드의 직접 제안(역제안), 수락·거절 처리
- 익명 셀러 스카우트 — 유료 레퍼런스 열람 → 수락 시 신원 공개 + DM
- 셀러 등급·랭킹 — 등급별 **수수료율 추가분**, 익명 리더보드
- 고객 판매 페이지 — 팔로워가 아닌 고객도 진행 중인 판매를 발견하고 오픈 알림 신청·장바구니·구매
- 링크 유입 보호 — 인플루언서 링크로 들어온 고객에게 같은 카테고리 상품 미노출 (홈 이동·새로고침에도 유지)
- 고객 문의(CS) — 관리자를 거치지 않고 브랜드사로 직행
- 실시간 매출 대시보드, 발주서 CSV·이메일 발주(시뮬)
- 정산 시뮬레이션 — PG 1.9% / 인플루언서 수수료 / 플랫폼 10% / 원천징수 3.3% / D+21 지급

## 판매 기간 정책

같은 상품이라도 기간은 **기본 공유** — 누구나 판매를 열 수 있습니다.
다만 **플래티넘 이상** 인플루언서가 확정한 기간에는 플래티넘 이상만 함께 진입할 수 있습니다.

## 파일 구조

```
apps/                 SvelteKit 앱 4개 — 라우트 = 화면 (폴더 이름이 URL)
  shop/               고객 판매 페이지 (base '' — 도메인 루트)  src/routes/{+page, influencers, cart, orders, about, s/[cid]}
    static/           아바타 SVG · 상품 이미지 · 파비콘 · email/celery.png — 앱 4개 공용, /assets/ /favicon.svg /email/ 로 서빙 (원본은 static/assets/_src/, git 제외)
  */svelte.config.js · vercel.json · src/hooks.server.ts   adapter-vercel(nodejs22.x · env.dir '../..') · 리전 icn1 (shop 은 /influencer /brand /admin rewrites) · Supabase SSR 세션 hooks
  influencer/         인플루언서 센터 (base /influencer)  src/routes/{+page, camps, dm, explore, sales, settle, rank, shop, ref, my, login, c/[cid], s/[cid]}
  brand/              브랜드 센터 (base /brand)           src/routes/{+page, camps, products, orders, cs, gallery, settle, my, dm, sales, shop, login, c/[cid], s/[cid]}
  admin/              관리자 (base /admin)                src/routes/{+page, products, influencers, brands, orders, match, revenue, settle, c/[cid], s/[cid]}
packages/core/src/    프레임워크 무관 로직 (TypeScript)
  constants.ts        PG_RATE · PLAT_RATE · WHT · CLEAR_DAYS · GRADES · LS 키 … 정책 숫자의 정답        ← 정책
  seed.ts             시드 데이터 — 데모 브랜드 · 인플루언서 · 상품 · 캠페인                              ← 카피 · 데모 데이터
  state.svelte.ts     상태 S($state) · D_() · save() · 링크 유입 컨텍스트 · 초기화
  helpers.ts          등급 · 정산 calc · 샘플 · 자동 매칭 · 링크 유입 보호 등 읽기 전용 계산
  actions.ts          버튼이 하는 일 전부 — 상태를 바꾸는 유일한 곳 (act.xxx)
  storage.ts          Storage 어댑터 (지금 localStorage · supabase.ts 는 자리)
packages/ui/src/      공용 UI
  css/theme.css       Tailwind + 디자인 토큰(:root) + 픽셀 스킨 (css/legacy/base.css · skin.css 를 layer 로)   ← 디자인
  components/         AppShell(앱바·탭) · HeroBand · Sec · CampRow · ProdCard · Chips …
  modals/             ModalHost 가 종류별로 렌더 (일정 · 샘플 구매 · 제안 · 상품 등록 · CS · 카카오 …)
  views/              CampaignDetail · Store · Shop · Sales · DM · LoginPage (여러 앱이 공유)
scripts/vite-root-assets.mjs   dev 전용 — apps/shop/static 을 4 앱 dev 서버에서 /assets/ /email/ /favicon.svg 로 서빙
docs/                 운영 정책 문서 · 수정 가이드 · 데이터 모델 · 이식 계획(monorepo-migration.md) (아래)
supabase/             Supabase 스키마 — migrations/0001~0010 + seed.sql (클라우드 프로젝트 `sellery` 적용 완료 · docs/data-model.md §8)
.github/              CI(프로토타입 점검 = npm run check + build · 더미 PUBLIC_*) · @claude 봇 · 이슈 템플릿 5종 · PR 템플릿
.env.example          4 앱 공용 환경변수 이름 표 → 복사해서 .env.local (gitignored)
```

## 정책 문서

숫자의 정답은 코드 상수(`packages/core/src/constants.ts`)이고, 사람이 읽는 판은 `docs/`에 있습니다. 상수를 바꾸면 같은 PR에서 문서도 고칩니다.

- [docs/settlement-policy.md](docs/settlement-policy.md) — 수수료 · 정산 (PG / 플랫폼 / 등급 추가분 / 원천징수 / D+21)
- [docs/grade-policy.md](docs/grade-policy.md) — 인플루언서 · 브랜드 등급
- [docs/period-policy.md](docs/period-policy.md) — 판매 기간 · 링크 유입 보호
- [docs/sample-policy.md](docs/sample-policy.md) — 샘플 (무상 · 구매 · 환급)
- [docs/points-policy.md](docs/points-policy.md) — 셀러리(🥬) 포인트 · 추천
- [docs/editing-guide.md](docs/editing-guide.md) — 데모 데이터 · 화면 · 디자인 수정 가이드 (비개발자용 · 파일 위치는 문서 상단의 새 경로표 참고)
- [docs/data-model.md](docs/data-model.md) — Supabase 데이터 모델 (ERD · 테이블 · RLS · 적용 방법)

## 수정하고 올리기

[CONTRIBUTING.md](CONTRIBUTING.md) 참고. 요약하면 브랜치 → `npm run check` → PR → 병합 → Vercel 자동 배포. `main`에는 직접 올리지 않습니다.

---

데이터는 브라우저 localStorage에 저장됩니다. 관리자(`/admin/`) 대시보드 상단의 **데이터 초기화** 버튼으로 시드 상태로 되돌립니다.

> 프로토타입 전용 — 실제 결제·인증·서버는 붙어 있지 않습니다. 문의: official@weglow.biz
