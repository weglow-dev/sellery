# 셀러리 Supabase 스키마 — 설계 노트 (프로토타입 → 테이블 매핑 · 열거형 · 이탈 사항)

- 산출물: `supabase/migrations/0001_init.sql` … `0006_storage.sql`, `supabase/seed.sql` (사람용 요약은 `docs/data-model.md`)
- 입력: `docs/analysis/data-model-extracted.md`(이하 DM), `docs/analysis/flows-and-invariants.md`(FL), `docs/analysis/access-model.md`(AM), glo 마이그레이션 0001/0008/0009/0010/0012/0013/0014/0015, OLD/index.html 직접 확인, 1차 리뷰 findings(2026-09-15 반영 — §6).
- 검증: 로컬 DB 없음. libpg_query(PG17 파서)로 7개 파일 전부 파싱 통과(문법), AST 로 FK 생성 순서·인덱스/정책/grant/트리거 대상·시드 insert 컬럼명·값 개수 검사 통과. **실제 실행은 아직 안 됨** — 아래 §5 "실행 시 확인" 참고.
- "추정" 표시가 없는 항목은 프로토타입 코드에서 확인한 사실에 근거한다.

## 0. 파일 구성

| 파일 | 테이블 / 객체 |
|---|---|
| 0001_init.sql | `set_updated_at()`, `profiles` + `handle_new_user()`/`on_auth_user_created`, `app_role()`, `platform_settings`, `grade_tiers`, `brand_grade_tiers`, `grade_for_sales()`, `brand_grade_for_gmv()`, `categories`, `brands`, `sellers` (+ `sellers_sync_grade` 트리거, `seller_is_public()`), `seller_channels` |
| 0002_products.sql | `products`, `exclusive_requests`, `product_views` |
| 0003_campaigns.sql | `campaign_code_seq`, `campaigns` (+ `campaigns_fill_brand` 트리거, 활성 쌍 부분 유니크), 0001/0002 공개 정책의 최종본 교체(products·brands), `campaign_card(text)` RPC, `campaign_events` |
| 0004_orders_settlements.sql | `customers`, `order_code_seq`, `orders` (+ `orders_sync_sold_qty` 트리거, `recalc_campaign_sold_qty()`), `brand_gmv()`, `settlements`, `payouts` |
| 0005_points_referral_cs.sql | `celery_ledger`, `celery_balances`(뷰), `celery_purchases`, `data_views`, `referral_earnings`, `seller_external_sales`, `cs_code_seq`, `cs_conversations`, `cs_messages` |
| 0006_storage.sql | Storage 버킷 `public-assets`(공개) · `partner-docs`(비공개) |
| seed.sql | 정책 상수 · 등급 · 카테고리 · b1~b2 · s1~s8 · ch1~ch9 · p1~p10 · c1~c13 · 주문 1,052건 · 스레드 23건 · 원장 · 열람/독점/조회/외부판매 · 추천 보상 · CS |

공통 관례: uuid PK + `code text unique`(프로토타입 id 보존 — campaigns/orders/cs_conversations 는 `not null` + 시퀀스 기본값), KRW `integer`(누적·정산 라인은 `bigint`), 비율 `numeric(5,4)` + `check 0..1`, 상태 `text + check`, 날짜 `date`(판매 기간·정산 기준일) / `timestamptz`(이벤트·실행 시각), `jsonb`(옵션·이벤트 payload·결제 원문·계좌), 모든 테이블 RLS ON + `revoke all from anon, authenticated`, 공개 컬럼만 `grant select (…)` + select 정책, insert/update 정책 없음(서버 service role 전용), 서버 전용·트리거 함수는 `revoke all on function … from public, anon, authenticated`.

## 1. 컬렉션·필드 매핑 (DM §0.1 의 19개 키 전수)

표기: **derived** = 파생값이라 저장하지 않음 / **app-only** = 브라우저·UI 상태라 DB 대상 아님 / **dropped** = 데드코드·미사용이라 미이관.

### 1.1 brands → `brands`

| 프로토타입 | 컬럼 | 비고 |
|---|---|---|
| id `'b1'` | `code` (+ `id uuid`) | 시드 uuid `b0000000-0000-4000-8000-00000000000N` |
| name | `name` | |
| cat | `category` check('건강기능식품','이너뷰티') | CATMAP 키. 시드 b2 `'이너뷰티·피부'` → `'이너뷰티'` 로 정규화 (DM §8-5 불일치 해소) |
| manager | `manager_name` | 비공개 |
| email | `email` | 비공개. `lower(email)` 부분 유니크 인덱스 (DM §4 자연 키) |
| settleInfo.bank/account/holder | `bank_info jsonb {bank,account,holder}` | glo 0012 `sellers.bank_info` 와 동일 형태. 은행 목록(DM §3.12)은 앱 검증 |
| settleInfo.bizNo | `biz_no` | 유니크. **anon grant 대상 아님** — 판매 인증 모달(L4414)은 캠페인 단위 `campaign_card()` 로 받는다 |
| settleInfo.mailOrder | `mail_order_no` | 위와 같음 |
| settleInfo.bizDoc | `biz_doc_url` | Storage `partner-docs`(비공개 버킷) object path 만 저장 — 0006 |
| gmvBase | `gmv_base bigint` | 이관 전 누적 GMV. 누적 GMV 는 `brand_gmv(id)` 함수 = gmv_base + Σ PAID 주문 |
| logo | `logo_url` | 시드는 프로토타입 svg data-URI 그대로 (짧음). 실서비스는 `public-assets` 버킷 |
| refCode | `ref_code unique` | |
| autoPropose | `auto_propose` | |
| referredBy | `referred_by → brands` | |
| freeRefUsed `{YYYY-MM:n}` | `free_ref_used jsonb` | 그대로 |
| celeryItems `{datapass: date}` | → `celery_purchases`(owner_type='brand') | 별도 테이블로 정규화 (AM §2.8 권장) |
| sampleExtra (brand) | **dropped** | `buyItem('sample')` 분기는 SHOP 에 항목이 없는 데드코드 (DM §8-15) |
| (없음) `autoPO {on,email}` 전역 | `po_enabled`, `po_email` | 전역 단일 객체 → 브랜드별 컬럼 (DM §8-2, **추정**) |
| (없음) | `user_id → auth.users`, `grade`(캐시), `active` | grade = `brand_grade_for_gmv(brand_gmv(id))` 를 서버가 주문/정산 시 재계산(시드는 마지막 update 로 채움). `active` 는 공개 정책용 (glo 0014 패턴, **추정**). `user_id` 연결은 관리자 승인 신청 흐름(glo 0013)으로만 — 이메일 일치 자동 연결 없음 |

### 1.2 sellers → `sellers`, sellers[].channels → `seller_channels`

