# MYR(Make Your Recipe) 전체 구현 방향 — apps/myr · myr-shop · myr-influencer · myr-admin

> **상태(2026-10-28 · 2026-10-29 장바구니/줄 단위 정산 반영): 방향 결정 문서. 구현 전.** "Make Your Recipe(MYR)" 로 만든 인플루언서 PB 제품을 **한 샵에서 모아 팔고, 인플루언서가 자기 제품의 등록·판매실적·CS 를 직접 맡고, 운영팀이 검수해 샵에 오픈하는** 구조를 정한다. 셀러리(캠페인 모델)의 결제·주문·CS 코드를 **복사해 쓰되 import 로 섞지 않는다** — MYR 이 완성되면 셀러리 쪽 앱·기능은 쓰지 않게 될 전망이라, 나중에 셀러리 폴더만 지워도 MYR 이 남도록 경계를 둔다.
>
> 근거(저장소 안): `apps/shop/src/routes/{api,checkout,cs,orders,account}/**` · `packages/payments/src/server/*` · `packages/db/src/server/{brand,partner,admin}/*.server.ts` · `supabase/migrations/{0004,0005,0008,0015,0018,0020,0021,0041}` · `docs/branding-plan.md`(랜딩 `apps/myr`) · `docs/brand-console-plan.md` · `docs/admin-console-plan.md`(콘솔 골격) · `docs/deploy.md`(외부 서비스 등록).
>
> 이 문서가 정하지 않는 것: 디자인(MYR 랜딩의 다크·앰버 테마를 따를지), 도메인 이름, 정산 요율 숫자. §9 열린 결정.
>
> **2026-11-03 물류 방향 반영**: 발송은 물류사 **이벗(Ebut)** API 로 자동화한다 — 바인허브(`weglow-biz/vyneherb` 저장소)와 같은 방식(평일 11시 자동 발주 · 18시 송장 자동 수집 · 반품 회수 API). 그래서 송장은 **주문 줄 단위**가 되고(결정 8 · 13), 배송준비중 이후의 환불·교환은 **인플루언서 승인 + 회수**를 거친다(결정 7). 연동 설계는 §6.8, 콘솔 작업 순서는 §4.2.1 · §4.3, 단계는 §7 E1~E4.

---

## 0. 결정 요약

| # | 결정 | 이유 |
|---|---|---|
| 1 | **앱 4개** — `apps/myr`(랜딩 · 기존) · `apps/myr-shop`(고객 샵) · `apps/myr-influencer`(인플루언서 콘솔) · `apps/myr-admin`(운영 콘솔). 각각 Vercel 프로젝트 1개, **도메인은 새로 연다**(§2) | 셀러리 4앱(`shop` `influencer` `brand` `admin`) 과 이름·배포·도메인을 완전히 분리. 셀러리 `apps/admin` 에 탭을 얹지 않는다. |
| 2 | **판매 단위 = 상품.** 캠페인 테이블을 만들지 않는다. `myr_products.seller_id`(not null) 가 주인이고, 주문 줄·문의는 그 값을 복사해 가진다 | MYR 은 "나만 팔 수 있는 내 레시피 제품" — 상품 하나에 셀러 하나. 셀러리의 캠페인은 "같은 상품을 여러 인플루언서가 기간을 나눠 파는" 문제를 풀려고 있었고 MYR 엔 그 문제가 없다. 셀러 한 명이 상품 여러 개는 당연히 된다(1:N). |
| 2-1 | **장바구니 — 결제 1건에 여러 셀러의 상품을 담고 한 번에 결제한다(2026-10-29).** 고객에게는 **주문 1건**(주문번호 하나 · 배송 하나) 으로 보이고, 셀러별로 나누는 건 **주문 줄(`myr_order_items.seller_id`)** 이다 — 정산 · 환불 · CS · 실적은 줄 단위, 배송 · 주문번호 · 결제는 주문 단위 | 디자인(Claude Design "MYR Shop") 이 장바구니를 전제한다. 셀러리 체크아웃은 "상품 1 × 옵션 1 × 수량" 한 줄이었고, MYR 은 그 한 줄을 "줄 여러 개" 로 바꾼 것뿐이라 토스 승인·복구·웹훅·비회원 토큰은 결제 단위에 그대로 붙는다. 고객에게 셀러별 배송 N건을 보여주지 않기로 했으므로(아래 8) 주문 행을 셀러별로 쪼개지 않는다. |
| 3 | **`seller_id` 는 폼 값이 아니라 세션 값.** 상품 등록은 `requireSeller()` 가 돌려준 `seller.id` 로 서버가 insert · 체크아웃은 `product_id` 만 받고 서버가 `products.seller_id` 를 세션·주문에 복사 · 문의도 같다 | 브랜드 콘솔이 `brand_id` 로 하는 방식 그대로. 클라이언트가 보낸 소유자 값은 받지 않는다 → 남의 상품·주문·문의는 URL 을 바꿔도 안 보인다. |
| 4 | **상품 등록은 인플루언서가 한다**(가격 · 소개글 · 이미지 · 옵션 · 판매/일시중지). 등록 직후 상태는 `pending` 이고 **운영팀 검수(`listed`) 를 통과해야 샵에 보인다.** 반려는 사유 필수 | 셀러리 `products.status` 게이트(0002 · `app_admin_review_product` 0015) 와 같은 패턴. 표시광고·건기식 문구는 사람이 봐야 한다. |
| 5 | **같은 Supabase 프로젝트(`sellery`), 새 테이블**(`myr_` 접두사 · 함수 `myr_app_*`) · 공유하는 것 = `auth` · `profiles` · `sellers` · `customers` · `payment_events` · 비회원 토큰 RPC(0021) · `platform_settings` | 로그인·고객·토스 키·지급대행을 둘로 나누지 않는다. 셀러리 전용 테이블(`campaigns` `orders` `cs_conversations` …)은 건드리지 않는다. |
| 6 | **결제·주문 코드는 그대로, SQL 함수만 다시.** `/api/checkout` `/api/payments/{confirm,webhook}` `/api/cron/reconcile` · `toss.server.ts` · `checkout-sync` 흐름 · `checkout_sessions` 상태 기계는 복사. `app_confirm_checkout` · `app_checkout_reserved` · `app_refund_precheck` 를 상품 축으로 재작성, `campaign_card` → `myr_product_card` | 결합은 "무엇을 검사하느냐"(캠페인 LIVE·기간·배정 재고 → 상품 listed·stock) 뿐이고 전부 DB 함수 안에 있다. |
| 7 | **CS·환불은 인플루언서가 한다.** 문의함 · 스레드 · 답변 · 종료 · 교환/환불 처리를 `seller_id` 게이트로. 환불은 **내 줄(order_items) 단위의 토스 부분 취소**(§6.3). **2026-11-03 개정 — 교환·환불은 승인형**: 고객 요청 → 인플루언서 승인(처리 방법 선택)/반려 → 발주 전이면 즉시 환불, 발주(배송준비중) 뒤면 회수 → 환불 · 교환은 재발송(§6.4 · §6.8). 회수·재발송 **실행**은 운영(admin) · 서버 몫 | 브랜드 콘솔 `cs.server.ts` · `brand-refund.server.ts` 를 `brand_id → seller_id` 로 복사하되, 결제 1건에 셀러가 여럿이라 전액 취소가 아니라 `cancelAmount` 부분 취소가 된다. 이벗으로 발주된 주문은 창고에서 이미 작업 중이라 즉시 취소할 수 없다 — 바인허브도 교환·반품을 신청 → 진행중 → 완료/거부 상태로 관리한다. |
| 8 | **발송은 MYR 물류(이벗)가 주문 단위로 한 번에 한다**(2026-10-29 전제 — 고객에게 주문 1건 · 배송 1건). 배송비는 **결제당 1건**(무료배송 기준도 장바구니 합계 기준). **2026-11-03 개정 — 발주·송장은 이벗 API 자동**(결정 13): 송장은 이벗이 **주문 줄마다** 돌려주므로 줄 단위로 저장한다(한 박스면 줄들의 송장이 같다). 수동 송장 입력은 이벗 장애·연동 전 대비로 `myr-admin` 에만. 인플루언서 콘솔 "주문" 탭은 내 줄의 **열람**만(환불은 결정 7 승인 흐름) | 랜딩이 "재고·물류는 MYR 이 맡는다" 를 약속하고, 셀러별 배송 N건을 고객에게 보여주지 않기로 했다. 셀러가 각자 보내는 방식으로 바꾸면 배송비 · 무료배송 · 운송장이 전부 셀러별(= 줄 묶음별) 로 갈라진다(§9-9 에 되돌릴 조건을 적어 둔다). |
| 9 | **운영 콘솔 `myr-admin` 1차 = 상품 검수 + 주문/문의 열람 + 예외 환불(§4.3 우선 2 — 인플루언서 흐름이 막혔을 때만 · 사유 필수).** 게이트는 `profiles.role='admin'`(`requireAdmin()` 복사) | 셀러리 관리자 계정을 그대로 쓴다(같은 Supabase). 정산 실행·지급은 2차. |
| 10 | **정산은 1차 범위 밖.** 주문에 `seller_margin_rate` 스냅샷만 남기고, 실적 화면은 매출·환불·순매출·예상 정산액을 보여준다 | 요율·주기·지급 방식이 미정. 셀러리 0053 수식(3%+3%+5%) 을 가져오지 않는다. 지급대행(`payouts.server.ts` · 0042) 은 나중에 재사용 가능. |
| 11 | **셀러리 코드와의 경계** — MYR 공용 코드는 **`packages/myr-core`(`@sellery/myr-core` · 2026-11-04)** 한 곳. 셀러리 패키지(`@sellery/db` · `@sellery/payments` · `@sellery/core` · `@sellery/ui`)는 MYR 앱·패키지에서 import 하지 않고 필요한 코드는 복사한다 — `scripts/check-boundaries.mjs` 규칙 (f)(g) 가 CI 에서 막는다(패키지의 SvelteKit 별칭 `$env`·`$app`·`$lib` 도 금지 · 설정은 `configureMyrCore` 주입). (처음 계획한 `packages/db/src/server/myr/` · `packages/payments/src/server/myr/` 복사본 위치는 쓰지 않았다 — 셀러리 패키지 안에 두면 셀러리를 걷어낼 때 같이 지워진다) | 셀러리 폐기 시 `apps/{shop,influencer,brand,admin}` 과 셀러리 패키지만 지우면 되게. |
| 12 | **단일 함수 원칙** — 같은 동작(환불 · 운송장 · 문의 답변 · 상품 상태 변경)은 **패키지 함수 하나 + SQL 함수 하나**로 두고 `actor`('customer' · 'seller' · 'admin') 매개변수로 권한만 가른다. 앱 라우트는 세션에서 actor 를 정해 그 함수를 부르는 얇은 껍데기. 외부가 부르는 HTTP 엔드포인트(토스 웹훅 · 크론) 는 `myr-shop` 에만 둔다(§3.1) | 셀러리는 고객 `/api/payments/cancel` · 브랜드 `refundOrderAsBrand` · 관리자 `admin-refund` 로 같은 토스 취소가 세 벌이다. MYR 은 앱이 넷이라 그대로 가면 네 벌이 된다. 앱끼리 HTTP 로 부르지 않는다 — 같은 Supabase 를 service role 로 직접 쓰므로 CORS·인증 전달이 필요 없다. |
| 13 | **물류 = 이벗 API 자동화(2026-11-03 · 바인허브와 같은 방식)** — ① 평일 11시: 11시 전 결제(가상계좌는 입금) 된 줄을 이벗 주문 등록(`ordercreatem` · 주문번호 = 줄 id · 상품 = 이벗 상품코드) → 줄 상태 "배송준비중" · 실패 3회 재시도 ② 매일 18시: 이벗 상태 조회(`orderstatus`) → 줄마다 송장 → "배송중" · 택배사 배송완료(또는 10일 경과) → "배송완료" · 배송 시작 메일 ③ 반품 회수(`exprtakeback` · 취소 · 상태 조회) ④ 이벗 상품코드는 **운영팀이 상품 검수 때 입력**(인플루언서는 입력·열람하지 않음) ⑤ 재고는 창고(이벗) 기준 — 인플루언서 재고 입력 없음. 크론·이벗 클라이언트는 `myr-shop`(외부 호출 한 곳 · 결정 12) | 물류사가 바인허브와 같은 이벗을 쓰기로 함(2026-11-03). 바인허브 구현(`backend/shop/app/Services/EbutOrderService.php` · `Jobs/OrderStatusToPreparing.php` · `Jobs/OrderStatusToDeliveringOrDelivered.php` · `routes/console.php`) 을 기준으로 삼는다. 이벗 계정 · 상품 등록 절차 · 박스 발송인은 미정(§9-14). |

---

## 1. 사용자 흐름

```
[인플루언서 · myr-influencer]            [운영팀 · myr-admin]              [고객 · myr-shop]
가입/로그인 ─ sellers 행 (기존 requireSeller 게이트)
  └ 상품 등록(pending) ─────────────▶ 상품 검수
                                       승인 → listed ────────────────▶ 홈 모아보기 · /p/<code> 노출
                                       반려 → rejected(사유) ◀─ 수정 후 재제출(pending)
  ├ 판매 중 / 일시중지 토글 (listed ↔ paused · 검수 재요청 없음)
  ├ 가격·소개글 수정 ─ 가격 변경은 pending 재검수 (§9)
  │                                                                     장바구니(여러 셀러) → 토스 결제 1건
  │                                                                       → myr_orders 1건 + myr_order_items(줄마다 seller_id)
  │                     [서버 크론 · 이벗]  평일 11시 자동 발주(줄 → 배송준비중) · 18시 송장 수집(줄 → 배송중/완료) ──▶ 배송 시작 메일
  │                                    실패·지연 목록 · 수동 송장(장애 대비)
  ├ 주문 탭: 내 줄 열람(배송 상태 · 송장 · 수취인 가림)
  ├ 문의 탭: 고객 문의(seller_id) 답변·종료 ◀──────────────────────── 문의 시트(CsSheet)
  ├ 교환·환불 탭: 요청 승인/반려 ◀──────────────────────────────────── 환불 신청 페이지(배송준비중 이후 = "요청")
  │    승인 → 발주 전: 즉시 부분 취소     회수 접수·확인 → 환불       고객 셀프 환불(발주 전 · 줄 또는 전체) /api/payments/cancel
  │                                       교환 재발송
  └ 실적 탭: 내 줄 기준 매출·환불·순매출·상품별 집계
```

---

## 2. 앱 · 도메인 · 배포

| 앱 | 역할 | 지금 주소 | 새 도메인(예시 · §9-1) | Vercel |
|---|---|---|---|---|
| `apps/myr`(기존) | 제조의뢰 랜딩·퍼널 | `https://sellery-branding.vercel.app/influencer/oem/` · `https://makeyourrecipe.vercel.app/influencer/oem/` · 공개 주소 `https://sellery.life/influencer/oem`(shop 리라이트) | 루트 `https://<myr-domain>/` | `myr`(옛 `sellery-branding`) · base `/influencer/oem` |
| `apps/myr-shop`(신규) | 고객 샵 · 결제 · 주문 조회 · 문의 | — | `https://shop.<myr-domain>` 또는 루트 | 신규 · base `''` |
| `apps/myr-influencer`(신규) | 인플루언서 콘솔 | — | `https://studio.<myr-domain>` 등 | 신규 · base `''` |
| `apps/myr-admin`(신규) | 운영 콘솔(검수 · 열람 · 환불 대행) | — | `https://admin.<myr-domain>` · `noindex`(HTML + `X-Robots-Tag` · robots.txt 는 막지 않음 — 막으면 noindex 를 못 읽는다) | 신규 · base `''` |

