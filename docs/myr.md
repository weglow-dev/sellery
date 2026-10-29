# MYR(Make Your Recipe) 전체 구현 방향 — apps/myr · myr-shop · myr-influencer · myr-admin

> **상태(2026-10-28): 방향 결정 문서. 구현 전.** "Make Your Recipe(MYR)" 로 만든 인플루언서 PB 제품을 **한 샵에서 모아 팔고, 인플루언서가 자기 제품의 등록·판매실적·CS 를 직접 맡고, 운영팀이 검수해 샵에 오픈하는** 구조를 정한다. 셀러리(캠페인 모델)의 결제·주문·CS 코드를 **복사해 쓰되 import 로 섞지 않는다** — MYR 이 완성되면 셀러리 쪽 앱·기능은 쓰지 않게 될 전망이라, 나중에 셀러리 폴더만 지워도 MYR 이 남도록 경계를 둔다.
>
> 근거(저장소 안): `apps/shop/src/routes/{api,checkout,cs,orders,account}/**` · `packages/payments/src/server/*` · `packages/db/src/server/{brand,partner,admin}/*.server.ts` · `supabase/migrations/{0004,0005,0008,0015,0018,0020,0021,0041}` · `docs/branding-plan.md`(랜딩 `apps/myr`) · `docs/brand-console-plan.md` · `docs/admin-console-plan.md`(콘솔 골격) · `docs/deploy.md`(외부 서비스 등록).
>
> 이 문서가 정하지 않는 것: 디자인(MYR 랜딩의 다크·앰버 테마를 따를지), 도메인 이름, 정산 요율 숫자. §9 열린 결정.

---

## 0. 결정 요약

