# 인플루언서 데모 화면 감사 — 콘솔 3~6단계 기능 명세

> **대상** 인플루언서 콘솔의 **상품 갤러리·캠페인·매출·정산**(콘솔 3~6단계)을 구현할 엔지니어
> **작성** 2026-09-21 · 기준 커밋 `76e98f0` · 문의 official@weglow.biz

## 이 문서의 자리

인플루언서 쪽에는 이미 계획서가 두 개 있다. **이 문서는 그것들을 대체하지 않는다.**

| 문서 | 다루는 것 |
|---|---|
| [inf-console-plan.md](inf-console-plan.md) | 도메인 · 로그인 · 가입 · 채널 인증 · 샘플 결제. **의사결정 12건이 이미 확정**돼 있다 |
| [monorepo-migration.md](monorepo-migration.md) | `web/`(Next) → `apps/*`(SvelteKit) 이식. 단계 S1~S5, 라우트 1:1 매핑 |
| **이 문서** | **데모 화면 9개가 정의하는 기능 표면** — 무엇이 실제 로직이고 무엇이 시늉인지, 그대로 옮기면 안 되는 것은 무엇인지 |

왜 필요한가. 이식 계획(`monorepo-migration.md §5.1`)은 콘솔 **1~2단계**(로그인·가입·홈·내 정보)까지만 라우트를 명세하고, 기존 데모 화면(`camps · dm · explore · rank · ref · sales · settle · shop · c/[cid] · s/[cid]`)은 `(demo)/` 그룹으로 옮겨 **프로덕션에서 404** 처리한다. 즉 **3~6단계에서 다시 만들 화면들의 기능 명세가 그 데모 화면 안에만 있다.**

그 데모 화면에는 정교한 도메인 로직(정산 계산, 등급 보너스, 샘플 자격, 기간 우선권)과 **시늉만 하는 코드**가 섞여 있다. 구분하지 않고 포팅하면 가짜 로직과 버그가 그대로 따라온다. 이 문서는 그 경계선이다.

---

## 0. 먼저 읽을 것

| 순서 | 문서 | 왜 |
|---|---|---|
| 1 | [inf-console-plan.md](inf-console-plan.md) §0 | 인증·결제·🥬·정산 지급 방식이 **이미 결정**돼 있다. 다시 정하지 말 것 |
| 2 | [monorepo-migration.md](monorepo-migration.md) §5 · §7 | 인플루언서 라우트 매핑과 단계 계획 |
| 3 | **이 문서 §1** | 데모 화면에서 무엇이 진짜고 무엇이 가짜인지 |
| 4 | [data-model.md](data-model.md) §5.2 · §9 | 앱이 강제해야 하는 규칙, 필요한 RPC 후보 |
| 5 | [settlement](settlement-policy.md) · [grade](grade-policy.md) · [period](period-policy.md) · [sample](sample-policy.md) · [points](points-policy.md) | 정책 5종. **숫자를 바꾸려면 기획 승인 필요** |
| 6 | [CONTRIBUTING.md](../CONTRIBUTING.md) | 실행·브랜치·PR 규칙 |

```bash
npm install
npm run dev:influencer     # http://localhost:5173/influencer
npm run check              # 앱 4개 타입·템플릿 검사
npm test                   # vitest (S1 에서 도입)
```

데모 로그인은 `/influencer/login` — 계정 목록이 화면에 있고 비밀번호는 8자 이상 아무거나. 로그인하지 않으면 앱바 우측 셀렉트로 인플루언서를 갈아끼우며 볼 수 있다. **이 로그인은 실서비스 로그인과 무관하다**(실제 것은 `inf-console-plan.md §4`).

---

## 1. 데모 화면에 무엇이 있나

### 1.1 구조

저장소에 **코드베이스가 둘** 있다는 점을 먼저 알아야 한다.

```
web/                  Next.js 앱 — 실서비스가 지금 여기서 자란다 (고객 결제 · 파트너 콘솔 1~2단계)
apps/                 SvelteKit 모노레포 — 이식 목표지 (shop · influencer · brand · admin)
packages/db           Supabase · 인증 · 캠페인 · 주문 · 링크 쿠키 — web/lib 에서 순수 TS 로 이식 (S1 완료)
packages/payments     토스 결제 (S1 완료)
packages/core         ★ 데모 로직 — 이 문서가 다루는 것
packages/ui           공용 컴포넌트 · 데모 화면 뷰
```

`monorepo-migration.md` 의 S1(골격·패키지)은 **완료**됐다. `apps/influencer` 에 `adapter-vercel`·`hooks.server.ts`(Supabase SSR 세션)가 들어와 있다. 다만 **화면(`routes/`)은 아직 손대지 않았다** — 여전히 `ssr = false` 이고 데이터는 localStorage 다.

데모 로직 쪽 구조:

```
apps/influencer/src/routes/      화면 (폴더 = URL). 얇다 — 대부분 60줄 이하
packages/core/src/
  constants.ts   정책 숫자·상태 머신·등급표·샵 품목        ← 정책 숫자의 출처
  types.ts       도메인 타입 (supabase/migrations 와 1:1)
  state.svelte.ts  S = $state({...}) 전역 상태 · D_() · save()
  helpers.ts     읽기 전용 계산 (정산 calc, 등급, 샘플 자격, 기간 충돌)  ← ★ 살릴 가치가 있는 부분
  actions.ts     상태를 바꾸는 유일한 곳 (act.xxx)
  storage.ts     Storage 인터페이스 (localStorage)
  supabase.ts    스텁. 호출하면 throw — 실제 DB 접근은 이제 packages/db 가 한다
packages/ui/src/
  views/         CampaignDetail · Store · Shop · Sales · DM · LoginPage (앱 공용)
  modals/        ModalHost 가 kind 별로 렌더
  components/    AppShell(앱바·탭) 등
```