- **앱마다 자기 도메인(또는 서브도메인) 을 갖는다.** 셀러리처럼 한 오리진 밑에 리라이트로 묶지 않는다 → `vercel.json` 리라이트 · `csrf.trustedOrigins` · base 경로가 전부 필요 없다. 대신 앱 사이 링크(콘솔의 "내 상품 보기" → 샵) 는 절대 URL 이라 `PUBLIC_MYR_SHOP_URL` 같은 env 로 넘긴다.
- 랜딩 `apps/myr` 는 지금 base `/influencer/oem` 으로 sellery.life 리라이트에 물려 있다. MYR 도메인이 열리면 **루트로 옮기고**(`paths.base ''` · `csrf.trustedOrigins` 제거 · `vercel.json` 의 `/ → /influencer/oem` 리다이렉트 제거), 옛 주소는 새 도메인으로 301. 광고·제안서에 박힌 `sellery.life/influencer/oem` 은 `apps/shop/vercel.json` 리라이트 대신 **리다이렉트**로 바꿔 유지한다.
- 환경변수는 `.env.example` 의 같은 이름(`PUBLIC_SUPABASE_*` · `SUPABASE_SERVICE_ROLE_KEY` · `TOSS_SECRET_KEY` · `PUBLIC_TOSS_CLIENT_KEY` · `RESEND_API_KEY` · `CRON_SECRET`) 을 앱별 Vercel 프로젝트에 넣는다. 크론(`reconcile` · `tracking`) 은 `apps/myr-shop/vercel.json` 에.
- 세션 쿠키는 호스트 단위라 **앱 사이에 로그인이 공유되지 않는다.** 이건 의도한 결과다 — 고객은 샵에서 카카오로, 인플루언서는 콘솔에서 이메일로, 운영자는 admin 에서 따로 로그인한다. 셀러리에서 `foreign` 세션(고객 세션이 콘솔에 붙는 경우) 을 처리하던 분기는 단순해진다.

### 2.1 새 도메인에서 외부 서비스 — 되는 것과 등록할 것

도메인이 바뀌어도 **구조적으로 막히는 건 없다.** 전부 "새 오리진을 등록" 하는 일이고, 어느 것도 코드 변경이 아니다. (정본 표는 `docs/deploy.md` §5 — 거기에 MYR 열을 추가한다.)

| 서비스 | 되는 이유 | 새 도메인에서 할 일 |
|---|---|---|
| **Supabase Auth** | 프로젝트 하나를 여러 오리진이 쓰는 건 정상. 세션은 각 앱의 `hooks.server.ts` 가 쿠키로 들고, DB 는 service role | Authentication → URL Configuration → **Redirect URLs** 에 세 앱의 `/auth/callback` · `/auth/confirm`(+ `*.vercel.app` 프리뷰 와일드카드) 추가. Site URL 은 하나뿐이라 셀러리 또는 MYR 중 하나 — 메일 링크는 `redirect_to` 를 쓰므로 어느 쪽이어도 된다. 이메일 템플릿은 프로젝트당 1벌이라 **셀러리와 MYR 이 같은 문구를 공유**한다(역할 중립으로 다듬을 것 · inf §4.8 과 같은 제약). |
| **카카오 로그인** | Supabase OAuth 는 카카오 콜백이 `https://<ref>.supabase.co/auth/v1/callback` 하나라 이미 등록돼 있다. 샵 도메인이 바뀌어도 카카오 쪽 Redirect URI 는 그대로 | 카카오 개발자 콘솔 → 플랫폼(Web) **사이트 도메인에 새 샵 오리진 추가**. 동의 화면에 뜨는 앱 이름·아이콘이 "셀러리" 인데 MYR 로 보이게 하려면 **카카오 앱을 따로 만들어야 하고, Supabase 프로젝트당 카카오 provider 는 1개**라 그 경우 Supabase 프로젝트 분리 또는 셀러리 쪽 카카오 로그인 포기가 따라온다(§9-2). |
| **토스페이먼츠** | 결제창 `successUrl` · `failUrl` 은 요청마다 보내는 값이라 등록이 없고, 승인·취소는 서버 → 토스 호출이라 도메인 무관 | 토스 개발자센터 → **웹훅 URL** 에 `https://<shop>/api/payments/webhook` 추가(여러 개 등록 가능). 가맹점 계약에 적은 **서비스 URL** 이 sellery.life 면 MYR 도메인을 알리거나 추가. MYR 을 **별도 사업자·별도 정산 계좌**로 받으려면 상점(MID) 을 따로 내야 하고 그때는 키 두 벌 — `TOSS_SECRET_KEY` 는 어차피 앱별 env 라 코드는 그대로다. |
| **Resend** | 발신 도메인 인증은 도메인 단위 | MYR 도메인으로 `noreply@` 를 보내려면 Resend 에 도메인 추가 + DNS(DKIM·SPF). 그 전까지는 `noreply@sellery.life` 발신으로 동작한다. |
| **Vercel** | 프로젝트별 도메인 | 프로젝트 3개 신규 · 각 Domains 에 서브도메인 · DNS CNAME. 팀 SSO 보호 때문에 `*-weglow-team.vercel.app` 고유 URL 은 302 — 공개 확인은 프로젝트 별칭(`<project>.vercel.app`) 으로(branding-plan §7 과 같은 현상). |
| **스마트택배 API** | 서버 호출 · 도메인 무관 | 없음(키만 env). |

---

## 3. 데이터 모델 (새 마이그레이션 0056~ · 접두사 `myr_`)

공유(기존): `auth.users` · `profiles`(role) · `sellers`(user_id · handle · name · email · avatar · bank_info) · `customers` · `payment_events` · `app_guest_*`(0021) · `platform_settings` · `sensitive_access_log`(0013).

```
myr_products
  id · code(unique · 'm' || seq) · seller_id → sellers (not null · on delete restrict)
  name · intro(소개글) · description · category(§9-5)
  thumb_url · image_urls text[] · options jsonb [{n, price}] (1개 이상 · 서버가 가격의 단일 소스)
  stock int · sold_qty int(트리거 캐시) · status('pending'|'listed'|'paused'|'rejected')
  reject_reason · reviewed_at · reviewed_by · submitted_at
  seller_margin_rate numeric(5,4)(정산 스냅샷용 · 운영 설정값 복사) · deleted_at · created/updated_at

-- 결제 단위 (셀러리 checkout_sessions 의 "한 줄" 을 "줄 여러 개" 로 — 상태 기계 · 멱등 선점 · 비회원 쿠키 · 만료는 0008 그대로)
myr_checkouts           ← 0008 checkout_sessions 의 결제 컬럼: toss_order_id · user_id/customer_id · buyer_* · shipping jsonb
                          items_amount · shipping_fee · amount(=합 · 토스에 보내는 값) · status(PENDING→CONFIRMING→CONFIRMED|FAILED|EXPIRED)
                          payment_key · fail_* · raw_payment · link 없음 · expires_at
myr_checkout_items        checkout_id · product_id · seller_id(서버가 products 에서 복사) · option_index · option_name · qty · unit_price
                          (소프트 재고 예약은 이 줄의 product_id 합으로 — myr_app_checkout_reserved(product_id))

-- 주문 단위 = 결제 1건 = 고객에게 보이는 주문 1건 (결정 2-1 · 8)
myr_orders              code('o' || seq · 주문번호 하나) · checkout_id · user_id/customer_id · buyer_* · shipping jsonb(수취인 원문)
                          items_amount · shipping_fee · amount · refund_amount(줄 환불 누적) · status('WAITING_DEPOSIT'|'PAID'|'PARTIAL_REFUNDED'|'REFUNDED'|'CANCELED')
                          payment_key · payment_method · paid_at · deposit_due_at(§6.7) · raw_payment
                          courier · tracking_no · shipped_at · delivered_at(0049) — **주문 단위 1건 · 물류센터가 입력**
                          exchange_courier · exchange_tracking_no · exchange_shipped_at(§6.4)
myr_order_items         order_id · seller_id · product_id · option_name · qty · unit_price · amount
                          seller_margin_rate 스냅샷(정산 기준) · status('PAID'|'PARTIAL_REFUNDED'|'REFUNDED') · refunded_qty · refund_amount(= unit_price × refunded_qty 누적) · refunded_at · refund_reason · refund_actor
                          → **정산 · 환불 · CS · 실적의 단위.** 셀러 콘솔은 `seller_id = 내 id` 인 줄만 본다
myr_cs_conversations    ← 0005 cs_conversations, brand_id → seller_id · campaign_id → product_id · order_id + order_item_id(소유 증명될 때만)
myr_cs_messages         ← 0005 cs_messages, sender('customer'|'seller'|'admin')
```

주문 상태는 줄에서 파생한다 — 모든 줄 REFUNDED 면 `REFUNDED`, 일부면 `PARTIAL_REFUNDED`(토스 `PARTIAL_CANCELED` 와 1:1). `sold_qty` 트리거는 `myr_order_items`(PAID) 에서 상품별로 재계산.

**이벗 연동으로 추가할 것(2026-11-03 · §6.8 · 아직 마이그레이션 없음)**

```
E1-a  myr_products            + ebut_goods_code text (옵션이 있으면 options[i].ebut_code 또는 별도 표 — 이벗 등록 방식 확인 뒤)
                              운영팀이 검수 때 입력 · 공개 RPC 에는 싣지 않는다
E1-b  myr_order_items         + ship_status('PAID'|'PREPARING'|'SHIPPING'|'DELIVERED') · courier · tracking_no
                                · ebut_registered_at · shipped_at · delivered_at · is_delayed
                              → 송장·배송 상태의 단위가 줄이 된다(이벗이 줄마다 송장을 준다 · 결정 8)
      myr_orders              courier · tracking_no · shipped_at 는 남겨 두고(옛 코드 호환 · §3.1 "같이 배포되지 않는 창")
                              화면은 줄 값을 읽는다. 주문 배송 라벨 = 줄 상태의 최솟값
E4    myr_refund_requests     교환/환불 요청(줄 · 수량 · 사유 · 사진 · 처리 방법 · 상태 · 회수 번호 · 타임라인) — 인플루언서 7번
      myr_ebut_runs(선택)      크론 실행 기록(발주 · 송장 수집 · 건수 · 실패) — 어드민 발주·배송 화면
```

0069 처리: 파일은 그대로 두고, E1-b 마이그레이션에서 `myr_app_admin_ship` 을 **같은 이름·인자로 다시 정의**해 주문의 남은 줄 전부에 같은 송장을 쓰게 한다(한 박스 발송 · 호출하는 쪽 변경 없음). 이벗 크론과 정정 화면용으로 **줄 단위 송장 함수**를 새로 둔다. `myr_app_admin_ship_pending` 도 기준을 줄 상태로 다시 정의한다.

RLS: 전부 `revoke all from anon, authenticated` · service role 만. 고객 공개 읽기는 `myr_product_card(code)` · `myr_home_products()` RPC(security definer · anon 실행 허용) 로만 — `products` 의 공개 grant 열 목록(0002) 과 같은 원칙으로 재고·마진·반려 사유는 내지 않는다. 주문 본인 조회는 `myr_orders_select_own`(`auth.uid() = user_id`) 요약 컬럼만(0004 와 동일).

RPC(전부 `{ok, code}` 반환 · 서버 전용):

| 영역 | 함수 | 원본 |
|---|---|---|
| 상품 | `myr_app_upsert_product(seller, …)` · `myr_app_set_product_status(seller, code, 'listed'|'paused')` · `myr_app_submit_product(seller, code)`(rejected → pending) | 0015 `app_brand_upsert_product` |
| 검수 | `myr_app_admin_products(status?)` · `myr_app_admin_review_product(id, 'approve'|'reject', reason)` · `myr_app_admin_force_status` | 0015 `app_admin_review_product` |
| 공개 | `myr_product_card(code)` · `myr_home_products(category?)` | 0003/0008 `campaign_card` |
| 결제 | `myr_app_checkout_reserved(product_id)` · `myr_app_create_checkout(items[], …)`(줄마다 listed · 재고 · 가격 서버 검증 → 세션 + 줄 insert · 한 줄이라도 미달이면 전체 거절) · `myr_app_claim_checkout` · `myr_app_confirm_checkout`(**줄의 products 행 전부 `for update` — id 순서로 잠가 교착 방지** · 전부 통과해야 주문 1건 + 줄 N건 insert · 하나라도 품절이면 ok:false → 호출부가 토스 전액 취소 · 가상계좌면 `WAITING_DEPOSIT` §6.7) · `myr_app_deposit_done(order)` · `myr_app_deposit_expire(order)` | 0008 (+ 다중 줄 · 가상계좌) |
| 환불 | `myr_app_refund_precheck(items[{item_id, qty}], actor, actor_id)` · `myr_app_refund_record(items[], actor, cancel_amount, raw, …)` — **한 벌 · 줄 × 수량 단위.** 고객의 "전체 환불" 은 모든 줄의 남은 수량을 넘기는 것. actor 별 가드: customer = 본인 주문의 줄 · 발송 전 / seller = `seller_id = actor_id` 인 줄만 · 발송 뒤 허용 / admin = 전부. 기록은 줄 `REFUNDED` + 주문 `refund_amount` 누적 + 주문 status 파생 | 0008 · 0018 · 0020 을 합치고 부분 취소로 |
| 주문 | `myr_app_orders(actor, actor_id, filter)` · `myr_app_order(actor, actor_id, code)` — seller 는 **내 줄이 있는 주문만, 응답도 내 줄 + 배송 상태(수취인 원문 없음)** · admin 은 전부 + 수취인 원문 · `myr_app_ship_order(admin, code, courier, tracking)` · `myr_app_ship_orders`(CSV) · `myr_app_exchange_ship(admin, …)` · `myr_app_po_rows(admin)` — **운송장·발주서는 admin 만**(결정 8) | 0018 `app_brand_*` · 0020 `app_admin_orders` 를 합침 |
| CS | `myr_app_cs_open(product_id, …)`(0041 소유 증명 그대로) · `myr_app_cs_thread(actor, …)`(customer = client_token · seller = 내 것 · admin = 전부) · `myr_app_cs_reply(actor, actor_id, …)`(customer 추가 문의 · seller 답변 · admin 대행 답변 `sender='seller'`) · `myr_app_cs_list(actor, actor_id, status?)` · `myr_app_cs_close(actor, …)` | 0018 · 0041 · 0020 을 합침 |
| 실적 | `myr_app_seller_sales(seller)` — gross · refunds · net · 상품별 · 예상 정산액 = net × margin · admin 은 `myr_app_admin_sales(seller?)` 로 같은 집계 | 0013 `app_seller_sales` 의 축소판 |
| 비회원 | 기존 `app_guest_customer_upsert` · `app_guest_order_*` 를 그대로 호출(주문 테이블이 달라 `myr_` 변형 필요하면 그때) | 0021 |