| # | 결정 | 이유 |
|---|---|---|
| 1 | **앱 4개** — `apps/myr`(랜딩 · 기존) · `apps/myr-shop`(고객 샵) · `apps/myr-influencer`(인플루언서 콘솔) · `apps/myr-admin`(운영 콘솔). 각각 Vercel 프로젝트 1개, **도메인은 새로 연다**(§2) | 셀러리 4앱(`shop` `influencer` `brand` `admin`) 과 이름·배포·도메인을 완전히 분리. 셀러리 `apps/admin` 에 탭을 얹지 않는다. |
| 2 | **판매 단위 = 상품.** 캠페인 테이블을 만들지 않는다. `myr_products.seller_id`(not null) 가 주인이고, 주문·문의는 그 값을 복사해 가진다 | MYR 은 "나만 팔 수 있는 내 레시피 제품" — 상품 하나에 셀러 하나. 셀러리의 캠페인은 "같은 상품을 여러 인플루언서가 기간을 나눠 파는" 문제를 풀려고 있었고 MYR 엔 그 문제가 없다. 셀러 한 명이 상품 여러 개는 당연히 된다(1:N). |
| 3 | **`seller_id` 는 폼 값이 아니라 세션 값.** 상품 등록은 `requireSeller()` 가 돌려준 `seller.id` 로 서버가 insert · 체크아웃은 `product_id` 만 받고 서버가 `products.seller_id` 를 세션·주문에 복사 · 문의도 같다 | 브랜드 콘솔이 `brand_id` 로 하는 방식 그대로. 클라이언트가 보낸 소유자 값은 받지 않는다 → 남의 상품·주문·문의는 URL 을 바꿔도 안 보인다. |
| 4 | **상품 등록은 인플루언서가 한다**(가격 · 소개글 · 이미지 · 옵션 · 판매/일시중지). 등록 직후 상태는 `pending` 이고 **운영팀 검수(`listed`) 를 통과해야 샵에 보인다.** 반려는 사유 필수 | 셀러리 `products.status` 게이트(0002 · `app_admin_review_product` 0015) 와 같은 패턴. 표시광고·건기식 문구는 사람이 봐야 한다. |
| 5 | **같은 Supabase 프로젝트(`sellery`), 새 테이블**(`myr_` 접두사 · 함수 `myr_app_*`) · 공유하는 것 = `auth` · `profiles` · `sellers` · `customers` · `payment_events` · 비회원 토큰 RPC(0021) · `platform_settings` | 로그인·고객·토스 키·지급대행을 둘로 나누지 않는다. 셀러리 전용 테이블(`campaigns` `orders` `cs_conversations` …)은 건드리지 않는다. |
| 6 | **결제·주문 코드는 그대로, SQL 함수만 다시.** `/api/checkout` `/api/payments/{confirm,webhook}` `/api/cron/reconcile` · `toss.server.ts` · `checkout-sync` 흐름 · `checkout_sessions` 상태 기계는 복사. `app_confirm_checkout` · `app_checkout_reserved` · `app_refund_precheck` 를 상품 축으로 재작성, `campaign_card` → `myr_product_card` | 결합은 "무엇을 검사하느냐"(캠페인 LIVE·기간·배정 재고 → 상품 listed·stock) 뿐이고 전부 DB 함수 안에 있다. |
| 7 | **CS·환불은 인플루언서가 한다.** 문의함 · 스레드 · 답변 · 종료 · 환불(발송 전 전액) 을 `seller_id` 게이트로. 발송 뒤 환불·교환은 1차에서 **CS 스레드로 처리 + 재발송 운송장 1칸**(§6.4) | 브랜드 콘솔 `cs.server.ts` · `brand-refund.server.ts` 를 `brand_id → seller_id` 로 복사. 셀러리에도 교환 상태 기계는 없다. |
| 8 | **발송(운송장) 주체는 미정** — 1차는 인플루언서 콘솔 "주문" 탭에 운송장 단건/CSV 등록을 넣고, MYR 물류센터가 맡게 되면 `myr-admin` 으로 옮긴다 | 랜딩은 "MYR 물류센터" 를 말하지만 운영 방식이 확정되지 않았다(§9). 기능은 브랜드 콘솔 `orders.server.ts` 복사라 어느 쪽에 둬도 비용이 같다. |
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
  │                                                                     주문 → 토스 결제 → myr_orders(seller_id)
  ├ 주문 탭: 미발송 → 운송장 등록(단건/CSV) ─────────────────────────▶ 배송 시작 메일
  ├ 문의 탭: 고객 문의(seller_id) 답변·종료 ◀──────────────────────── /cs/new?product=<code>(&order=)
  ├ 환불: 발송 전 전액(토스 취소) · 발송 뒤 CS 처리    열람·환불 대행     고객 셀프 환불(발송 전) /api/payments/cancel
  └ 실적 탭: 매출·환불·순매출·상품별 집계
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

myr_checkout_sessions   ← 0008 checkout_sessions 와 동일 컬럼, campaign_id → product_id · seller_id
myr_orders              ← 0004 orders 와 동일 컬럼, campaign_id → product_id · seller_id
                          status('WAITING_DEPOSIT'|'PAID'|'REFUNDED'|'CANCELED') · deposit_due_at(§6.7 가상계좌)
                          + exchange_courier · exchange_tracking_no · exchange_shipped_at(§6.4)
                          + seller_margin_rate 스냅샷 · refund_amount(0050 의 것) · delivered_at(0049)