**살릴 것과 버릴 것을 미리 말하면** — `helpers.ts` 의 계산 함수(`calc`, `gradeOf`, `sampleBtn`, `periodBlock`, `settleDue`)는 정책을 정확히 구현하고 있어 **서버로 옮길 가치가 있다**. `actions.ts` 는 클라이언트 전용 가드라 서버 RPC 로 다시 써야 한다. `storage.ts`/`supabase.ts` 는 `packages/db` 가 대체한다.

**아키텍처 규칙 하나** — 상태 변경은 `actions.ts` 에서만. 화면이나 helper 안에서 `S`/`D_()` 를 고치면 Svelte 5 가 `state_unsafe_mutation` 을 던지고 **화면 전체가 빈 페이지**가 된다. 데모 화면을 고칠 일이 있으면 이 규칙을 지켜야 한다.

### 1.2 화면 목록

| 탭 | 경로 | 파일 | 상태 |
|---|---|---|---|
| 홈 | `/` | `routes/+page.svelte` | 할 일·진행 판매·장부·등급·추천 상품 |
| 내 캠페인 | `/camps` | `routes/camps/+page.svelte` | 목록 + 캘린더 |
| DM | `/dm` | `views/DM.svelte` | 캠페인 스레드 모아보기 |
| 상품 갤러리 | `/explore` | `routes/explore/+page.svelte` | 카테고리 필터 · TOP5 · 트렌드 |
| 실시간 매출 | `/sales` | `views/Sales.svelte` | LIVE 주문 현황 |
| 정산 | `/settle` | `routes/settle/+page.svelte` | 수수료·실수령·지급 예정일 |
| 랭킹·등급 | `/rank` | `routes/rank/+page.svelte` | 피라미드 · 익명 리더보드 |
| 셀러리 샵 | `/shop` | `views/Shop.svelte` | 🥬 충전·아이템 |
| 추천 프로그램 | `/ref` | `routes/ref/+page.svelte` | 추천 코드·보상 현황 |
| 마이페이지 | `/my` | `routes/my/+page.svelte` | 프로필·채널·정산정보 |
| 캠페인 스레드 | `/c/[cid]` | `views/CampaignDetail.svelte` | 상태 머신의 중심 |
| 판매 페이지 미리보기 | `/s/[cid]` | `views/Store.svelte` | 고객이 볼 화면 |

### 1.3 **동작하는 것처럼 보이지만 가짜인 것** ← 가장 중요

이 표가 이 문서의 핵심이다. 데모에서 잘 돌아가는 것들이 서버가 없어서 성립한 것이다.

| 기능 | 지금 코드 | 실제로는 |
|---|---|---|
| **로그인** | `LoginPage.svelte` — 시드 이메일 목록과 대조, 비밀번호는 길이만 검사 | 인증 없음. 비밀번호 저장도 안 함 |
| **계정 전환** | 앱바 `<select>` → `act.setSeller(id)` | **아무나 남의 계정으로 전환 가능**. 데모 편의용 |
| **가입** | `join()` — 신규 가입자를 데모 계정 `s1` 로 입장시킴 | 계정 생성 안 됨 |
| **채널 인증** | `act.confirmVerify()` → `ch.verified = true` | SNS 소유 확인을 전혀 안 함. 코드(`SLRY-XXXX`)만 보여주고 버튼 누르면 통과 |
| **샘플 월 한도** | `sampleLeft()` 클라이언트 계산 | localStorage 편집으로 무한 우회 |
| **기간 우선권** | `periodBlock()` 클라이언트 검사 | 서버 검증 없음. 동시 제안 시 레이스 |
| **재고 배정** | `stockLeft()` 클라이언트 검사 | 두 인플루언서가 동시에 같은 재고를 잡을 수 있음 |
| **실시간 매출** | `act.toggleLive()` — `setInterval` 3.5초마다 랜덤 주문 생성 | 실제 주문 아님 |
| **주문 시뮬** | `act.simSell(cid, n)` · `act.ffwd(cid)`(종료일을 3주 전으로 조작) | 데모 전용. 운영에선 제거 |
| **정산** | `calc()` 클라이언트 계산 → `runSettle()` 이 배열에 push | 실제 송금·명세 발행 없음 |
| **정산 계좌** | `saveSettleInfo()` 형식만 확인 | 1원 인증 없음 (화면에도 "실서비스에서 자동 처리" 라고 적혀 있음) |
| **사업자등록증** | `setBizDoc()` — **파일명 문자열만** 저장 | 업로드 안 됨 |
| **프로필 사진** | `fileToSquareDataURL()` → data URL 을 localStorage 에 | 용량 초과 위험. Storage 버킷(`0006`)으로 옮겨야 함 |
| **추천 코드** | 시드에 고정. 데모 가입 폼에 코드 입력이 없음 | 데모에서는 추천 관계를 만들 경로가 없다. 새 가입 폼 명세에는 `referral_code` 가 들어 있다(S5) |
| **3개월 매출(`m3Sales`)** | `runSettle()` 에서 `+c.id.slice(1) >= 100` 인 캠페인만 가산 | 시드 데이터를 안 건드리려는 데모 해킹. 등급의 근거 값인데 실제 집계가 아님 |
| **갤러리 TOP5** | `explore/+page.svelte:14` 하드코딩 `{ p1: 48200000, p4: 36400000, … }` | 가짜 숫자 |
| **뜨는 카테고리** | `CAT_TRENDS` 상수 (`+112%` 등) | 가짜 |
| **"최근 24시간 샘플 요청 12건"** | `routes/+page.svelte:112` 문자열 리터럴 | 가짜 |
| **외부 판매 예상** | `estExternal()` — 팔로워×참여율×상수 | 문서에도 "가계산" 이라 적힌 추정식 |
| **CSV 다운로드** | 브라우저 Blob (`dlCSV`) | 서버 생성/보관이 필요하면 옮겨야 함 |
| **반려 사유·삭제 확인** | `prompt()` / `confirm()` | 디자인 시스템 모달로 교체 필요 |
| **오픈 알림 신청** | `act.notifyMe()` — 토스트 한 줄이 전부 | 신청이 저장되지 않음 |
| **샘플 운송장** | `shipSample()` 이 비어 있으면 `6890-랜덤4-랜덤4` 자동 생성 | 택배사 연동 없음 |
| **상세페이지 미리보기** | `storeCamp()` 가 `'p:p1'` 입력에 `status:'LIVE'` 가짜 캠페인 객체를 만들어 반환 | DB 에 없는 캠페인 |
| **방문수 · 전환율** | 실시간 매출 KPI — B2 참조 | 트래픽 데이터가 아예 없음 |