| 프로토타입 | 컬럼 | 비고 |
|---|---|---|
| id `'s1'` | `code` | uuid `a0000000-…-00000000000N` |
| name / handle / email | `name` / `handle unique` / `email`(비공개, `lower(email)` 부분 유니크) | |
| platform | `platform` check(instagram,youtube,naver,tiktok) | 메인 채널과 동기화는 앱(L3963) |
| settleInfo.type | `settle_type` check(personal,biz) nullable | `biz ⇒ biz_no not null` 체크 제약 (FL §10-16). **null(미등록) 은 원천징수 3.3% 대상** — `sellerWht` L1656 은 biz 만 0 |
| settleInfo.bank/account/holder | `bank_info jsonb` | |
| settleInfo.bizNo / bizDoc | `biz_no` / `biz_doc_url`(`partner-docs` object path) | |
| img | `avatar_url` | 시드 s1 은 AV1(jpeg data-URI) 대신 코드의 폴백 `'assets/av-s1.svg'` (L1241 삼항의 else 값) |
| followers / cat / intro | `followers` / `category → categories` / `intro` | |
| likesAvg / recentLikes | `likes_avg` / `recent_likes integer[]` | growthOf 는 앱 계산 |
| m3Sales | `m3_sales bigint` | 저장값. 정산 시 서버가 증분(L4256). 롤링 90일 집계로의 전환은 **추정** 후속 과제 |
| (derived) gname | `grade`(캐시) | `sellers_sync_grade` 트리거가 `m3_sales` insert/update 마다 `grade_for_sales()` 로 재계산. 공개 grant 대상 (AM §3.3) |
| refCode / referredBy | `ref_code unique` / `referred_by → sellers` | |
| hidden | `hidden` | **anon grant 대상 아님**(열거로 ○○○ 카드와 실제 행을 짝지을 수 있어서). 정책은 `active and not hidden` 을 직접 쓰지 않고 `seller_is_public(id)`(security definer) 를 호출해 grant 여부와 무관하게 안전하다(§3-20·§4, 2차 리뷰) |
| channels[] | `seller_channels` | 아래 |
| celeryItems | → `celery_purchases`(owner_type='seller') | |
| sampleExtra | `sample_extra` | 읽기(sampleLeft L1460)는 살아 있으므로 컬럼 유지, 증가 경로는 데드코드 |
| (없음) | `user_id`, `active` | |

channels[]: `id 'ch1'`→`code`, `platform`, `handle`, `url`, `followers`, `verified`, `primary`→`is_primary`, `vcode`→`vcode`(인증 완료 시 null). 제약: 판매자당 primary 1개(부분 유니크, FL §10-14), `(platform, handle)` 유니크(DM §4 자연 키). **`is_primary ⇒ verified` 체크는 두지 않는다** — 메인 채널의 핸들/플랫폼을 수정하면 `verified=false` 가 되면서 primary 는 유지되고(L3944), primary 는 삭제 불가(L3954)이므로 체크가 있으면 채널 1개인 인플루언서는 메인 채널을 수정할 수 없다. "인증된 채널만 메인으로 설정"(L3961)은 `setPrimaryCh` 서버 액션의 가드. 채널 공개 정책은 `verified and seller_is_public(seller_id)` — 부모가 hidden 이면 채널(핸들·URL = 신원)도 숨긴다.

### 1.3 products → `products`

| 프로토타입 | 컬럼 | 비고 |
|---|---|---|
| id / brandId / name / desc / em | `code` / `brand_id` / `name` / `description` / `emoji` | uuid `d0000000-…-0000000000NN` |
| thumb / imgs[] | `thumb_url` / `image_urls text[]` | data-URI → `public-assets`. 최대 4장은 앱 검증 |
| cat | `category → categories` | `createProduct` 기본값 `'건기식'`(CATS 밖, DM §8-5)은 FK 로 거부됨 — 앱에서 유효 카테고리 필수 |
| cp / gp / rate | `consumer_price` / `sale_price` / `commission_rate numeric(5,4)` | rate 하한 0.05 는 앱(L4291); DB 는 0..1 만 검사 |
| sample / stock | `sample_text` / `stock` | |
| status | `status` check(pending,listed,paused,rejected) | 정확히 프로토타입 값 |
| rejectReason | `reject_reason` | `rejected ⇒ not null` 체크 |
| t {g,note} | `trend jsonb` | 표시용 |
| exclusive.grade / label | `exclusive_grade → grade_tiers` / `exclusive_label` | `exclusive_grade in (블랙,다이아,플래티넘,골드)` 체크 — 오퍼 선택지는 `GRADES.slice(0,4)` (L3759) |
| exclusive.min | **dropped** | 읽기 폴백만 있는 레거시(DM §8-14). `exGradeOf` 는 grade 컬럼만 보면 됨 |
| exclusiveSellerId | `exclusive_seller_id → sellers` | |
| samplePolicy.freeGrade/buyMode/fixedPrice/refund | `sample_free_grade` / `sample_buy_mode` check(auto,fixed) / `sample_fixed_price` / `sample_refund` | 네 컬럼 **전부-또는-없음** 체크. 모두 null 이면 앱이 `spOf()` 기본값(`platform_settings.sample_default_free_grade`) 사용(L1463) — 시드 p2,p3,p5,p7,p8,p10,p6 이 그 경우 |
| options [{n,price}] | `options jsonb` default `[]` | 비어 있으면 `optsOf()` 기본 3옵션(앱, `platform_settings.option_bundle_defaults`) |
| boosted + celeryItems.boost | `boosted_at date` | 7일 유효 판정은 앱(passActive). 구매 자체는 `celery_purchases(item_id='boost', product_id)` |
| (deleteProduct L4297-4303) | `deleted_at timestamptz` | **소프트 삭제**. `campaigns.product_id` 가 `restrict` 라 종결 캠페인(REJECTED/PASSED/DECLINED)만 있는 상품도 하드 삭제가 막히므로, 서버 RPC 가 L4299 가드 통과 시 `deleted_at = now()`. 공개 정책·앱 목록은 `deleted_at is null` 만 |

### 1.4 campaigns → `campaigns`

