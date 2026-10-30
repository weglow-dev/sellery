# MYR(Make Your Recipe) 전체 구현 방향 — apps/myr · myr-shop · myr-influencer · myr-admin

> **상태(2026-10-28 · 2026-10-29 장바구니/줄 단위 정산 반영): 방향 결정 문서. 구현 전.** "Make Your Recipe(MYR)" 로 만든 인플루언서 PB 제품을 **한 샵에서 모아 팔고, 인플루언서가 자기 제품의 등록·판매실적·CS 를 직접 맡고, 운영팀이 검수해 샵에 오픈하는** 구조를 정한다. 셀러리(캠페인 모델)의 결제·주문·CS 코드를 **복사해 쓰되 import 로 섞지 않는다** — MYR 이 완성되면 셀러리 쪽 앱·기능은 쓰지 않게 될 전망이라, 나중에 셀러리 폴더만 지워도 MYR 이 남도록 경계를 둔다.
>
> 근거(저장소 안): `apps/shop/src/routes/{api,checkout,cs,orders,account}/**` · `packages/payments/src/server/*` · `packages/db/src/server/{brand,partner,admin}/*.server.ts` · `supabase/migrations/{0004,0005,0008,0015,0018,0020,0021,0041}` · `docs/branding-plan.md`(랜딩 `apps/myr`) · `docs/brand-console-plan.md` · `docs/admin-console-plan.md`(콘솔 골격) · `docs/deploy.md`(외부 서비스 등록).
>
> 이 문서가 정하지 않는 것: 디자인(MYR 랜딩의 다크·앰버 테마를 따를지), 도메인 이름, 정산 요율 숫자. §9 열린 결정.

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
| 7 | **CS·환불은 인플루언서가 한다.** 문의함 · 스레드 · 답변 · 종료 · 환불을 `seller_id` 게이트로. 환불은 **내 줄(order_items) 단위의 토스 부분 취소**(§6.3). 교환은 1차에서 **CS 스레드로 처리 + 재발송 운송장 1칸**(§6.4) | 브랜드 콘솔 `cs.server.ts` · `brand-refund.server.ts` 를 `brand_id → seller_id` 로 복사하되, 결제 1건에 셀러가 여럿이라 전액 취소가 아니라 `cancelAmount` 부분 취소가 된다. 셀러리에도 교환 상태 기계는 없다. |
| 8 | **발송은 MYR 물류센터가 주문 단위로 한 번에 한다**(2026-10-29 전제 — 고객에게 주문 1건 · 배송 1건). 운송장 입력 · 발주서는 `myr-admin`, 배송비는 **결제당 1건**(무료배송 기준도 장바구니 합계 기준). 인플루언서 콘솔 "주문" 탭은 내 줄의 **열람 · 환불 · CS** 만 | 랜딩이 "재고·물류는 MYR 이 맡는다" 를 약속하고, 셀러별 배송 N건을 고객에게 보여주지 않기로 했다. 셀러가 각자 보내는 방식으로 바꾸면 배송비 · 무료배송 · 운송장이 전부 셀러별(= 줄 묶음별) 로 갈라진다(§9-9 에 되돌릴 조건을 적어 둔다). |
| 9 | **운영 콘솔 `myr-admin` 1차 = 상품 검수 + 주문/문의 열람 + 환불 대행.** 게이트는 `profiles.role='admin'`(`requireAdmin()` 복사) | 셀러리 관리자 계정을 그대로 쓴다(같은 Supabase). 정산 실행·지급은 2차. |
| 10 | **정산은 1차 범위 밖.** 주문에 `seller_margin_rate` 스냅샷만 남기고, 실적 화면은 매출·환불·순매출·예상 정산액을 보여준다 | 요율·주기·지급 방식이 미정. 셀러리 0053 수식(3%+3%+5%) 을 가져오지 않는다. 지급대행(`payouts.server.ts` · 0042) 은 나중에 재사용 가능. |
| 11 | **셀러리 코드와의 경계** — 서버 모듈은 `packages/db/src/server/myr/` · `packages/payments/src/server/myr/` 에 복사본. 셀러리 모듈(`brand/*` `partner/*` `campaign*`) 을 import 하지 않는다(`scripts/check-boundaries.mjs` 에 규칙 추가). 순수 모듈(`text` `dates` `carriers` `guest-order` `money` `auth`) 과 `mail/{resend,layout}` 은 공유 | 셀러리 폐기 시 `apps/{shop,influencer,brand,admin}` 과 셀러리 서버 폴더만 지우면 되게. |
| 12 | **단일 함수 원칙** — 같은 동작(환불 · 운송장 · 문의 답변 · 상품 상태 변경)은 **패키지 함수 하나 + SQL 함수 하나**로 두고 `actor`('customer' · 'seller' · 'admin') 매개변수로 권한만 가른다. 앱 라우트는 세션에서 actor 를 정해 그 함수를 부르는 얇은 껍데기. 외부가 부르는 HTTP 엔드포인트(토스 웹훅 · 크론) 는 `myr-shop` 에만 둔다(§3.1) | 셀러리는 고객 `/api/payments/cancel` · 브랜드 `refundOrderAsBrand` · 관리자 `admin-refund` 로 같은 토스 취소가 세 벌이다. MYR 은 앱이 넷이라 그대로 가면 네 벌이 된다. 앱끼리 HTTP 로 부르지 않는다 — 같은 Supabase 를 service role 로 직접 쓰므로 CORS·인증 전달이 필요 없다. |

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
  │                                    주문 → 운송장 등록(단건/CSV) ──▶ 배송 시작 메일 (주문 단위 · 물류센터)
  ├ 주문 탭: 내 줄 열람 · 줄 환불(부분 취소) · 문의 연결
  ├ 문의 탭: 고객 문의(seller_id) 답변·종료 ◀──────────────────────── /cs/new?product=<code>(&order=)
  ├ 환불: 내 줄 → 토스 cancelAmount 부분 취소        열람·환불 대행     고객 셀프 환불(발송 전 · 줄 또는 전체) /api/payments/cancel
  └ 실적 탭: 내 줄 기준 매출·환불·순매출·상품별 집계