### 1.4 확인된 버그 (프로토타입 한계가 아니라 그냥 틀린 것)

인수인계 전 코드를 훑으면서 나온 것들이다. **첫 주 워밍업 과제로 적당하다** — 코드베이스에 익숙해지면서 실제로 고칠 거리가 된다.

| # | 위치 | 증상 | 원인 |
|---|---|---|---|
| B1 | `views/Sales.svelte:27` | 실시간 매출의 "내 수수료" 가 **사업자 인플루언서에게도 3.3% 를 뺀다**. 같은 캠페인인데 스레드 화면(`CampaignDetail`)과 금액이 다르게 보인다 | `sellerWht(s)` 를 써야 하는데 상수 `WHT` 를 직접 곱함. 시드 계정 s2(혜린)가 사업자라 바로 재현된다 |
| B2 | `views/Sales.svelte:18-19` | "방문 → 구매 전환" KPI 가 **주문 수와 무관하게 항상 5.8%** | 방문수를 `주문수 × 17.3` 으로 만들어 놓고 다시 `주문수 ÷ 방문수` 를 계산한다. 정보량이 0인 지표 |
| B3 | `constants.ts:114` + `actions.ts:211,255` | 더미 구매자 이름 10개 중 **뒤 2개('오\*랑','신\*혜')가 절대 안 나온다** | 배열은 10개인데 `Math.random() * 8` |
| B4 | `actions.ts:346` (`addCart`) | 인플루언서가 미리보기 화면에서 **장바구니에 담을 수 있다** | `buyNow` 에는 있는 `S.role !== 'customer'` 가드가 `addCart` 에는 없음 |
| B5 | `modals/ProductDetailModal.svelte:22` | 수수료 범위 상한이 **내 등급과 무관하게 항상 블랙 기준(+3%p)** 으로 보인다. 스타터 인플루언서에게 "20~23%" 라고 표시 | `GRADES[0].bonus` 하드코딩 |
| B6 | `views/Store.svelte:33` | 신뢰 배너의 "인플루언서 채널 인증 ✓" 이 **미인증 인플루언서에게도 무조건 표시**된다 | `verified` 를 확인하지 않는 정적 문구. 대외 신뢰 문구라 우선순위 높음 |
| B7 | `views/Shop.svelte:34` | `featured`·`homefeature` 는 7일 상품인데 **남은 기간이 표시되지 않는다** | `SHOP` 항목에 `days` 가 `regongu`(30)만 있고 나머지는 비어 있음 |

### 1.5 하드코딩된 입력 제약 (의도인지 확인 필요)

`ScheduleModal.svelte` 가 인플루언서의 핵심 액션인데 값이 코드에 박혀 있다. 정책인지 임시값인지 기획 확인이 필요하다.

- 판매 기간 선택지가 **3일 / 5일 / 7일 세 개뿐** (`:21`)
- 기본 시작일 = 오늘 + 7일 (`:9`), 기본 기간 5일 (`:10`)
- 배정 재고 **최소 50개, 50단위** (`:22`), 기본값 상한 500 (`:12`)

`ProductDetailModal` 의 실적 페이월은 **첫 행만 무료 노출**하고 나머지를 블러 처리한다(`:42`). 이 "1행" 도 하드코딩이다.

### 1.6 이미 준비된 것 (새로 만들지 말 것)