| 프로토타입 | 컬럼 | 비고 |
|---|---|---|
| id / sellerId / productId | `code not null default 'c'||nextval(campaign_code_seq)` / `seller_id` / `product_id` | uuid `c0000000-…-0000000000NN`. 판매 링크 `/s/{handle}/{code}` (L4411) 가 신규 행에도 항상 있도록 시퀀스 기본값 (100 부터 — 시드 c1~c13 과 분리) |
| (derived) product.brandId | `brand_id` | 비정규화(DM §8-6). `campaigns_fill_brand` before-trigger(security definer) 가 product 에서 채우고 불일치를 막는다 |
| status | `status` check(ST 14개) | `PREVIEW` 는 합성 객체 전용이라 제외(DM §8-18) |
| createdAt | `created_at timestamptz` | 월 샘플 한도(`sampleUsed`)는 `date_trunc('month', created_at)` 로. **anon grant 대상 아님**(협상 시작 시각) |
| start / end / qty | `start_date` / `end_date` / `qty` | `end_date >= start_date`; `SCHEDULE_CONFIRMED/LIVE/CLEARING/SETTLED ⇒ start·end not null, qty > 0` (FL §10-4) |
| propStart / propEnd / propQty | `proposed_start` / `proposed_end` / `proposed_qty` | `SCHEDULE_PROPOSED ⇒ 셋 다 not null` (FL §10-4) |
| testDue | `test_due date` | + `received_at timestamptz`(수령 시각, 프로토타입엔 없음 — 요청된 컬럼, **추정**) |
| tracking | `tracking_no` | 샘플 운송장 |
| settledAt | `settled_at timestamptz` | `SETTLED ⇒ not null` 체크. `settlements.settled_at` 과 같은 트랜잭션·같은 값 |
| purchased / samplePaid{price,cel,cash,method} / sampleRefunded | `purchased` / `sample_price`,`sample_cel`,`sample_cash`,`sample_method` check(cash,cel) / `sample_refunded` | `purchased ⇒ price·method not null`; 분할 정합성 체크 `cash ⇒ cel=0 & cash=price`, `cel ⇒ cel>0 & cel×20,000+cash=price` (sampleSplit L1465, confirmSampleBuy L3880) — 20,000 은 SAMPLE_CEL_WON 하드코딩(설정 변경 시 제약도 변경) |
| invited / celUsed / celRefunded / auto / regongu | `invited` / `cel_used` / `cel_refunded` / `auto_proposed` / `regongu` | 제안권 🥬 는 `grade_tiers.invite_cost_cel` |
| homeFeatured | `home_featured_at date` | |
| (derived) soldQty | `sold_qty` (캐시) | `orders` 트리거가 PAID Σqty 로 유지 → anon 에 orders 를 열지 않고 공개 (AM §3.2) |
| (없음) | `price_locked`, `rate_locked` | 확정 시 가격/수수료 스냅샷 — 프로토타입은 잠금(L4282)으로 대신함. 요청된 컬럼, **추정** 설계 |
| (없음) | `decision_reason text` | DECLINED/REJECTED/PASSED/일정 반려 사유. 프로토타입은 사유를 저장하지 않는다(rejectSample L4185, declineInvite L4076 입력 없음; 유일한 사유 입력은 rejectProduct L4276) — 체크리스트 요구로 추가한 의도적 확장(**추정**). 같은 값을 `campaign_events.payload.reason` 에도 남긴다 |
| (derived) allocated/stockLeft/periodHolders/periodBlock/settleDue/isRefBoost | **derived — not stored** | 서버 계산. `campaigns_period_idx` 부분 인덱스만 제공 |

제약: `campaigns_active_pair_uidx` — `(seller_id, product_id)` 에 status ∉ (REJECTED,PASSED,DECLINED,SETTLED) 인 행 1개(FL §10-2 승격). **기간 배타 제약은 두지 않음** — 기간 공유가 기본이고 우선권 등급(`grade_tiers.is_priority`)은 등급 조건부라 exclusion constraint 가 정책과 모순(FL §3.2). 서버 RPC 가 `periodBlock` 을 검사한다.

시뮬레이션 전용 액션은 이관하지 않는다: `goLive`(L4226, start 를 오늘로 당김) · `endCamp`(L4233) · `ffwd`(L4240, `end = 오늘−21` 이라 `campaigns_period_valid` 에 걸린다) · `simOrders`. 실서비스는 스케줄러(autoTick L1422)만 전이한다.

### 1.5 messages{cid} → `campaign_events`

| 프로토타입 | 컬럼 | 비고 |
|---|---|---|
| (맵 키) cid | `campaign_id` | |
| type `'sys'` | `kind='system'`, `sender='system'` | HTML(`<b>`) 포함 문자열 → `body`(평문) + `event_type`(슬러그) + `payload jsonb`(파라미터). 렌더 시 앱이 조립 (DM §8-3 결정). 수령 이벤트는 `sample_received` 1행 + `payload.test_due` (L4192-4193 — 시드의 c3 sys 2행도 이렇게 합침) |
| type `'chat'`, role seller/brand | `kind='chat'`, `sender` check(seller,brand,admin,system) = **표시 역할** | + `actor_role`(실제 발신 역할, chat 이면 필수) + `actor_user_id`. 관리자 대행 발신(L4467 — 관리자는 브랜드로 발신, 사용자 결정)은 `sender='brand', actor_role='admin'` 으로 저장해 화면은 브랜드명(L3564)으로 나오고 감사 이력은 남는다. `sender='admin'` 은 운영팀 명의 발신('셀러리 운영팀')용 |
| type `'warn'` (별도 행) | `leak_flag=true` (감지된 chat 행에) | 경고 문구는 앱 렌더. 별도 행이 아니므로 **이탈** — 원문 보존은 동일(정규식 감지는 서버 insert 시) |
| txt / at | `body` / `created_at` | |
| (derived) 안 읽음 | **derived** | 마지막 chat 의 sender ≠ 내 역할. 읽음 상태 컬럼은 프로토타입에도 없음 |

종결 사유(DECLINED/REJECTED/PASSED/schedule_rejected)는 `campaigns.decision_reason` + 해당 이벤트의 `payload.reason` — 프로토타입에 없는 확장(**추정**).

### 1.6 orders → `orders` (+ `customers`)

| 프로토타입 | 컬럼 | 비고 |
|---|---|---|
| id `'o101'` / campaignId | `code not null unique default 'o'||nextval(order_code_seq)` / `campaign_id` | 시드 uuid = `md5('sellery:order:o101')::uuid`. 시퀀스는 2000 부터(시드 o100~o1151 과 분리) |
| buyer | `buyer_name` | 표시명. 인플루언서 응답 마스킹은 앱(AM §4.3-4) |
| qty / unit / opt | `qty` / `unit_price` / `option_name` | `amount` 는 generated(qty×unit) |
| status | `status` check(PAID,REFUNDED,CANCELED) | CANCELED 는 읽기 전용 값이지만 calc 가 참조하므로 포함. `is_sample ⇒ status <> 'REFUNDED'` 체크 (FL §10-7, L4248) |
| at | `paid_at timestamptz` | 날짜 비교는 `paid_at::date` (KST 이슈 §5) |
| sample | `is_sample` | |
| tracking / courier | `tracking_no` / `courier` check(5개 택배사) | + `shipped_at` |
| (없음) | `customer_id`, `user_id`, `shipping jsonb`, `payment_key`, `payment_method`, `raw_payment`, `refunded_at`, `refund_reason` | glo 0001 orders 필드. `REFUNDED ⇒ refunded_at` 체크 |