```

---

## 2. 앱 · 도메인 · 배포

| 앱 | 역할 | 지금 주소 | 새 도메인(예시 · §9-1) | Vercel |
|---|---|---|---|---|
| `apps/myr`(기존) | 제조의뢰 랜딩·퍼널 | `https://sellery-branding.vercel.app/influencer/oem/` · `https://makeyourrecipe.vercel.app/influencer/oem/` · 공개 주소 `https://sellery.life/influencer/oem`(shop 리라이트) | 루트 `https://<myr-domain>/` | `myr`(옛 `sellery-branding`) · base `/influencer/oem` |
| `apps/myr-shop`(신규) | 고객 샵 · 결제 · 주문 조회 · 문의 | — | `https://shop.<myr-domain>` 또는 루트 | 신규 · base `''` |
| `apps/myr-influencer`(신규) | 인플루언서 콘솔 | — | `https://studio.<myr-domain>` 등 | 신규 · base `''` |
| `apps/myr-admin`(신규) | 운영 콘솔(검수 · 열람 · 환불 대행) | — | `https://admin.<myr-domain>` · `noindex` · robots disallow | 신규 · base `''` |

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

**S1 적용(2026-10-29 · `supabase/migrations/0056_myr_products.sql`)** — 위 설계 중 상품 표만 먼저. 실제 컬럼은 디자인 필드 그대로(~~`sub`~~(한 줄 소개 — **0059 에서 삭제** · 2026-10-30 대표 결정: 인플루언서 등록 폼에도 두지 않는다 · 카드·상세는 제형·구성(`form` · `unit`)을 보여준다) · `unit` · `price` + `options` · `tile` · `thumb_url` · `icon` · `form` · `pack` · `flavor` · `tag` · `chips` · `ingredients` · `note` · `howto` · `specs` · 상세 `story_title` `story` ~~`points`~~(숫자 포인트 3칸 — **0059 에서 삭제** · 등록 폼에도 없음) `ingredient_rows` ~~`howto_title`~~(섭취법 제목 — **0059 에서 삭제**) `howto_steps` `faq`) + `stock` `sold_qty` `status` `reject_reason` `submitted_at` `reviewed_at` `reviewed_by` `seller_margin_rate` `deleted_at`. `category` 는 MYR 6개(`diet` `inner` `derma` `hair` `mental` `mens` — §9-5 는 이걸로 결정). 공개 RPC `myr_home_products()` · `myr_product_card(code)`(related ≤4 포함 · 재고·마진·검수 정보 제외 · `sold_out` 만) · 운영 RPC `myr_app_admin_review_product(id, approve|reject|pause, reason, reviewer)`. 콘솔 전까지 투입·검수는 **`packages/db/scripts/myr-products.mjs`**(`import <json> [--listed]` · `list` · `review` · `delete` · `creators` — 크리에이터는 `sellers` 에 handle 기준 upsert, 계정 미연결 행은 `partner-admin.mjs invite --link` 로 연결) · 시드 `myr-products.seed.json`(디자인 8개). 적용 절차는 셀러리와 같다 — 병합 → 링크된 PC 에서 `npx supabase db push --linked` → `node packages/db/scripts/myr-products.mjs import packages/db/scripts/myr-products.seed.json --listed`. **2026-10-29 적용 완료**: 클라우드 `sellery` 에 0056 push + 시드(크리에이터 4 · 제품 8 `listed`) 투입. 주의 — 루트 `.env.local` 의 Supabase 주소가 로컬 인스턴스(`127.0.0.1:54321`)라 스크립트는 로컬 DB 에 들어간다. 클라우드 시드는 CLI 의 DB 연결(`npx supabase db query --linked --file …`)로 같은 내용의 SQL 을 넣었고, 로컬에도 `supabase migration up --local` + 스크립트로 같은 8개를 넣었다. 시드는 디자인용 가짜 제품이라 실제 제품이 들어오면 `myr-products.mjs delete <code>` 로 지운다.

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
   | 환불(줄 단위 부분 취소) | 본인 주문의 줄(전체 = 모든 줄) · PAID · 발송 전 | `seller_id = 내 id` 인 줄만 · PAID · 발송 뒤 허용(`after_ship` 기록) | 전부 |
   | 운송장 · 교환 발송 · 발주서 | — | — (열람만 · 수취인 원문 없음) | 전부(물류센터) |
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
| 상품 | `/products` `/products/new` `/products/[code]` | 목록(상태 칩) · 등록 · 수정 · 판매중/일시중지 · 반려 사유 · 재제출 | `apps/brand/(console)/products/*` |
| 주문 | `/orders` `/orders/[code]` | 내 줄이 있는 주문 목록(줄 · 수량 · 금액 · 배송 상태 읽기) · 내 줄 환불(부분 취소) · 문의 연결. **운송장 입력 없음**(물류센터 · 결정 8) | `apps/brand/(console)/orders` 에서 발송 기능 제거 |
| 문의 | `/cs` `/cs/[code]` | 문의함(OPEN → ANSWERED → CLOSED) · 답변 · 종료 | `apps/brand/(console)/cs/*` |
| 실적 | `/sales` | 기간별 매출·환불·순매출 · 상품별 · 예상 정산액 | `apps/influencer/(console)/sales` 축소 |
| 내 정보 | `/my` | 프로필(핸들 · 아바타 · 소개) · 정산 계좌 · 알림 이메일 | `apps/influencer/(console)/my` |