**S1 적용(2026-10-29 · `supabase/migrations/0056_myr_products.sql`)** — 위 설계 중 상품 표만 먼저. 실제 컬럼은 디자인 필드 그대로(~~`sub`~~(한 줄 소개 — **0059 에서 삭제** · 2026-10-30 대표 결정: 인플루언서 등록 폼에도 두지 않는다 · 카드·상세는 제형·구성(`form` · `unit`)을 보여준다) · `unit` · `price` + `options` · `tile` · `thumb_url` · `icon` · `form` · `pack` · `flavor` · `tag` · `chips` · `ingredients` · `note` · `howto` · ~~`specs`~~(제품 정보 카드 3개 — **0059 에서 삭제** · 섭취법·구성과 겹침 · 제품 정보 표는 `infoRowsOf` 로 남음) · 상세 `story_title` `story` ~~`points`~~(숫자 포인트 3칸 — **0059 에서 삭제** · 등록 폼에도 없음) `ingredient_rows` ~~`howto_title`~~(섭취법 제목 — **0059 에서 삭제**) `howto_steps` `faq`) + `stock` `sold_qty` `status` `reject_reason` `submitted_at` `reviewed_at` `reviewed_by` `seller_margin_rate` `deleted_at`. `category` 는 MYR 6개(`diet` `inner` `derma` `hair` `mental` `mens` — §9-5 는 이걸로 결정). 공개 RPC `myr_home_products()` · `myr_product_card(code)`(related ≤4 포함 · 재고·마진·검수 정보 제외 · `sold_out` 만) · 운영 RPC `myr_app_admin_review_product(id, approve|reject|pause, reason, reviewer)`. 콘솔 전까지 투입·검수는 **`packages/db/scripts/myr-products.mjs`**(`import <json> [--listed]` · `list` · `review` · `delete` · `creators` — 크리에이터는 `sellers` 에 handle 기준 upsert, 계정 미연결 행은 `partner-admin.mjs invite --link` 로 연결) · 시드 `myr-products.seed.json`(디자인 8개). 적용 절차는 셀러리와 같다 — 병합 → 링크된 PC 에서 `npx supabase db push --linked` → `node packages/db/scripts/myr-products.mjs import packages/db/scripts/myr-products.seed.json --listed`. **2026-10-29 적용 완료**: 클라우드 `sellery` 에 0056 push + 시드(크리에이터 4 · 제품 8 `listed`) 투입. 주의 — 루트 `.env.local` 의 Supabase 주소가 로컬 인스턴스(`127.0.0.1:54321`)라 스크립트는 로컬 DB 에 들어간다. 클라우드 시드는 CLI 의 DB 연결(`npx supabase db query --linked --file …`)로 같은 내용의 SQL 을 넣었고, 로컬에도 `supabase migration up --local` + 스크립트로 같은 8개를 넣었다. 시드는 디자인용 가짜 제품이라 실제 제품이 들어오면 `myr-products.mjs delete <code>` 로 지운다.

**테스트(2026-10-29 · docs/testing.md)** — 0056 의 권한·공개 RPC 필터·`sold_out`·related·검수 전이와 거부 코드 4종은 `supabase/tests/myr_products.test.sql`(pgTAP 28 · `npm run test:db`). 운영 스크립트의 검증·행 조립은 `packages/db/scripts/lib/myr-products-plan.mjs` 로 떼어 vitest(시드 8개가 전부 통과하는지 포함). 샵 쪽 순수 모듈(`lib/cart.ts` 장바구니 계산 · `lib/product-row.ts` RPC 행 매핑 · `lib/auth.ts` · `lib/data.ts`)도 `apps/myr-shop/src/test` 에 vitest. M4 부터 생기는 RPC(체크아웃·주문·환불)도 같은 방식 — 마이그레이션 PR 에 pgTAP 파일을 같이 낸다.

### 3.1 단일 함수 원칙 (결정 12) — 동작 하나 = 패키지 함수 하나 = SQL 함수 하나

| 동작 | 패키지 함수(한 곳) | SQL | 부르는 앱 · actor |
|---|---|---|---|
| 토스 승인 · 취소 · 조회 | `packages/payments/src/server/myr/toss.server.ts`(기존 `toss.server.ts` 그대로) | — | 전부(간접) |
| 체크아웃 세션 · 승인 확정 · 복구 | `payments/server/myr/checkout.server.ts` — `createCheckout` · `confirmCheckout` · `syncFromToss` | `myr_app_claim/confirm_checkout` · `myr_app_deposit_*` | shop(고객 · 웹훅 · reconcile) |
| 환불 | `payments/server/myr/refund.server.ts` — `refundItems({ actor, actorId, orderCode, items:[{itemId, qty}], reason })` 하나. precheck 가 돌려준 `Σ(unit_price × qty)` 를 토스 `cancelAmount` 로 **부분 취소**(남은 수량이 0이 되면 토스가 전액 취소로 처리). Idempotency-Key 는 **`${order.id}:${정렬한 items 해시}`**(같은 줄·수량 묶음의 재시도는 같은 키 · 다른 묶음은 다른 키) | `myr_app_refund_precheck/record` | shop `/api/payments/cancel`(customer · 전체 또는 줄) · influencer `/orders/[code] ?/refund`(seller · 내 줄) · admin `/orders/[code] ?/refund`(admin) |
| 운송장 · 교환 발송 · 발주서 | `db/server/myr/orders.server.ts` — `listOrders` · `getOrder`(`{ actor, actorId }`) · `shipOrder` · `shipOrdersCsv` · `exchangeShip` · `poRows`(admin 전용) | `myr_app_orders/ship_*` | 열람 influencer(seller) · admin / 발송 admin 만 |
| 문의 | `db/server/myr/cs.server.ts` — `openCs`(고객만) · `listCs` · `getCsThread` · `replyCs` · `closeCs`(`{ actor, actorId \| clientToken }`) | `myr_app_cs_*` | shop(customer) · influencer(seller) · admin(admin) |
| 상품 | `db/server/myr/products.server.ts` — `upsertProduct`(seller) · `setProductStatus({ actor })`(seller = listed↔paused · admin = 전부) · `reviewProduct`(admin) · `productCard` · `homeProducts`(anon) | `myr_app_*product*` | influencer · admin · shop |
| 메일 훅 | `db/server/myr/mail-events.server.ts` — `notifyOrderPaid/Shipped/Refunded/ExchangeShipped/DepositPending` · `notifyCsOpened/Replied` | — | 위 함수들이 내부에서 호출 — 앱이 직접 부르지 않는다 |
| 게이트 | 기존 `requireSeller()` · `requireAdmin()` · `safeGetSession` → actor 결정은 **라우트가** 한다(`seller.id` · `user.id` · 비회원 토큰) | — | 각 앱 |

규칙 — 함수 하나에 권한이 모이므로 아래 넷이 보안의 전부다:

1. **actor · actorId 는 서버 세션에서만 결정한다. 요청 본문·쿼리·쿠키 값에서 받지 않는다.** customer = `safeGetSession().user.id`(또는 서버가 심은 HttpOnly 비회원 토큰의 검증 결과) · seller = `requireSeller().seller.id` · admin = `requireAdmin()` 통과한 `user.id`. 라우트가 `actor` 를 문자열로 조립하는 자리는 이 세 헬퍼 뒤 한 줄뿐이고, 폼에 `actor` 필드가 있으면 무시한다.
2. **SQL 함수가 마지막 방어선이다.** 패키지 함수는 service role 로 부르므로 RLS 를 통과한다 — 권한 검사는 `myr_app_*` 본문에서 `p_actor` · `p_actor_id` 로 한다(seller 면 `seller_id = p_actor_id` · customer 면 `user_id = p_actor_id` 또는 토큰 검증 · admin 은 `profiles.role='admin'` 재확인). 함수는 `security definer set search_path = public`, **`revoke all … from public, anon, authenticated` · `grant execute … to service_role`** — 브라우저의 anon 키로는 직접 못 부른다(셀러리 0007 · 0052 와 같은 조치). anon 에 여는 건 `myr_product_card` · `myr_home_products` 같은 읽기 전용 공개 함수뿐. 권한 미달은 `{ok:false, code:'FORBIDDEN'}`(존재 여부를 흘리지 않게 NOT_FOUND 와 같은 응답으로 묶는 곳은 함수 주석에 적는다).
3. **actor 로 가르는 건 "허용 조건·한도" 까지만.** 고객은 발송 전 전액만 · 셀러는 발송 뒤도 · 관리자는 언제든 같은 차이는 함수 머리의 **허용 조건 표** 한 곳에서 관리한다(아래). 흐름 자체가 달라지면(예: 부분 환불 · 가상계좌 입금 전 취소 · 교환 재발송) 함수 하나에 if 를 쌓지 말고 **별도 동작**으로 쪼갠다(`myr_app_refund_record` 와 `myr_app_deposit_expire` 가 따로인 이유).

   | 동작 | customer | seller | admin |
   |---|---|---|---|
   | 환불(줄 단위 부분 취소) | 본인 주문의 줄(전체 = 모든 줄) · PAID · 발송 전(**이벗 연동 뒤 = 발주 전**) | `seller_id = 내 id` 인 줄만 · PAID · 발송 뒤 허용(`after_ship` 기록) — **이벗 연동 뒤에는 승인 흐름(결정 7)에서만 호출** | 전부 |
   | 교환·환불 요청 처리(E4 · 인플루언서 7번) | 요청 생성(배송준비중 이후) | 내 줄 요청 승인(처리 방법) · 반려 | 전부 · 회수 접수/취소/완료 · 재발송 |
   | 운송장 · 교환 발송 · 발주 | — | — (열람만 · 수취인 원문 없음) | 전부(수동 입력 · 재발주) · 자동은 서버 크론(이벗) |
   | 문의 열람·답글 | 본인(토큰·user) · 추가 문의 | 내 상품 문의 · 답변·종료 | 전부 · 대행 답변(`sender='seller'` `actor_role='admin'`) |
   | 상품 상태 | — | 내 상품 · listed ↔ paused · rejected → pending | 전부 · pending → listed/rejected · 강제 전환 |

4. **HTTP 엔드포인트는 `myr-shop` 한 곳.** 외부가 부르는 것(토스 웹훅 · `DEPOSIT_CALLBACK` · 크론 reconcile/tracking) 만 라우트로 열고, influencer/admin 은 같은 패키지 함수를 서버 load/action 에서 직접 호출한다. 앱 사이 HTTP 호출은 하지 않는다(다른 도메인이라 CORS·세션 전달이 생기고, 같은 DB 를 service role 로 쓰므로 이득이 없다).

같이 배포되지 않는 창: 앱 넷이 같은 패키지 함수를 쓰면 `main` 병합 한 번에 Vercel 프로젝트 넷이 **따로** 빌드·배포되고, 몇 분 동안 shop 은 새 코드 · admin 은 옛 코드인 순간이 생긴다. HTTP 로 묶지 않았으니 코드끼리는 문제없지만 **DB 는 그 창 동안 양쪽 코드와 호환돼야 한다** — 컬럼 삭제·이름 변경·함수 시그니처 변경은 두 단계로(① 새 컬럼/새 함수 추가 + 양쪽 읽기 → 전 앱 배포 확인 → ② 옛 것 제거), `{ok, code}` 반환에 새 code 를 더할 때도 옛 파서가 `default` 로 받게 둔다. `supabase db push` 는 ① 과 ② 를 다른 PR 로.

---

## 4. 화면

### 4.1 `apps/myr-shop` (고객)

| 경로 | 내용 | 원본(복사) |
|---|---|---|
| `/` | 전체 상품 모아보기(listed · 카테고리 탭 · 셀러 필터) | `apps/shop/+page.server.ts` 에서 캠페인·링크보호·팔로우 제거 |
| `/p/[code]` | 상품 페이지(셀러 프로필 · 옵션 · 구매 · 문의 · OG) | `/s/[handle]/[code]` |
| `/checkout` `/checkout/{success,fail}` · `/api/checkout` `/api/payments/{confirm,webhook,cancel}` `/api/cron/reconcile` `/api/cron/tracking` `/api/health` | 그대로 | `apps/shop` |
| `/login` `/auth/*` `/api/me` | 카카오 로그인 · 비회원 | 그대로 |
| `/account/orders` `/account/orders/[code]` `/orders/lookup` `/orders/g/[code]` | 주문 · 상세(환불 신청 · 문의) | `OrderDetail.svelte` — 환불 정책 문구 MYR 로 |
| `/cs/new?product=<code>&order=` `/cs/[code]` | 문의 접수·스레드 | `?campaign=` → `?product=` |
| `/terms` `/privacy` `/robots.txt` | 문서 | 새로 |

빼는 것: `/s/*`(캠페인 링크) · `/c/*` · `/influencers` · `/about` · `/alerts/*` · 링크 유입 쿠키 훅 · 팔로우 · 오픈 알림 · 등급 표시.

### 4.2 `apps/myr-influencer` (인플루언서)

| 탭 | 경로 | 내용 | 원본 |
|---|---|---|---|
| 가입·로그인 | `/signup` `/verify-sent` `/login` `/password/*` `/auth/confirm` | 이메일+비밀번호 · token_hash · `sellers` 행 생성(`createSellerFromSignup`) | `apps/influencer` 그대로 |
| 홈 | `/home` | 검수 상태 · 미발송 · 미답변 문의 · 오늘 매출 카드 | `partner/home.server.ts` 축소 |
| 상품 | `/products` `/products/new` `/products/[code]` | 목록(상태 칩) · 등록 · 수정 · 판매중/일시중지 · 반려 사유 · 재제출. **재고 입력 없음 · 이벗 상품코드 없음**(결정 13) | `apps/brand/(console)/products/*` |
| 주문 | `/orders` `/orders/[code]` | 내 줄이 있는 주문 목록(줄 · 수량 · 금액 · **줄별 배송 상태 · 송장** 읽기) · 문의 연결. **운송장 입력 · 환불 버튼 없음**(결정 7 · 8) | `apps/brand/(console)/orders` 에서 발송·환불 제거 |
| 문의 | `/cs` `/cs/[code]` | 상품·배송 문의함(OPEN → ANSWERED → CLOSED) · 답변 · 종료 | `apps/brand/(console)/cs/*` |
| 교환·환불 | `/returns` `/returns/[id]`(UI 시안의 "교환 · 환불 관리" — 지금 경로 `/cs`) | 요청 목록(대기 · 진행 중 · 완료/반려) · 승인(처리 방법 선택 + 고객 메시지) · 반려 · 타임라인 · 사진 | 새로(시안 "MYR Influencer Admin") |
| 실적 | `/sales` | 기간별 매출·환불·순매출 · 상품별 · 예상 정산액 | `apps/influencer/(console)/sales` 축소 |
| 내 정보 | `/my` | 프로필(핸들 · 아바타 · 소개) · 정산 계좌 · 알림 이메일 | `apps/influencer/(console)/my` |

게이트: `requireSeller()` 그대로(`sellers.user_id and active`). 도메인이 분리되므로 `foreign` 상태는 "파트너 아닌 세션" 하나로 줄어든다.

PII: 발송을 물류센터가 하므로(결정 8) 인플루언서 응답에는 **수취인 실명·연락처·주소 원문을 넣지 않는다**(셀러리 0004 "인플루언서 응답에서 제거" 규칙 유지 · 구매자 표시명은 `김*은` 마스킹). CS 에서 주소가 필요하면 문의 스레드 안에서 고객이 적거나 운영팀이 대행한다. 수취인 원문은 admin 응답에만, 열람 로그는 `sensitive_access_log`(0013) 재사용.

#### 4.2.1 작업 순서 (2026-11-03 · UI 단계 이후)

지금 상태: Claude Design "MYR Influencer Admin" 시안을 목 데이터로 옮긴 화면만 있다(`ssr=false` · `lib/state.svelte.ts` · 인증·DB 없음). 이벗 연동(E1~E4 · §6.8)을 기다리지 않고 0~5 를 먼저 하고, E1-b 는 6번 바로 앞에 샵 수정과 함께 한다.