- **Supabase 스키마** — `supabase/migrations/0001~0010` 이 클라우드 프로젝트 `sellery`(ref `ocxppeuoiysnkwwujvko`, Seoul)에 적용돼 있다. RLS 정책, 컬럼 단위 grant, 트리거 캐시까지. [data-model.md](data-model.md) 에 ERD·접근제어가 정리돼 있다.
- **`packages/db` · `packages/payments`** (S1 완료) — Supabase 클라이언트, 인증, 캠페인·주문 조회, 링크 쿠키, 토스 결제가 순수 TS 로 이식돼 있고 vitest 72개가 붙어 있다. **DB 접근은 여기를 쓴다.** `packages/core/src/supabase.ts` 스텁은 더 이상 쓰지 않는다.
- **인증 배관** (S1 완료) — `apps/influencer/src/hooks.server.ts` 에 Supabase SSR 세션(`locals.supabase` · `locals.safeGetSession`)이 있다. 세션 게이트(`requireSeller`)는 S5 에서 붙는다.
- **`adapter-vercel` · Vercel 프로젝트 4개** (S1 완료) — `sellery.life/influencer/*` 가 shop 의 rewrite 를 거쳐 이 앱에 닿는 구조.
- **정책 문서 5종** — 숫자의 근거. 코드 상수와 짝을 맞춰야 한다.

---

## 2. 어떤 순서로 만드나

전체 순서는 [monorepo-migration.md §7](monorepo-migration.md) 의 S1~S5 와 [inf-console-plan.md §7](inf-console-plan.md) 의 콘솔 1~6단계가 정하고 있다. **이 문서는 그중 3~6단계**, 즉 데모 화면이 정의하는 기능들을 다룬다.

| 단계 | 범위 | 상태 | 이 문서의 해당 절 |
|---|---|---|---|
| S1 | 골격 · 패키지 · 인증 배관 | **완료** | — |
| S2~S4 | shop(고객) 화면 · 결제 · 도메인 전환 | 진행 | — |
| S5 = 콘솔 1~2단계 | 로그인 · 가입 · 홈 · 내 정보 | 계획 확정 | §3.10 마이페이지(채널·정산정보 부분) |
| **콘솔 3단계** | **상품 갤러리 · 샘플 요청** | 명세 필요 | §3.4 · §3.3 |
| **콘솔 4단계** | **캠페인 스레드 · 일정 제안** | 명세 필요 | §3.3 · §3.2 |
| **콘솔 5단계** | **정산 · 매출** | 명세 필요 | §3.6 · §3.5 |
| **콘솔 6단계** | **등급 · 🥬 · 추천** | 명세 필요 | §3.7 · §3.8 · §3.9 |

### 3~6단계에 공통으로 필요한 일

데모 화면을 콘솔로 옮길 때마다 반복되는 작업이다.

1. **계산 로직을 서버로** — `helpers.ts` 의 `calc` · `gradeOf` · `sampleBtn` · `periodBlock` · `settleDue` 는 정책을 정확히 구현한다. 클라이언트에 두면 조작되므로 `packages/db` 쪽 서버 모듈이나 RPC 로 옮긴다. **다시 쓰지 말고 옮길 것** — 정책 해석이 이미 검증돼 있다.
2. **가드를 서버에서 강제** — [data-model.md §5.2](data-model.md) 표가 그대로 작업 목록이다. 인플루언서 영역:
   - 샘플 규칙 — 월 한도(등급별 1/2/5회, `created_at` 월 기준, **서울 시간대**), 무상 자격 등급, 상품당 무상 1회, 독점 상품 잠금, `paused/pending` 상품 차단
   - 등급 우선 기간제 — **제안·승인 두 시점 모두** 검사. 겹침 조회 후 `grade_tiers.is_priority` 로 판정. 배타 제약으로 만들면 안 된다(정책은 "기본 공유, 플래티넘 이상만 예외")
   - 재고 배정 — `qty <= stock − allocated`, 동시성은 트랜잭션
   - 🥬 차감 — 잔액 검사와 원장 기록이 한 트랜잭션. **결정 7에 따라 토스 승인 뒤 확정 RPC 안에서만 차감**(선차감 금지)
   - 상태 전이 화이트리스트 — 지금 `transition()` 은 아무 상태나 받는다
3. **마스킹** — 인플루언서 화면에서 구매자명은 `김*은` 형태로, 타 인플루언서는 익명 집계로만. 서버 응답 단계에서 처리한다([data-model.md §5.2](data-model.md) 마스킹 체크리스트).
4. **스케줄러** — `SCHEDULE_CONFIRMED→LIVE`(시작일), `LIVE→CLEARING`(종료일), D+21 정산 도래. 지금 `autoTick()` 은 **브라우저를 열 때만** 돈다.
5. **데모 숫자 제거** — §1.3 표의 하드코딩을 실제 집계로 바꾸거나 화면에서 뺀다. `simSell` · `ffwd` · `toggleLive` 는 프로덕션에 나가면 안 된다(`(demo)` 그룹이 404 되므로 자동 해결되지만, 콘솔로 옮길 때 딸려가지 않게 주의).

## 3. 화면별 명세

각 화면마다 **지금 / 해야 할 일 / 수용 기준** 순.

### 3.1 홈 `/`

**지금** — 할 일 목록(응답 대기 캠페인), 진행 중·예정 판매 카드, 내 장부 4칸, 등급 피라미드, 자산(🥬·샘플 잔여), 뉴스 3종, 추천 상품 3개.