게이트: `requireSeller()` 그대로(`sellers.user_id and active`). 도메인이 분리되므로 `foreign` 상태는 "파트너 아닌 세션" 하나로 줄어든다.

PII: 발송을 물류센터가 하므로(결정 8) 인플루언서 응답에는 **수취인 실명·연락처·주소 원문을 넣지 않는다**(셀러리 0004 "인플루언서 응답에서 제거" 규칙 유지 · 구매자 표시명은 `김*은` 마스킹). CS 에서 주소가 필요하면 문의 스레드 안에서 고객이 적거나 운영팀이 대행한다. 수취인 원문은 admin 응답에만, 열람 로그는 `sensitive_access_log`(0013) 재사용.

### 4.3 `apps/myr-admin` (운영)

| 경로 | 내용 | 원본 |
|---|---|---|
| `/login` | 이메일 로그인 · `requireAdmin()`(`profiles.role='admin'`) | `apps/admin` |
| `/home` | 검수 대기 수 · 오늘 주문 · 미답변 문의 | |
| `/products` `/products/[code]` | 검수 대기 목록(pending 우선) · 상세(이미지 · 문구 · 옵션 · 셀러) · 승인/반려(사유) · listed/paused 강제 전환 | `apps/admin` 상품 검수(파트너 관리) 패턴 |
| `/orders` `/orders/[code]` | 주문표(수취인 원문) · **운송장 단건/CSV · 발주서 · 교환 재발송**(물류센터 · 결정 8) · 환불 대행(`actor='admin'`) | `apps/brand/(console)/orders`(발송) + `apps/admin/(console)/(money)/orders`(열람·환불) |
| `/cs` `/cs/[code]` | 열람 · 대행 답변(`sender='seller'`, `actor_role='admin'`) | `(money)/cs` |
| `/sellers` | 인플루언서 목록 · 정지/복구 | `partner-admin.mjs` 기능의 화면판 |
| (2차) `/settle` | 정산 실행 · 지급 | 0020 패턴 |

