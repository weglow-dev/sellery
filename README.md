# 셀러리 (Sellery)

> 좋은 브랜드를 만나는 공간, 셀러리

브랜드사와 인플루언서(셀러)를 잇는 **건강·웰니스 전용** 브랜드사 협업판매 중개 플랫폼의 클릭 가능한 UI/UX 프로토타입입니다. (주)위글로우 · 오픈 준비 중.

**정식 서비스** → https://sellery.life (아래 "현재 서비스 상태" 참고). **SvelteKit 데모(apps/*)** 는 로컬 `npm run build && npm run serve` 로 확인합니다 — 첫 화면에서 센터를 고릅니다. (예전 Vercel 데모 주소 sellery-swart.vercel.app 은 2026-09-18 삭제)

| 주소 | 화면 |
|---|---|
| `/shop/` | 고객 판매 페이지 · 장바구니 · 카카오 로그인(데모) · 내 주문 |
| `/influencer/` | 인플루언서 센터 (캠페인 · DM · 상품 갤러리 · 정산 · 랭킹·등급 · 셀러리 샵 · 추천) |
| `/brand/` | 브랜드 센터 (상품 관리 · 주문·발주 · 고객 문의 · 인플루언서 갤러리 · 정산) |
| `/admin/` | 관리자 (검수 · 매칭·자동 제안 · 매출·순수익 · 정산 실행 · 데이터 초기화) |
| `/shop/s/c1` | 판매 링크 진입 (링크 유입 보호 모드) |
| `/influencer/login` · `/brand/login` | 파트너 로그인 데모 (계정 목록은 화면 안 · 비밀번호 8자 이상 아무거나) |

**제안서에 인쇄된 옛 데모** → https://junho763-dotcom.github.io/sellery-prototype/ (PDF 링크용으로 유지)

## 현재 서비스 상태 (2026-09-18)

- **정식 주소 https://sellery.life 는 아직 `web/`(Next.js 16 · Supabase · 토스페이먼츠) 가 서비스합니다** — 판매 링크·카카오 로그인·토스 결제·내 주문·약관/처리방침, 인플루언서 콘솔 1~2단계(`/influencer` 가입·로그인·홈·채널 인증). Vercel 프로젝트 `sellery-app`(Root Directory `web`, `main` 자동 배포). 실행·배포는 [web/README.md](web/README.md) · [web/DEPLOY.md](web/DEPLOY.md), 설계는 [docs/app-plan.md](docs/app-plan.md) · [docs/inf-console-plan.md](docs/inf-console-plan.md).
- `apps/*`(SvelteKit 앱 4개)는 아직 localStorage 데모입니다. **이후 작업은 `web/` 의 기능을 `apps/shop` → `apps/influencer` → `apps/brand` → `apps/admin` 순서로 옮기는 것**이며, 같은 수준에 도달하면 도메인을 옮기고 `web/` 를 지웁니다. 그 전까지 `web/` 는 손대지 않습니다(버그 수정만).
- Supabase 스키마는 `supabase/migrations/0001~0010` 이 클라우드 프로젝트 `sellery` 에 적용돼 있습니다(0007 service_role 권한 · 0008 체크아웃/결제 · 0009 가상계좌 판정 수정 · 0010 파트너 가입). 새 변경은 새 번호로.

## 기술 스택

**SvelteKit 2 · Svelte 5(runes) · TypeScript · Tailwind v4** 모노레포(npm workspaces). 앱 4개가 한 도메인 아래 경로(`/shop` `/influencer` `/brand` `/admin`)로 배포되며, 같은 origin 이라 데모 데이터(localStorage)를 앱끼리 공유합니다 — 브랜드 센터에서 승인하면 인플루언서 센터에 바로 보입니다. 서버·결제·실인증은 아직 없습니다 (Supabase 스키마는 설계·적용 완료, 앱 미연동).

```bash
npm install             # 처음 한 번 (Node 20+)
npm run dev:shop        # 고객 앱      → http://localhost:5176/shop
npm run dev:influencer  # 인플루언서   → http://localhost:5173/influencer
npm run dev:brand       # 브랜드       → http://localhost:5174/brand
npm run dev:admin       # 관리자       → http://localhost:5175/admin
npm run check           # 앱 4개 svelte-check (CI 와 동일)
npm run build           # 배포와 같은 빌드 → dist/ (허브 + 앱 4개 + assets)
npm run serve           # dist/ 를 Vercel 규칙(SPA 폴백)으로 로컬 서빙 → http://localhost:4173
```

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
  shop/               고객 판매 페이지 (base /shop)      src/routes/{+page, influencers, cart, orders, about, s/[cid]}
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
hub/                  첫 화면(센터 선택) — 정적 HTML, dist/ 루트로 복사
assets/               아바타 SVG · 상품 이미지 · 파비콘 — 앱 4개 공용, /assets/ 로 서빙 (원본은 assets/_src/, git 제외)
api/auth/kakao.js     카카오 로그인 콜백 자리 (Vercel 서버리스 함수 · KAKAO_REST_KEY 설정 전까지 501)
scripts/build.mjs     앱 4개 빌드 → dist/<app> + 허브 + assets (Vercel buildCommand)
scripts/serve-dist.mjs dist/ 로컬 서빙 (SPA 폴백 = vercel.json rewrites)
docs/                 운영 정책 문서 · 수정 가이드 · 데이터 모델 (아래)
supabase/             Supabase 스키마 — migrations/0001~0006 + seed.sql (클라우드 프로젝트 `sellery` 적용 완료 · 앱 미연동 · docs/data-model.md §8)
.github/              CI(프로토타입 점검 = npm run check + build) · @claude 봇 · 이슈 템플릿 5종 · PR 템플릿
vercel.json           npm ci → npm run build → dist/ 서빙 · 앱별 SPA 리라이트
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