**해야 할 일**
- "지금 할 일" 은 `INVITED / SAMPLE_SHIPPED / TESTING / SAMPLE_APPROVED / SAMPLE_PURCHASED` 필터다. 서버 조회로 옮기고 **알림(알림톡·이메일)과 연결**. 지금은 앱에 들어와야만 알 수 있다.
- 뉴스 영역의 "샘플 요청 12건" 은 리터럴 — 실제 집계나 제거.
- 내 장부의 "정산 예정 수수료" 는 원천징수 후 금액이다. 계산 근거를 툴팁으로 노출할지 검토.

**수용 기준** — 새 제안이 오면 홈에 뜨고, 앱 밖에서도 알림을 받는다.

### 3.2 내 캠페인 `/camps`

**지금** — `CampRow` 목록 + `Calendar`. 정렬은 생성일 역순.

**해야 할 일** — 상태 필터·검색(캠페인이 수십 건 넘으면 필요). 캘린더는 현재 내 캠페인만 — 같은 상품의 **다른 인플루언서 점유 기간**을 흐리게 보여주면 일정 제안 실패가 줄어든다(등급 우선권 정책과 연결).

### 3.3 캠페인 스레드 `/c/[cid]` ← 제품의 심장

**지금** — 상태 머신 14개 상태를 한 화면에서 전이시킨다. 스테퍼, 시스템 이벤트 + 채팅 타임라인, 상태별 액션 카드, 정산 미리보기.

**해야 할 일**
- **연락처 유출 감지** — `pushChat()` 의 정규식이 클라이언트에 있다. 서버 insert 시점으로 옮기고 `campaign_events.leak_flag` 에 기록. 현재 정규식은 휴대폰·"카톡"·"카카오" 만 잡는다. 오픈채팅 링크, 텔레그램, 이메일 주소는 안 잡힌다.
- **실시간** — 브랜드가 답하면 바로 보여야 한다. Supabase Realtime Broadcast 또는 `postgres_changes`(후자는 `campaign_events` 에 당사자 select 정책 추가 필요). data-model §6 에 미결로 남아 있다.
- **파일 첨부** — 지금 없다. 샘플 사진, 콘텐츠 시안 주고받기는 실서비스에서 반드시 요구된다.
- 읽음 표시 · 안 읽은 수(`dmUnreadN`)는 "마지막 메시지가 상대 것" 이라는 근사치다. 실제 읽음 시각이 필요.

**수용 기준** — 두 브라우저에서 같은 스레드를 열고 한쪽이 보내면 다른 쪽에 새로고침 없이 뜬다.

### 3.4 상품 갤러리 `/explore`

**지금** — 노출 상품 카드, 카테고리 필터, 동급 인플루언서 베스트셀러 TOP5(하드코딩 혼합), 트렌드 카테고리(상수).

**해야 할 일**
- TOP5 → `peer_bestsellers(grade)` RPC. **익명 집계만** 반환해야 한다(타 인플루언서 신원 노출 금지).
- 트렌드 → 실제 카테고리별 성장률 집계 또는 제거.
- 검색·정렬(수수료율, 판매가, 신규순)이 없다. 상품이 수백 개가 되면 필요.
- 상품 카드의 샘플 버튼 분기(`sampleBtn()`)는 잘 만들어져 있다 — 서버 검증만 붙이면 된다.

### 3.5 실시간 매출 `/sales`

**지금** — LIVE 캠페인의 주문 현황. 시뮬레이션 토글이 붙어 있다.

**해야 할 일** — 실주문 스트림(Realtime). 시뮬레이션 토글은 운영에서 제거. 구매자명은 인플루언서 화면에서 `김*은` 형태로 **마스킹** 해야 한다(data-model §5.2). 지금 시드는 이미 마스킹된 더미라 눈에 안 띄지만, 실주문이 들어오면 서버 응답에서 마스킹해야 한다.

### 3.6 정산 `/settle`

**지금** — 캠페인별 확정 매출·수수료율·세전 수수료·실수령 예정·지급 예정일. CSV 다운로드.

**해야 할 일**
- 숫자를 클라이언트 `calc()` 가 아니라 **`settlements` 스냅샷**에서 읽어야 한다. 정산 후에 등급이 바뀌면 지금 코드는 과거 정산액이 소급해 바뀐다 — 버그다.
- 원천징수 영수증·세금계산서 발행 연동.
- 지급 상태(대기/보류/완료)와 실제 이체일 표시. `payouts` 테이블이 이미 있다.
- CSV 를 서버 생성으로 옮길지 검토(감사 추적).

**수용 기준** — 정산 완료된 건의 금액은 이후 어떤 변경에도 바뀌지 않는다.

### 3.7 랭킹·등급 `/rank`

**지금** — 내 등급 피라미드, 등급별 혜택표, 전체 리더보드(타인은 `○○○` 익명).

**해야 할 일** — 리더보드가 지금 **모든 인플루언서 행을 클라이언트로 내려받아** 이름만 가린다. 서버에서 익명 집계로 만들어 내려야 한다(`seller_leaderboard()` RPC). `m3Sales` 집계 방식 확정 필요(§6).

### 3.8 셀러리 샵 `/shop`

**지금** — 🥬 잔액, 충전(시뮬), 아이템 5종 구매.