`customers`: 프로토타입에 없음(AM §2.6 **추정**). `user_id unique nullable`, `name/phone/email/address jsonb`.

### 1.7 celeryLedger → `celery_ledger` (+ 뷰 `celery_balances`)

| 프로토타입 | 컬럼 | 비고 |
|---|---|---|
| who `'s1'|'b1'` | `owner_type` check(seller,brand) + `seller_id` / `brand_id` (정확히 하나 not null) | 접두사 의존 제거(DM §8-7) |
| at / delta / memo / won | `created_at` / `delta`(≠0) / `memo` / `won` | |
| (없음) | `reason` check(14종) | memo 패턴(DM §3.6)을 슬러그로: earned, signup_bonus, onboarding_bonus, admin_grant, topup, shop_item, data_unlock, ref_unlock, sample_purchase, sample_refund, invite, auto_invite, invite_refund, adjust |
| (없음) | `ref_type`, `ref_id` | 원인 엔티티 참조 |
| (derived) celEarned | `reason='earned'` 행 | **이탈**: 프로토타입은 잔액 = floor(m3Sales|bGmv/500만)(파생) + Σdelta. DB 는 Σdelta 만(뷰) — 획득분은 서버가 정산/GMV 갱신 시 원장에 적재(FL §5.1 권장, **추정**). 시드는 이관 시점 획득분을 1행씩 넣어 잔액을 맞춘다 |
| (derived) celBal | `celery_balances` 뷰 (security_invoker, anon/authenticated 권한 없음) | 차감 전 잔액 검사는 서버 트랜잭션 |

### 1.8 refEarnings / brandRefEarnings → `referral_earnings`

`side` check(seller,brand) + `referrer_seller_id/referred_seller_id` 또는 `referrer_brand_id/referred_brand_id`(체크 제약으로 side 별 강제; 넷 다 인덱스 — `referred_*` 가 "첫 5회/3회" 조회 키), `campaign_id`(nullable — 시드 `'(지난 판매)'` 는 null + memo, DM §8-8), `settlement_id`, `rate`(0.02/0.01), `amount`, `earned_on`. 추천 관계 자체는 `sellers.referred_by` / `brands.referred_by`; "첫 5회/3회" 는 정산 시 서버 계산 (**derived**).

### 1.9 cs → `cs_conversations` + `cs_messages`

| 프로토타입 | 컬럼 | 비고 |
|---|---|---|
| id / cid / buyer / type / status / at | `cs_conversations.code`(`not null default 'cs'||nextval(cs_code_seq)`) / `campaign_id` / `buyer_name` / `type` check(CS_TYPES 4) / `status` check(OPEN,ANSWERED,CLOSED) / `created_at` | `ANSWERED ⇒ replied_at` 체크 (FL §10-15) |
| orderId (고객 타이핑 원문, 불일치여도 저장 L4379/L4383) | `order_code text` + `order_id → orders`(nullable) | 서버가 `orders.code` 를 대소문자 무시·같은 캠페인 범위로 해석해 `order_id` 를 채우고, 못 찾으면 null 로 둔다 (원문은 `order_code` 에 그대로) |
| (derived) csBrandId | `brand_id` | 파생값을 저장(브랜드 문의함 조회 인덱스) |
| msg | `cs_messages(sender='customer')` 1행 | |
| reply / repliedAt | `cs_messages(sender='brand')` + `cs_conversations.replied_at` | glo 0015 구조로 일반화 — 답변 수정·추가 대화 가능. `cs_messages` 도 `sender`(표시)/`actor_role`(실제, 필수)/`actor_user_id` 분리 — 관리자 대행 답변은 `sender='brand', actor_role='admin'` |
| (없음) | `customer_id`, `user_id`, `client_token`(비회원 식별, glo 0015), `last_preview`, `last_message_at`, `closed_at` | **추정** |

### 1.10 settlements → `settlements` (+ `payouts`)

| 프로토타입 | 컬럼 | 비고 |
|---|---|---|
| at / cid / title | `settled_at timestamptz` / `campaign_id unique` / `title` | 캠페인당 1행(FL §10-12). `campaigns.settled_at` 과 같은 값 |
| net / brandPay / sellerPay / platFee / pfNet | `net` / `brand_payout` / `seller_payout` / `platform_fee` / `platform_net` — 전부 `bigint` | float → **KRW 정수, 라인별 독립 반올림**(계약은 0004 헤더·data-model §4) |
| holdS / holdB | `hold_seller` / `hold_brand` | |
| (calc 의 나머지 라인) gross, refund, sampleNet, pg, sf, gBonus, boost, refReward, bBoost, bReward, bDisc, pfGross, vat, sfTotal, paidCnt, refCnt, rb, bb | `gross, refunds, sample_net, pg_fee, seller_fee, seller_bonus, ref_boost, ref_reward, brand_ref_boost, brand_ref_reward, brand_discount, platform_fee_gross, vat, seller_fee_total, paid_count, refund_count, ref_boost_applied, brand_ref_applied` | 프로토타입은 5개만 저장했으나 명세/감사를 위해 전 라인 스냅샷. `costs` 와 결제 건수는 파생(비저장) |
| (없음) | `pg_rate, platform_rate, seller_rate, seller_grade, seller_bonus_pp, brand_grade, brand_discount_rate, wht_rate, ref_boost_rate, ref_reward_rate, brand_ref_disc_rate, brand_ref_reward_rate, seller_wht, sample_refund_cel, sample_refund_cash, status check(pending,held,paid), due_on, paid_at` | 요율 스냅샷(추천 4요율 포함 — 미적용이면 0) + 지급 상태. `due_on = end_date + clear_days` 는 서버가 채움 |

`payouts`: 정산당 (seller, brand) 2행 — `amount bigint`, `wht bigint`, `status` check(pending,held,paid), `hold_reason`, `bank_snapshot jsonb`, `paid_at`. 프로토타입의 holdS/holdB 플래그를 지급 배치 단위로 추적하기 위한 확장(**추정**).

**SETTLED ⇔ settlements 1행** 은 서버 트랜잭션 불변식이지 DB 제약이 아니다. 시드 c6 은 프로토타입 parity(`settlements:[]` L1323)로 스냅샷 없이 SETTLED — 서버 코드는 left join 해야 한다.

### 1.11 exclusiveReqs → `exclusive_requests`

`code`, `product_id`, `seller_id`, `status` check(PENDING,APPROVED,REJECTED), `decided_at`, `created_at`. `(product_id, seller_id)` where PENDING 부분 유니크(FL §10-13). 승인 시 `products.exclusive_seller_id` 세팅은 서버.

### 1.12 productViews → `product_views`