- **0. Vercel 배포(미리)**
    - ① CLI 로 프로젝트 생성: `vercel project add myr-influencer --scope weglow-team` → `vercel link --project myr-influencer` → `vercel project update myr-influencer --root-directory apps/myr-influencer --framework sveltekit-1 --node-version 22.x --yes`
    - ② 대시보드 Settings → Git 에서 `weglow-dev/sellery` 연결 · Production Branch main · "Include source files outside of the Root Directory" ON
    - ③ 검색 제외 — **2026-11-04 적용**: `app.html` 의 `<meta name="robots" content="noindex, nofollow">`(ssr=false 라 `<svelte:head>` 로는 크롤러가 못 읽는다) · `vercel.json` 의 `X-Robots-Tag` 헤더 · `static/robots.txt` 는 수집 허용(Disallow 하면 noindex 를 못 읽는다)
    - ④ 첫 배포 확인 `https://myr-influencer.vercel.app` ⑤ `docs/deploy.md` MYR 표에 열 추가
    - 주의 — main 에 앱이 없는 상태에서 Git 을 연결하면 푸시한 브랜치가 Production 으로 한 번 배포됨(myr-shop 때 그랬음 · main 병합 뒤 덮임). 고유 URL(`-weglow-team.vercel.app`)은 SSO 보호로 302 라 확인은 프로젝트 별칭으로
- **1. 공용 코드 추출 — 완료(2026-11-04)**
    - **`packages/myr-core`(`@sellery/myr-core`)** — 이름이 `packages/myr` 가 아닌 것은 랜딩 앱 `apps/myr` 가 이미 `@sellery/myr` 라서. 구성·쓰는 법은 `packages/myr-core/README.md`
    - 옮긴 것: 순수 `constants`(MAX_QTY · won) · `site`(siteOrigin) · `text` · `company` · `checkout-rules` · `order-view` · `refund-rules` · `cs-rules` · `ship-rules` · `mail/{resend,layout,templates}` / 서버 `config`(configureMyrCore) · `admin` · `toss` · `payment-events`(checkout-sync 에서 결제 로그만 분리) · `refund` · `refund-photos` · `cs` · `ship` · `mail` · `mail-events`
    - 샵에 남은 것: 결제 세션·웹훅·크론(`checkout-sync`) · 장바구니 · 상품 공개 RPC(`db`) · 주문 조회(`orders` · `customers`) · 레이트리밋 · 크론 인증
    - 샵: `$lib/server/env.ts` 가 `$env` → `configureMyrCore` 1회 주입 · `$lib/server/{admin,toss,refund,…}.ts` 는 `import './env'; export * from '@sellery/myr-core/server/…'` 재수출이라 라우트 import 경로는 그대로 · 순수 모듈은 `@sellery/myr-core/<모듈>` 직접
    - 동작 변경 없음(코드 이동 · 환경값을 읽는 위치만 바뀜) — vitest 1,147 통과(옮긴 테스트 8파일 95개는 패키지로) · 로컬 `/api/health` 200(서비스 키 주입 확인) · 발송 API 가 패키지 → RPC 까지 동작
    - 이벗 클라이언트(주문 등록 · 송장 조회 · 회수)도 E2~E4 때 여기(`server/ebut`)에 둔다
- **2. 인증 골격 — 완료(2026-11-04)**
    - 게이트: `hooks.server.ts`(Supabase SSR 세션 · 공개 경로 밖은 세션 없으면 `/login?next=`) + `@sellery/myr-core/server/seller`(`sellerContext` — **`sellers.user_id = 계정 and active` 가 진실** · 상태 anon / unlinked / suspended / ok · 셀러리의 guest·foreign·🥬 는 없음) + 앱 `$lib/server/seller.ts requireSeller`(요청당 1회 조회 · 서비스 키 없으면 503). 판정 규칙은 순수 `lib/console-auth.ts`(vitest)
    - 화면 묶음: 기존 화면을 `(console)` 그룹으로(주소 그대로) — `(console)/+layout.server.ts` 가 `me`(활동명 · 핸들 · 사진 · 이니셜 · 색 — 색·이니셜은 샵과 같은 `@sellery/myr-core/creator`)를 넘기고 목 `ME` 를 대체(홈 · 상품 등록 노트/미리보기 · CS 타임라인 "방금 · 이름"). 콘솔 화면은 목 상태 때문에 **아직 `ssr=false`**(3번에서 끈다) — 게이트는 서버에서 돌고, 정지·연결 없음은 데이터 요청이 안내 화면으로 보낸다(빈 셸에 데이터 없음)
    - 그룹 밖(서버 렌더 · JS 없이 동작): `/login`(서버 form action `signInWithPassword` · 자격 오류는 한 문구 · `next` 는 같은 오리진만) · `/password`(재설정 메일 · 계정 유무 비공개) · `/password/new`(바꾸면 로그아웃 → 새 비밀번호로 로그인) · `/auth/confirm`(token_hash — 재설정·초대 → `/password/new`) · `/auth/signout`(POST 만) · `/unlinked` · `/suspended`. 로그아웃 버튼: PC 상단 내비 · 모바일 홈
    - 계정: 가입(10번) 전까지 **`packages/db/scripts/myr-creators.mjs`**(`account` · `invite --console` · `list` · `unlink` · `suspend` · `reactivate` — 셀러리 `partner-admin.mjs` 는 셀러리 콘솔로 메일을 보내서 쓰지 않는다). 시드 크리에이터 4명(민지 루틴 · 하루 웰 · 준 피트 · 소이 클린)에 로컬 계정 연결 완료 — docs/deploy.md 크리에이터 콘솔 절
    - 공용 패키지로 옮김: 샵 `lib/auth.ts`(displayName · avatarOf · safeNext) → `@sellery/myr-core/auth` · 샵 `creatorStyle` · `handleSlug` → `@sellery/myr-core/creator`
    - Vercel `myr-influencer`: `PUBLIC_SUPABASE_URL` · `PUBLIC_SUPABASE_ANON_KEY` 넣음(production + preview) · **남은 것(대표)**: `SUPABASE_SERVICE_ROLE_KEY`(Secret 이라 복사 불가) · Supabase Redirect URLs `localhost:5179` · `myr-influencer.vercel.app`(Owner) · 클라우드 크리에이터 계정(`myr-creators.mjs` 를 운영 키로)
    - 확인: 로컬 HTTP 시나리오(비로그인 → 로그인 이동 · 틀린/맞는 비밀번호 · 외부 `next` 무시 · 정지 → `/suspended` · 연결 끊기 → `/unlinked` · 로그아웃 · 만료 링크 · 새 비밀번호 화면 세션 필요) · 프로덕션 빌드에서 다른 출처 로그인·로그아웃 폼 403(dev 서버는 출처 검사를 안 한다)
- **3. 내 제품 읽기**
    - 새 마이그레이션 `myr_app_seller_products(seller)` + `draft` 상태 추가
    - `/products` 서버 load → 목 products 를 서버 값으로 · 상태 매핑 순수 함수(임시저장 · 심사 중 · 판매 중 · 일시중지 · 반려)
    - 재고는 **읽기 전용**(창고 기준 · 이벗 재고 연동 전에는 운영팀 입력값)
- **4. 상품 등록 쓰기**
    - `myr_app_seller_save_product(seller, code?, payload, submit)` — 임시저장 = draft · 제출 = pending · rejected → pending 재제출 · `myr_app_seller_set_status`(listed ↔ paused)
    - ProductDraft → `myr_products` 매핑 순수 모듈(+vitest: info 표 5줄 ↔ form/pack/unit · ingredient_rows → ingredients)
    - 이미지 업로드 `POST /api/products/photos` — Storage 버킷 · `image_urls` 컬럼 · 샵 환불 사진 API 와 같은 틀
    - **재고 칸 제거 · 이벗 상품코드 칸 없음** · 카테고리 자유 추가 제거(DB 6개 고정) · 제출 완료 화면 연결
    - 검수는 어드민 상품 검수 전까지 `myr-products.mjs review` · pgTAP(거부 코드 전부) · 가격·옵션 수정 시 재검수 여부 결정 필요(§9-3)
- **5. 문의 답변(스레드형)**
    - `/cs` = `myr_app_cs_list(actor='seller')` · `/cs/[code]` = `myr_app_cs_thread` + `myr_app_cs_reply` + `myr_app_cs_close` + `notifyCsReplied` 메일
    - 대상은 상품 문의 · 배송 문의. 교환·환불은 7번 화면 · 마이그레이션 없음
- **E1-b. 줄 단위 배송 상태(6번 직전 · 샵 수정 포함 · §3 · §6.8)**
    - 줄마다 배송 상태 · 택배사 · 송장 · 이벗 등록 시각 · 0069 함수 재정의 + 줄 단위 송장 함수
    - 샵 주문 상세·환불 화면 수정 · 고객 셀프 환불 기준 "송장 전" → "발주(배송준비중) 전"
    - 이벗 연동(E2·E3) 전에도 동작 — 그때까지 상태 전환·송장 입력은 운영 스크립트 / 어드민 주문 화면
- **6. 주문 열람(읽기 전용)**
    - 새 RPC `myr_app_seller_orders(seller)` — 내 줄만 · 수취인 원문 없음 · `김*은` 마스킹 · 줄마다 배송 상태 · 송장
    - `/orders` 화면(시안 없음) · **셀러 환불 버튼 없음**(7번 승인 흐름으로)
- **7. 교환·환불 승인형 CS(필수 · E4 의 DB 부분)**
    - 새 마이그레이션 `myr_refund_requests` — 교환/환불 · 줄·수량 · 사유 · 사진 · 처리 방법 · 상태(대기 · 진행 중 · 완료 · 반려) · 타임라인
    - 샵 환불 신청 페이지 수정 — 발주 전은 지금처럼 즉시 취소, 배송준비중 이후는 "요청" 생성
    - 콘솔 처리 — 승인(처리 방법 선택) 또는 반려 + 고객 메시지 · 반려 메일
    - 승인 뒤: 발주 전 = 즉시 `refundItems` · 발주 후 환불 = 회수 접수 → 회수 확인 → `refundItems` · 교환 = 회수(필요 시) → 재발송
    - 회수·재발송 실행은 어드민 몫 — 이벗 회수 API(E4) 전에는 운영자가 "회수 완료 · 재발송 송장" 을 수동 처리
    - 환불 사진 서명 URL · 단순 변심 왕복 배송비(UI 의 ₩6,000)는 정책 결정 필요
- **8. 홈 지표 · 실적** — `myr_app_seller_sales(seller)`(이번 달 매출·주문·수량 · CS 비율 · 7일 막대) → `MOCK_STATS` `mockMonthRevenue` 치환 · 정산율은 `platform_settings`(§9-6 전까지 UI 의 10% 는 자리값) · `/sales`(시안 없음)
- **9. 프로필** — 사진 업로드(Storage) → `sellers.avatar_url` · `/my` 알림 이메일 · 정산 계좌(시안 없음)
- **10. 가입** — `/signup` `/verify-sent` · `create_seller_from_signup`(0010) 재사용 또는 MYR 축소판 · Supabase 이메일 템플릿이 셀러리와 공유되는 제약(§2.1)
- **11. 마무리** — `check-boundaries` 규칙(셀러리 모듈 import 금지) · 이 문서 §7 · `docs/deploy.md` MYR 표 · pgTAP/vitest 결과를 PR 본문에

### 4.3 `apps/myr-admin` (운영)

2026-11-03 개정 — 이벗 연동을 반영해 화면을 다시 나눴다. 우선순위는 짝이 되는 작업과 함께 간다: **우선 1** ↔ 인플루언서 4번(상품 등록) · **우선 2** ↔ E1-b · 인플루언서 6번 · **우선 3** ↔ 이벗 확정 뒤 E2~E4 · 인플루언서 7번 · **우선 4** ↔ 이벗 재고 API · 박스 발송인 결정 뒤.

- **우선 1 · 로그인** `/login`
    - 관리자 계정 로그인(셀러리와 같은 `profiles.role='admin'` · `requireAdmin()` 복사) · 관리자가 아니면 거부
    - noindex(`app.html` 메타 + `X-Robots-Tag` 헤더 · robots.txt 는 수집 허용 — 인플루언서 콘솔과 같은 방식) · 운영자 외 세션은 404 가 아니라 `/login` 으로
- **우선 1 · 홈** `/`
    - 검수 대기 수 · 발송 대기 수(이벗 연동 뒤 = 오늘 발주 결과 성공·실패) · 배송 지연 수 · 처리 안 된 교환·환불 수 · 재고 부족 수(이벗 재고 연동 뒤)
    - 숫자를 누르면 해당 화면으로
- **우선 1 · 상품 검수** `/products` · `/products/[code]`
    - 상태별 목록(심사 중 · 판매 중 · 일시중지 · 반려) · 인플루언서 필터
    - 샵과 같은 모양의 상세 미리보기
    - 승인 · 반려(사유 필수) · 판매중지 · 재개(`myr_app_admin_review_product` 0056)
    - **이벗 상품코드 입력·수정**(옵션이 있으면 옵션별 · E1-a) — 이벗 확정 전에는 선택, 확정 뒤 승인 필수
    - 재고 입력(이벗 재고 연동 전까지 운영팀 값)
    - 이 화면이 생기면 `myr-products.mjs review` 삭제
- **우선 2 · 주문** `/orders` · `/orders/[code]`
    - 전체 주문 · 상태·기간·인플루언서 필터 · 수취인 정보 전체(열람 기록 `sensitive_access_log`)
    - 줄별 배송 상태 · 송장 · 이벗 등록 이력
    - **송장 수동 입력·정정**(주문 단위 = 0069 재정의 · 줄 단위 = 새 함수) · 송장 CSV 일괄
    - **예외 환불**(`refundItems` actor='admin' · 0061 이 관리자에게 모든 줄을 허용) — 평소 환불은 인플루언서 승인 흐름 · 교환·반품 화면에서 끝나고, 이건 그 흐름이 막혔을 때만: 인플루언서 미응답 · 정지·탈퇴 · 토스 콘솔에서 금액만 취소된 건 정리(§6.3 운영 큐) · 오배송·분실 같은 물류 사고. 기본 버튼으로 두지 않고 **사유 필수** · 관리자 처리 기록 · 해당 인플루언서에게 알림 메일 · 그 줄에 진행 중인 교환·환불 요청이 있으면 경고하고 같이 닫는다(이중 환불은 DB 가 막지만 요청 상태가 어긋날 수 있다)
    - 이 화면이 생기면 `/api/ops/ship` · `myr-ops.mjs`(+ `lib/myr-ops-plan.mjs` · 테스트) · `.env.example` 의 `MYR_SHOP_URL` 삭제 — `ship.ts` 는 콘솔로 복사(정식)
- **우선 2 · 문의** `/cs` · `/cs/[code]`
    - 전체 문의 열람 · 상태 필터 · 대행 답변(`sender='seller'` `actor_role='admin'`) · 종료
- **우선 3 · 발주·배송** `/shipping`(E2 · E3 와 함께)
    - 오늘 11시 발주 대상 미리보기 · 이벗 등록 실패 목록과 [다시 보내기] · 배송준비중에서 멈춘 지연 목록 · 크론 실행 기록(발주 · 송장 수집)
- **우선 3 · 교환·반품** `/returns`(인플루언서 7번 · E4 와 함께)
    - 인플루언서가 승인한 요청 중 회수가 필요한 건
    - 회수 접수 · 취소 · 상태 확인(이벗 `exprtakeback` 등) — E4 전에는 "회수 완료" 수동 처리
    - 회수 확인 뒤 환불 실행 · 교환 재발송 등록(E4 전에는 재발송 송장 수동 입력)