**해야 할 일** — 실결제(토스). 충전은 **선수금(부채)** 이라 회계 처리가 필요하다(points-policy 참고). 아이템 효과(프로필 상단 노출, 고객 홈 노출, 재판매 우선권)는 지금 플래그만 세우고 실제 노출 로직은 클라이언트 정렬에 있다 — 서버 쿼리로 옮겨야 한다.

### 3.9 추천 프로그램 `/ref`

**지금** — 코드 표시·복사, 보상 구조 설명, 내가 추천한 인플루언서 목록과 수익.

**해야 할 일** — 이 화면은 **S5 의 가입 폼이 `referral_code` 를 받아 `sellers.referred_by` 를 채운 뒤에야 의미가 생긴다**(데모에는 그 경로가 없었다). 보상 계산 자체는 `calc()` 의 `refReward`(확정 매출 2%)·`boost`(수수료 +1%p)와 `isRefBoost()`(첫 5회 판정)에 이미 정확히 들어 있으니 서버로 옮기기만 하면 된다. 지급은 정산 시점.

### 3.10 마이페이지 `/my`

**지금** — 프로필 사진(data URL), 추천 코드, 채널 목록(추가·수정·인증·메인 설정·삭제), 정산 정보 폼.

**해야 할 일** — §1.3 의 채널 인증·계좌 인증·사업자등록증 업로드가 전부 여기 걸려 있다. **개인정보·금융정보를 다루는 화면**이라 서버 검증과 암호화 저장이 필수다. `sellers` 테이블의 `bank_info`(jsonb)·`biz_no`·`biz_doc_url` 은 **service role 전용**으로 이미 닫혀 있다.

### 3.11 로그인 `/login`

**이 화면은 버린다.** 실서비스 로그인·가입은 `inf-console-plan.md §4` 가 정한 대로 이메일/비밀번호 + 인증 메일이고, 라우트는 `monorepo-migration.md §5.1` 의 `/login` `/signup` `/verify-sent` `/password` `/apply` 로 새로 만든다(콘솔 1~2단계 = S5). 데모 로그인은 `(demo)/demo-login` 으로 밀려난다.

다만 **가입 폼에 추천 코드 입력이 들어간다**는 점은 확인해 둘 것 — 데모에는 없어서 `sellers.referred_by` 를 채울 경로가 없었는데, 새 가입 폼 명세에는 `referral_code` 가 들어 있다. §3.9 추천 프로그램 화면이 그 위에서만 의미를 갖는다.

---

## 4. 바꾸면 안 되는 도메인 규칙

숫자와 규칙은 **기획이 정한 것**이다. 코드가 불편하면 코드를 바꾸되, 아래 값을 바꾸려면 `policy-change` 이슈로 올려 승인받는다. 상수는 전부 `packages/core/src/constants.ts` 에 있다.

### 4.1 정산식 (`helpers.ts: calc()`)

```
확정 매출(net)   = 결제 합계 − 환불
PG 수수료        = net × 1.9%                     ← 브랜드 정산에서 차감, 플랫폼 수익 아님
인플루언서 수수료 = (net − 샘플구매분) × 상품 수수료율
  + 등급 보너스   = (net − 샘플구매분) × 등급 bonus%p
  + 추천 부스트   = net × 1%  (추천으로 가입, 첫 5회 판매)
플랫폼 수수료    = net × 10% − (등급보너스 + 추천보상 + 브랜드추천 + 브랜드등급할인)
브랜드 정산액    = net − PG − 인플루언서기본수수료 − 플랫폼10% + 브랜드할인분
지급             = 판매 종료 + 21일
원천징수         = 개인 3.3% / 사업자 0 (세금계산서)
```

**핵심 원칙 두 가지**
- 등급 보너스·추천 보상·브랜드 할인은 **상대방 몫을 깎지 않는다**. 전부 플랫폼 수수료에서 나간다.
- 인플루언서 샘플 구매분은 인플루언서 수수료 계산에서 빠지지만 플랫폼 10% 는 그대로 붙는다.

### 4.2 등급 (`GRADES`)

최근 3개월 확정 매출 기준 7단계. 보너스는 **"수수료율에 더하는 %p"** 다 — "3%를 받는다" 가 아니라 "20% → 23%".

| 등급 | 기준 | 보너스 | 샘플/월 |
|---|---|---|---|
| 블랙 | 1억 | +3%p | 5 |
| 다이아 | 5천만 | +2%p | 5 |
| 플래티넘 | 3천만 | +1.5%p | 5 |
| 골드 | 1,500만 | +1%p | 2 |
| 실버 | 800만 | +0.5%p | 2 |
| 브론즈 | 300만 | +0.3%p | 1 |
| 스타터 | 0 | 0 | 1 |

### 4.3 판매 기간

같은 상품·같은 기간은 **기본 공유**다. 예외는 하나 — **플래티넘 이상**(`PRIORITY_TIER`)이 확정하거나 진행 중인 기간에는 골드 이하가 새로 들어갈 수 없다. "기간 완전 독점" 은 **폐기된 옛 정책**이니 되살리지 말 것. 상품 독점권(`exclusive`)은 별개 기능이다.

### 4.4 샘플

무상 조건 **세 가지를 모두** 만족해야 한다. ① 상품별 무상 기준 등급 이상 ② 그 상품 무상 이력 없음(상품당 1회) ③ 이달 한도 남음. 하나라도 미달이면 유상 구매 — **현금 또는 🥬 우선+잔액 현금**(택일이 아니라 혼합). 브랜드가 직접 제안한 건은 한도를 깎지 않는다.