`product_id`, `seller_id`, `viewed_at timestamptz`. `ago`('2시간 전') 표시 문자열은 타임스탬프로 대체(DM §8-11); 시드는 `now() - interval` 로 근사(**추정**).

### 1.13 external{sid} → `seller_external_sales`

`seller_id`, `product_name`(name), `brand_name`(brand), `source` check(4 플랫폼)(src), `price`, `seen_on`(at). `estExternal` 은 **derived**.

### 1.14 unlockedRefs / brandDataUnlocks → `data_views`

`brand_id`, `seller_id`, `kind` check('data' = brandDataUnlocks, 'ref' = unlockedRefs), `price_cel`, `free`, `ledger_id`, `viewed_at`; `(brand_id, seller_id, kind)` 유니크. **이탈**: `unlockedRefs` 는 브랜드 스코프 없는 전역 배열이었으나 차감이 브랜드 잔액에서 이뤄지므로 브랜드 귀속으로 정규화(DM §8-1, AM §5-3). 시드 `brandDataUnlocks {b1:['s1'], b2:['s7']}` 는 kind='data', price 0(프로토타입에 가격 기록 없음).

### 1.15 autoPO → `brands.po_enabled/po_email` (§1.1) · 1.16 opex → `platform_settings('opex_default' / 'opex')`

`OPEX_DEF` 는 `opex_default` 키(불변). 관리자 `saveOpex`(L4428)는 별도 키 `opex` 를 upsert 하고 `resetOpex`(L4429)는 `opex` 행을 삭제한다 — 서버는 프로토타입 L3160 처럼 `{...opex_default, ...opex}` 로 병합. (한 키에 덮어쓰면 기본값이 사라져 reset 할 것이 없다.)

### 1.17 seq → 테이블별 시퀀스

프로토타입 단일 카운터 `seq`(L1324, 100 부터)는 `campaign_code_seq`(100~) · `order_code_seq`(2000~) · `cs_code_seq`(100~) 로 나눈다. 시드는 프로토타입 코드를 명시적으로 넣고, 신규 행은 기본값이 발급한다. 다른 테이블(`products`, `sellers`, `brands`, `seller_channels`, `exclusive_requests`)의 `code` 는 시드 매핑용이라 nullable 그대로.

### 1.18 S.data 밖 저장 키 (DM §0.2)

`sellery-session`(로그인 세션) → Supabase Auth 세션 + `profiles` / `slry-linkctx`(링크 진입 보호) → **app-only** 쿠키(AM §3.4; 해제 일수는 `platform_settings.link_protect_days`) / `slry-stage`, `slry-boot` → **app-only** UI.

### 1.19 그 밖의 파생값 (DM §5) — 전부 **derived — not stored**

인플루언서·브랜드 등급(캐시 컬럼만), 셀러리 획득량(원장 행), 판매 수량(`sold_qty` 캐시), 배정/잔여 재고, 정산 금액(실행 시 `settlements` 스냅샷), 원천징수율, 정산 기준일(`settlements.due_on`), 추천 부스트 여부, 샘플 한도/사용/잔여, 샘플 정책 기본값/샘플가/🥬 분할, 무상 자격, 옵션 기본값, 성장세, 외부 판매 예상, 패스 활성 여부(`celery_purchases.expires_on` 비교), 자동 매칭 후보, 기간 우선권 차단, 독점 자격, 무료 열람 잔여, CS 배정 브랜드(저장으로 승격), DM 안 읽음, 뱃지 카운트, 고객 홈 추천, 실시간 시청자 수(의사난수 — DB 아님), 플랫폼 누적 GMV, 스케줄러 전이(autoTick → 크론/Edge Function, **추정**).

## 2. 열거형 매핑

| 대상 | 프로토타입 값 | DB check |
|---|---|---|
| profiles.role | login.html `seller|brand|admin` (+ 고객 무계정) | `customer,seller,brand,admin` |
| campaigns.status | ST 14 키 | 동일 14개 (`PREVIEW` 제외) |
| products.status | `listed|pending|rejected|paused` | 동일 (+ `deleted_at` 소프트 삭제는 상태값이 아님) |
| orders.status | `PAID|REFUNDED` (+ 읽기 전용 `CANCELED`) | `PAID,REFUNDED,CANCELED` |
| campaign_events.kind / sender / actor_role | `sys|chat|warn` / `seller|brand(|admin)` | `system,chat` (+ `leak_flag`) / `seller,brand,admin,system` (sender = 표시, actor_role = 실제) |
| sellers.platform, seller_channels.platform, seller_external_sales.source | `instagram|youtube|naver|tiktok` | 동일 |
| sellers.settle_type | `personal|biz` | 동일 (null = 미등록, 원천징수 대상) |
| products.sample_buy_mode / campaigns.sample_method | `auto|fixed` / `cash|cel` | 동일 |
| products.exclusive_grade | `GRADES.slice(0,4)` | `블랙,다이아,플래티넘,골드` (FK + check) |
| cs_conversations.type / status | CS_TYPES 4 / `OPEN|ANSWERED|CLOSED` | 동일 (한글 값 그대로) |
| cs_messages.sender / actor_role | (없음: msg/reply) | `customer,brand,admin` |
| exclusive_requests.status | `PENDING|APPROVED|REJECTED` | 동일 |
| brands.category | `'건강기능식품'|'이너뷰티'` (CATMAP 키) | 동일 |
| categories.name | CATS 7 | FK 마스터 |
| grade_tiers.name / brand_grade_tiers.name | GRADES / BGRADES 7단계 한글명 | PK (sort_order = tierIdx) |
| settlements.status / payouts.status | (없음) | `pending,held,paid` |
| celery_ledger.reason | memo 패턴 (DM §3.6) | 14 슬러그 (§1.7) |
| celery_purchases.item_id | SHOP id | `datapass,featured,homefeature,regongu,boost,fastreview` (auto 아이템 제외) |
| orders.courier | 5개 택배사 (L4106) | 동일 |
| data_views.kind | brandDataUnlocks / unlockedRefs | `data,ref` |
| referral_earnings.side | refEarnings / brandRefEarnings | `seller,brand` |

## 3. 프로토타입에서 이탈한 지점과 이유

