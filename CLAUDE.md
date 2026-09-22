# 셀러리 (Sellery)

브랜드사와 인플루언서(셀러)를 잇는 **건강·웰니스 전용** 브랜드사 협업판매 중개 플랫폼.
태그라인: **"좋은 브랜드를 만나는 공간, 셀러리"**

이 저장소는 클릭 가능한 UI/UX 프로토타입입니다. 백엔드·결제·인증은 없고, 데이터는 브라우저 localStorage에 있습니다.
브랜드 입점제안서·인플루언서 제안서(PDF, 2026.09)가 따로 있고, 거기 인쇄된 데모 주소는 옛 저장소(`junho763-dotcom/sellery-prototype`)이므로 지우지 않습니다.

## 현재 서비스 상태 (2026-09-21 · S5 완료 · 도메인 전환 완료)

- **정식 주소 https://sellery.life 는 `apps/shop`(Vercel `sellery-shop`) 이 서비스합니다** — 고객 사이트 전부(`/` `/s/*` `/c/*` `/about` `/influencers` `/login` `/auth/*` `/checkout*` `/account/*` `/orders/*`(비회원 주문 조회) `/api/*` `/terms` `/privacy` · Supabase SSR · 토스페이먼츠). 옛 Next.js 앱 `web/` 은 S5 PR-11 에서 저장소에서 삭제됐고(설계 문서의 `web/src/…` 경로는 역사 — 이식 위치는 docs/monorepo-migration.md §3~§5 표), Vercel `sellery-app` 은 2026-09-21 삭제됨(롤백은 `sellery-shop` 이전 배포 Promote — docs/deploy.md §3.6).
- `apps/shop/vercel.json` 리라이트: `/influencer/*` → `sellery-influencer`(**`apps/influencer` 인플루언서 콘솔 1~2단계** — 가입 · 이메일 인증 · 로그인 · 홈 · 내 정보 · 채널 인증 · SSR · `(demo)` 그룹은 dev/`PUBLIC_DEMO=1` 만), `/brand/*` → `sellery-brand`(**`apps/brand` 브랜드 콘솔 1~5단계** — 입점 신청(가입) · 이메일 인증 · 로그인 · 홈 · 상품 · 처리 대기 · 캠페인/스레드/초대 · 주문/발주/운송장 · 고객 문의 · 실시간 매출 · 정산 · 내 정보/등급 · SSR · `requireBrand()`; 남은 브랜드 데모(`/brand/demo` · `/brand/camps` `/dm` `/gallery` `/shop` `/c` `/s`)는 `(demo)` 그룹으로 dev/`PUBLIC_DEMO=1` 만 — Production `PUBLIC_DEMO` 정리 예정), `/admin/*` → `sellery-admin`(**`apps/admin` 관리자 콘솔 — 로그인 `requireAdmin()`(`profiles.role='admin'`) · 홈 · "정산·돈" 화면 = 실서비스(`(console)/(money)/settle` 정산 실행/상세 · `/settle/payouts` 지급·이체 파일·원천징수 자료 · `/orders` 주문/환불 · `/payments` 결제 정합성 · `/cs` 문의 열람 — 0020 · docs/admin-console-plan.md "정산·돈" PR-A/B) · 파트너 관리(인플루언서/브랜드 정지·채널 인증·상품 검수)는 Soyunnlee 진행 중(지금은 `partner-admin.mjs`) · 남은 데모(`/admin/demo` `/products` `/influencers` `/brands` `/match` `/revenue` `/c` `/s`)는 `(demo)` 그룹으로 dev/`PUBLIC_DEMO=1` 만 · `noindex` · `/admin/robots.txt` disallow). 배포·운영 정본은 [docs/deploy.md](docs/deploy.md)(외부 서비스 대시보드 §5 · DB §6 · 운영 §8 포함). 설계는 [docs/app-plan.md](docs/app-plan.md) · [docs/inf-console-plan.md](docs/inf-console-plan.md) · [docs/monorepo-migration.md](docs/monorepo-migration.md).
- **인플루언서 콘솔 1~5단계 완료(2026-09-21, PR #19~#30 — 상품 갤러리 · 샘플 요청/구매 결제 · 캠페인 · 매출 · 정산 자료) · 브랜드 콘솔 1~5단계 완료(2026-09-22, 0014~0019 — 가입/로그인 · 상품 · 샘플 승인/발송 · 일정 확정 · 스레드 · 초대 · 주문/발주/운송장 · 고객 문의 · 실시간 매출 · 정산 · 내 정보/등급).** 남은 것 = 두 콘솔의 6단계(🥬 · 데이터 열람 · 셀러리 샵 — 규제 검토 뒤, inf §5.8 · brand §6) · **관리자 콘솔**(`apps/admin` — 정산·돈 화면은 2026-09-22 실서비스(0020 · docs/admin-console-plan.md "정산·돈" §6); 파트너 관리(상품 검수 · 채널 인증 큐 · 정지/복구)는 진행 중 — 그때까지 `packages/db/scripts/partner-admin.mjs` 스크립트) · Preview/Production 의 `PUBLIC_DEMO` 정리. 계획 [docs/brand-console-plan.md](docs/brand-console-plan.md) · [docs/inf-console-plan.md](docs/inf-console-plan.md).
- **기능 완료 → 실판매 준비**(토스 라이브 키 · 시드 데이터 정리 · 알림/CS 운영 결정 · 비밀 회전 · 리허설)는 [docs/launch-checklist.md](docs/launch-checklist.md).
- **거래 메일(2026-09-22 · 대표 결정 "이메일")** — 주문 확인(고객+브랜드) · 배송 시작 · 환불 완료 · 문의 답변/접수를 앱 서버가 **Resend HTTP API** 로 보냅니다(`packages/db/src/mail` 템플릿 · `server/mail-events.server.ts` 훅 · 발신 `noreply@sellery.life`). 환경변수 `RESEND_API_KEY`(shop · brand 필수 · admin 선택 — **Vercel 에 아직 넣지 않았으면 병합 직후 넣을 것**, 없으면 조용히 비활성) — docs/deploy.md §1.2 · §5.7 · docs/emails/README.md. 알림톡·SMS 는 없습니다.
- Supabase 스키마는 `supabase/migrations/0001~0021` 이 클라우드 프로젝트 `sellery` 에 적용돼 있습니다(0007 service_role 권한 · 0008 체크아웃/결제 · 0009 가상계좌 판정 수정 · 0010 파트너 가입 · 0011 샘플 견적/무상 요청/수령 확인 · 0012 샘플 결제 · 0013 매출·정산 · 0014 브랜드 가입 `create_brand_from_signup` · 0015 브랜드 상품/캠페인/샘플 처리 · 0016 일정/스레드/초대 · 0017 초대 게이트 · 0018 스케줄러/주문/운송장/CS · 0019 브랜드 매출/정산/등급/프로필 · 0020 관리자 정산 실행/지급/이체 파일/주문·결제·문의 열람 — docs/admin-console-plan.md "정산·돈" · 0021 비회원 구매). 새 변경은 새 번호로(0022~ 는 관리자 파트너 관리).

## 스택 · 구조 (2026-09-18 SvelteKit 모노레포로 전환)

**SvelteKit 2 · Svelte 5(runes) · TypeScript · Tailwind v4 · npm workspaces.** 이전의 바닐라 JS 한 페이지(`index.html` + `js/00~90`)는 이 커밋에서 제거됐고, 기능·정책·디자인은 그대로 이식됐습니다.

```
apps/shop apps/influencer apps/brand apps/admin   SvelteKit 앱 4개 · SPA(ssr=false) · shop 은 base '' (도메인 루트) · 나머지 /influencer /brand /admin
  svelte.config.js · vercel.json · src/hooks.server.ts   @sveltejs/adapter-vercel(nodejs22.x · env.dir '../..' = 루트 .env.local) · 리전 icn1 (shop 의 vercel.json 은 /influencer /brand /admin → 각 프로젝트 rewrites)
                              · Supabase SSR hooks(locals.supabase · safeGetSession — PUBLIC_SUPABASE_URL/ANON_KEY 가 비면 null 로 통과) — docs/monorepo-migration.md §1 · §2
  src/routes/+layout.ts       ssr=false · load() 에서 S.role 지정 (렌더 밖에서)
  src/routes/+layout.svelte   AppShell 에 탭·우측 슬롯·페르소나 전달
  src/routes/<화면>/+page.svelte   화면 하나 = 폴더 하나 (c/[cid] 캠페인 스레드 · s/[cid] 판매 상세)
packages/core/src   프레임워크 무관 로직 — constants.ts(정책 숫자 · LS 키) · seed.ts · state.svelte.ts(S=$state · D_ · save)
                    · ui.svelte.ts(toast · modal · go) · helpers.ts(읽기 전용 계산) · actions.ts(상태 변경 전부) · storage.ts(localStorage · supabase.ts 는 스텁)
                    ※ SSR 앱(shop · influencer 콘솔)은 constants · util · icons · types 만 import — 데모 상태(state.svelte · actions · seed · storage)는 brand · admin 전용 (docs/monorepo-migration.md §0-4 · §3.3)
packages/db/src     @sellery/db — web/src/lib 의 데이터 계층 이식: 순수(auth · campaign · linkctx · order-status · dates · text · carriers · legal · company · console-paths · partner/signup-rules)
                    · browser.ts(createBrowserSupabase) · server/*.server.ts(config(configureDb) · admin · auth · linkctx · customers · campaign · orders · partner/{seller,signup,slack}) · database.types.ts(gen:types) · scripts/*.mjs · src/test(vitest)
packages/payments/src  @sellery/payments — money · checkout-rules(순수) · server/{config(configurePayments),toss,checkout-sync}.server.ts (토스 API · 세션↔결제 동기화)
scripts/check-boundaries.mjs   패키지 경계 검사(CI) — 서버 전용 모듈(`*/server/*` · `$lib/server`) 을 브라우저 도달 파일이 import 하면 실패 · shop/influencer 의 `@sellery/core` 데모 import 는 경고(S2/S5 에서 error)
packages/ui/src     css/theme.css(Tailwind + @theme 토큰 + css/legacy/{base,skin}.css 를 layer 로) · components/ · modals/(ModalHost) · views/(CampaignDetail · Store · Shop · Sales · DM · LoginPage)
apps/shop/static/   앱 4개 공용 이미지·파비콘·email/celery.png — 프로덕션은 shop 이 /assets/ /favicon.svg /email/ 로 서빙, 개발은 scripts/vite-root-assets.mjs 가 4 앱 dev 서버에 서빙 (원본 _src/ 는 git 제외)
docs/  supabase/    정책 문서 · Supabase 스키마 (그대로)
.env.example        4 앱 공용 환경변수 이름 표 → .env.local (PUBLIC_* 는 $env/static/public — 이름이 없으면 check·build 실패, CI 는 더미)
```

- 앱 4개가 **같은 origin** 에 배포되므로 localStorage 데모 데이터를 공유합니다 (개발 서버는 포트가 달라 앱별로 분리됨 — README "로컬 개발" 포트 표).
- **상태 변경은 `packages/core/src/actions.ts` 에서만.** `$derived`·컴포넌트 init·helper 안에서 `S`/`D_()` 를 쓰면 `state_unsafe_mutation` 으로 앱이 빈 화면이 됩니다. 초기화가 필요한 배열(`D_().cs` 등)도 액션 안에서 만듭니다. 역할 지정은 `+layout.ts` `load()`, 부트 시 자동 제안(`autoTick`)은 `onMount`.
- 화면 링크는 앱 기준(`/camps`)으로 쓰고 `AppShell`·`go.*` 가 base 를 붙입니다. 직접 `<a href>` 를 쓰면 `$app/paths` 의 `base` 를 앞에.
- 파일 수정은 해당 화면의 `+page.svelte` 하나만 열면 됩니다. 앵커 문자열 충돌 걱정은 사라졌습니다.

## 저장소 · 배포

- GitHub: `weglow-dev/sellery` (glo와 같은 조직 · 2026-09-15 에 `weglow-glo` → `weglow-dev` 로 이름 변경, 옛 이름은 리다이렉트되지 않음). `main`은 보호됨 — PR 필수, CI `프로토타입 점검` 통과, 리뷰 코멘트 해결, 관리자도 예외 없음.
- 배포: **Vercel** 프로젝트 4개 (team `weglow-team`) — `sellery-shop`(Root Directory `apps/shop` · 도메인 `sellery.life` · `www`) · `sellery-influencer` · `sellery-brand` · `sellery-admin`(각 `apps/<앱>` · "Include source files outside of the Root Directory" ON · Node 22 · `@sveltejs/adapter-vercel`). `apps/shop/vercel.json` rewrites 가 `/influencer/*`(→ `sellery-influencer` 콘솔) · `/brand/*` `/admin/*`(→ 데모 프로젝트) 를 프록시 → 브라우저 오리진 하나 · 세션 쿠키 공유. GitHub 앱 연동 → `main` 병합 = 프로덕션, PR = 앱별 미리보기 URL 댓글. **정본 docs/deploy.md**(프로젝트 표 · 환경변수 이름 · 리라이트 표 · 도메인 전환 기록 · 외부 서비스 · DB · 운영 스크립트 · Vercel 주의) · 단계 기록은 docs/monorepo-migration.md §7(S1~S5 완료).
- CI: `.github/workflows/ci.yml` → `npm ci` · `npm run check`(앱 4개 svelte-check) · `npm run build`(4 앱 `.vercel/output`) — job env 에 더미 `PUBLIC_SUPABASE_URL` `PUBLIC_SUPABASE_ANON_KEY`(`$env/static/public` 은 이름이 없으면 실패). 로컬에서도 같은 명령 — `.env.local` 에 같은 이름(`.env.example` 복사).
- Claude 봇: `.github/workflows/claude.yml` (glo와 같은 구성 + 셀러리용 안내문). Secrets `ANTHROPIC_API_KEY` + 조직 Claude GitHub 앱에 저장소 추가 필요.
- 이 파일(CLAUDE.md)은 **커밋되는 팀 공용 메모**입니다. 개인 메모는 `CLAUDE.local.md`(gitignore). 줄바꿈은 `.gitattributes`가 모든 텍스트 파일을 LF로 강제합니다(Windows 포함).
- 로컬: `npm install` → `npm run dev:shop|influencer|brand|admin` (5176 · 5173 · 5174 · 5175, 각 base 경로로 접속).

## 기여

브랜치 → `npm run check` → PR(템플릿 체크리스트) → CI 초록 + 리뷰 코멘트 해결 → squash 병합(`gh pr merge --squash --delete-branch`).
브랜치 접두사 `fix/` `feat/` `copy/` `design/` `docs/` `policy/`. 커밋 메시지는 한글 한 줄, 파일명이 아니라 화면·기능 이름으로.
이슈 템플릿 5종 bug · copy-change · design-change · policy-change · task (`.github/ISSUE_TEMPLATE/`) — 수수료·등급 등 정책 숫자 변경은 policy-change. 상세는 CONTRIBUTING.md · docs/editing-guide.md(비개발자용).

## 핵심 정책 (숫자는 코드 상수가 정답 · 사람용 설명은 docs/)

상수는 모두 `packages/core/src/constants.ts` 에 있습니다.

**정산** `PG_RATE 1.9%` · `PLAT_RATE 10%` · `WHT 3.3%` · `CLEAR_DAYS 21`
확정 매출 − PG − 인플루언서 수수료 − 플랫폼 수수료, 판매 종료 D+21 지급. 등급 추가분과 브랜드 등급 할인은 상대 몫을 깎지 않고 플랫폼이 부담. → docs/settlement-policy.md

**등급** 인플루언서 스타터~블랙 7단계, 최근 3개월 확정 매출 기준 (`GRADES`). 등급 보너스는 **브랜드사가 제안한 수수료율에 더해지는 값**입니다.
(제안 20% → 골드 21%, 블랙 23%) "3%를 받는다"가 아니라 "수수료율 +3%p". → docs/grade-policy.md

**판매 기간** 같은 상품이라도 기간은 기본 공유 — 누구나 오픈 가능.
단 **플래티넘 이상**(`PRIORITY_TIER`)이 확정한 기간에는 플래티넘 이상만 진입할 수 있습니다 (`periodBlock()`, helpers.ts).
과거의 "기간 완전 독점"은 폐기됐습니다. 상품 독점권은 별개 기능 — 상품별 기준 등급(`exGradeOf`, 브랜드가 등록 폼에서 골드~블랙 중 선택, 자격 판정은 `exEligible`). 다이아 전용이 아니며 시드에도 플래티넘 기준 상품(p4)이 있습니다. → docs/period-policy.md

**샘플** 상품별 무상 기준 등급 이상 · 상품당 무상 1회(`hadFreeSample`) · 월 한도 등급별 1/2/5회(`sampleQuota`). 셋 중 하나라도 미달이면 유상 구매 — 현금, 또는 🥬 우선 + 잔액 현금(`sampleSplit`, 1🥬=₩20,000 `SAMPLE_CEL_WON`; 현금/🥬 택일이 아님). 브랜드 직접 제안은 한도 미차감. → docs/sample-policy.md

**셀러리 포인트** 확정 매출 ₩500만당 1🥬 (`CELERY_PER`), 1🥬 ≈ ₩20,000 상당. 데이터 열람 가격은 `DATA_PRICE`. → docs/points-policy.md

**링크 유입 보호** 인플루언서 판매링크(`/s/<cid>` — shop 앱, 도메인 루트)로 들어온 고객에게는 같은 카테고리 상품을 노출하지 않습니다.
홈으로 이동하거나 새로고침해도 유지됩니다 (`custVisible()`, `S.linkCtx`, 캠페인 종료 +7일에 해제).

**고객 CS** 고객 문의는 관리자를 거치지 않고 **브랜드사로 바로** 갑니다 (브랜드 센터 "고객 문의" 탭). 관리자는 주문·CS 화면에서 열람만 합니다.

**비회원 구매** (2026-09-22 · 0021) 고객은 카카오 로그인 없이도 삽니다 — `/checkout` 이 미로그인이면 [카카오로 로그인하고 구매] / [비회원으로 구매] 선택. 비회원은 주문자 이름·연락처(·이메일)를 받아 `customers` 비회원 행(`guest`, 체크아웃당 1행)을 만들고, 이후 **주문번호 + 연락처**(`/orders/lookup`, IP 30분 5회)로 조회 → `/orders/g/<code>`(회원 상세와 같은 `OrderDetail`) 에서 환불·문의. 조회 토큰은 HttpOnly 쿠키 `slry_guest_<code>`(90일), DB 에는 sha256 해시만(`packages/db/src/guest-order.ts` · docs/app-plan.md §6.1 · §7).

## 데이터 (localStorage)

- 시드 키 `LS = 'sellery-proto-v30'` (`constants.ts`) — **데이터 구조를 바꾸면 번호를 올려야** 기존 방문자 화면이 안 깨집니다.
- 세션 `sellery-session` · 고객 `sellery-cust` · 장바구니 `sellery-cart` · 링크 유입 `slry-linkctx`.
- 초기화: `/admin/` 대시보드의 [데이터 초기화] 버튼(`act.reset`). 앱바에는 없습니다.

## 타이포그래피 — 건드릴 때 주의

- 본문 `IBM Plex Sans KR`은 **700이 최대**. `font-weight:800`을 쓰면 가짜 굵기가 적용돼 글자가 뭉갭니다.
- `font-synthesis:none` 유지 (합성 굵기 차단 · `packages/ui/src/css/legacy/base.css`, theme.css 에서 layer 로 로드)
- `-webkit-font-smoothing:antialiased` **넣지 마세요** — 윈도우 서브픽셀 렌더링이 꺼져서 흐려집니다
- 한글은 `word-break:keep-all` — 없으면 표에서 "바인허/브"처럼 어절 중간에서 잘립니다
- Tailwind 유틸리티는 새 마크업에서 자유롭게 쓰되, 색·여백 토큰은 `theme.css` 의 `@theme`/`:root` 값을 씁니다.

## 로고

셀러리 마크는 **위치 로고일 때만 왼쪽으로 -14° 기울입니다** (앱바 `Wordmark`, 허브, 로그인 워드마크).
본문 안에 포인트로 들어가는 마크는 똑바로 세웁니다.

## 데모 계정 (`/influencer/demo-login` · `/brand/demo-login` — (demo) 그룹 · dev/`PUBLIC_DEMO=1` 만; 실서비스 콘솔 로그인 `/influencer/login` · `/brand/login` 은 Supabase 계정 — 개발용은 `dev-seller.mjs` · `dev-brand.mjs`)

인플루언서 8명: 지유 jiyu@ · 혜린 hyerin@ · 민지 minji@ · 서아 seoa@ · 로라 lola@ · 하늘 haneul@ · 소민 somin@ · 유나 yuna@ (`@sellery.demo`) · 브랜드: 바인허브 `partner@vyneherb.co` · 글로헬스 `official@weglow.biz` · 관리자 `admin@sellery.co.kr`.
비밀번호는 **8자 이상이면 아무거나**(데모 버튼은 `sellery2026` 자동 입력). 로그인 탭(인플루언서/브랜드)과 계정 역할이 맞아야 하고, 관리자는 어느 탭에서든 됩니다. 구글 로그인은 데모 계정 선택 팝업(`GOOGLE_CLIENT_ID` 자리표시자).
고객 카카오 로그인은 `KAKAO_JS_KEY` 가 비어 있으면 데모 계정 선택 모달(`KAKAO_DEMO`), 키가 들어오면 SDK v2 `authorize()` → 콜백(옛 `api/auth/kakao.js` 자리는 S1 에서 삭제 — 실로그인은 S3 의 Supabase OAuth `/auth/callback`).

## 아직 안 붙은 것

실결제(PG) · 실인증 · 서버 · 앱↔DB 연동. Supabase 스키마는 **설계·클라우드 적용 완료(2026-09-15)**: `supabase/migrations/0001~0006` + `seed.sql`, 프로젝트 `sellery`(ref `ocxppeuoiysnkwwujvko`, Seoul, Pro/Micro), anon 접근 검증 완료. 앱 쪽 연결 지점은 `packages/core/src/storage.ts` 의 `Storage` 인터페이스(`createSupabaseStore()` 스텁). 이후 스키마 변경은 새 번호 마이그레이션 추가 → 병합 → 로그인·링크된 PC에서 `npx supabase db push --linked`(시드는 `--include-seed`). 자세한 절차는 docs/data-model.md §8.
외부 판매 예상 매출(`estExternal`)은 가계산입니다. 제안서의 "테스트 기한 14일"은 `TEST_DAYS` 상수이고 기한 경과 처리는 없습니다.