### 4.5 상태 머신

14개 상태, `ST` 에 정의. 전이는 `actions.ts` 의 각 함수가 담당하고 모든 전이가 `campaign_events` 에 시스템 메시지를 남긴다. **이 이력이 분쟁 해결의 근거**이므로 전이를 조용히 처리하면 안 된다.

---

## 5. DB 매핑 요약

| 프로토타입 | 테이블 | 비고 |
|---|---|---|
| `Seller` | `sellers` | 정산 정보는 service role 전용 컬럼 |
| `Seller.channels[]` | `seller_channels` | `(platform, handle)` 유니크, seller당 primary 1개 |
| `Campaign` | `campaigns` | 활성 `(seller, product)` 1개 부분 유니크 제약 있음 |
| 스레드 메시지 | `campaign_events` | `system` / `chat`, `leak_flag` |
| `Order` | `orders` | `sold_qty` 는 트리거 캐시 |
| `Settlement` | `settlements` + `payouts` | 캠페인당 1회 유니크 |
| 🥬 원장 | `celery_ledger` · `celery_balances`(뷰) · `celery_purchases` | |
| 추천 보상 | `referral_earnings` | side 별 컬럼 조합 check |
| 독점권 신청 | `exclusive_requests` | PENDING 중복 방지 |

필요한 RPC/서버 액션 후보는 `docs/data-model.md §9` 에 영역별로 정리돼 있다. 인플루언서 영역: `request_sample`, `buy_sample`, `accept_invite`, `decline_invite`, `receive_sample`, `pass`, `propose_schedule`, `regongu`, `celery_spend`, `celery_topup`, `post_campaign_message`, `seller_leaderboard`, `peer_bestsellers`.

---

## 6. 결정 상태

### 6.1 이미 결정된 것 — 다시 논의하지 말 것

[inf-console-plan.md §0](inf-console-plan.md) 에 확정돼 있다. 이 문서 초안에서 "확인 필요" 로 적었던 항목 중 아래는 이미 답이 나와 있었다.

| 항목 | 결정 | 근거 |
|---|---|---|
| 파트너 로그인 | 이메일/비밀번호 + 인증 메일. 구글은 2차, 카카오 미지원 | 결정 4 |
| 가입 심사 | **수동 심사 없음** — 인증 메일 완료 즉시 `sellers` 행 생성·입장. 사칭 방어는 채널 인증이 맡는다 | 결정 5 |
| 채널 인증 | 셀프 서비스. [인증 확인] 클릭 시 즉시 verified 가 아니라 `vcode_confirmed_at` 만 기록("인증 대기") → 운영자 확인 또는 자동 확인 후 verified. 샘플 요청의 전제조건 아님 | 결정 5 · §4.7 |
| 🥬 유상 충전 | **도입하지 않음** — 선불전자지급수단 규제 검토 전까지. 1차 🥬 는 가입 축하 3 + 관리자 지급 + 정산 획득분만 | 결정 9 |
| 🥬 차감 시점 | 토스 승인 **뒤** 확정 RPC 한 트랜잭션에서만(선차감 금지) | 결정 7 |
| 정산 지급 수단 | 운영자 은행 이체 + 스크립트로 `payouts.paid` 표시. 토스 페이아웃·펌뱅킹은 범위 밖 | §5.9 |
| 콘솔 URL | 경로 모드 `sellery.life/influencer/home`(서브도메인 아님, 2026-09-18 변경) | 결정 변경 |
| 샘플 배송지 | 결제·요청 시 입력 → `campaigns.sample_shipping`, 프로필 기본값 프리필 | — |

한 가지 **불일치가 이미 지적돼 있다** — 샘플 구매가에 등급 보너스를 반영하기로 했는데(`rate + grade_bonus` 차감), 데모의 `samplePrice()` 는 `p.rate` 만 뺀다. 포팅할 때 고쳐야 한다.

### 6.2 아직 답이 필요한 것 (이 문서에서 새로 나온 것)

콘솔 3~6단계에 들어가기 전에 답이 필요하다.

1. **`m3Sales` 집계 방식** — 정산 시 증분(데모) vs 롤링 90일 재계산. 후자가 정확하지만 **등급이 내려갈 수 있다**. 등급 강등을 허용하나. 등급은 수수료율·샘플 한도·기간 우선권의 근거라 파급이 크다.
2. **팔로워 수 신뢰** — 지금은 자기 입력(`ChannelModal` placeholder 가 "실서비스에선 API로 자동 수집" 이라고 적혀 있다). 갤러리 노출 순서와 자동 매칭 점수에 쓰인다. 수집으로 검증할 것인가, 표시만 하고 랭킹에서 뺄 것인가.
3. **판매 기간·재고 입력 제약** (§1.5) — 3/5/7일 고정과 재고 50단위·최소 50개가 정책인가 임시값인가. 브랜드가 상품별로 지정하게 할 것인가.
4. **방문수·전환율 지표** — 판매 링크 방문 로깅을 붙일 것인가, KPI 를 없앨 것인가. 지금 값은 의미가 없다(B2).
5. **데모 지표 노출** — 상품 갤러리 TOP5·트렌드 카테고리를 실데이터가 쌓일 때까지 어떻게 할 것인가. 하드코딩을 유지하려면 "데모 지표" 라벨을 전부에 붙여야 한다(지금은 일부만).
6. **알림 채널** — 카카오 알림톡 템플릿 승인에 리드타임이 있다. 어느 이벤트(제안 도착·샘플 발송·일정 승인·정산 지급)에 보낼지 목록 확정.
7. **타 인플루언서 익명 집계 범위** — 리더보드·베스트셀러 TOP5 를 서버 집계로 옮길 때 어디까지 공개할지. [data-model.md §9.1](data-model.md) 의 열린 결정 3번과 연결된다.