- **우선 4 · 재고** `/stock` — 이벗 재고와 판매 가능 수량 비교 · 재고 부족 기준 · 알림(바인허브 `EbutStockService` · `SendWarehouseLowStockNotification` 참고)
- **우선 4 · 인플루언서** `/sellers` — 목록 · 상품 수 · 계정 연결 여부 · 정지·복구 · 초대(운영팀이 만든 셀러 행에 계정 연결) · 박스에 인플루언서 이름을 찍기로 하면 인플루언서별 이벗 쇼핑몰 코드·보내는 사람(바인허브는 한의원별 `ebut_shop_code`)
- **우선 4 · 설정** `/settings` — 이벗 공통 설정(쇼핑몰 코드 · 보내는 사람) · 발주 마감 시각 · 배송비 · 무료배송 기준 · 공휴일(선택 · 바인허브에도 없음)
- **나중 · 정산** `/settle` — 정산 정책(마진율 · 지급 주기)이 정해진 뒤 · 0020 패턴

---

## 5. 랜딩(`apps/myr`) 과의 연결

- 지금 랜딩은 접수를 Slack 웹훅으로만 보낸다(`docs/branding-plan.md` §1 · §6-3). 1차에서는 **그대로 둔다** — 미팅 뒤 인플루언서가 `myr-influencer` 에 직접 가입해 상품을 올린다.
- 2차(§9-7): 접수를 `myr_applications` 테이블에 남기고, 운영팀이 승인하면 `sellers` 행을 미리 만들어 **초대 링크로 가입 → 계정 연결**(`auth/callback` 의 `linkSellerIdOf` · `app_metadata.link_seller_id` 경로가 이미 있다). 그러면 "접수 → 미팅 → 가입 → 상품" 이 한 줄로 추적된다.
- 랜딩의 CTA "내 제품 만들기" 는 그대로 제조의뢰 퍼널이고, 가입한 인플루언서용 "콘솔 로그인" 링크를 푸터에 하나 둔다(`PUBLIC_MYR_INFLUENCER_URL`).

---

## 6. 규칙

### 6.1 상품 상태
`pending`(등록·재제출) → 검수 → `listed`(샵 노출) ↔ `paused`(인플루언서 토글 · 노출 중단 · 진행 중 주문 영향 없음) / `rejected`(사유 · 수정 후 `pending`). 삭제는 `deleted_at` 소프트(주문이 참조). 가격·옵션 변경 시 재검수 여부는 §9-3.

### 6.2 장바구니 · 체크아웃 가드
- **장바구니·찜은 계정에 보관한다(2026-10-30 대표 결정 · 0057 — 처음 적었던 "브라우저에만" 은 셀러리의 비회원 중심 흐름을 그대로 가져온 것이라 폐기).** 로그인이 전면에 있는 커머스의 보통 흐름대로 로그인한 고객은 어느 기기에서나 같은 장바구니를 보고, 비회원은 브라우저(localStorage · 상품 스냅샷)에 두었다가 **로그인하는 순간 계정에 합친다**(`myr_cart_merge` · 같은 상품은 수량 합산 · 상한 9 · `myr_likes_merge`) 뒤 브라우저 쪽은 비운다.
  - 표 `myr_cart_items`(user · product · option_index · qty 1~9 · 유니크) · `myr_likes`(user · product). **가격은 저장하지 않고** 읽을 때(`myr_cart_get`) 상품 표에서 다시 가져온다 — 가격 변경·품절·판매중지·삭제·셀러 비활성이 바로 반영되고, 살 수 없게 된 줄은 `available:false` 로 남겨 고객이 보고 지운다(합계에서는 뺀다). 찜 목록은 살 수 없는 상품을 서버가 뺀다.
  - RPC `myr_cart_get/set/merge/clear` · `myr_like_set` · `myr_likes_merge/get` — 전부 service role 만(§3.1 규칙 2) · `p_user_id` 는 서버 세션(`safeGetSession`)에서(규칙 1). 샵 라우트 `GET/PUT/DELETE /api/cart` · `POST /api/cart/merge` · `GET/PUT/POST /api/likes`(세션 없으면 401 · 서비스 키 없으면 503 → 클라이언트는 브라우저 보관으로 계속). 화면은 낙관 갱신 뒤 서버 응답의 전체 줄로 덮어쓴다(`lib/state.svelte.ts` · 계산은 `lib/cart.ts`). 테스트 `supabase/tests/myr_cart_likes.test.sql`(52) · `src/test/cart-api.test.ts`.
  - 체크아웃 때 서버가 줄마다 상품을 다시 읽어 검증하므로 장바구니 안의 가격은 표시용이다. 주문 완료 뒤 주문된 상품만 장바구니에서 뺀다(`removeCartCodes` · 줄마다 `myr_cart_set` qty 0).
  - **선택 주문(2026-11-02 대표 요청)**: 줄마다 체크박스 · 전체 선택 · 선택 삭제. 합계·배송비·체크아웃은 **체크한 줄만**(`state.orderLines` · `lib/cart.ts selectedLines`). 선택 상태는 "해제한 code 목록" 으로 **브라우저에만** 저장(기본 전부 선택 · 새로 담은 줄은 선택 · 서버 장바구니에는 선택 개념 없음 — 기기별). 살 수 없는 줄은 체크 불가.
- **체크아웃 적용(2026-10-30 · 0058)**: 줄 1~20 · qty 1~9(`MAX_QTY` 와 같은 값 — §6.2 의 "1..10" 은 9 로 통일) · 옵션 없는 상품은 `price`, 있으면 `options[i].price` · 배송비는 `myr_shipping_fee()`(platform_settings) 가 단일 소스이고 샵 `FREE_SHIPPING/SHIPPING_FEE` 는 표시용 거울(pgTAP·vitest 가 둘 다 50,000/3,000 을 고정 — 바꾸면 둘 다) · 거절 응답은 `{ ok:false, code:'LINES_REJECTED', items:[{ code, reason: SOLD_OUT|NOT_AVAILABLE|NOT_FOUND|BAD_OPTION, left? }] }`.
- `/api/checkout` 입력 `{ items:[{code, optionIndex, qty}], recipient, … }` · 줄 1~20개 · 같은 (상품, 옵션) 은 합친다. 줄마다 `listed` · `stock − sold_qty − 예약 ≥ qty` · 단가 = `options[optionIndex].price`(서버 값) · qty 1..10. **한 줄이라도 미달이면 세션을 만들지 않고 어느 줄이 왜 안 되는지 돌려준다**(`{ok:false, code:'SOLD_OUT', items:[{code, left}]}`) — 장바구니 화면이 그 줄만 표시.
- 금액: `items_amount = Σ(단가 × qty)` · `shipping_fee` = 서버 규칙(§9-11 · 기본 "장바구니 합계 ≥ 무료배송 기준이면 0") · `amount = items_amount + shipping_fee` 가 토스에 보내는 값이고 confirm 이 대조하는 값. 금액 ≥ 100.
- `myr_app_confirm_checkout` 은 줄의 상품 행을 **id 순서로 전부 잠근 뒤** 재고를 다시 보고, 전부 통과해야 주문 1건 + 줄 N건을 만든다. 하나라도 모자라면 `ok:false` → 호출부가 토스 **전액** 취소(셀러리 "DONE 뒤 주문 실패 = 자동 취소" 규칙 그대로 · 부분 성공 없음).
- 그 외(멱등 선점 · 불명 재조회 · 비회원 쿠키 · 레이트리밋 · 30분 만료 · 본인 PENDING 세션 supersede) 는 0008 과 `apps/shop` 라우트 주석 그대로 — 결제 단위(`myr_checkouts`) 에 붙는다.

### 6.3 환불 — 줄 단위 부분 취소
- 여러 품목을 한 번에 주문하므로 **부분 환불이 기본**이다. 단위는 **주문 줄 × 수량** — 입력은 `[{ item_id, qty }]`(줄 전체 = 그 줄의 남은 수량 · 주문 전체 = 모든 줄). 토스에는 `cancelAmount = Σ(unit_price × qty)` 로 **부분 취소**를 보낸다(같은 결제에 부분 취소 여러 번 가능). 마지막 남은 수량까지 취소되면 토스가 전액 취소(`CANCELED`) 로 처리한다.
- 수량 일부 환불은 `refunded_qty` 를 올리고 줄은 `PARTIAL_REFUNDED`, 남은 수량이 0이면 `REFUNDED`. `sold_qty` · 실적 · 정산은 `qty − refunded_qty` 기준.
- **`PARTIAL_CANCELED` 는 MYR 에서 정상 상태**다. 셀러리는 "콘솔에서 누가 건드린 이상 상태" 로 보고 운영 큐에 넣었지만(0008 §7.3), MYR 의 reconcile · 웹훅은 토스 `cancels[]` 합계를 `myr_orders.refund_amount` 와 대조해 **줄 기록이 빠진 만큼만** 운영 큐에 올린다(토스 콘솔에서 금액만 취소한 경우 — 어느 줄인지 모르므로 사람이 지정).
- 고객 셀프: 본인 주문 · 발송 전 · 줄 선택(기본 전체) → 부분/전액 취소 → `myr_app_refund_record(item_ids, actor='customer')` → 환불 메일. 발송 뒤는 "고객센터(문의)" 로.
- 인플루언서: `seller_id = 내 id` 인 줄만 · **발송 뒤도 허용**(회수 확인은 인플루언서 판단 · `after_ship` 기록). 남의 줄은 `FORBIDDEN`.
- 운영 대행: `actor='admin'` · 아무 줄.
- 기록: 줄 `refunded_qty` · `refund_amount` · `refund_actor` · status 파생 · 주문 `refund_amount` 누적 · 주문 status 파생(`PARTIAL_REFUNDED` / `REFUNDED`) · `sold_qty` 재계산 · 실적·정산은 환불 수량을 뺀다.
- **적용(2026-11-02 · 0061)**: `myr_app_refund_precheck(order, items[{item_id, qty}], actor, actor_id)`(가드 + 금액 · 빈 items = 남은 전부 · **이번 환불로 전부 환불되면 배송비 포함** · 입금 대기면 `deposit:true`) · `myr_app_refund_record(...)`(줄·주문 누적 · 상태 파생 · WAITING_DEPOSIT 은 CANCELED). 샵 `lib/server/refund.ts refundItems`(precheck → `tossCancel(cancelAmount · Idempotency-Key = 주문 id + 정렬한 줄 묶음)` → record · 불명이면 CANCEL_UNCERTAIN 운영 큐) · `POST /api/payments/cancel`(회원 user.id · 비회원 토큰 → customer_id) · 환불 신청 페이지 `/orders/[code]/refund` `RefundPage.svelte`(줄별 수량 · 제품별 상세 note(0067 줄 refund_reason "사유 — 상세") · 사진(0068 버킷 `myr-refunds` · 줄 `refund_photos`) · 사유 · 인라인 확인 — S6-5 · S6-6). 웹훅은 토스 `cancels[]` 합이 `refund_amount` 와 같으면 noop, 더 크면 `needs_manual_adjust`. 셀러·관리자 actor 는 함수에 있고 화면은 각 콘솔에서. 고객 셀프 환불 뒤 메일은 S6-3.
- 배송비: 줄 환불 때 배송비는 **돌려주지 않는다**(기본) · 모든 줄이 환불되면 배송비까지 전액. 남은 줄 합계가 무료배송 기준 아래로 떨어져도 배송비를 사후 청구하지 않는다(§9-11 에 대안).
- 가상계좌 `WAITING_DEPOSIT` 은 토스 호출 없이 상태만 취소(§6.7).

- **이벗 연동 뒤(2026-11-03 · §6.8)**: 고객 셀프 환불 기준이 "발송 전" → "**발주 전**"(줄 상태 PAID · 평일 11시 전) 으로 당겨진다. 배송준비중 이후는 환불 신청 페이지가 즉시 취소 대신 **요청**(`myr_refund_requests`)을 만들고, 인플루언서 승인 → (회수) → `refundItems` 로 간다. `refundItems` · precheck · record 자체는 그대로 — 부르는 시점과 주체만 바뀐다.

### 6.4 교환(1차 최소안)
문의 유형 '교환·반품' 스레드에서 인플루언서가 판단하고, **재발송은 물류센터(admin)** 가 주문 단위로 `exchange_courier` · `exchange_tracking_no` 입력 → 고객 주문 상세에 "교환 발송" 줄 + 메일. 주문 · 줄 `status` 는 바꾸지 않는다(PAID 유지). 상태 기계(`EXCHANGE_REQUESTED → EXCHANGED`) 는 운영해 보고 필요하면 2차.

- **2026-11-03 개정 — 승인형으로**: 이벗으로 발주되면 교환은 "회수(필요 시) → 이벗에 교환 주문 재등록(바인허브 `ordGbn=2`) → 새 송장" 이라 스레드만으로는 처리할 수 없다. 교환·환불 요청을 `myr_refund_requests` 로 따로 두고(인플루언서 7번), 상태는 대기 → 진행 중 → 완료/반려(바인허브 ER/EP/EC/EJ · RR/RP/RC/RJ 와 같은 구조). 처리 방법: 환불 요청 = 전액 환불 · 부분 환불(배송비 차감) · 교환으로 전환 / 교환 요청 = 바로 재발송 · 회수 후 재발송 · 환불로 전환(UI 시안 `resolutionOptions`). 교환 재발송 송장은 E4 전까지 어드민 수동 입력.

### 6.5 메일(Resend · 기존 템플릿)
주문 확인(고객 1통 + **줄의 셀러마다 1통** — 내 줄만 담아 `sellers.email`) · 배송 시작(고객) · 환불 완료(고객 + 해당 줄 셀러) · 교환 발송(고객) · 입금 안내(가상계좌) · 문의 접수(셀러) · 문의 답변(고객). `mail-events.server.ts` 복사본에서 `brands.email → sellers.email`. 발신은 MYR 도메인 인증 전까지 `noreply@sellery.life`.

- **적용(2026-11-02 · S6-3)**: `packages/db/src/mail` 복사 → `apps/myr-shop/src/lib/mail/{resend,layout,templates}.ts`(순수 · vitest) + `lib/server/{mail,mail-events}.ts`. 훅은 각 이벤트가 **한 곳에서 한 번**: `checkout-sync.confirmDone`(새 주문 — PAID 면 고객 주문 확인 + 셀러 새 주문, WAITING_DEPOSIT 이면 고객 입금 안내만) · `checkout-sync.depositDone`(입금 확인 → 주문 확인 + 셀러) · `refund.refundItems`(새 기록만 → 고객 환불 완료 + **환불된 줄의 셀러만**). 셀러 메일은 자기 줄·금액만 싣고 고객 연락처·배송지는 싣지 않는다. 받는 사람: 고객 = `buyer_email` → `customers.email` → 회원 auth 이메일(카카오 계정은 비어 있을 수 있어 없으면 조용히 건너뜀) · 셀러 = `sellers.email`(시드 크리에이터 4명은 비어 있음). 환경변수 `RESEND_API_KEY`(없으면 비활성 · 1회 안내) · **`MAIL_FROM`(발신자 — 기본 `MYR <noreply@sellery.life>` · 대표 결정 대기 · MYR 도메인이 Resend 에 Verified 되면 값만 교체)** · `PUBLIC_SITE_URL`(메일 링크 · 없으면 `https://myr-shop.vercel.app`). 절대 throw 하지 않아 주문·환불 흐름을 막지 않는다. 남은 메일 = 배송 시작 · 교환 발송(운송장은 M5 콘솔) · 문의(S6-4).