1. **`campaigns.brand_id` 비정규화** + fill 트리거 — 모든 브랜드 화면·CS 배정·정산이 product 경유였던 것을 인덱스 가능한 컬럼으로. 트리거가 product 와의 일치를 보장.
2. **`campaigns.sold_qty` 카운터** + orders 트리거 — 고객 판매센터가 orders 를 읽지 않고 판매 수량을 보이게(AM §3.2). 서버가 별도 갱신할 필요 없음. 두 트리거 함수는 `security definer` — 쓰는 쪽 역할과 무관하게 캐시가 유지되도록(나중에 고객 결제 insert 정책이 생겨도 RLS 에 걸리지 않게).
3. **활성 (seller, product) 쌍 유니크 인덱스** — UI 가드(L1473)를 DB 불변식으로 승격(FL §10-2).
4. **기간 배타 제약 없음** — 의도적. 등급 우선권(플래티넘↑ 선점 시 골드↓ 차단)은 앱 규칙(FL §3.2). btree_gist 도 설치하지 않음.
5. **시스템 메시지의 HTML → event_type + payload** — `sys.txt` 의 `<b>` 마크업을 DB 에 두지 않는다. `warn` 행 → `leak_flag`.
6. **🥬 획득분을 원장 행으로** — 파생값(m3Sales/GMV 환산)이 잔액에 소급 반영되던 모델을 원장 단일 소스로. 시드는 이관 시점 획득분 1행으로 잔액 동치.
7. **`celeryItems{}` → `celery_purchases`**, **`boosted` → `products.boosted_at`**, **`homeFeatured` → `campaigns.home_featured_at`** — 만료 판정을 컬럼 비교로.
8. **`unlockedRefs` 브랜드 귀속**, **`autoPO` 브랜드별**, **`opex` 는 settings 2키(default/override)** — DM §8-1/2.
9. **정산 스냅샷 확장 + KRW 정수** — float 지급액(sellerPay/platFee/pfNet)을 라인별 독립 반올림, 요율(추천 4요율 포함)·등급·라인 전부 저장, `payouts` 로 지급 배치 추적. 추천 4라인의 기준은 `net`(sample_net 미차감, L1644-1645).
10. **cs 를 대화/메시지 2테이블로** — glo 0015 와 동일 구조, 비회원 `client_token`, `order_code` 원문 + `order_id` 해석값.
11. **brand.cat 시드값 정규화**(`'이너뷰티·피부'` → `'이너뷰티'`), **`createProduct` 기본 cat `'건기식'`** 은 FK 로 거부 — 앱이 유효 카테고리를 넘겨야 함.
12. **`products.sample_*` 4컬럼 nullable + 전부-또는-없음 체크** — samplePolicy 부재 = 앱 기본값이라는 프로토타입 의미 유지, 부분 행 금지.
13. **`orders.amount` generated 컬럼**, `refunded_at`/`shipped_at`/결제 필드 추가 — glo 0001 orders 와 정렬.
14. **`sellers.grade` 트리거 캐시** — 공개 grant 를 위해 등급만 노출하고 `m3_sales` 는 숨김(AM §3.3). 브랜드 등급은 주문에 의존해 트리거 대신 서버 재계산(`brand_gmv()` + `brand_grade_for_gmv()`).
15. **`received_at`, `price_locked`, `rate_locked`, `decision_reason`, `payouts`, `customers`, `settlements.status`** — 프로토타입에 없는 요청 컬럼/테이블. 모두 nullable/기본값이라 시드는 비워 둠.
16. **정책의 2단계 생성** — `products_select_public` / `brands_select_public` 은 0001/0002 에서 `using (false)` 로 닫아 두고 0003 에서 campaigns 조건을 포함한 최종본으로 drop/create. (정책 본문은 생성 시점에 참조 테이블 존재를 검사하므로.) `sellers_select_public` 은 0001 이 최종본.
17. **profiles.role 자기 수정 차단** — glo 0001 의 행 전체 update 정책 대신 `grant update (full_name, phone)` 로 컬럼 제한(AM §1.3).
18. **SHOP `days` 보강** — 프로토타입 SHOP 은 브랜드 datapass(30) 에만 `days` 가 있어 featured/homefeature/boost/regongu 가 '보유 중' 으로 영구 남는 결함(points-policy §4.4, §9-9)이 있었다. 시드 `shop_items` 는 소비 측 상수(featured 7 L2674 · homefeature 7 L3261 · boost 7 L1921 · regongu 30 L4208)를 카탈로그에 명시한다 — 정책 전사가 아닌 의도적 보강(**추정**). `samplepay.price '1 = ₩20,000'` → `null`(sample_cel_won 참조), `ref/sdata.price '1–5'` → `"grade"`(grade_tiers.data_price_cel), `diamond.price 10` 은 표시용(차감액은 `grade_tiers.invite_cost_cel`).
19. **정책 상수의 단일 소스** — `PRIORITY_TIER` 는 `grade_tiers.is_priority` 로만, 다이아·블랙 제안권 10🥬 는 `grade_tiers.invite_cost_cel` 로만(설정 키 `priority_tier`/`invite_cel_high_grade` 없음). 반대로 앱 코드에만 있던 spOf 기본 등급 구간·optsOf 묶음 할인·홈 노출 7일·링크 보호 7일·가입/입점/관리자 지급 🥬 는 `platform_settings` 키로 옮겼다(값은 코드 그대로).
20. **hidden 인플루언서·미판매 파트너의 열거 차단** — 프로토타입은 hidden 인플루언서를 링크로 도달한 카드에서만, 타 인플루언서 실적은 익명 집계로만, 브랜드 사업자번호는 인증 모달에서만 보여준다(L3269/L3510/L2120-2125/L4414). 직접 테이블 정책으로 이걸 재현하면 PostgREST 목록 조회로 전부 긁힌다. 그래서 `sellers` 는 `active and not hidden` 만, `campaigns` 는 진행·예정·환불 기간(SETTLED 제외), `products`/`brands` 는 그 캠페인이 걸린 것만 열고, 캠페인 1건 단위 정보(hidden 인플루언서 카드·종료 링크 페이지·사업자번호·인증 채널)는 `campaign_card(code)` RPC(security definer)로 준다 (AM §2.1.1, §2.9). 종료 캠페인 실적(qty/sold_qty)은 RPC 에서도 null — AM §5 열린 결정 4 는 "비공개" 로 닫음.
21. **`seller_channels_primary_verified` 체크 없음** — §1.2. FL §10-14 의 `primary ⇒ verified` 는 시드 상태의 서술이지 편집 흐름(L3944)과 양립하는 제약이 아니다.
22. **`products.deleted_at` 소프트 삭제** — §1.3 (deleteProduct L4297-4303 과 `restrict` FK 의 충돌 해소).
23. **Storage 버킷 2개(0006)** — 자산은 공개 버킷, 사업자등록증은 비공개 버킷 + object path 만 저장. 프로토타입의 data-URI/파일명 보관을 대체.

## 4. RLS 요약 (AM §4.2 실현)