myr_cs_conversations    ← 0005 cs_conversations, brand_id → seller_id · campaign_id → product_id
myr_cs_messages         ← 0005 cs_messages, sender('customer'|'seller'|'admin')
```

RLS: 전부 `revoke all from anon, authenticated` · service role 만. 고객 공개 읽기는 `myr_product_card(code)` · `myr_home_products()` RPC(security definer · anon 실행 허용) 로만 — `products` 의 공개 grant 열 목록(0002) 과 같은 원칙으로 재고·마진·반려 사유는 내지 않는다. 주문 본인 조회는 `myr_orders_select_own`(`auth.uid() = user_id`) 요약 컬럼만(0004 와 동일).

RPC(전부 `{ok, code}` 반환 · 서버 전용):

| 영역 | 함수 | 원본 |
|---|---|---|
| 상품 | `myr_app_upsert_product(seller, …)` · `myr_app_set_product_status(seller, code, 'listed'|'paused')` · `myr_app_submit_product(seller, code)`(rejected → pending) | 0015 `app_brand_upsert_product` |
| 검수 | `myr_app_admin_products(status?)` · `myr_app_admin_review_product(id, 'approve'|'reject', reason)` · `myr_app_admin_force_status` | 0015 `app_admin_review_product` |
| 공개 | `myr_product_card(code)` · `myr_home_products(category?)` | 0003/0008 `campaign_card` |
| 결제 | `myr_app_checkout_reserved(product_id)` · `myr_app_claim_checkout` · `myr_app_confirm_checkout`(products 행 `for update` · listed · stock − sold_qty ≥ qty · 가상계좌면 `WAITING_DEPOSIT` 주문 §6.7) · `myr_app_deposit_done(order)` · `myr_app_deposit_expire(order)` | 0008 (+ 가상계좌 신규) |
| 환불 | `myr_app_refund_precheck(order_id, actor, actor_id)` · `myr_app_refund_record(order_id, actor, …)` — **한 벌.** actor 별 가드: customer = 본인 · 발송 전 / seller = 내 상품 · 발송 뒤 허용 / admin = 전부 | 0008 · 0018 · 0020 을 합침 |
| 주문 | `myr_app_orders(actor, actor_id, filter)` · `myr_app_order(actor, actor_id, code)` · `myr_app_ship_order(actor, actor_id, code, courier, tracking)` · `myr_app_ship_orders`(CSV) · `myr_app_exchange_ship` · `myr_app_po_rows` — seller 는 `seller_id = actor_id` 행만, admin 은 전부 | 0018 `app_brand_*` · 0020 `app_admin_orders` 를 합침 |
| CS | `myr_app_cs_open(product_id, …)`(0041 소유 증명 그대로) · `myr_app_cs_thread(actor, …)`(customer = client_token · seller = 내 것 · admin = 전부) · `myr_app_cs_reply(actor, actor_id, …)`(customer 추가 문의 · seller 답변 · admin 대행 답변 `sender='seller'`) · `myr_app_cs_list(actor, actor_id, status?)` · `myr_app_cs_close(actor, …)` | 0018 · 0041 · 0020 을 합침 |
| 실적 | `myr_app_seller_sales(seller)` — gross · refunds · net · 상품별 · 예상 정산액 = net × margin · admin 은 `myr_app_admin_sales(seller?)` 로 같은 집계 | 0013 `app_seller_sales` 의 축소판 |
| 비회원 | 기존 `app_guest_customer_upsert` · `app_guest_order_*` 를 그대로 호출(주문 테이블이 달라 `myr_` 변형 필요하면 그때) | 0021 |

### 3.1 단일 함수 원칙 (결정 12) — 동작 하나 = 패키지 함수 하나 = SQL 함수 하나

| 동작 | 패키지 함수(한 곳) | SQL | 부르는 앱 · actor |
|---|---|---|---|
| 토스 승인 · 취소 · 조회 | `packages/payments/src/server/myr/toss.server.ts`(기존 `toss.server.ts` 그대로) | — | 전부(간접) |
| 체크아웃 세션 · 승인 확정 · 복구 | `payments/server/myr/checkout.server.ts` — `createCheckout` · `confirmCheckout` · `syncFromToss` | `myr_app_claim/confirm_checkout` · `myr_app_deposit_*` | shop(고객 · 웹훅 · reconcile) |
| 환불 | `payments/server/myr/refund.server.ts` — `refundOrder({ actor, actorId, orderCode, reason })` 하나. 토스 취소 Idempotency-Key 는 `${order.id}` 고정(actor 와 무관 · 같은 주문의 두 번째 호출은 토스가 ALREADY_CANCELED) | `myr_app_refund_precheck/record` | shop `/api/payments/cancel`(customer) · influencer `/orders ?/refund`(seller) · admin `/orders/[code] ?/refund`(admin) |
| 운송장 · 교환 발송 · 발주서 | `db/server/myr/orders.server.ts` — `listOrders` · `shipOrder` · `shipOrdersCsv` · `exchangeShip` · `poRows`(전부 `{ actor, actorId }` 첫 인자) | `myr_app_orders/ship_*` | influencer(seller) · admin(admin) |
| 문의 | `db/server/myr/cs.server.ts` — `openCs`(고객만) · `listCs` · `getCsThread` · `replyCs` · `closeCs`(`{ actor, actorId \| clientToken }`) | `myr_app_cs_*` | shop(customer) · influencer(seller) · admin(admin) |
| 상품 | `db/server/myr/products.server.ts` — `upsertProduct`(seller) · `setProductStatus({ actor })`(seller = listed↔paused · admin = 전부) · `reviewProduct`(admin) · `productCard` · `homeProducts`(anon) | `myr_app_*product*` | influencer · admin · shop |
| 메일 훅 | `db/server/myr/mail-events.server.ts` — `notifyOrderPaid/Shipped/Refunded/ExchangeShipped/DepositPending` · `notifyCsOpened/Replied` | — | 위 함수들이 내부에서 호출 — 앱이 직접 부르지 않는다 |
| 게이트 | 기존 `requireSeller()` · `requireAdmin()` · `safeGetSession` → actor 결정은 **라우트가** 한다(`seller.id` · `user.id` · 비회원 토큰) | — | 각 앱 |

규칙: SQL 함수 안에서 `p_actor` 로 분기하고 권한 미달은 `{ok:false, code:'FORBIDDEN'}`. 라우트는 actor 를 세션에서만 만든다(클라이언트가 보낸 actor 값은 받지 않는다). HTTP 엔드포인트가 꼭 필요한 것(토스 웹훅 · `DEPOSIT_CALLBACK` · 크론 reconcile/tracking) 은 **`myr-shop` 한 곳**에만 두고, influencer/admin 은 같은 패키지 함수를 서버 load/action 에서 직접 호출한다. 앱 사이 HTTP 호출은 하지 않는다(다른 도메인이라 CORS·세션 전달이 생기고, 같은 DB 를 service role 로 쓰므로 이득이 없다).

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
| 주문 | `/orders` | 주문표 · 운송장 단건/CSV · 발주서 · 환불(발송 전) · 교환 재발송 운송장 | `apps/brand/(console)/orders` |
| 문의 | `/cs` `/cs/[code]` | 문의함(OPEN → ANSWERED → CLOSED) · 답변 · 종료 | `apps/brand/(console)/cs/*` |
| 실적 | `/sales` | 기간별 매출·환불·순매출 · 상품별 · 예상 정산액 | `apps/influencer/(console)/sales` 축소 |
| 내 정보 | `/my` | 프로필(핸들 · 아바타 · 소개) · 정산 계좌 · 알림 이메일 | `apps/influencer/(console)/my` |

게이트: `requireSeller()` 그대로(`sellers.user_id and active`). 도메인이 분리되므로 `foreign` 상태는 "파트너 아닌 세션" 하나로 줄어든다.

PII: 브랜드 콘솔 응답을 복사하면 수취인 실명·연락처·주소 원문이 포함된다 — **1차는 인플루언서가 발송·CS 를 맡으므로 원문을 보여준다**(결정 8 에 따라 발송이 물류센터로 가면 주소는 마스킹으로 되돌린다). 열람 로그는 `sensitive_access_log`(0013) 재사용.

### 4.3 `apps/myr-admin` (운영)

| 경로 | 내용 | 원본 |
|---|---|---|
| `/login` | 이메일 로그인 · `requireAdmin()`(`profiles.role='admin'`) | `apps/admin` |
| `/home` | 검수 대기 수 · 오늘 주문 · 미답변 문의 | |
| `/products` `/products/[code]` | 검수 대기 목록(pending 우선) · 상세(이미지 · 문구 · 옵션 · 셀러) · 승인/반려(사유) · listed/paused 강제 전환 | `apps/admin` 상품 검수(파트너 관리) 패턴 |
| `/orders` `/orders/[code]` | 열람 · 환불 대행(`actor='admin'`) | `apps/admin/(console)/(money)/orders` |
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

### 6.2 체크아웃 가드
`listed` 이고 `stock − sold_qty − 예약(미만료 PENDING 세션 qty 합) ≥ qty` · 단가 = `options[optionIndex].price`(서버 값) · qty 1..10 · 금액 ≥ 100. 그 외(멱등 선점 · 불명 재조회 · 자동 취소 · 비회원 쿠키 · 레이트리밋) 는 0008 과 `apps/shop` 라우트 주석 그대로.

### 6.3 환불
- 고객 셀프: 발송 전 · PAID · 전액 → 토스 취소 → `myr_app_refund_record(actor='customer')` → 환불 메일.
- 인플루언서: `myr_app_seller_refund_precheck(seller_id, code)`(소유 · PAID) → 같은 취소·기록 경로(Idempotency-Key `${order.id}:seller`). **발송 뒤도 허용**(회수 확인은 인플루언서 판단 · 기록에 `after_ship`).
- 운영 대행: `actor='admin'` · 같은 경로.
- 부분 환불은 1차 없음(토스 콘솔 부분취소는 0008 과 같이 운영 큐).

### 6.4 교환(1차 최소안)
문의 유형 '교환·반품' 스레드에서 처리. 인플루언서가 재발송하면 주문 탭에서 `exchange_courier` · `exchange_tracking_no` 입력 → 고객 주문 상세에 "교환 발송" 줄 + 메일. 주문 `status` 는 바꾸지 않는다(PAID 유지). 상태 기계(`EXCHANGE_REQUESTED → EXCHANGED`) 는 운영해 보고 필요하면 2차.

### 6.5 메일(Resend · 기존 템플릿)
주문 확인(고객 + **셀러** `sellers.email`) · 배송 시작 · 환불 완료 · 교환 발송 · 문의 접수(셀러) · 문의 답변(고객). `mail-events.server.ts` 복사본에서 `brands.email → sellers.email`. 발신은 MYR 도메인 인증 전까지 `noreply@sellery.life`.

### 6.6 소유 증명(문의 ↔ 주문)
0041 그대로: 회원 `user_id` · 고객 행 `customer_id` · 비회원 조회 토큰(`app_guest_order_verify`) 중 하나가 맞을 때만 `order_id` 연결. 증명 못 하면 `order_code` 원문만 남기고 콘솔에 "(미확인)".

### 6.7 결제수단 · 가상계좌
- 결제 UI 는 **토스 결제위젯**(`@tosspayments/tosspayments-sdk` · `CheckoutClient.svelte` 복사) 이라 결제수단 목록은 코드가 아니라 **토스 개발자센터의 위젯 UI 설정 + 가맹점 계약**이 정한다. 카드 · 간편결제(토스페이 · 네이버페이 · 카카오페이 등) · 계좌이체 · 휴대폰은 거기서 켜면 바로 뜨고, 승인 흐름은 수단과 무관하게 같다. 주문에는 토스가 돌려준 `method` 가 `payment_method` 로 저장된다. 배치는 `PUBLIC_TOSS_WIDGET_VARIANT`.
- **가상계좌는 셀러리가 거부한다**(`WAITING_FOR_DEPOSIT` → 즉시 취소 · `VIRTUAL_ACCOUNT_NOT_SUPPORTED` · 0009). "승인 즉시 DONE" 전제로 주문을 만들기 때문. MYR 은 **처음부터 열어 둔다**(건기식·식품은 가상계좌 비중이 있다):
  - `myr_orders.status` 에 `WAITING_DEPOSIT` 추가 · `deposit_due_at`(토스 `virtualAccount.dueDate`) · 가상계좌 번호·은행은 `raw_payment` 에.
  - `myr_app_confirm_checkout`: 승인 결과가 `WAITING_FOR_DEPOSIT` 이면 주문을 `WAITING_DEPOSIT` 으로 만들고 **재고는 예약**(sold_qty 계산에 포함 · 입금 전 품절 방지). 성공 페이지는 입금 계좌·기한을 보여주고 입금 안내 메일(`notifyDepositPending`).
  - `/api/payments/webhook` 의 `DEPOSIT_CALLBACK`(수신 분기는 셀러리에 이미 있다 · `source='deposit_callback'`) → `myr_app_deposit_done` → `PAID` · `paid_at` · 주문 확인 메일. 상태 `CANCELED`(기한 만료) → `myr_app_deposit_expire` → `CANCELED` · 재고 반환.
  - reconcile 크론이 `WAITING_DEPOSIT` 이고 `deposit_due_at` 지난 주문을 토스 재조회로 종결한다(웹훅 유실 대비).
  - 환불 가드: `WAITING_DEPOSIT` 은 "취소"(토스 취소 호출 없이 상태만) · `PAID` 이후는 §6.3. 셀러 주문표·실적은 `WAITING_DEPOSIT` 을 매출에 넣지 않는다.
- 1차에 가상계좌를 미루더라도 **상태값과 컬럼은 M4 스키마에 넣어 둔다** — 나중에 열 때 마이그레이션 없이 위젯 설정 + 함수 분기만 추가하면 된다.

---

## 7. 단계 (PR 순서)

| 단계 | 내용 | 산출 |
|---|---|---|
| M0 도메인·외부 등록 | 도메인 결정 · Vercel 프로젝트 3개 · Supabase Redirect URLs · 카카오 사이트 도메인 · 토스 웹훅 · (Resend 도메인) — §2.1 | docs/deploy.md MYR 열 |
| M1 스키마 | 0056 `myr_products` · 상품/검수 RPC · `myr_product_card` · `myr_home_products` | 마이그레이션 1개 · `gen:types` |
| M2 인플루언서 콘솔 1 | `apps/myr-influencer` 생성(가입·로그인·홈·상품 등록/수정/토글) | 앱 1 |
| M3 운영 콘솔 1 | `apps/myr-admin` 생성(로그인 · 상품 검수) | 앱 1 |
| M4 샵 | `apps/myr-shop` 생성(홈 · `/p/[code]` · 로그인 · 체크아웃 · 결제 API · 웹훅 · reconcile · 주문 조회) + 0057 `myr_checkout_sessions` `myr_orders`(가상계좌 상태·컬럼 포함) · 결제 RPC · 환불 RPC(actor 한 벌) · `refund.server.ts` `checkout.server.ts` | 앱 1 · 마이그레이션 1개 · 토스 테스트 키 리허설(카드 · 간편결제 · 가상계좌 입금 콜백) |
| M5 인플루언서 콘솔 2 | 주문(운송장 · 발주서 · 환불 · 교환 발송) · 문의(0058 `myr_cs_*`) · 메일 훅 | 마이그레이션 1개 |
| M6 운영 콘솔 2 · 실적 | admin 주문/문의 열람 · 환불 대행 · 인플루언서 `/sales` · `seller_margin_rate` 스냅샷 | |
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
9. **발송 주체** — 인플루언서 직접 vs MYR 물류센터(결정 8).
10. **결제수단 범위** — 1차에 켤 수단(카드 · 간편결제 종류 · 계좌이체 · 가상계좌 · 휴대폰). 간편결제·휴대폰·가상계좌는 토스 가맹점 계약에 포함돼야 위젯에 뜬다(§6.7). 가상계좌를 1차에 켤지, 상태·컬럼만 준비하고 미룰지.