`noindex` · `/robots.txt` disallow · 운영자 외 세션은 404 가 아니라 `/login` 으로.

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
  - 체크아웃 때 서버가 줄마다 상품을 다시 읽어 검증하므로 장바구니 안의 가격은 표시용이다. 주문 완료 뒤 `myr_cart_clear`.
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
- 배송비: 줄 환불 때 배송비는 **돌려주지 않는다**(기본) · 모든 줄이 환불되면 배송비까지 전액. 남은 줄 합계가 무료배송 기준 아래로 떨어져도 배송비를 사후 청구하지 않는다(§9-11 에 대안).
- 가상계좌 `WAITING_DEPOSIT` 은 토스 호출 없이 상태만 취소(§6.7).

### 6.4 교환(1차 최소안)
문의 유형 '교환·반품' 스레드에서 인플루언서가 판단하고, **재발송은 물류센터(admin)** 가 주문 단위로 `exchange_courier` · `exchange_tracking_no` 입력 → 고객 주문 상세에 "교환 발송" 줄 + 메일. 주문 · 줄 `status` 는 바꾸지 않는다(PAID 유지). 상태 기계(`EXCHANGE_REQUESTED → EXCHANGED`) 는 운영해 보고 필요하면 2차.

### 6.5 메일(Resend · 기존 템플릿)
주문 확인(고객 1통 + **줄의 셀러마다 1통** — 내 줄만 담아 `sellers.email`) · 배송 시작(고객) · 환불 완료(고객 + 해당 줄 셀러) · 교환 발송(고객) · 입금 안내(가상계좌) · 문의 접수(셀러) · 문의 답변(고객). `mail-events.server.ts` 복사본에서 `brands.email → sellers.email`. 발신은 MYR 도메인 인증 전까지 `noreply@sellery.life`.