| 테이블 | anon/authenticated grant | 정책 |
|---|---|---|
| profiles | select(id, role, email, full_name, phone, created_at) · update(full_name, phone) — authenticated | 본인 행 |
| grade_tiers, brand_grade_tiers, categories | select * | true |
| brands | select(id, code, name, category, logo_url, grade, active) | `active and exists(공개 캠페인)` — 0003 |
| sellers | select(id, code, name, handle, platform, avatar_url, followers, category, intro, grade, active) | `seller_is_public(id)` — 0001 최종 (2차 리뷰: `active and not hidden` 직접 참조 대신 헬퍼 재사용) |
| seller_channels | select(id, seller_id, platform, handle, url, followers, verified, is_primary) | `verified and seller_is_public(seller_id)` |
| products | select(id, code, brand_id, name, description, emoji, thumb_url, image_urls, category, consumer_price, sale_price, options, status, deleted_at) | `deleted_at is null and exists(공개 캠페인)` — 0003 (2차 리뷰: `deleted_at` grant 추가) |
| campaigns | select(id, code, seller_id, product_id, brand_id, status, start_date, end_date, qty, sold_qty, home_featured_at) | `status in (SCHEDULE_CONFIRMED, LIVE, CLEARING)` |
| customers | select(...) — authenticated | 본인 |
| orders | select(id, code, campaign_id, user_id, status, qty, unit_price, amount, option_name, courier, tracking_no, shipped_at, paid_at, refunded_at) — authenticated | `auth.uid() = user_id` |
| 그 외 전부 (platform_settings, campaign_events, exclusive_requests, product_views, settlements, payouts, celery_ledger, celery_balances 뷰, celery_purchases, data_views, referral_earnings, seller_external_sales, cs_*) | 없음 (revoke all) | 없음 → service role 전용 |

RPC(anon/authenticated execute): `campaign_card(text)` — 코드 1건의 캠페인·상품·인플루언서 카드(hidden 포함)·브랜드(사업자번호 포함)·인증 채널; `seller_is_public(uuid)` — 정책 헬퍼. `app_role()` 은 authenticated 만. 나머지 함수(등급 판정·GMV·캐시·트리거 함수)는 전부 execute 회수.