---

## 7. 작업 방식

- 브랜치 → `npm run check` · `npm test` → PR → CI(`프로토타입 점검`) 초록 → squash 병합. `main` 직접 커밋 금지.
- 브랜치 접두사 `fix/` `feat/` `copy/` `design/` `docs/` `policy/`. 커밋 메시지는 **한글 한 줄, 파일명이 아니라 화면·기능 이름으로**.
- **파일 소유(파티션)** — 이식 작업은 [monorepo-migration.md §9](monorepo-migration.md) 에서 담당자별 파일 범위를 나눠 뒀다. S1 은 공유 파일을 만지므로 단독 병합, 이후는 파티션 안에서만 움직인다.
- 정책 숫자를 바꾸면 `docs/` 의 해당 문서를 **같은 PR 에서** 고친다. 파트너에게 보여주는 문서라 코드와 어긋나면 안 된다.
- 스키마 변경은 새 번호 마이그레이션 추가 → 병합 → `npx supabase db push --linked`. 기존 파일 수정 금지.
- 서버 전용 코드가 클라이언트 번들에 새지 않는지 `node scripts/check-boundaries.mjs` 가 검사한다. CI 에 포함돼 있다.
- 타이포: 본문 `IBM Plex Sans KR` 은 **700이 최대**(800 쓰면 뭉갬), `font-synthesis:none` 유지, `-webkit-font-smoothing:antialiased` 넣지 말 것(윈도우에서 흐려짐), 한글은 `word-break:keep-all`.

### 알려진 이슈

- 개발 서버는 앱마다 포트가 달라 **localStorage 가 앱별로 분리**된다. 브랜드 앱에서 승인한 것이 인플루언서 앱에 안 보인다. DB 연동 후 사라지는 문제다.
- 데모 화면은 S5 에서 `(demo)/` 그룹으로 옮겨져 **프로덕션 404**, dev 에서만 `/influencer/demo` 로 열린다. 이 문서가 참조하는 경로는 그때 바뀐다.

---

## 8. 첫 주 체크리스트

**파악**
- [ ] `npm install && npm run dev:influencer` 로 띄우고 탭 전부 눌러보기
- [ ] 한 캠페인을 `SAMPLE_REQUESTED` 부터 `SETTLED` 까지 끝까지 진행해보기 (브랜드 앱 5174 · 관리자 앱 5175 를 같이 띄운다)
- [ ] §1.3 "가짜인 것" 표를 코드에서 직접 확인
- [ ] [inf-console-plan.md](inf-console-plan.md) §0 결정 12건 · [monorepo-migration.md](monorepo-migration.md) §5 · §7 읽기
- [ ] [data-model.md](data-model.md) §5.2(앱이 강제할 규칙) · §9(필요한 RPC) 읽기

**워밍업 — 코드 익히면서 실제로 고치기**
- [ ] B1 사업자 원천징수 불일치 (한 줄 수정, 영향 확인이 본체)
- [ ] B6 미인증 인플루언서에게 "채널 인증 ✓" 표시 — 대외 신뢰 문구라 우선
- [ ] B4 미리보기에서 장바구니 담기 차단
- [ ] B3 · B5 · B7
- [ ] 샘플 구매가 등급 보너스 미반영 (§6.1 하단)

**진행**
- [ ] §6.2 미결 7건에 대한 답 받기 (1·2·6 은 리드타임이 있다)
- [ ] 콘솔 3단계(상품 갤러리·샘플 요청) 설계 — §3.4 · §3.3 과 `helpers.ts` 의 `sampleBtn`/`freeEligible` 을 서버로 옮기는 것부터

---

## 부록: 파일 빠른 참조

| 찾는 것 | 파일 |
|---|---|
| 정책 숫자 (수수료·등급·샘플·🥬) | `packages/core/src/constants.ts` |
| 정산 계산 | `packages/core/src/helpers.ts` → `calc()` |
| 샘플 자격 판정 | `helpers.ts` → `sampleBtn()` · `freeEligible()` · `sampleLeft()` |
| 기간 우선권 판정 | `helpers.ts` → `periodBlock()` · `isPriority()` |
| 버튼이 하는 일 전부 (데모) | `packages/core/src/actions.ts` |
| 상태 머신 정의 | `constants.ts` → `ST` · `FLOW` |
| 데모 화면 하나 | `apps/influencer/src/routes/<화면>/+page.svelte` |
| 캠페인 스레드 | `packages/ui/src/views/CampaignDetail.svelte` |
| 디자인 토큰 | `packages/ui/src/css/theme.css` |
| DB 접근 (실서비스) | `packages/db` |
| 결제 (실서비스) | `packages/payments` |
| 인증 세션 | `apps/influencer/src/hooks.server.ts` |
| DB 스키마 | `supabase/migrations/0001~0010` |