### 6.6 소유 증명(문의 ↔ 주문)
0041 그대로: 회원 `user_id` · 고객 행 `customer_id` · 비회원 조회 토큰(`app_guest_order_verify`) 중 하나가 맞을 때만 `order_id` 연결. 증명 못 하면 `order_code` 원문만 남기고 콘솔에 "(미확인)". 문의는 상품(= 셀러) 단위로 열리므로, 증명된 주문 안에서 **그 상품의 줄**(`order_item_id`) 을 함께 연결한다 — 다른 셀러의 줄 금액·수량은 응답에 담지 않는다.

- **적용(2026-11-02 · S7 · 0063)**: `myr_cs_conversations`(상품 단위 · `seller_id` 는 상품에서 파생 · `order_id`/`order_item_id` 는 소유 증명될 때만) · `myr_cs_messages`(sender/actor_role 분리 · 관리자 대행 답변 = sender `seller`). RPC 는 **단일 함수 + actor**(결정 12): `myr_app_cs_open(product, customer, user, name, type, body, order_code, guest_token)` · `myr_app_cs_thread(code, actor, actor_id, client_token)` · `myr_app_cs_list(actor, actor_id, status)` · `myr_app_cs_reply(code, actor, …)`(customer → OPEN · seller/admin → ANSWERED · CLOSED 거부) · `myr_app_cs_close(code, actor)`(seller·admin) · `myr_app_cs_for_order(order)`. 증명된 주문이라도 **이 상품의 줄이 없으면 연결하지 않는다**. 샵: `lib/cs-rules.ts`(순수) · `lib/server/cs.ts`(customer actor 만) · `/cs/new?product=&order=` · `/cs/[code]`(비회원 = HttpOnly 쿠키 `myr_cs_<code>` 90일 · 회원 = user_id) · 상품 페이지 FAQ 아래 [문의하기] · 주문 상세 줄마다 [문의하기] + "이 주문의 문의" · 마이 "내 문의". 메일: 접수·추가 문의 → `sellers.email`(`csOpenedSellerMail`) · 답변 → 고객(`csRepliedMail` — 훅 `notifyCsReplied` 는 콘솔의 reply 경로가 부른다). **답변·종료 화면은 인플루언서 콘솔(`myr-influencer`) 몫** — 같은 RPC 를 actor='seller' 로 호출. 스크립트 대행은 두지 않는다(대표 결정 2026-11-02). pgTAP 75 · vitest 33.

### 6.7 결제수단 · 가상계좌
- 결제 UI 는 **토스 결제위젯**(`@tosspayments/tosspayments-sdk` · `CheckoutClient.svelte` 복사) 이라 결제수단 목록은 코드가 아니라 **토스 개발자센터의 위젯 UI 설정 + 가맹점 계약**이 정한다. 카드 · 간편결제(토스페이 · 네이버페이 · 카카오페이 등) · 계좌이체 · 휴대폰은 거기서 켜면 바로 뜨고, 승인 흐름은 수단과 무관하게 같다. 주문에는 토스가 돌려준 `method` 가 `payment_method` 로 저장된다. 배치는 `PUBLIC_TOSS_WIDGET_VARIANT`.
- **가상계좌는 셀러리가 거부한다**(`WAITING_FOR_DEPOSIT` → 즉시 취소 · `VIRTUAL_ACCOUNT_NOT_SUPPORTED` · 0009). "승인 즉시 DONE" 전제로 주문을 만들기 때문. MYR 은 **처음부터 열어 둔다**(건기식·식품은 가상계좌 비중이 있다):
  - `myr_orders.status` 에 `WAITING_DEPOSIT` 추가 · `deposit_due_at`(토스 `virtualAccount.dueDate`) · 가상계좌 번호·은행은 `raw_payment` 에.
  - `myr_app_confirm_checkout`: 승인 결과가 `WAITING_FOR_DEPOSIT` 이면 주문(+ 줄) 을 `WAITING_DEPOSIT` 으로 만들고 **재고는 예약**(sold_qty 계산에 포함 · 입금 전 품절 방지). 성공 페이지는 입금 계좌·기한을 보여주고 입금 안내 메일(`notifyDepositPending`).
  - `/api/payments/webhook` 의 `DEPOSIT_CALLBACK`(수신 분기는 셀러리에 이미 있다 · `source='deposit_callback'`) → `myr_app_deposit_done` → `PAID` · `paid_at` · 주문 확인 메일. 상태 `CANCELED`(기한 만료) → `myr_app_deposit_expire` → `CANCELED` · 재고 반환.
  - reconcile 크론이 `WAITING_DEPOSIT` 이고 `deposit_due_at` 지난 주문을 토스 재조회로 종결한다(웹훅 유실 대비).
  - 환불 가드: `WAITING_DEPOSIT` 은 "취소"(토스 취소 호출 없이 상태만) · `PAID` 이후는 §6.3. 셀러 주문표·실적은 `WAITING_DEPOSIT` 을 매출에 넣지 않는다.
- **2026-10-30 적용(0058)**: 위 그대로 — `myr_app_confirm_checkout` 이 `WAITING_FOR_DEPOSIT` 을 받으면 `WAITING_DEPOSIT` 주문 + 재고 예약, `DEPOSIT_CALLBACK`/reconcile 이 `myr_app_deposit_done`(→ PAID) · `myr_app_deposit_expire`(→ CANCELED · 줄 CANCELED · 재고 반환) 로 종결. 성공 페이지가 은행·계좌·기한을 보여준다. 입금 안내 메일은 아직 없음. 위젯에 가상계좌를 켤지는 토스 설정(§9-10).
- 1차에 가상계좌를 미루더라도 **상태값과 컬럼은 M4 스키마에 넣어 둔다** — 나중에 열 때 마이그레이션 없이 위젯 설정 + 함수 분기만 추가하면 된다.

### 6.8 물류 — 이벗(Ebut) 자동 발주 · 송장 (2026-11-03 · 결정 13)

물류사가 바인허브와 같은 이벗을 쓰기로 했다. MYR 상품이 만들어진 뒤 이벗 쪽 등록 절차(창고 입고 · 상품코드 발급)는 아직 정해지지 않았으므로, **우선 바인허브와 같은 방식으로 "운영팀이 상품 검수 때 이벗 상품코드를 연결" 하는 것까지 만들고**, API 연동(E2~E4)은 계정·절차가 확정된 뒤 붙인다.

**바인허브 방식(참고 · `weglow-biz/vyneherb` `backend/shop`)**

| 시각(KST) | 하는 일 | 이벗 API · 바인허브 코드 |
|---|---|---|
| 평일 11:00 | 11시 전 첫 결제가 된 주문의 "결제완료" 줄을 이벗에 등록 → 성공한 줄만 "배송준비중" · 실패 주문은 3회 재시도 뒤 critical 로그 | `ordercreatem`(Bearer API 키 · 줄마다 `orderNo` = 주문 줄 id · `goodsCode` = 상품코드 · 수취인 · 보내는 사람 · `ordShop` 쇼핑몰 코드 · `ordGbn` 1 일반/2 교환) · `Jobs/OrderStatusToPreparing.php` |
| 매일 18:00 | 배송준비중·배송중 줄을 조회해 `invcExprNo`(송장) 저장 → "배송중" · 택배사 `exprStatus=91` 또는 배송 시작 10일 경과 → "배송완료" · 그 뒤 남은 배송준비중 줄은 `is_delayed` | `orderstatus`(codeType 2 · 줄 id 목록) · `Jobs/OrderStatusToDeliveringOrDelivered.php` |
| 반품 시 | 회수 접수 · 취소 · 상태 조회 | `exprtakeback` · `exprtbcancel` · `exprtbstatus` · `Jobs/AssignPickupReturnNumber.php` |
| 수시 | 창고 재고 조회 · 부족 알림 | `EbutStockService` · `SendWarehouseLowStockNotification` |

환경값: `EBUT_ID` · `EBUT_CUST_CODE` · `EBUT_API_KEY` · `EBUT_ORD_SHOP` + 보내는 사람(이름 · 연락처 · 우편번호 · 주소). 공휴일은 처리하지 않는다(평일만).

**MYR 에 옮길 때의 작업(E1~E4)**

| 번호 | 내용 | 짝이 되는 콘솔 작업 | 시점 |
|---|---|---|---|
| E1-a | `myr_products` 이벗 상품코드(옵션별) · 공개 RPC 제외 | 어드민 상품 검수(우선 1) | 지금 — 확정 전에는 선택 입력 |
| E1-b | 줄 단위 배송 상태 · 송장 · 이벗 등록 시각 · 지연 표시(§3) · 0069 재정의 + 줄 단위 송장 함수 · 샵 주문 상세·환불 화면 · 고객 셀프 환불 기준 "발주 전" | 인플루언서 6 · 어드민 주문(우선 2) | 인플루언서 6번 직전 · 이벗 확정 불필요 |
| E2 | 평일 11시 발주 크론(Vercel `0 2 * * 1-5` UTC) — 11시 전 결제(가상계좌는 입금 시각) 줄 → `ordercreatem` → 배송준비중 · 3회 재시도 · 실행 기록 | 어드민 발주·배송(우선 3) | 이벗 계정 확정 뒤 |
| E3 | 매일 18시 송장 수집 크론(`0 9 * * *` UTC) — `orderstatus` → 줄 송장 · 배송중/배송완료 · 배송 시작 메일(줄 단위 · 같은 송장 묶음 1통) · 지연 표시 | 어드민 발주·배송(우선 3) | E2 와 함께 |
| E4 | 반품 회수 접수·취소·상태 · 교환 재등록(`ordGbn=2`) · `myr_refund_requests`(DB 는 인플루언서 7번에서 먼저) | 인플루언서 7 · 어드민 교환·반품(우선 3) | 요청·승인은 먼저, 회수 API 는 이벗 확정 뒤 |

규칙:
- 이벗 호출은 `myr-shop` 의 크론에서만(결정 12 — 외부 호출 한 곳). 콘솔의 [다시 보내기] · 회수 접수는 같은 패키지 함수를 서버 action 에서 부른다.
- 발주는 멱등이어야 한다 — 이벗 등록에 성공한 줄만 상태를 바꾸고(바인허브와 같음), 같은 줄을 두 번 보내지 않도록 `ebut_registered_at` 이 있는 줄은 제외.
- 수취인 이름·연락처·주소가 물류사로 넘어가므로 **개인정보처리방침에 수탁자(물류사) 명시**.
- 이벗 장애 대비로 어드민의 수동 송장 입력(0069 계열)은 연동 뒤에도 남긴다.

---

## 7. 단계 (PR 순서)