**정책 식의 컬럼 권한 규칙(2차 리뷰로 재수정 — 더는 "확정된 규칙"으로 서술하지 않는다)**: 이전 판(1차 리뷰)은 "정책이 **자기 테이블** 컬럼을 참조할 때는 grant 가 필요 없다"고 단정하고 `sellers.hidden`/`products.deleted_at` 을 grant 없이 정책에서 참조했다. 이 가정은 로컬 DB 없이 검증되지 않았고(0001 L19-22 가 이미 **추정**이라 표시), 만약 틀리면(Supabase 의 Column Level Security 문서가 실제로 경고하는 대로 컬럼 단위 select 권한이 자기 테이블 정책 컬럼에도 적용되면) anon/authenticated 의 `sellers`/`products` 조회가 전부 `permission denied` 로 깨진다(review/semantic.js 재검사로 발견한 2차 리뷰 high #1·#2). 그래서 두 컬럼을 **다르게** 처리한다:
  - `sellers.hidden` — 계속 grant 하지 않는다(열거로 ○○○ 카드와 실제 행을 짝지을 위험, §3-20). 대신 정책 USING 절이 `active and not hidden` 을 직접 쓰지 않고 이미 있던 `security definer` 헬퍼 `seller_is_public(id)` 를 호출한다 — `seller_channels` 정책이 이미 쓰던 것과 같은 함수라 새 코드가 없다.
  - `products.deleted_at` — `hidden` 과 달리 비식별화 위험이 없는 값이므로 grant 목록에 추가했다(재사용할 헬퍼가 마땅치 않고, 여는 쪽이 안전).
  둘 다 같은 문제(정책이 참조하는 자기 테이블 컬럼의 grant 누락)에 대한 서로 다른 처방이다 — 함수로 우회할 수 있고 컬럼이 민감하면 우회, 컬럼이 민감하지 않으면 grant. 실행 검증은 여전히 **추정**: 적용 후 data-model §8.4 의 `set role anon` 스모크 테스트(sellers/products/seller_channels 각 1행 select)로 확인한다.

## 5. 실행 시 확인할 것 (리뷰 포인트)

1. **Supabase Postgres 버전** — `create view … with (security_invoker = true)` 는 PG15+. Supabase 는 15/17 이라 문제 없을 것으로 봄(**추정**).
2. **`generated always as … stored`** (orders.amount) — PG12+. OK.
3. **auth.users 트리거** — glo 와 동일하게 마이그레이션 실행 롤(postgres)이 auth 스키마에 트리거를 만들 권한이 있어야 한다(glo 에서 이미 동작 중인 idiom).
4. **시드 실행 롤** — postgres/service role 로 실행해야 한다 (anon 은 insert 권한이 없음). 트리거 함수는 security definer 라 롤과 무관하게 캐시를 채운다.
5. **날짜/시간대** — `paid_at`, `created_at`, `settled_at` 은 timestamptz. 프로토타입의 "오늘 주문", "이달 한도" 비교를 KST 기준으로 하려면 서버가 `(paid_at at time zone 'Asia/Seoul')::date` 로 비교해야 한다. 시드는 `current_date` (세션 TZ, Supabase 기본 UTC) 기준.
6. **시드 재실행** — `on conflict do nothing` + 결정적 uuid 라 중복 없음. 단 날짜가 "오늘 기준"이라 며칠 뒤 재실행해도 기존 행 날짜는 갱신되지 않는다(의도). **프로덕션 프로젝트에서는 실행 금지**(가짜 계좌·사업자번호).
7. **`campaigns_active_pair_uidx`** 가 실서비스 흐름에서 `regongu`(SETTLED 후 새 행)와 충돌하지 않는지 — SETTLED 는 제외 집합이라 OK. `PASSED` 후 재요청(구매 유도)도 OK.
8. **정책 컬럼 권한 가정(§4, 2차 리뷰로 갱신)** — `set role anon; select id from public.sellers limit 1; select id from public.products limit 1; select id from public.seller_channels limit 1;` 이 permission denied 없이 돌아야 한다. `sellers_select_public` 은 이제 `seller_is_public(id)` 를 쓰므로 `hidden` grant 여부와 무관하게 통과해야 정상이고, `products_select_public` 은 `deleted_at` 을 이미 grant 했으므로 역시 통과해야 정상이다 — 실패한다면(즉 자기 테이블 컬럼 grant 가 정말 전혀 문제되지 않는 것으로 확인된다면) 이 두 우회 자체가 불필요했다는 뜻이니 문서만 갱신하면 되고, 스키마를 되돌릴 필요는 없다.
9. **`campaign_card()` 스모크** — `select public.campaign_card('c1') is not null;`(LIVE), `campaign_card('c6')->'campaign'->>'sold_qty' is null`(SETTLED 실적 비공개), `campaign_card('c7') is null`(협상 단계).
10. **Storage** — `storage.buckets` insert 는 postgres 롤로 실행된다(glo 0008 과 동일). `partner-docs` 에 storage.objects 정책이 없는지 Dashboard 에서 확인.
11. 미구현/후속: 공개 집계(`site_stats` 또는 `public_stats()` RPC), 익명 랭킹·실적표 RPC(AM §4.2 보조 함수), 셀러리 차감 RPC(glo 0009 `use_points` 패턴), 스케줄러(LIVE/CLEARING 자동 전이) 크론, 파트너 가입/심사 신청 테이블(glo 0013 패턴 — `user_id` 연결의 유일한 경로. 프로토타입에 흐름이 없어 이번 범위에서 제외).

## 6. 1차 리뷰 반영 이력 (2026-09-15)

| # | 항목 | 반영 |
|---|---|---|
| 1·14 | sellers/brands email, brands biz_no 유니크 | `lower(email)` 부분 유니크 ×2, `biz_no` 부분 유니크 (0001) |
| 2 | orders grant 에 user_id 없음 / 문서 주장 오류 | user_id grant 추가 + §4 규칙 문장 수정 |
| 3·11 | FL §10-4/7/15 체크 | `campaigns_proposed_when_proposed`, `campaigns_period_when_confirmed`, `orders_sample_not_refunded`, `cs_answered_has_reply` |
| 4 | FK 인덱스 누락 | referral_earnings.referred_*, celery_purchases.product_id/ledger_id, data_views.ledger_id, cs_conversations.customer_id 추가. grade_tiers FK 2개는 주석으로 의도 명시 |
| 5 | 타입 폭·정산 시각 | settlements 금액 라인·payouts.amount/wht·grade_tiers.min_m3_sales → bigint; `settled_on date` → `settled_at timestamptz` |
| 6 | 트리거 함수 권한 | `campaigns_fill_brand`, `orders_sync_sold_qty` → security definer + revoke |
| 7 | `is_primary ⇒ verified` 체크가 편집 흐름과 충돌 | 체크 삭제, setPrimaryCh 서버 가드로 (§1.2, §3-21) |
| 8 | 관리자 대행 발신 표현 불가 | `campaign_events`/`cs_messages` 에 `actor_role`, `actor_user_id` (§1.5, §1.9) |
| 9 | deleteProduct 불가 | `products.deleted_at` 소프트 삭제 (§1.3, §3-22) |
| 10 | 종결 사유 컬럼 없음 | `campaigns.decision_reason` + payload.reason (§1.4) |
| 12 | campaigns.code nullable | code not null + 시퀀스 기본값 (campaigns/orders/cs_conversations) (§1.17) |
| 13 | 시드 `test_due_set` 슬러그 | c3 sys 2행 → `sample_received` + payload.test_due 1행 (스레드 23건) |
| 15 | opex 키 하나 | `opex_default` + `opex`(오버라이드, 기본 없음) (§1.16) |
| 16 | CS 주문번호 원문 | `cs_conversations.order_code` + 해석 규칙 (§1.9) |
| 17·18·19·20 | hidden 인플루언서·SETTLED 실적·미판매 상품/브랜드·hidden/created_at grant 의 열거 노출 | sellers `active and not hidden` / campaigns SETTLED 제외 / products·brands 는 공개 캠페인 조건 / grant 에서 hidden·created_at·biz_no·mail_order_no 제거 / `campaign_card()` RPC / `seller_is_public()` 헬퍼 (§3-20, §4) |
| 21 | 시드 PII | 브랜드 이메일 `.example`, b2 예금주 '(주)글로헬스', dev/staging 전용 명시, 이메일 자동 연결 서술 삭제 |
| 22 | 함수 execute 기본 부여 | grade_for_sales/brand_grade_for_gmv/트리거 함수 전부 revoke |
| 23 | Storage 버킷 없음 | 0006_storage.sql |
| 24·25·26·33 | 반올림 계약·추천 기준·요율 스냅샷·settle_type null | 0004 헤더 + data-model §4 에 명문화, `ref_boost_rate/ref_reward_rate/brand_ref_disc_rate/brand_ref_reward_rate` 추가 |
| 27 | 우선권·제안권 이중 소스 | `priority_tier`/`invite_cel_high_grade` 설정 키 삭제, `grade_tiers.invite_cost_cel` 추가 (§3-19) |
| 28 | SHOP days 보강 미기록 | §3-18 + 시드 설명 |
| 29 | platform_settings 누락 키 | `sample_default_free_grade`, `option_bundle_defaults`, `home_feature_days`, `link_protect_days`, `signup_bonus_cel`, `onboarding_bonus_cel`, `admin_grant_cel` |
| 30 | exclusive_grade 상위 4단계 | `products_exclusive_grade_top4` 체크 |
| 31 | 샘플 분할 정합성 | `campaigns_sample_split_consistent` |
| 32 | 샘플 정책 부분 행 | `products_sample_policy_all_or_none` |
| 34 | 시드 c6 스냅샷 없음 | 시드·0004·data-model 에 의도 명시(서버는 left join) |

## 7. 2차 리뷰 반영 이력 (2026-09-15)

1차 리뷰(§6)가 `sellers.hidden`/`campaigns.created_at` 을 grant 에서 뺀 뒤, `review/semantic.js` 의 정책-그랜트 교차검증을 재실행해서 잡은 회귀 2건(둘 다 high, sql-correctness 렌즈). 둘 다 같은 원인: 정책 USING 절이 grant 목록에 없는 **자기 테이블** 컬럼을 직접 참조 — 0001 L19-22 가 이미 실행 검증 전(**추정**)이라 표시해 둔 바로 그 가정이 틀렸을 경우 anon/authenticated 의 전체 조회가 `permission denied` 로 깨지는 경로다.

| # | 항목 | 반영 |
|---|---|---|
| 1 | `sellers_select_public` 이 grant 에 없는 `hidden` 을 USING 절에서 직접 읽음 (0001) | `active and not hidden` → `seller_is_public(id)` (이미 `seller_channels` 정책이 쓰던 동일 `security definer` 헬퍼 재사용, 새 함수 없음) |
| 2 | `products_select_public` 이 grant 에 없는 `deleted_at` 을 USING 절에서 직접 읽음 (0003, grant 는 0002) | `deleted_at` 을 0002 의 anon/authenticated select 컬럼 목록에 추가(값 자체는 비식별화 위험이 없어 hidden 과 반대 처방) |

두 처방 모두 §4 말미 "정책 식의 컬럼 권한 규칙" 문단에 반영했고, 실제 필요 여부(자기 테이블 정책 컬럼도 컬럼 단위 권한을 요구하는지)는 여전히 **추정**이며 §5-8 의 `set role anon` 스모크 테스트로 확정한다. `review/semantic.js` 재실행 결과 이 두 건은 더 이상 나오지 않음(pglast 재파싱도 6개 마이그레이션 + seed 전부 통과).