### 6.6 소유 증명(문의 ↔ 주문)
0041 그대로: 회원 `user_id` · 고객 행 `customer_id` · 비회원 조회 토큰(`app_guest_order_verify`) 중 하나가 맞을 때만 `order_id` 연결. 증명 못 하면 `order_code` 원문만 남기고 콘솔에 "(미확인)". 문의는 상품(= 셀러) 단위로 열리므로, 증명된 주문 안에서 **그 상품의 줄**(`order_item_id`) 을 함께 연결한다 — 다른 셀러의 줄 금액·수량은 응답에 담지 않는다.

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
| **S4/S5 결제·주문 · 완료(2026-10-30)** | **0058** `myr_checkouts` · `myr_checkout_items` · `myr_orders` · `myr_order_items`(가상계좌 `WAITING_DEPOSIT` · `deposit_due_at` 포함) · `myr_shipping_fee`(platform_settings `myr_shipping` 50,000/3,000) · `myr_app_create_checkout`(줄 합치기 · listed/옵션/단가/잔여 검증 · 한 줄이라도 미달이면 `LINES_REJECTED items[]` · supersede) · `myr_app_claim_checkout` · `myr_app_confirm_checkout`(상품 행 id 순 `for update` · DONE → PAID · WAITING_FOR_DEPOSIT → WAITING_DEPOSIT + 재고 예약) · `myr_app_deposit_done/expire/due` · `myr_expire/stale/purge_*` · `myr_app_guest_token_issue/verify/lookup` · 0021 `purge_checkout_pii` 가 `myr_orders` 도 보게 재정의 · sold_qty 트리거(줄 + 주문 상태). **샵**: `lib/checkout-rules.ts`(순수 · 검증·파서·문구) · `lib/server/{toss,checkout-sync,customers,cron,rate-limit}.ts`(셀러리 복사) · `/api/checkout` · `/api/payments/confirm`(회원 user_id · 비회원 `myr_gck` 쿠키 · 성공 시 계정 장바구니 비움 · 비회원 토큰 쿠키 `myr_guest_<code>`) · `/api/payments/webhook` · `/api/cron/reconcile`(`vercel.json` 10분) · `/checkout`(토스 결제위젯 `PaymentWidget.svelte` · 비회원 이메일·동의) · `/checkout/success`(confirm 1회 · 입금 안내) · `/checkout/fail`(본인 PENDING 종결). 확인: pgTAP 101 · vitest · 로컬 브라우저로 비회원 담기 → 체크아웃 → 세션 생성(35,000 = 32,000 + 배송비) → 위젯 렌더 → confirm/webhook/cron/fail 랜딩을 API 로 검증(토스 시크릿이 로컬에 없어 승인은 `CONFIG_ERROR` 로 FAILED 되는 것까지). **남은 것**: 토스 테스트 키 리허설(카드 · 간편결제 · 두 셀러 담아 결제 · 가상계좌 입금 콜백) — Vercel `myr-shop` 에 `TOSS_SECRET_KEY` `PUBLIC_TOSS_CLIENT_KEY` `CRON_SECRET` + 토스 웹훅 URL 등록 뒤(docs/deploy.md MYR 표) · PAID 뒤 토스 콘솔 취소는 줄 환불 RPC(다음 마이그레이션) 전까지 payment_events 운영 큐(`needs_manual_adjust`) · 주문 확인 메일 없음 | 마이그레이션 1개 · pgTAP 101 · 라우트 4 · 화면 3 |
| M4 샵 | `apps/myr-shop` 생성(홈 · `/p/[code]` · 장바구니 · 로그인 · 체크아웃 · 결제 API · 웹훅 · reconcile · 주문 조회) + 0057 `myr_checkouts` `myr_checkout_items` `myr_orders` `myr_order_items`(가상계좌 상태·컬럼 포함) · 다중 줄 결제 RPC · 줄 단위 환불 RPC(actor 한 벌 · 부분 취소) · `refund.server.ts` `checkout.server.ts` | 앱 1 · 마이그레이션 1개 · 토스 테스트 키 리허설(카드 · 간편결제 · 가상계좌 입금 콜백 · **두 셀러 담아 한 줄만 환불**) |
| M4-UI(선행) · **2026-10-29 완료** | 디자인(Claude Design "MYR Shop" 프로젝트 파일 `MYR Shop.dc.html` 2026-10-28 판) 을 **목 데이터로 화면만** — `apps/myr-shop`: `/` 홈 · `/category?cat=&creator=` · `/p/[code]` · `/cart` · `/checkout` · `/checkout/done` · `/my` · 탭바 · 토스트. 장바구니·찜·주문자·목 주문은 `localStorage`(`myr-shop-v1` · `lib/state.svelte.ts`), 데이터는 `lib/data.ts`. 결제 수단 칸은 디자인 그림(§6.7 위젯 자리) · 포인트 칸은 뺌(§9-12) · 뒤로가기는 `lib/nav.ts`(앱 안에서 온 길이 없으면 홈). **2차(같은 날 · "MYR Shop PC" 2026-10-29 판)**: 상세페이지 섹션 — 레시피 노트 → 01 왜 만들었나(스토리 + 숫자 포인트 3) → 02 성분표(성분·이유·함량) → 03 섭취법(3스텝) → 04 제품 정보(스펙 + 표) → 05 FAQ → 함께 보면 좋은 레시피 — 모바일·PC 공통(인플루언서 상품 등록 템플릿 = `Detail` 타입 · 민지 젤리·하루 콜라겐만 실제 문구, 나머지는 `genericDetail`) + **PC(lg≥1024) 반응형**: 상단 내비(`SiteHeader`) · 홈 2단 히어로 + "이번 주 레시피" · 카테고리 사이드바 · 상세 2단 + sticky 구매 패널 · 장바구니/결제 2단 + sticky 요약 · 마이 2단 | 앱 골격 · 컴포넌트 · 테마(`app.css` 토큰은 `apps/myr` 와 같은 값) · `npm run dev:myr-shop`(5178) |
| M5 인플루언서 콘솔 2 | 주문(내 줄 열람 · 줄 환불) · 문의(0058 `myr_cs_*`) · 메일 훅 | 마이그레이션 1개 |
| M6 운영 콘솔 2 · 실적 | admin 주문표 · **운송장 · 발주서 · 교환 발송**(물류센터) · 문의 열람 · 환불 대행 · 인플루언서 `/sales`(줄 기준) · `seller_margin_rate` 스냅샷 | |
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