| 단계 | 내용 | 산출 |
|---|---|---|
| M0 도메인·외부 등록 | 도메인 결정 · Vercel 프로젝트 3개 · Supabase Redirect URLs · 카카오 사이트 도메인 · 토스 웹훅 · (Resend 도메인) — §2.1. **샵 몫(S0 · 2026-10-29)**: Vercel `myr-shop` 생성 · Root `apps/myr-shop` · SvelteKit · Node 22 까지 CLI 로 완료(docs/deploy.md §1.1 MYR 표). GitHub 연결 · Include source files ON 도 완료(첫 배포 `https://myr-shop.vercel.app`). 남은 것 = Supabase Redirect URLs(`localhost:5178` · `myr-shop.vercel.app`) — 계정 역할이 Developer 라 조직 Owner 가 추가하거나 Administrator 로 올려야 한다(S3 전까지만 필요) | docs/deploy.md MYR 표 |
| M1 스키마 · **S1 완료(2026-10-29 · PR 대기)** | 0056 `myr_products` · 검수 RPC · `myr_product_card` · `myr_home_products` · 운영 스크립트 `myr-products.mjs` + 시드(§3 "S1 적용"). `gen:types` 는 안 했다 — 샵이 RPC JSON 을 자기 타입(`lib/data.ts` `Product`)으로 파싱하므로 database.types 에 의존하지 않는다 | 마이그레이션 1개 · 스크립트 · 클라우드 적용은 `db push --linked` 뒤 |
| **S2 샵 데이터 연결 · 완료(2026-10-29)** | `apps/myr-shop` 홈 · 카테고리 · 상품이 `lib/server/db.ts`(anon 키 · `@supabase/supabase-js` · 세션 없음) 로 0056 RPC 를 읽는다. **목 데이터는 로컬 dev 서버에서만**(환경변수 없음 · RPC 실패 둘 다) — 운영·Preview 는 어느 경우든 빈 목록/404 + 에러 로그(2026-10-30 대표 결정 · `lib/fallback.ts` · 가짜 상품이 운영에 뜨면 장애가 가려진다). 장바구니·찜은 상품 **스냅샷**(`myr-shop-v2`) 으로 저장 — M4 에서 code 로 서버 재검증. 크리에이터 아바타는 사진(`avatar_url`) 또는 이니셜 + 핸들 해시 색. Vercel `myr-shop` 에 `PUBLIC_SUPABASE_URL` · `PUBLIC_SUPABASE_ANON_KEY`(production · preview · 셀러리와 같은 값) 넣음 | 환경변수 2개 · `svelte.config.js` `env.dir '../..'` |
| M2 인플루언서 콘솔 1 | `apps/myr-influencer` 생성(가입·로그인·홈·상품 등록/수정/토글) | 앱 1 |
| M3 운영 콘솔 1 | `apps/myr-admin` 생성(로그인 · 상품 검수) | 앱 1 |
| **S3 로그인 · 완료(2026-10-29)** | `apps/myr-shop` 에 Supabase SSR 세션(`hooks.server.ts` · `locals.supabase` · `safeGetSession` — `apps/shop` 복사, 링크 유입 훅 없음) · `/login`(카카오 `signInWithOAuth` · `scopes` 지정 금지 · 개발용 이메일 폼은 `PUBLIC_DEV_LOGIN=1` + dev/Preview 만) · `/auth/callback`(`exchangeCodeForSession` → `?welcome=1`) · `/auth/signout`(POST) · `/api/me` · 레이아웃이 세션(표시명 · 아바타 · 이메일)을 헤더(PC 아바타/로그인 버튼) · 마이(프로필 · 로그아웃 · 비로그인 CTA) 에 전달 · 환영 토스트. 순수 헬퍼 `lib/auth.ts`(displayName · avatarOf · safeNext 복사) · 브라우저 클라이언트 `lib/supabase-browser.ts`(`@supabase/ssr`). **`customers` 행 보장은 안 한다**(service role 필요 → S4 `/api/checkout`). 비회원 구매 준비 = 로그인 페이지 안내 문구뿐(실제 흐름은 S4~S6 · `app_guest_*` 재사용). 확인: 로컬 Supabase 의 dev 계정으로 로그인·토스트·`/api/me`·로그아웃, 클라우드 키로 띄운 dev 서버에서 카카오 버튼 → `accounts.kakao.com` 이동까지 | hooks · 라우트 4 · 레이아웃 세션 |
| **S4a 계정 장바구니·찜 · 완료(2026-10-30)** | 0057 `myr_cart_items` `myr_likes` + RPC 7개(§6.2) · `lib/server/admin.ts`(service role · `SUPABASE_SERVICE_ROLE_KEY` 없으면 호출 시 throw · 라우트는 503) · `lib/server/cart.ts` · `/api/cart` `/api/cart/merge` `/api/likes` · `state.svelte.ts` 가 로그인이면 서버, 비회원이면 브라우저 · 로그인 직후 합치기 · 장바구니 화면에 "지금은 살 수 없어요" 줄. 로컬 확인: 로그인 담기 → 서버 행 · 로그아웃 뒤 비회원 줄 3개(없는 상품 1 포함) 심고 로그인 → 2개 합쳐짐(수량 합산) · 없는 상품 건너뜀 · 브라우저 비워짐 · 수량 변경 저장 · paused 처리 뒤 `available:false` + 합계 제외 | 마이그레이션 1개 · pgTAP 52 · Vercel `myr-shop` `SUPABASE_SERVICE_ROLE_KEY`(대표) |
| **카카오 회원 주문 안내 메일 · 완료(2026-11-02)** | 운영 확인: 카카오 계정이 이메일을 넘기지 않아(동의항목 "카카오계정(이메일)" 꺼짐 · 비즈 앱 전환 필요) 회원 주문 6건 모두 `buyer_email` 없음 → 거래 메일 미발송. 대응(대표 결정 2번): 계정 이메일이 없는 회원이면 체크아웃에 "이메일(주문 안내 메일)" 칸(선택) → `POST /api/checkout` 의 `email` → 그 주문 `buyer_email` + `customers.email` 저장(다음 결제 프리필 · 메일 대체 주소). 회원 이메일 순서 = 계정 이메일 → 이번 입력 → `customers.email`. 비회원 칸 문구도 같은 "이메일(주문 안내 메일)". 주문 상세 배송지의 이메일 줄은 항상 표시(없으면 '-'). 카카오 동의항목을 켜는 건 별도(카카오 디벨로퍼스 · 셀러리와 같은 앱) | 화면 2 · API 1 |
| **SEO · 2026-11-04** | **샵**: 순수 `lib/seo.ts`(사이트 오리진 = `PUBLIC_SITE_URL` · 메일과 같은 함수 · 제목 · 설명 · 색인 제외 경로 · JSON-LD · robots · sitemap · vitest) + `Seo.svelte`(제목 · 설명 · canonical · OG · 트위터 카드 · JSON-LD 한 벌) — 홈(WebSite · Organization) · 카테고리(정식 쿼리 순서 · 빈 목록 noindex) · 상품(설명 = 레시피 노트 · Product(가격 · 재고) + BreadcrumbList · 평점은 넣지 않음). `/robots.txt` · `/sitemap.xml`(판매 중 상품 · 목 데이터면 상품 제외). 개인화·결제·주문·문의·로그인·API 는 hooks 가 `X-Robots-Tag: noindex`. 공유 이미지 `static/og.png`(임시 · 같은 경로·크기로 교체). **레이아웃은 `<title>` 을 내지 않는다** — 상품 페이지에서 레이아웃 기본 제목이 이겨 모든 상품이 같은 제목이던 것을 고침. **랜딩**: Organization JSON-LD · `sellery.life/robots.txt` 에 `Allow: /influencer/oem`(콘솔용 `Disallow: /influencer` 가 랜딩까지 막고 있었다). **인플루언서 콘솔**: `ssr=false` 라 `<svelte:head>` 의 noindex 를 크롤러가 못 읽어 `app.html` 로 옮기고 `vercel.json` 이 `X-Robots-Tag` 헤더 · robots.txt 는 수집 허용(막으면 noindex 를 못 읽는다) | 순수 1 · 컴포넌트 1 · 라우트 2 |
| **S8 운영 스크립트(발송) · 완료(2026-11-03)** | 운영 콘솔 `myr-admin`(M6) 전까지 **발송 처리**를 터미널에서(대표 결정 2026-11-03 — 운영용). **임시인 것은 껍데기 둘뿐** — 스크립트 `myr-ops.mjs` 와 샵의 `/api/ops/ship` 은 M6 에서 삭제. **0069 RPC 와 `ship.ts`(+ 배송 시작 메일)는 정식** — 콘솔의 운송장 화면이 같은 함수를 호출한다(마이그레이션은 교체·삭제하지 않고 쌓는다 · 바꿀 게 생기면 새 번호에서 `create or replace`). **0069** `myr_app_admin_ship(code, courier, tracking)`(PAID·PARTIAL_REFUNDED 만 · 택배사 5곳 · 운송장 숫자 8~30 · 같은 운송장 재호출 already · 다른 운송장은 정정 + shipped_at 유지) · `myr_app_admin_ship_pending(limit, shipped)`(수취인 이름까지 · 주소 없음). 샵: 순수 `lib/ship-rules.ts`(별칭 cj/한진… · 운송장 정리 · 조회 URL · 파서) · `lib/server/ship.ts shipOrder`(새 기록이면 **고객 배송 시작 메일** `orderShippedMail` · 멱등 키 = 주문 + 운송장) · **운영 API `GET/POST /api/ops/ship`**(인증 = 크론과 같은 `CRON_SECRET` Bearer). 스크립트 `packages/db/scripts/myr-ops.mjs`(`orders [--shipped]` · `ship <주문번호> <택배사> <운송장>` · `ship-csv <file>`) 는 **DB 를 직접 만지지 않고 이 API 만 부른다**(판정·메일이 서버 한 곳) — env `CRON_SECRET` + `MYR_SHOP_URL`(기본 운영). 상품 검수는 기존 `myr-products.mjs` · 문의 답변·환불 대행 스크립트는 두지 않는다(콘솔에서). pgTAP 17 · vitest +23 | 마이그레이션 1개 · API 1 · 스크립트 1 |
| **S6-6 환불 신청 사진 첨부 · 완료(2026-11-03)** | 대표 시안 "상세 내용 · 사진 추가". **0068** Storage 비공개 버킷 `myr-refunds`(5MB · jpeg/png/webp · storage.objects 정책 없음 → 서버만) · `myr_order_items.refund_photos text[]` · `myr_refund_lines` + `photos`(3장) · `myr_app_refund_record` 가 이 주문·이 줄 아래 경로(`<order>/<item>/<uuid>.<ext>`)만 받고 아니면 `BAD_ITEMS(BAD_PHOTOS)`. 샵: `POST /api/refunds/photos`(multipart · 세션/조회 토큰으로 본인 줄 확인 · 줄당 3장 · **4MB**(Vercel 본문 4.5MB) · 매직 바이트로 형식 판별 · IP 30분 30건) · `DELETE`(그 주문 아래 경로만) · `lib/server/refund-photos.ts`(올리기 · 지우기 · 서명 URL 7일) · 신청 페이지 아코디언에 [사진] + 미리보기·× · 신청 본문 `items[].photos`. 셀러 환불 메일에 "사진 · 상품명" 행(서명 URL 7일 + 안내). 고아 파일(올리고 신청 안 함)은 `myr_refund_photo_orphans`(줄에 없고 24시간 지난 것)로 찾아 **크론 `/api/cron/reconcile` 4단계가 10분마다 100개씩 지운다**(storage.objects 직접 delete 는 막혀 있어 Storage API 로). 콘솔(M5)은 `refund_photos` 를 서명 URL 로 본다. pgTAP +4 · vitest +3 | 마이그레이션 1개 · API 1 · 서버 1 |
| **S6-5 환불 신청 페이지 · 완료(2026-11-03)** | 대표 시안 — 주문 상세의 [교환 · 환불 신청]/[주문 취소] 가 **별도 페이지** `/orders/[code]/refund`(비회원 `/orders/g/[code]/refund`) 로 간다. `RefundPage.svelte`(옛 `RefundPanel` 삭제): PC 왼쪽 제품 체크 카드(줄 하나면 미리 선택 · 수량 · 접히는 **"상세 내용 (선택)"** = 크리에이터에게 전달) + 환불 사유 드롭다운 / 오른쪽 환불 요약(선택 수 · 사유 · 예상 금액 · [₩ 환불 신청] → 인라인 확인) + 안내. 모바일은 같은 순서로 쌓고 하단 바. 보낸 뒤 주문 상세로. **0067** `myr_refund_lines` + `note` · `myr_app_refund_record` 가 줄 `refund_reason` 에 "사유 — 상세"(주문 refund_reason 은 사유만) · 셀러 환불 메일에 "상세 · 상품명" 행. 금액·가드·Idempotency-Key 는 note 와 무관. **사진 첨부는 다음 PR**(Storage 버킷 · 업로드 API · 첨부 경로). pgTAP +2 · vitest +3 | 마이그레이션 1개 · 화면 2 · 컴포넌트 1 |
| **S7-6 환불 진행 상태 · 완료(2026-11-03)** | 대표 시안 — 환불이 있는 주문 상세: 머리 칩 옆 그대로 · 환불된 줄에 "환불 완료" 칩(PC) · 결제 정보 = 결제 금액 / 환불 금액(−, 주황) / **최종 결제 = 결제 − 환불** · 상품 아래 "환불 진행 상태" 타임라인. 타임라인은 **실제 기록만**(환불 신청 = 사유 · 환불 완료 = 시각) — 환불은 신청 즉시 토스 취소까지 끝나므로 시안의 "판매자 확인" 대기 단계는 없다(두 단계 모두 체크). 승인형(배송 중 환불은 크리에이터 확인 뒤 취소) 전환은 별도 결정·작업. **0066** `myr_order_json` + `refund_reason` `refunded_at`(상세 `p_full` · 환불 있을 때만 · 목록엔 null). `refundSteps`(순수). pgTAP +3 · vitest +2 | 마이그레이션 1개 · 화면 1 |
| **S7-5 문의 이어 묻기 제거 · 완료(2026-11-03)** | 대표 시안 — 마이 "내 문의" 아코디언에는 [문의 화면에서 이어서 묻기] 링크가 없다. 고객 추가 문의 기능을 걷어냄: `/cs/[code]` 는 **읽기 전용 스레드**(추가 문의 폼 · `?/reply` 액션 삭제 · 답변이 달렸거나 종료된 문의는 "주문 상세/상품 페이지의 [문의]로 새로 남겨주세요") · `customerReplyCs` · `parseCsReplyInput` · `parseCsActionResult` · 추가 문의 메일(`followUp` 변형) 삭제 · 답변 메일의 "이어서 질문" 안내 삭제. 더 궁금하면 문의 시트로 새 문의. DB `myr_app_cs_reply` 의 customer actor 분기는 그대로(콘솔이 같은 함수를 seller 로 호출 · 마이그레이션 없음). vitest −3 | 컴포넌트 2 · 서버 3 |
| **S7-4 주문 상세 개편 · 완료(2026-11-02)** | 대표 시안대로 `OrderDetail.svelte` 가 화면 전체(머리 포함) — PC: 제목 + 상태 칩·주문번호·상대 시각·결제수단 / 왼쪽 상품 카드(크리에이터 · 수량·금액 · [문의]) / 오른쪽 결제 정보 + [교환 · 환불 신청] · 배송지(+이메일) · 이 주문의 문의. 모바일: 뒤로 헤더(주문번호) · 칩 줄 · 하단 바 [교환 · 환불 신청](셸 바닥). **[문의] = 상품 페이지와 같은 `CsSheet`**(이 주문 고정 · 유형과 무관하게 연결) — 비회원도 `POST /api/cs` 가 그 주문의 조회 토큰 쿠키로 확인(`guestOrder`)하면 접수(이름 = 주문자). **옛 `/cs/new` 문의 페이지와 `csNewHref` 는 삭제** — 문의 접수는 `CsSheet` 하나뿐(종료된 문의의 "새 문의" 는 주문 상세/상품 페이지로). `RefundPanel` 은 바깥에서 열 수 있게(`open` bindable · `showTrigger`) + 교환 안내 한 줄. **0065** 줄 JSON `creator_handle` · 상세 JSON `buyer_email`(목록엔 없음). pgTAP +3 · vitest +1 | 마이그레이션 1개 · 화면 2 |
| **S7-3 문의 시트 · 완료(2026-11-02)** | 상품 페이지 [○○에게 문의하기] → `CsSheet.svelte`(PC 모달 · 모바일 바텀시트 · 대표 시안): 상품 카드 · 유형 칩 · **배송 문의 · 교환·반품 일 때만** 주문번호 콤보박스(`GET /api/cs/orders?product=` — 내 최근 주문 50건 중 이 상품 줄이 있는 것 · 직접 입력 가능) · 유형별 안내 문구 · `POST /api/cs`(회원 전용 · 이름 = 세션 표시명 · 비회원 401 · 교차 출처 거부 · IP·user 30분 5건). 이름 칸 없음. `/cs/new` 페이지는 비회원 주문 상세 경로로 남김. vitest +3 | 컴포넌트 1 · API 2 |
| **S7-2 문의 UI · 완료(2026-11-02)** | 상품 페이지 크리에이터 옆/아래 "○○에게 문의하기" 버튼(**회원만** — 비회원은 `/cs/new` 도 주문번호 없이 들어오면 로그인으로 · 주문 상세 상품 줄에서만 문의). 마이 "내 문의" 아코디언(대표 시안) — 접힌 줄 = 상태 칩 · 유형 · 상대 시각 · 첫 질문 · 크리에이터·상품, 펼치면 `GET /api/cs/<code>` 로 스레드(내 문의 회색 · 크리에이터 답변 주황 테두리 · 답변 대기 안내). **0064** `myr_cs_conversation_json` 에 `first_body` · 메시지 시각 기본값 `clock_timestamp()`(한 트랜잭션 안 순서 보장). pgTAP +3 · vitest +2 | 마이그레이션 1개 · 컴포넌트 1 · API 1 |
| **S7 고객 문의 · 완료(2026-11-02)** | **0063** `myr_cs_conversations` `myr_cs_messages` + RPC 6개(§6.6 적용 · actor 가드 · 주문 소유 증명 · 이 상품 줄만). 샵 `/cs/new` `/cs/[code]` · 상품·주문 상세·마이 링크 · 접수 메일(셀러) · 답변 메일 템플릿·훅(콘솔이 호출). 답변·종료 화면은 `myr-influencer`(M5) · 스크립트 대행 없음. 로컬: 회원 접수 → 셀러 RPC 답변 → 추가 문의 → 마이 "내 문의" 확인 | 마이그레이션 1개 · pgTAP 75 · 화면 2 |
| **S6-3 메일 · 완료(2026-11-02)** | 셀러리 `packages/db/src/mail` 복사 → `lib/mail/{resend,layout,templates}.ts`(순수) · `lib/server/{mail,mail-events}.ts`. 주문 확인(고객 · 회원 `/orders/<code>` · 비회원 `/orders/g/<code>` + 조회 안내) · 새 주문(줄의 셀러별 **자기 줄만**) · 입금 안내(가상계좌 · 계좌·예금주·기한) · 환불 완료(고객 · 부분/전액/입금 대기 취소 문구 분기) · 환불(환불된 줄의 셀러만). 훅 = `confirmDone` · `depositDone` · `refundItems`(새 기록만 · §6.5). 마이그레이션 없음 · vitest 23(전송기 · 템플릿). Vercel `myr-shop` 에 `RESEND_API_KEY`(Production 만) + `MAIL_FROM`(발신자 결정 뒤) 필요 — docs/deploy.md MYR 표 | 순수 3 · 서버 2 · 훅 3곳 |
| **S6-2 환불 · 완료(2026-11-02)** | 0061 `myr_refund_lines`(내부) · `myr_app_refund_precheck` · `myr_app_refund_record` — 줄 × 수량 · actor 표(§6.3) · 배송비 규칙 · 입금 대기 취소. 샵 `lib/refund-rules.ts`(순수 · 본문 검증 · 화면 판정 · 추정 금액 · Idempotency-Key · 파서) · `lib/server/refund.ts` · `/api/payments/cancel` · `RefundPanel.svelte`(주문 상세 안 · 회원/비회원 공용). 웹훅 `syncOrder` 가 `cancels[]` 합과 `refund_amount` 를 대조. pgTAP 38 · vitest 11 | 마이그레이션 1개 · 라우트 1 · 컴포넌트 1 |
| **S6-1 주문 조회 · 완료(2026-11-02)** | **0060** `myr_order_json`(고객이 보는 주문 모양 — 줄 · 배송 상태 · WAITING_DEPOSIT 이면 가상계좌 정보 · 배송지는 상세만) · `myr_app_my_orders(user, limit)` · `myr_app_order_view(code, user)`(회원은 user_id 대조 · 비회원 경로(user null)는 user_id null 주문만). 샵: `/my` 최근 주문이 서버 주문(`+page.server.ts`) · `/orders/[code]`(회원 · 로그인 필요 · 남의 주문 404) · `/orders/lookup`(비회원 · 주문번호+연락처 · IP 30분 5회 · 토큰 회전 → 쿠키) · `/orders/g/[code]`(쿠키 토큰 검증) · 공용 `OrderDetail.svelte` · 순수 `lib/order-view.ts`(파서 · 상태 라벨 · 조회 폼 검증). 로그인 화면 문구를 "비회원 주문 조회 안내" 로 교체. 성공 페이지 [주문 상세] → 회원 `/orders/<code>` · 비회원 `/orders/g/<code>`. 운영 리허설(2026-11-02): 회원 간편결제(두 셀러) · 비회원 계좌이체 모두 PAID · 재고·장바구니·로그 정상 — 첫 시도 CONFIG_ERROR 는 키 추가 뒤 재배포 누락(docs/deploy.md). **남은 것(S6-2)**: 줄 단위 환불 RPC + 화면 · 문의 · 메일 | 마이그레이션 1개 · pgTAP 22 · 화면 4 |
| **S4/S5 결제·주문 · 완료(2026-10-30)** | **0058** `myr_checkouts` · `myr_checkout_items` · `myr_orders` · `myr_order_items`(가상계좌 `WAITING_DEPOSIT` · `deposit_due_at` 포함) · `myr_shipping_fee`(platform_settings `myr_shipping` 50,000/3,000) · `myr_app_create_checkout`(줄 합치기 · listed/옵션/단가/잔여 검증 · 한 줄이라도 미달이면 `LINES_REJECTED items[]` · supersede) · `myr_app_claim_checkout` · `myr_app_confirm_checkout`(상품 행 id 순 `for update` · DONE → PAID · WAITING_FOR_DEPOSIT → WAITING_DEPOSIT + 재고 예약) · `myr_app_deposit_done/expire/due` · `myr_expire/stale/purge_*` · `myr_app_guest_token_issue/verify/lookup` · 0021 `purge_checkout_pii` 가 `myr_orders` 도 보게 재정의 · sold_qty 트리거(줄 + 주문 상태). **샵**: `lib/checkout-rules.ts`(순수 · 검증·파서·문구) · `lib/server/{toss,checkout-sync,customers,cron,rate-limit}.ts`(셀러리 복사) · `/api/checkout` · `/api/payments/confirm`(회원 user_id · 비회원 `myr_gck` 쿠키 · 성공 시 계정 장바구니 비움 · 비회원 토큰 쿠키 `myr_guest_<code>`) · `/api/payments/webhook` · `/api/cron/reconcile`(`vercel.json` 10분) · `/checkout`(토스 결제위젯 `PaymentWidget.svelte` · 비회원 이메일·동의) · `/checkout/success`(confirm 1회 · 입금 안내) · `/checkout/fail`(본인 PENDING 종결). 확인: pgTAP 101 · vitest · 로컬 브라우저로 비회원 담기 → 체크아웃 → 세션 생성(35,000 = 32,000 + 배송비) → 위젯 렌더 → confirm/webhook/cron/fail 랜딩을 API 로 검증(토스 시크릿이 로컬에 없어 승인은 `CONFIG_ERROR` 로 FAILED 되는 것까지). **남은 것**: 토스 테스트 키 리허설(카드 · 간편결제 · 두 셀러 담아 결제 · 가상계좌 입금 콜백) — Vercel `myr-shop` 에 `TOSS_SECRET_KEY` `PUBLIC_TOSS_CLIENT_KEY` `CRON_SECRET` + 토스 웹훅 URL 등록 뒤(docs/deploy.md MYR 표) · PAID 뒤 토스 콘솔 취소는 줄 환불 RPC(다음 마이그레이션) 전까지 payment_events 운영 큐(`needs_manual_adjust`) · 주문 확인 메일 없음 | 마이그레이션 1개 · pgTAP 101 · 라우트 4 · 화면 3 |
| M4 샵 | `apps/myr-shop` 생성(홈 · `/p/[code]` · 장바구니 · 로그인 · 체크아웃 · 결제 API · 웹훅 · reconcile · 주문 조회) + 0057 `myr_checkouts` `myr_checkout_items` `myr_orders` `myr_order_items`(가상계좌 상태·컬럼 포함) · 다중 줄 결제 RPC · 줄 단위 환불 RPC(actor 한 벌 · 부분 취소) · `refund.server.ts` `checkout.server.ts` | 앱 1 · 마이그레이션 1개 · 토스 테스트 키 리허설(카드 · 간편결제 · 가상계좌 입금 콜백 · **두 셀러 담아 한 줄만 환불**) |
| M4-UI(선행) · **2026-10-29 완료** | 디자인(Claude Design "MYR Shop" 프로젝트 파일 `MYR Shop.dc.html` 2026-10-28 판) 을 **목 데이터로 화면만** — `apps/myr-shop`: `/` 홈 · `/category?cat=&creator=` · `/p/[code]` · `/cart` · `/checkout` · `/checkout/done` · `/my` · 탭바 · 토스트. 장바구니·찜·주문자·목 주문은 `localStorage`(`myr-shop-v1` · `lib/state.svelte.ts`), 데이터는 `lib/data.ts`. 결제 수단 칸은 디자인 그림(§6.7 위젯 자리) · 포인트 칸은 뺌(§9-12) · 뒤로가기는 `lib/nav.ts`(앱 안에서 온 길이 없으면 홈). **2차(같은 날 · "MYR Shop PC" 2026-10-29 판)**: 상세페이지 섹션 — 레시피 노트 → 01 왜 만들었나(스토리 + 숫자 포인트 3) → 02 성분표(성분·이유·함량) → 03 섭취법(3스텝) → 04 제품 정보(스펙 + 표) → 05 FAQ → 함께 보면 좋은 레시피 — 모바일·PC 공통(인플루언서 상품 등록 템플릿 = `Detail` 타입 · 민지 젤리·하루 콜라겐만 실제 문구, 나머지는 `genericDetail`) + **PC(lg≥1024) 반응형**: 상단 내비(`SiteHeader`) · 홈 2단 히어로 + "이번 주 레시피" · 카테고리 사이드바 · 상세 2단 + sticky 구매 패널 · 장바구니/결제 2단 + sticky 요약 · 마이 2단 | 앱 골격 · 컴포넌트 · 테마(`app.css` 토큰은 `apps/myr` 와 같은 값) · `npm run dev:myr-shop`(5178) |
| **M5-UI 인플루언서 콘솔 화면 · 2026-11-03** | Claude Design "MYR Influencer Admin"(모바일 · PC) 시안을 목 데이터로 — 홈 · 교환/환불 CS · 내 제품 · 8단계 상품 등록 · `ssr=false` · 인증·DB 없음 · `npm run dev:myr-influencer`(5179) | 앱 1 |
| M5 인플루언서 콘솔 기능 | **§4.2.1 작업 순서 0~11**(배포 · 공용 코드 · 로그인 · 상품 읽기/쓰기 · 문의 · 주문 열람 · 승인형 교환/환불 · 실적 · 프로필 · 가입) — 2026-11-03 이벗 반영으로 주문 탭은 열람만, 환불은 승인 흐름 | 마이그레이션 2~3개 |
| M6 운영 콘솔 | **§4.3 우선 1~4**. 우선 2(주문 · 송장 수동 입력)가 생기면 **지우는 것**: `packages/db/scripts/myr-ops.mjs`(+ `lib/myr-ops-plan.mjs` · 테스트) · 샵 `/api/ops/ship` · `.env.example` 의 `MYR_SHOP_URL` · docs/deploy.md MYR 표의 발송 처리 문장. 0069 RPC 는 남고 E1-b 에서 재정의 · `ship.ts` 는 콘솔로 복사 | |
| E1~E4 이벗 연동 | **§6.8 표**. E1-a 는 어드민 상품 검수와 · E1-b 는 인플루언서 6번 직전(샵 수정 포함) · E2~E4 는 이벗 계정·상품 등록 절차 확정 뒤(§9-14) | 마이그레이션 2~3개 · 크론 2 |
| M7 운영 전환 | 토스 라이브 키 · 크론 · `check-boundaries` 규칙 · 랜딩 루트 이전(§2) · 옛 주소 리다이렉트 | |

M1~M3 는 결제 없이 끝까지 돌아가므로 먼저 보낸다. M0 는 M4 결제 리허설 전까지만 끝나면 되지만 도메인 이름은 M2 의 메일 링크·`PUBLIC_*_URL` 에 들어가므로 일찍 정하는 게 좋다. M4 가 가장 크다(`apps/shop` 복사 뒤 캠페인 흔적 제거).

---

## 8. 셀러리 → MYR 재사용 표

| 그대로(복사만) | 치환(campaign → product · brand → seller) | 가져오지 않음 |
|---|---|---|
| `toss.server.ts` · `money.ts` · `jwe.ts` | `checkout-sync.server.ts`(테이블·RPC 이름) | 캠페인 생명주기 · 샘플 · 일정 · 틱 |
| `hooks.server.ts` SSR 세션 · `/login` `/auth/*` · 파트너 가입·인증 | `/api/checkout` `/api/payments/*`(코드 필드 · 카드 조회) | 등급 · 보너스 · 독점권 · 🥬 · 추천 · 셀러리 샵 · 갤러리 · 초대 |
| `guest-order.ts` + `app_guest_*` · `rateLimit` · `text` `dates` `carriers` | `mail-events.server.ts`(수신처) · `tracking.server.ts`(테이블) | 링크 유입 보호 · 팔로우 · 오픈 알림 |
| `mail/{resend,layout,templates}` | `cs.server.ts` · `brand/{cs,orders}.server.ts` · `brand-refund.server.ts`(게이트 컬럼) | 정산 0053 수식 · 등급 틱 |
| `requireSeller()` · `requireAdmin()` · `PartnerShell` 골격 | `OrderDetail.svelte` · `CheckoutClient.svelte`(문구 · 필드) · admin `(money)/{orders,cs}` | 브랜드 콘솔 자체 · 아웃리치 |

---

## 9. 열린 결정

1. **도메인 이름과 배치** — 앱별 서브도메인(`shop.` `studio.` `admin.`) vs 샵을 루트로. 토스·카카오·Supabase 등록(§2.1) 이 걸려 M4 전에 필요. 랜딩을 루트로 옮기는 시점도 함께.
2. **카카오 동의 화면 브랜드** — "셀러리" 앱 그대로 쓸지, MYR 카카오 앱을 새로 만들지. 후자는 Supabase 프로젝트당 카카오 provider 1개 제약 때문에 프로젝트 분리 또는 셀러리 카카오 로그인 중단이 따라온다.
3. **가격·옵션 수정 시 재검수** — 셀러리는 판매 전 변경 시 `pending` 재검수(0002 주석). MYR 도 같게 할지, 소개글만 자유로 둘지.
4. **상품 페이지 URL** — `/p/<code>` 단독 vs `/s/<handle>/<code>`(셀러 브랜딩). 모아보기가 목적이면 전자, 인플루언서가 자기 링크를 홍보하면 후자. 둘 다 두고 정식은 하나로 308 가능.
5. **카테고리** — 셀러리 `CATS` 8개 재사용 vs MYR 퍼널의 카테고리(`apps/myr` `apply-options.ts` `CATEGORIES`) 로 통일.
6. **정산** — 인플루언서 마진율(상품별 vs 전역 `platform_settings`) · 지급 주기 · 지급대행(0042) 재사용 여부 · 토스 상점(MID) 을 MYR 사업자로 따로 낼지. 1차는 스냅샷 컬럼만.
7. **제조의뢰 접수 → 상품 연결** — §5 의 2차(`myr_applications` + 초대 가입).
8. **디자인** — `packages/ui` 셀러리 테마 vs `apps/myr` 다크·앰버 테마. 콘솔은 전자(빠름), 샵은 후자(브랜드 일관) 가 자연스럽지만 미정.
9. **발송 주체** — 2026-10-29 전제는 MYR 물류센터 일괄 발송(결정 8). 셀러가 각자 보내는 방식으로 바꾸면 배송비·무료배송·운송장이 셀러별 줄 묶음 단위가 되고(`myr_shipments` 테이블 추가), 고객 화면에 "배송 N건" 이 다시 필요해진다 — 그때 결정 2-1 과 함께 고친다.
10. **결제수단 범위** — 1차에 켤 수단(카드 · 간편결제 종류 · 계좌이체 · 가상계좌 · 휴대폰). 간편결제·휴대폰·가상계좌는 토스 가맹점 계약에 포함돼야 위젯에 뜬다(§6.7). 가상계좌를 1차에 켤지, 상태·컬럼만 준비하고 미룰지.
11. **배송비 규칙** — 무료배송 기준 금액(디자인 Tweaks `freeShipping`) · 기본 배송비 · 도서산간 추가 여부 · 줄 환불 뒤 남은 합계가 기준 아래로 떨어질 때(§6.3 기본 = 사후 청구 없음 · 대안 = 마지막 줄 환불 시 배송비 차감) · 배송비 정산 귀속(MYR 수입 vs 셀러 분배).
12. **찜 · 포인트** — 디자인 "마이" 에 찜 목록·포인트가 있다. 찜은 셀러리 팔로우(0045) 를 상품 단위로 바꾸면 되지만(`myr_wishes`), 포인트는 🥬 를 가져오지 않기로 했으므로 디자인에서 빼거나 별도 적립 정책을 정해야 한다. 1차 = 찜만(브라우저 저장) · 포인트 없음. **→ 2026-10-30 결정: 찜도 장바구니와 함께 계정 보관(0057 `myr_likes` · §6.2)**. 포인트는 여전히 없음.
13. **결제수단 UI 영역** — 디자인의 "결제수단 선택" 은 그려진 그림이고, 실제로는 토스 위젯이 그 자리를 렌더한다(§6.7). 위젯 variant 로 디자인에 가깝게 맞추되 완전히 같게는 안 된다.
14. **이벗 연동 세부(2026-11-03 · §6.8)** — 확인 대기: ① MYR 이 바인허브와 **같은 이벗 계정**(고객코드 · API 키)을 쓰는지, 새로 받는지 ② MYR 상품을 이벗에 등록하는 절차(누가 · 언제 창고 입고와 상품코드 발급을 하는지 · 옵션별 코드인지) ③ 박스 **보내는 사람**을 MYR 로 할지 인플루언서 이름으로 할지(인플루언서별이면 셀러마다 쇼핑몰 코드·발송인 정보 — 바인허브의 한의원별 `ebut_shop_code` 와 같은 구조) ④ 분할 출고(한 주문 여러 박스) 유무 ⑤ 11시 이후·공휴일 주문 처리 ⑥ 발주 후 출고 취소 가능 여부(가능하면 "발주 전" 환불 기준을 늦출 수 있다).
15. **교환·환불 비용 정책** — 단순 변심 왕복 배송비(UI 시안 ₩6,000 · 고객 부담) · 파손·오배송은 MYR 부담 · 개봉 제품 불가 · 수령 7일 기준. 시안 문구(`POLICY_BY_REASON`)를 정책으로 확정할지.
