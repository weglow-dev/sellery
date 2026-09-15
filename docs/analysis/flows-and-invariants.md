# 셀러리 프로토타입 — 비즈니스 플로우 & 불변식 (DB 설계 입력)

원본: `E:/위글로우/셀러리/index.html` (4,533줄, 읽기 전용). 모든 인용은 `L<줄번호>`.
작성일 2026-09-14. 코드에서 직접 확인한 사실만 기술하고, 코드에 없는 부분은 **추정** 으로 표시한다.

---

## 0. 공통 상수·유틸·엔티티 형태

| 항목 | 값 | 위치 |
|---|---|---|
| `PG_RATE` | 0.019 | L1212 |
| `PLAT_RATE` | 0.10 | L1212 |
| `WHT` (원천징수) | 0.033 | L1212 |
| `CLEAR_DAYS` | 21 | L1212 |
| `CELERY_PER` | 5,000,000원 → 1🥬 | L1376 |
| `SAMPLE_CEL_WON` | 20,000원 = 1🥬 (샘플 결제 환산) | L1462 |
| `DATA_PRICE` | 스타터1·브론즈1·실버2·골드2·플래티넘3·다이아4·블랙5 (기본 2) | L1379-1380 |
| `BG_DISC` | 블랙0.02·다이아0.015·플래티넘0.01·골드0.005 (기타 0) | L1382 |
| `BREF_RATE/BREF_DISC/BREF_TIMES` | 0.01 / 0.01 / 3 | L1374 |
| `REF_RATE/REF_BOOST/REF_TIMES` | 0.02 / 0.01 / 5 | L1541 |
| `PRIORITY_TIER` | '플래티넘' | L1673 |
| `OPEX_DEF` | server30000, db35000, cs50000, domain15000, misc30000, pgFixed0, kakaoPer15, claudePerCrawl120, claudePerMatch300 (월·₩) | L1377 |
| `TOPUP` | 5🥬=100,000 / 10🥬=190,000 / 30🥬=540,000 | L1451 |
| `CATMAP` | 건강기능식품:[다이어트·체형, 비타민·영양, 눈·뇌 건강, 장·소화, 활력·수면, 웰니스 푸드] / 이너뷰티:[이너뷰티·피부] | L1406 |
| `CATS` | 전체·다이어트·체형·이너뷰티·피부·비타민·영양·눈·뇌 건강·장·소화·활력·수면·웰니스 푸드 | L1936 |
| `CS_TYPES` | 배송 문의·교환·반품·상품 문의·기타 | L1690 |
| `PLAT_NAMES` | instagram·youtube·naver·tiktok | L1487 |

날짜: 모든 날짜는 `ymd()` 문자열 `YYYY-MM-DD` (로컬 자정, L1189-1190). `today()`는 로컬 자정 (L1186). 비교는 `P(str)`로 Date 변환.

ID 채번: 단일 카운터 `data.seq` (시드 100부터, L1324)를 캠페인 `c`, 주문 `o`, 독점신청 `x`, 채널 `ch`, CS `cs`, 상품 `p` 가 공유한다 (L3869, L3882, L3921, L3947, L4382, L4312). → DB에서는 각각 독립 PK.

### 0.1 엔티티 형태 (코드에서 실제 쓰이는 필드)

**brand** (L1224-1225, L3808, L3824, L3842): `id, name, cat, manager, email, settleInfo{bank, account, holder, bizNo, mailOrder?, bizDoc?}, gmvBase, logo(dataURL), refCode, referredBy?, autoPropose?, freeRefUsed{YYYY-MM: n}?, celeryItems{itemId: ymd}?`

**seller** (L1241-1259, L3963, L3979, L4010, L4026, L4046): `id, name, handle('@..'), email, platform, settleInfo{type:'personal'|'biz', bank, account, holder, bizNo?, bizDoc?}, img, followers, cat, likesAvg, recentLikes[], m3Sales, refCode, referredBy?, hidden?, intro, channels[], sampleExtra?, celeryItems{}?`

**channel** (L1243, L3947, L2208): `id, platform, handle, url, followers, verified(bool), primary?(bool), vcode?('SLRY-XXXX')`

**product** (L1288-1300, L4312-4316, L4284-4295): `id, brandId, name, desc, em, thumb?, imgs[]?(≤4), cat, cp(소비자가), gp(판매가), rate(인플루언서 수수료율, 플랫폼 10% 제외), sample(문구), stock, status('pending'|'listed'|'paused'|'rejected'), rejectReason?, t{g,note}?(트렌드 데모), exclusive{grade,label}?, exclusiveSellerId?, samplePolicy{freeGrade, buyMode:'auto'|'fixed', fixedPrice, refund(bool)}?, options[{n,price}]?, boosted?, celeryItems{boost: ymd}?`

**campaign** (시드 L1303-1315 + 액션): `id, sellerId, productId, status, createdAt, start?, end?, qty?, propStart?, propEnd?, propQty?, testDue?, tracking?(샘플 운송장), purchased?, samplePaid{price, cel, cash, method:'cash'|'cel'}?, sampleRefunded?, invited?, celUsed?, celRefunded?, auto?, regongu?, settledAt?, homeFeatured?(ymd)`

**order** (L1330, L1338, L3884, L4091, L4363, L4475): `id, campaignId, buyer(마스킹 문자열), qty, unit(단가), opt?(옵션명), status('PAID'|'REFUNDED'), at(ymd), sample?(bool), tracking?, courier?`
- `'CANCELED'` 는 L1636·L2365 에서 필터로만 참조되고 어디서도 대입되지 않는다.

**messages** `{cid: [msg]}`, msg = `{type:'sys'|'chat'|'warn', txt, role?('seller'|'brand'|'admin'), at}` (L1343-1344, L1658-1664).

**cs** (L1319-1320, L4383, L4400): `id, cid, orderId|null, buyer, type, msg, status('OPEN'|'ANSWERED'|'CLOSED'), at, reply?, repliedAt?`

**celeryLedger** entry: `{who(sellerId|brandId), at, delta(±int), memo, won?(충전 원화)}` (L1231, L4041).

**settlements** entry: `{at, cid, title, net, brandPay, sellerPay, platFee, pfNet, holdS, holdB}` (L4260).

**exclusiveReqs**: `{id, productId, sellerId, status('PENDING'|'APPROVED'|'REJECTED'), at}` (L1282, L3921, L3926, L3931).

**refEarnings**: `{at, referrerId, fromSellerId, campaignId, amt}` (L1285, L4264). **brandRefEarnings**: `{at, referrerId, fromBrandId, campaignId, amt}` (L1228, L4269).

**기타 루트 상태**: `productViews[{sellerId, productId, ago}]` (시드 전용, L1261), `unlockedRefs[sid]` (전역, 브랜드별 아님, L1269), `brandDataUnlocks{bid:[sid]}` (L1270), `external{sid:[{name,brand,src,at,price}]}` (L1271), `autoPO{on,email}` (L4163), `opex{}` (L4428).

---

## 1. 캠페인 상태 머신

### 1.1 상태 정의 (L1194-1209)

| status | 라벨 | turn | 종결? |
|---|---|---|---|
| SAMPLE_REQUESTED | 샘플 요청 | brand | |
| INVITED | 브랜드 제안 · 수락 대기 | seller | |
| DECLINED | 제안 거절 | — | 종결 |
| REJECTED | 거절됨 | — | 종결 |
| SAMPLE_APPROVED | 샘플 발송 대기 | brand | |
| SAMPLE_PURCHASED | 샘플 구매 · 발송 대기 | brand | |
| SAMPLE_SHIPPED | 샘플 배송중 | seller | |
| TESTING | 테스트 중 | seller | |
| PASSED | 인플루언서 패스 | — | 종결 |
| SCHEDULE_PROPOSED | 일정 승인 대기 | brand | |
| SCHEDULE_CONFIRMED | 일정 확정 | — (스케줄러) | |
| LIVE | 판매 진행중 | — (스케줄러) | |
| CLEARING | 교환·환불 기간 | — (관리자 정산) | |
| SETTLED | 정산 완료 | — | 종결 |

- 메인 FLOW(스테퍼) L1210: SAMPLE_REQUESTED → SAMPLE_APPROVED → SAMPLE_SHIPPED → TESTING → SCHEDULE_PROPOSED → SCHEDULE_CONFIRMED → LIVE → CLEARING → SETTLED. 스테퍼는 SAMPLE_PURCHASED 를 SAMPLE_APPROVED 단계로, INVITED 를 SAMPLE_REQUESTED 단계로 매핑 (L1792).
- **"활성 캠페인"** 판정에 쓰이는 제외 집합 `['REJECTED','PASSED','DECLINED','SETTLED']` (L1413, L1473, L1891, L1916, L2282의 변형, L2452, L4299). 같은 (seller, product) 쌍에 활성 캠페인이 있으면 새 샘플 요청/구매/자동 제안 불가.
- `transition(cid, st, sysTxt)` L3790: status 대입 → 시스템 메시지 push → save → render. 이력 테이블 없음 (시스템 메시지가 사실상 이력).

### 1.2 전이 표

| # | from → to | 트리거 (ACT) | 가드 | 부수효과 |
|---|---|---|---|---|
| T1 | (신규) → SAMPLE_REQUESTED | `reqSample(pid)` L3862-3874 | ① `p.exclusiveSellerId && ≠ me` → 거부 L3864 ② `!freeEligible(p,me)` → 구매 모달로 우회 L3866 ③ `hadFreeSample(p,me)` → 구매 모달 L3867 ④ `sampleLeft(me)<=0` → 구매 모달 L3868. (UI 전용 가드: 같은 상품 활성 캠페인 있으면 버튼 비활성 L1473; 상품 status 'listed'만 갤러리 노출 L1949 — ACT 자체는 p.status 미검사) | 캠페인 push `{status:'SAMPLE_REQUESTED', createdAt:today}` L3870; sys "인플루언서 **name(handle)**가 샘플을 요청했습니다" L3872 |
| T2 | (신규) → SAMPLE_PURCHASED | `confirmSampleBuy(pid)` L3877-3887 | 결제수단 `cel` 이면 `celSpend(me, split.cel)` 잔액 가드 L3881 (부족 시 중단). 독점/노출상태/한도 가드는 ACT에 없음 (UI `sampleBtnHtml` L1472-1477 에만 의존) | 캠페인 `{purchased:true, samplePaid:{price,cel,cash,method}}` L3883; **주문 push** `{buyer:'name (샘플 구매)', qty:1, unit:price, status:'PAID', sample:true}` L3884; 🥬 결제 시 원장 −cel (memo `샘플 구매 · {p.name} (₩x 상당)`); sys 🧾 구매 메시지 (환급 상품이면 "판매 확정 시 구매액 환급" 문구) L3885 |
| T3 | (신규) → INVITED | `confirmInvite(sid)` L4057-4068 | ① `p.exclusiveSellerId && ≠ sid` 거부 L4059 ② 대상 등급 다이아/블랙 → `celSpend(brand,10)` 잔액 가드 L4061 ③ 제안 가능 상품은 `status==='listed'` 만 (모달 목록, L3721) | 캠페인 `{invited:true, celUsed:0|10}` L4064; sys "브랜드 **B**가 **P** 판매를 직접 제안했습니다 · 인플루언서 수락 대기" L4065; 메시지 있으면 chat(brand) push L4066 |
| T3' | (신규) → INVITED (자동) | `runAutoPropose()` L4448-4461 | `autoMatches()` 상위 5건; 다이아/블랙 대상이고 브랜드 잔액<10 이면 skip L4452 | `{invited:true, auto:true, celUsed}` L4456; 다이아/블랙이면 원장 −10 (memo `{등급} 인플루언서 자동 제안 · {p.name}`) L4454; sys 🤖 자동 제안 L4457 |
| T4 | INVITED → SAMPLE_APPROVED | `acceptInvite(cid)` L4069-4075 | ① `p.exclusiveSellerId && ≠ sellerId` L4071 ② `p.status!=='listed'` 거부 L4072. 무상 자격/월 한도 **검사 안 함** (초대 우회) | sys "제안을 **수락** · 샘플 발송 단계로 이동 (배송지 전달됨)" + 비공개 인플루언서면 "🔓 익명 인플루언서 신원 공개 — name handle" L4073 |
| T5 | INVITED → DECLINED | `declineInvite(cid)` L4076-4081 | 없음 | `c.celUsed>0` 이면 브랜드 원장 **+celUsed** (memo `제안 거절 환급 · {p.name}`), `c.celRefunded=celUsed` L4078; sys 거절 (+환급 문구) L4079 |
| T6 | SAMPLE_REQUESTED → SAMPLE_APPROVED | `approveSample(cid)` L4184 | 없음 | sys "브랜드가 샘플 요청을 **승인**했습니다 · 배송지 전달됨" |
| T7 | SAMPLE_REQUESTED → REJECTED | `rejectSample(cid)` L4185 | 없음 | sys "브랜드가 샘플 요청을 거절했습니다". 🥬 소비 없음 → 환급 없음 |
| T8 | SAMPLE_APPROVED \| SAMPLE_PURCHASED → SAMPLE_SHIPPED | `shipSample(cid)` L4186-4190 | 없음 (운송장 미입력 시 `6890-####-####` 랜덤 생성 L4187) | `c.tracking=t`; sys "샘플 발송 · 운송장 **t**" |
| T9 | SAMPLE_SHIPPED → TESTING | `receiveSample(cid)` L4191-4194 | 없음 | `c.testDue = today+14` L4192; sys "샘플을 수령 · 테스트 기한 **M/D**" |
| T10 | TESTING → PASSED | `passCamp(cid)` L4195 | 없음 | sys "테스트 후 **패스**" |
| T11 | TESTING → SCHEDULE_PROPOSED | `proposeSchedule(cid)` L4197-4215 | ① 시작일 필수 L4199 ② `en = st + len − 1` (len ∈ {3,5,7}) L4200 ③ `periodBlock(pid, st, en, cid, sellerId)` 가 상위 등급 선점 반환 시 거부 L4202-4203 ④ `qty<=0` 거부 L4204 ⑤ `qty > stockLeft(p, cid)` 거부 L4205. UI 기본값: 시작 today+7, min today+1, 재고 min(500, stockLeft), min 50 step 50 (L3690-3692, UI 전용) | `c.propStart/propEnd/propQty` 저장 L4206; sys "판매 일정을 제안 · **M/D – M/D** · 재고 n" L4213 |
| T11' | TESTING → SCHEDULE_CONFIRMED (재판매 우선권) | 같은 `proposeSchedule` L4208-4212 | T11 가드 통과 후 `c.regongu && passActive(seller,'regongu',30)` | `start/end/qty` 즉시 확정 (브랜드 승인 생략); sys "⚡ **재판매 우선권** — 일정 즉시 확정" |
| T12 | SCHEDULE_PROPOSED → SCHEDULE_CONFIRMED | `confirmSchedule(cid)` L4216-4224 | ① `periodBlock(...)` 재검사 (제안 이후 선점 발생 시 거부) L4218 ② `propQty > stockLeft(p,cid)` 거부 L4220 | `start=propStart, end=propEnd, qty=propQty` L4221; sys "브랜드가 일정을 **승인** · 기간 확정" |
| T13 | SCHEDULE_PROPOSED → TESTING | `rejectSchedule(cid)` L4225 | 없음 | prop* 필드는 유지됨; sys "일정 반려 · 다른 기간으로 재제안" |
| T14 | SCHEDULE_CONFIRMED → LIVE | ① 스케줄러 `autoTick()` L1425: `P(start) <= today` (render마다 실행 L1716) ② 관리자 시뮬 `goLive(cid)` L4226-4230 | goLive: `start>today` 면 `start=today`, `end<start` 면 `end=today+4` L4228 | sys "판매 시작 시각 도래 — 판매 링크 자동 활성화 (스케줄러)" / "판매 링크 활성화 — **판매 시작**" |
| T15 | LIVE → CLEARING | ① `autoTick()` L1426: `P(end) < today` (종료일 다음날부터) ② 관리자 시뮬 `endCamp(cid)` L4233-4239 | endCamp: `end=today` 로 덮어씀 L4234 | sys "판매 기간 종료 · 교환/환불 기간 시작 · 정산 예정 **M/D**"; `autoPO.on` 이면 추가 sys "📦 최종 발주서 자동 발송 완료 — email" L4237 |
| T16 | CLEARING → SETTLED | `runSettle(cid)` L4253-4274 (단건) / `runSettleAll()` L4441 (`CLEARING && settleDue(c)<=today` 일괄) | `runSettle` 자체엔 기준일 가드 없음 (UI가 `isDue` 일 때만 버튼 노출 L3101). `ffwd(cid)` L4240 는 `end=today−21` 로 당기는 시뮬 | §2.4 참조 (m3Sales 누적, 샘플 환급, settlements 기록, 지급 보류, 추천 보상, sys) |
| T17 | SETTLED → (신규 캠페인) TESTING | `regongu(cid)` L4166-4173 (seller/admin, 브랜드 화면엔 버튼 없음 L3672) | 없음 | 새 캠페인 `{status:'TESTING', testDue: today+14, regongu:true, sellerId/productId 동일}`; sys "🔁 **재판매** — 지난 판매(CID) 성과 기반. 샘플 단계 생략" (+우선권 보유 문구) |

역할별 액션 노출 규칙은 `detActions` L3594-3679 (V=seller/brand/admin). 관리자는 시뮬 버튼(goLive, simOrders, endCamp, ffwd)을 추가로 가진다.

### 1.3 캠페인 관련 파생 규칙

- 대기 카운트: 판매자 `['INVITED','SAMPLE_SHIPPED','TESTING']` (+정보성 SAMPLE_APPROVED/SAMPLE_PURCHASED, L2713-2716), 브랜드 `['SAMPLE_REQUESTED','SAMPLE_APPROVED','SAMPLE_PURCHASED','SCHEDULE_PROPOSED']` + 독점 PENDING (L2707-2711) + CS OPEN (L1700-1702), 관리자 = pending 상품 + 정산 기준일 도래 CLEARING (L1703).
- 상품 삭제 가드 L4299: `status ∉ ['REJECTED','PASSED','DECLINED']` 인 캠페인이 하나라도 있으면 삭제 불가 (SETTLED 포함 → 이력 보존).
- 상품 `paused` 는 새 샘플 요청만 막고(갤러리 비노출 L1949, 초대 수락 거부 L4072) 진행 중 캠페인은 유지 (L2615 문구).
- TESTING 기한(testDue) 만료 시 자동 전이 없음 — `autoTick` 은 SCHEDULE_CONFIRMED/LIVE 만 처리.
- 시드 시스템 메시지 L1345-1368 은 각 전이의 문구 표본.

---

## 2. 정산 수식 (있는 그대로)

### 2.1 캠페인 단위 `calc(c)` L1634-1655

입력: 해당 캠페인 주문 `os = orders where campaignId = c.id`, 상품 `p`, 판매자 `s`, 브랜드 `b`.

```
gross      = Σ unit*qty  over os where status != 'CANCELED'       // 실질 PAID + REFUNDED
refund     = Σ unit*qty  over os where status == 'REFUNDED'
net        = gross − refund                                       // == Σ PAID (netOf(c), L1534)
sampleNet  = Σ unit*qty  over os where sample && status == 'PAID' // 인플루언서 샘플 구매분

pg         = net * PG_RATE                       // 0.019
sf         = (net − sampleNet) * p.rate          // 인플루언서 기본 수수료 (샘플분 제외)
gBonus     = (net − sampleNet) * gradeBonusOf(s) // 등급 보너스 %p (블랙3·다이아2·플래티넘1.5·골드1·실버0.5·브론즈0.3·스타터0)/100, 플랫폼 부담  L1383
rb         = isRefBoost(c)        // 추천받은 판매자의 첫 REF_TIMES(5)회 판매 여부  L1617-1624
boost      = rb ? net * REF_BOOST : 0            // +1%p 판매자에게 (플랫폼 부담)
refReward  = rb ? net * REF_RATE  : 0            // 2% 추천인에게 (플랫폼 부담)
bb         = isBrandRefBoost(c)   // 추천받은 브랜드의 첫 BREF_TIMES(3)회 판매 여부  L1625-1633
bBoost     = bb ? net * BREF_DISC : 0            // −1%p 플랫폼 수수료 할인 → 브랜드에게
bReward    = bb ? net * BREF_RATE : 0            // 1% 추천 브랜드에게
bDisc      = net * bDiscOf(b)                    // 브랜드 등급 수수료 할인 (BG_DISC) → 브랜드에게
pfGross    = net * PLAT_RATE                     // 0.10 (샘플분 포함)
costs      = gBonus + boost + refReward + bBoost + bReward + bDisc
pf         = pfGross − costs                     // 플랫폼 수수료 매출 (VAT 포함)
vat        = pf > 0 ? pf − pf/1.1 : 0
pfNet      = pf − vat                            // 플랫폼 순수익 (PG는 통과 비용)
sfTotal    = sf + gBonus + boost                 // 인플루언서 총 수수료(세전)
brandPay   = net − pg − sf − pfGross + bBoost + bDisc
paidCnt    = count(status=='PAID'), refCnt = count(status=='REFUNDED')
```

보존식(검산): `net = pg + brandPay + sfTotal + refReward + bReward + pf` (성립).
관찰: `boost/refReward/bBoost/bReward/bDisc/pfGross` 는 **sampleNet 을 포함한 net** 기준, `sf/gBonus` 만 샘플분 제외.

### 2.2 원천징수·지급액

- `sellerWht(s)` L1656: `settleInfo.type==='biz'` → 0, 그 외(개인·미등록) → WHT 0.033.
- 인플루언서 실지급 = `sfTotal * (1 − sellerWht(s))` (+ 샘플 환급 현금, §2.4).
- 화면 불일치(기록): 판매자 정산 탭 L2087 과 실시간 매출 L2373 은 유형 무관하게 `sfTotal*(1−WHT)` 표시, 홈 L1813-1814·상세 L3671·관리자 L3100·runSettle 은 `sellerWht()` 사용. → DB/서버 계산은 `sellerWht` 기준으로 통일 권장.
- `settleDue(c) = P(c.end) + 21일` L1657. 정산 실행 가능 조건 `status==='CLEARING' && settleDue(c) <= today` (L3093, L4441).

### 2.3 환불 `refund(oid)` L4245-4252

가드: ① 주문 `status==='PAID'` ② 캠페인 `status!=='SETTLED'` (정산 후 환불 불가 → "별도 CS 정산 조정") ③ `o.sample` 이면 불가 (샘플 구매분은 스레드 협의). 효과: `status='REFUNDED'`; sys "환불 처리 · buyer · ₩x (정산액 차감)". 환불은 LIVE·CLEARING 둘 다 가능 (브랜드 주문 탭 L2798, 관리자 L3064).

### 2.4 정산 실행 `runSettle(cid)` L4253-4274 (순서대로)

1. `c.status='SETTLED'; c.settledAt=today` L4255.
2. `if (+c.id.slice(1) >= 100) s.m3Sales += k.net` L4256 — 시드(c1~c13) 제외, 런타임 생성 캠페인만 3개월 매출(등급·🥬 획득 기준)에 누적. (m3Sales 는 롤링 윈도우 계산이 코드에 없음 → **추정**: 실서비스는 최근 90일 확정매출 집계 뷰.)
3. 샘플 환급 L4258: `c.samplePaid && spOf(p).refund && !c.sampleRefunded` 이면 — `samplePaid.cel>0` → 판매자 원장 **+cel** (memo `샘플 구매 환급 · {p.name}`); `refundCash = samplePaid.cash`; `c.sampleRefunded=true`; sys "🎁 샘플 구매액 환급 — 🥬n + ₩cash (판매 확정 조건 충족)". 현금 환급 부담 주체는 calc/OPEX 어디에도 반영되지 않음 (🥬 결제분만 `celCover` 로 OPEX 반영 L3162).
4. 지급 보류 L4259: `holdS = !(s.settleInfo && s.settleInfo.account)`, `holdB = !(b.settleInfo && b.settleInfo.account)`.
5. `settlements.push({at, cid, title:'{p.name} · {handle}', net, brandPay, sellerPay: sfTotal*(1−wht)+refundCash, platFee: pf, pfNet, holdS, holdB})` L4260. 보류여도 레코드는 생성되고 status 는 SETTLED 로 감 (보류는 플래그).
6. 보류 시 sys "⏸ 지급 보류 — 인플루언서·브랜드 정산 계좌 미등록 …" L4261.
7. `refReward>0` → `refEarnings.push({referrerId: s.referredBy, fromSellerId, campaignId, amt})` + sys L4262-4266.
8. `bReward>0` → `brandRefEarnings.push({referrerId: b.referredBy, fromBrandId, campaignId, amt})` + sys L4267-4271.
9. sys "**정산 완료** · 브랜드 ₩brandPay (추천/등급 할인 포함) · 인플루언서 ₩sfTotal (보너스/부스트 포함) → 원천징수 3.3% 공제 후 ₩x | 사업자 정산(세금계산서) ₩sfTotal · 명세 발행" L4272.

CSV 명세 L4174-4183 컬럼: 캠페인, 상품, 인플루언서, 시작, 종료, 확정매출(net), PG수수료(round pg), 인플루언서수수료(round sfTotal), 플랫폼수수료(round pf), 브랜드정산액(round brandPay), 상태. 대상 status ∈ LIVE/CLEARING/SETTLED.

### 2.5 브랜드 정산 탭 L2801-2817

대상: 브랜드 상품의 캠페인 중 `status ∈ LIVE/CLEARING/SETTLED || c.samplePaid` (샘플 구매 캠페인은 SAMPLE_PURCHASED 상태여도 표시). 컬럼: 확정 매출 net, 인플루언서 수수료 **sf** (보너스 제외), 플랫폼+PG `pf+pg`, 브랜드 정산액 brandPay, 정산일 = SETTLED면 '완료' else settleDue. 계좌 미등록 판정 `!(bank && account && bizNo)` L2805.

### 2.6 관리자 매출·순수익 L3149-3252

- 집계 대상 `cs = status ∈ LIVE/CLEARING/SETTLED || samplePaid` L3150; `T` = calc 항목 합산 (T.sf 는 sfTotal 합, T.ref = boost+refReward, T.bref = bBoost+bReward) L3152.
- 셀러리 손익 L3153-3157: `topups = ledger where won`, `celWon = Σwon`, `celNet = round(celWon/1.1)`, `spent = −Σ(delta<0)`, `earned = Σ celEarned(all)`, `granted = Σ(delta>0 && !won)`, `bal = Σ celBal(all)` (부채, ×20,000원 환산 L3211).
- OPEX L3160-3174:
  ```
  ox = OPEX_DEF ⊕ data.opex
  celCover = Σ_campaigns (samplePaid.cel || 0) * SAMPLE_CEL_WON
  kakao    = ox.kakaoPer * orders.length * 3
  claude   = ox.claudePerCrawl * sellers.length * 30 + ox.claudePerMatch * (count(campaign.auto) + count(external items))
  fixedTotal = server+db+cs+domain+misc
  varTotal   = kakao + claude + pgFixed + celCover
  opexTotal  = fixedTotal + varTotal
  finalNet   = T.pfNet − opexTotal
  takeNet    = T.net ? T.pfNet / T.net : 0
  bep        = takeNet>0 ? opexTotal / takeNet : 0     // 손익분기 월 GMV
  ```
- 관리자 홈 KPI L2920-2922: `done = LIVE/CLEARING/SETTLED`, `gmv = Σnet`, `net = ΣpfNet`; 환불률 = REFUNDED 건수/전체 주문 건수 L2924.

### 2.7 브랜드 GMV·등급 입력

- `netOf(c) = Σ PAID unit*qty` (전 상태, 샘플 주문 포함) L1534.
- `bGmv(b) = b.gmvBase + Σ netOf(c) for c where product.brandId = b.id` L1529-1532 — 상태 무관(SAMPLE_PURCHASED·LIVE 도 즉시 반영).
- `platformGmv = Σ gmvBase + Σ netOf(all campaigns)` L3279.
- `celEarned(brand) = floor(bGmv/5e6)`, `celEarned(seller) = floor(m3Sales/5e6)` L1452-1455.

---

## 3. 기간·재고·가격·링크 규칙

### 3.1 기간 겹침 `periodHolders(pid, s, e, exceptCid)` L1674-1678

```
holders = campaigns where productId==pid && id!=exceptCid
          && status ∈ ['SCHEDULE_CONFIRMED','LIVE']
          && !( P(e) < P(c.start) || P(s) > P(c.end) )      // 양끝 포함(inclusive) 겹침
```
- CLEARING, SCHEDULE_PROPOSED 는 기간을 점유하지 않는다 (제안만 된 기간은 먼저 확정하는 쪽이 선점).
- 종료일 `end = start + len − 1` (len 3/5/7) L4200 → 5일 기간이면 start~start+4.

### 3.2 등급 우선권 `periodBlock` L1680-1685 (2026-09-14 정책, L1670-1672)

```
isPriority(seller) = tierIdx(gname(seller)) in [0..2]   // 블랙(0)·다이아(1)·플래티넘(2)  L1679, tierIdx L1516
periodBlock(pid,s,e,exceptCid,sellerId):
  me = seller(sellerId)
  if isPriority(me): return null                                   // 플래티넘↑ 은 항상 진입 가능
  hit = periodHolders(...).find(c => isPriority(seller(c.sellerId)))
  return hit ? seller(hit.sellerId) : null                         // 상위 등급이 잡은 기간이면 차단
```
- 즉 **동일 상품·겹치는 기간은 기본 공유**(배타 아님). 차단 조건은 "나는 골드 이하 AND 겹치는 확정/LIVE 캠페인 중 플래티넘 이상 판매자가 있음" 뿐.
- 검사 시점: 제안(T11) 과 승인(T12) 두 번. 등급은 검사 시점의 `m3Sales` 로 산출(저장 안 함).

### 3.3 재고 배정 L1686-1688

```
allocated(pid, exceptCid) = Σ c.qty  where productId==pid && id!=exceptCid && status ∈ ['SCHEDULE_CONFIRMED','LIVE']
stockLeft(p, exceptCid)   = max(0, (p.stock||0) − allocated(p.id, exceptCid))
```
- 제안/승인 시 `qty <= stockLeft` (L4205, L4220). CLEARING/SETTLED 캠페인은 배정 해제(재고를 되돌려줌).
- `p.stock` 은 주문으로 차감되지 않는다. 고객 구매 가드는 캠페인 배정량 기준: `left = c.qty − soldQty(cid)`, `soldQty = Σ qty of PAID orders` L1403, L4360. 환불되면 잔여로 복귀.
- 관리자 승인 / 우선검수 시 `stock = stock || 500` (L4029, L4275).

### 3.4 가격·수수료율 잠금 L4279-4296

- 저장된 `p.rate` = 인플루언서 몫만 (플랫폼 10%p 별도). 입력 총수수료율 t(%) → `rate = max(5, (t||30) − 10) / 100` (L4291, L4315). 즉 인플루언서 최소 5%, UI 입력 범위 11~50 (L3767).
- `locked = ∃ campaign(productId==pid, status ∈ ['SCHEDULE_CONFIRMED','LIVE','CLEARING'])` L4282 → cp/gp/rate 변경 무시(폼도 disabled L3765-3767). 재고·샘플정책·옵션·이미지·독점권은 수정 가능.
- 미잠금 상태에서 `gp` 또는 `rate` 가 바뀌고 `status==='listed'` 면 → `status='pending'` (재검수) L4293.
- 캠페인은 가격/수수료를 스냅샷하지 않고 항상 `prod(c.productId)` 를 참조한다 (calc L1639, 주문 unit 만 옵션가 스냅샷). → DB에서는 캠페인 확정 시 `gp/rate` 스냅샷 컬럼 권장 (**추정** 설계 제안).

### 3.5 옵션·주문 단가 L1398-1402

```
optsOf(p) = p.options?.length ? p.options
          : [{n:'1개', price:gp}, {n:'2개 세트 · 5% 추가 할인', price: r(gp*2*.95)}, {n:'3개 세트 · 10% 추가 할인', price: r(gp*3*.9)}]
r(v) = round(v/100)*100
```
고객 주문 `unit = 선택 옵션 price`, `opt = 옵션명`, `qty 1..10` (L4354, L4359-4363). 시뮬 주문은 `unit = p.gp` (L4091, L4476).

### 3.6 판매 링크·진입 보호

- 링크 형식: `sellery.co.kr/s/{handle without @}/{cid}` (L1842, L3546, L3502, L4411); 상세 미리보기 `sellery.co.kr/p/{pid}` (L3502).
- 프로토타입 해시 진입: `#s/cN` 또는 `#link/cN` — 정규식 `/^(?:s|link)\/(c\d+)$/` (L1591, L1596). 존재하는 캠페인이면 customer 뷰로 잠그고 `S.linkCtx={cid}` 저장.
- `LINKCTX_KEY='slry-linkctx'` localStorage `{cid, at}` L1566-1567. 해제 조건 L1573-1575: 캠페인이 사라졌거나 `(today − P(c.end))/DAY > 7` (종료 후 7일 초과). 미종료(end 없음)면 무기한 유지.
- 보호 규칙 `custVisible(c)` L3255-3260: linkCtx 가 있으면 링크 판매자의 캠페인은 모두 표시, 타 판매자 캠페인은 `p.id != lp.id && p.cat != lp.cat` 일 때만 표시 (같은 상품 OR 같은 카테고리 숨김).
- 판매 인증 모달 L4405-4419: 링크·인증 채널(verified) 목록·브랜드 등급·사업자번호·기간·에스크로 21일 표시.
- 상품 미리보기 `storeCamp('p:'+pid)` L3485-3489 는 가짜 캠페인 `{status:'PREVIEW', preview:true}`.

---

## 4. 샘플 규칙

### 4.1 월 한도 L1457-1460

```
sampleQuota(s) = i<=tierIdx('플래티넘') ? 5 : i<=tierIdx('실버') ? 2 : 1   // 블랙·다이아·플래티넘 5 / 골드·실버 2 / 브론즈·스타터 1
sampleUsed(s)  = count(campaigns where sellerId==s.id && !invited && !purchased && createdAt[0:7]==thisMonth)
sampleLeft(s)  = max(0, quota + (s.sampleExtra||0) − used)
```
- `sampleUsed` 는 상태 무관 → 거절(REJECTED)·패스된 요청도 이달 한도를 소모. `regongu` 캠페인도 (invited/purchased 플래그 없음) 카운트됨.
- `sampleExtra` 는 `buyItem('sample')` L4026 에서만 증가하나 `SHOP.seller` 에 id 'sample' 항목이 없다 (L1434-1440) → 도달 불가 코드. 등급 perk 문구(L1489-1495)와 quota 값은 일치.

### 4.2 무상 자격·상품당 1회 L1461-1467

```
spOf(p) = p.samplePolicy || { freeGrade: gp<30000?'브론즈' : gp<80000?'실버' : '골드', buyMode:'auto', fixedPrice:0, refund:false }
freeEligible(p,s) = tierIdx(gname(s)) > -1 && tierIdx(gname(s)) <= tierIdx(spOf(p).freeGrade)
hadFreeSample(p,s) = ∃ campaign(productId==p.id && sellerId==s.id && !purchased && !invited && status ∉ ['REJECTED','DECLINED'])
```
- `hadFreeSample` 는 PASSED·SETTLED·진행 중을 모두 포함 → 상품당 무상 샘플은 **평생 1회** (완판 후 같은 상품 재요청도 구매로 유도; 재판매는 `regongu` 로 샘플 생략).
- 초대(`invited`) 캠페인은 두 함수 모두에서 제외되어 한도·1회 규칙을 우회 (L3610 "무상 · 이달 한도 미차감").

### 4.3 구매 가격·🥬 분할 L1464-1465

```
samplePrice(p) = (sp.buyMode==='fixed' && sp.fixedPrice) ? sp.fixedPrice : round(gp*(1−rate)/10)*10   // 10원 단위 반올림
sampleSplit(price) = { cel: floor(price/20000), cash: price − cel*20000 }
```
결제수단 L3879-3881: `cel` 선택 시 `celSpend(seller, split.cel)` 후 `{price, cel, cash, method:'cel'}`; 아니면 `{price, cel:0, cash:price, method:'cash'}`. UI 는 `cel>0 && 잔액>=cel` 일 때만 🥬 옵션 활성 (L3697).

### 4.4 구매 샘플의 정산 취급

- 주문 1건(`sample:true`, PAID)으로 생성 → 브랜드에게 일반 판매와 동일하게 `net` 포함·플랫폼 10% 부과, 인플루언서 수수료/보너스 0 (calc `sampleNet` 제외, L1641-1643).
- 환불 불가(`refund` 가드 L4248). 판매 확정(SETTLED) 시 `samplePolicy.refund` 면 환급 (§2.4-3).
- 🥬로 낸 금액은 플랫폼이 브랜드에 원화로 보전 (OPEX `celCover` L3162).

### 4.5 테스트 창·패스

- `testDue = today + 14` (L4192 수령 시, L4170 재판매 생성 시); 문구 "테스트 기한 14일" L3631. 캘린더에 '테스트 마감' 이벤트 L2049. 만료 자동 처리 없음.
- 패스: T10. 패스 후 같은 상품 재요청은 `hadFreeSample` 로 구매 유도.

### 4.6 독점권 (exclusive)

- 오퍼: `p.exclusive={grade,label}`; `exGradeOf(p) = exclusive.grade || (exclusive.min>=5e7?'다이아':'플래티넘')` L1517; 브랜드 폼은 GRADES 상위 4개(블랙·다이아·플래티넘·골드)만 선택 L3759.
- 신청 자격 `exEligible = tierIdx(gname(s)) <= tierIdx(exGradeOf(p))` L1518. 신청 `reqExclusive` L3920 → `exclusiveReqs {status:'PENDING'}`; 중복 신청 UI 가드 = 동일 (product, seller) 에 `status!=='REJECTED'` 인 신청 존재 L2282.
- 승인 `approveExcl` L3924: `status='APPROVED'; p.exclusiveSellerId = sellerId`. 거절 `rejectExcl` L3929.
- `exclusiveSellerId` 효과: 타 판매자 샘플 요청 차단 L3864/L1472, 브랜드 초대 차단 L4059, 초대 수락 차단 L4071, 자동 매칭 제외 L1412. 기존 진행 캠페인엔 영향 없음. `saveProduct` 에서 `exclusiveSellerId` 가 있으면 exclusive 삭제 불가 L4290.
- 비공개 판매자가 독점 신청하면 브랜드에 프로필 공개 (문구 L2417, L3922).

---

## 5. 셀러리(🥬) 포인트·원장·유료 기능·추천

### 5.1 잔액 모델 L1452-1456, L1482-1485

```
celEarned(who) = who가 seller ? floor(m3Sales/CELERY_PER) : floor(bGmv(b)/CELERY_PER)     // 원장에 기록되지 않는 파생값
celBal(who)    = celEarned(who) + Σ ledger.delta where ledger.who == who
celSpend(who,n,memo): if celBal(who) < n → 실패(토스트, false); else push {who, at:today, delta:−n, memo}; true
```
- 획득분이 파생값이라 `m3Sales`/`bGmv` 가 오르면 잔액이 소급 증가한다. DB에서는 획득도 원장 이벤트로 적재하는 편이 안전 (**추정** 설계 제안).

### 5.2 원장 기록 지점 전수

| 위치 | who | delta | memo | 비고 |
|---|---|---|---|---|
| 시드 L1231-1238 | s*, b* | +3 / +5 / −2 | '가입 축하 지급', '입점 이벤트 지급', '매출 데이터 확인권 구매', '익명 레퍼런스 열람 · ○○○ 인플루언서' | |
| `confirmSampleBuy` L3881 | seller | −split.cel | `샘플 구매 · {p.name} (₩{cel*20000} 상당)` | method='cel' 일 때만 |
| `spendData` L1387-1391 → `unlockSellerData` L3890 | brand | −dataPrice(s) | `데이터 확인 · {name} {handle} ({grade})` | 다이아/블랙 브랜드 월 5회 무료면 원장 대신 `freeRefUsed[YYYY-MM]++` 후 0 반환 |
| `spendData` → `unlockRef` L3896 / `unlockRefGo` L3914 | brand | −dataPrice(s) | `익명 레퍼런스 열람 · ○○○ 인플루언서 ({grade})` | 동일 무료 규칙; `unlockedRefs` 에 sid push (전역) |
| `buyItem(id)` L4020-4036 | seller/brand | −it.price | `{it.name} 구매` | `homefeature` 대상 캠페인 없으면 `ledger.pop()` 으로 되돌림 L4032. `auto` 항목은 price 가 문자열('1–5')이라 buyItem 호출되면 안 됨(UI 미노출 L2334) |
| `buyDataPass(pid)` L4044-4048 | seller | −2 | '매출 데이터 확인권 구매' | `celeryItems.datapass = today` (영구) |
| `confirmInvite` L4061 | brand | −10 | `{다이아|블랙} 인플루언서 제안 · {p.name}` | 대상 등급 다이아/블랙만 |
| `runAutoPropose` L4454 | brand | −10 | `{grade} 인플루언서 자동 제안 · {p.name}` | 잔액<10 이면 skip |
| `declineInvite` L4078 | brand | +celUsed | `제안 거절 환급 · {p.name}` | |
| `runSettle` L4258 | seller | +samplePaid.cel | `샘플 구매 환급 · {p.name}` | refund 정책 상품만 |
| `topup(n)` L4037-4043 | seller/brand | +n, `won` | `셀러리 충전 (₩{won} 시뮬 결제)` | `won` 이 있으면 충전 매출로 집계 L3154 |
| `admGrant(who)` L4440 | any | +3 | '관리자 이벤트 지급' | |

### 5.3 데이터 열람 가격·무료 횟수

- `dataPrice(s) = DATA_PRICE[gname(s)] || 2` L1380.
- `freeRefLeft(b)` L1386: 브랜드 등급 다이아/블랙 만 `max(0, 5 − freeRefUsed[thisMonth])`, 그 외 0. 사용 시 `b.freeRefUsed[YYYY-MM]` 증가 L1389.
- 열람 상태 판정 `sellerCard` L2628: `unlocked = 브랜드 뷰 아님 || 함께 판매한 이력(worked) || passActive(brand,'datapass',30) || brandDataUnlocks[bid] ∋ sid`. `worked` = 해당 판매자의 LIVE/CLEARING/SETTLED 캠페인 중 내 브랜드 상품 존재 L2625-2626.
- 비공개(hidden) 판매자 레퍼런스: `unlockedRefs`(전역 배열, 브랜드 스코프 없음 L1269/L3897/L3915) 에 있으면 지표 공개+제안 가능 L2676-2685. 초대 수락 시 신원 공개 sys L4073.
- 판매자용 매출 데이터 확인권: 상품 실적 표에서 첫 행만 공개, 나머지 blur; `celeryItems.datapass` 보유 시 전체 L2274-2277.

### 5.4 유료 아이템 카탈로그 `SHOP` L1433-1450 와 효과

| role | id | 가격 | 효과 (buyItem L4020-4036) / 판정 |
|---|---|---|---|
| seller | samplepay | auto | 샘플 구매 시 자동 (§4.3) |
| seller | datapass | 2 | `celeryItems.datapass` 영구 (days 없음 → `passActive` 항상 true L1481) |
| seller | featured | 3 | `celeryItems.featured`; 갤러리 추천 점수 +5 (7일) L2674 |
| seller | homefeature | 3 | 내 LIVE/SCHEDULE_CONFIRMED 캠페인 `homeFeatured=today`; 고객 홈 7일 상단 `isHomeFeat` L3261, 정렬 L3285-3286 |
| seller | regongu | 2 | `celeryItems.regongu`; 30일 내 재판매 일정 제안 즉시 확정 (T11') |
| brand | diamond | 10 auto | 다이아/블랙 초대 시 자동 차감 |
| brand | ref / sdata | 1–5 auto | 열람 시 자동 차감 (§5.3) |
| brand | datapass | 30 (30일) | `passActive(brand,'datapass',30)` 갤러리 전체 열람 |
| brand | boost | 3 | 브랜드의 첫 listed 상품 `boosted=true`, `product.celeryItems.boost=today`; 갤러리 정렬·뱃지 7일 L1949, L1921 |
| brand | homefeature | 5 | 내 상품의 LIVE/SCHEDULE_CONFIRMED 캠페인 `homeFeatured=today` |
| brand | fastreview | 1 | 내 pending 상품 전부 `listed` (+stock\|\|500) — 관리자 검수 우회 |

`passActive(ent,id,days) = ent.celeryItems[id] && (!days || (today − P(date))/DAY < days)` L1481. 샵 화면의 "보유 중 · n일 남음" 계산 L2335. `it.repeat` 는 참조만 되고 정의 없음.

### 5.5 추천 프로그램

**인플루언서** (L1541, L1617-1624, L2230-2266): `refCode` 공유 → 신규 판매자 `referredBy`. `isRefBoost(c)`: 피추천 판매자의 LIVE/CLEARING/SETTLED 캠페인을 `createdAt` 오름차순 정렬했을 때 해당 캠페인 인덱스 < 5. 효과: 피추천인 `+1%p`(boost), 추천인 `2%`(refReward) — 정산 시 `refEarnings` 기록. 카운트는 calc 시점마다 재평가(저장 안 함).

**브랜드** (L1374, L1625-1633, L2535-2561): `refCode` → `referredBy`. `isBrandRefBoost(c)`: 피추천 브랜드 상품의 LIVE/CLEARING/SETTLED 캠페인 오름차순 인덱스 < 3. 효과: 피추천 브랜드 플랫폼 수수료 `−1%p`(bBoost → brandPay 가산), 추천 브랜드 `1%`(bReward) — `brandRefEarnings` 기록.

추천 코드 입력(가입) 흐름은 코드에 없다 (`referredBy` 는 시드 전용). **추정**: 회원가입 시 코드 검증 후 `referred_by` 세팅.

---

## 6. 스레드·메시징·CS

### 6.1 메시지 L1658-1665, L3561-3565

- `pushSys(cid, txt)` → `{type:'sys', txt, at}`; `txt` 는 HTML 조각(`<b>` 포함)이며 렌더 시 이스케이프하지 않음 (L3562). `pushChat(cid, role, txt)` → `{type:'chat', role, txt, at}`, 렌더 시 이스케이프.
- 연락처 유출 감지 (L1662-1664): `/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}|카톡|카카오톡|kakao/i` 매치 시 원문은 그대로 저장하고 뒤에 `{type:'warn', txt:'⚠ 연락처/외부 메신저 공유가 감지되었습니다. …'}` 를 추가 push. 차단 아님.
- 발신 역할 `sendChat` L4465-4469: seller 뷰 → 'seller', 그 외(brand·admin) → 'brand' (관리자는 브랜드 대행, 주석 L4467). 렌더에는 role 'admin' 분기('셀러리 운영팀')가 있으나 생성 경로는 없다 (L3564, L2004).
- 읽음: 저장 필드 없음. `unread = 마지막 메시지가 chat && role != 내 role` (L2003, L2736-2742). DM 정렬 = 마지막 메시지 at 내림차순, 동률이면 createdAt 내림차순 L2006. 검색 대상 필드 L2009.
- 관리자 최근 활동 피드 = 모든 캠페인의 sys 메시지를 at 내림차순 (L2936-2937).

### 6.2 고객 CS (L1689-1694, L4377-4404, L2880-2915)

- 접수 `submitCS(cid)`: `{id, cid, orderId|null, buyer:'고객', type∈CS_TYPES, msg, status:'OPEN', at}` + 캠페인 스레드에 sys "💬 구매 고객이 **type** 문의를 남겼습니다 — **brand** 고객 문의함으로 전달". 배정 = `csBrandId(x) = prod(camp(x.cid).productId).brandId` (파생, 저장 안 함).
- 답변 `saveCSReply`: `reply, repliedAt, status='ANSWERED'` + sys "💬 브랜드가 고객 문의에 답변했습니다 (type)". 답변 수정 가능(ANSWERED 상태에서도 L2901). 종료 `csClose` → 'CLOSED' (CLOSED 는 종결, 재오픈 없음).
- 브랜드 목록 정렬: OPEN 우선, at 내림차순 L2881. 관리자는 전체 조회만 (L3066-3078), 답변 UI 없음. 고객 알림은 "알림톡" 문구만(시뮬).

---

## 7. 고객 스토어·주문·발주·송장

### 7.1 구매 `buyNow(cid)` L4355-4376

가드: ① `S.view.role==='customer'` (미리보기에서 주문 생성 금지) ② `c.status==='LIVE'` ③ `left = c.qty − soldQty(cid) >= q` ④ 수량 1..10 (L4354). 주문 `{buyer:'고객(구매 페이지)', qty, unit:옵션가, opt, status:'PAID', at}`. 완료 모달 문구: 에스크로 보관, 종료 후 21일 후 정산, 브랜드 직배송, 운송장 알림톡, "실서비스에서는 PG 결제창". 고객 계정/로그인 없음(카카오 로그인 시뮬 L4424).

### 7.2 시뮬레이션 주문

- `simSell(cid, n)` L4471-4479: n건, `qty = 25% 확률 2 else 1`, `unit = p.gp`, buyer 마스킹 이름 8종. 관리자 상세 버튼 +5/+20 (L3660-3661).
- `toggleLive` L4082-4098: 3.5초마다 80% 확률로 LIVE 캠페인 중 하나에 주문 (`qty` 20% 확률 2).
- `viewersOf(cid)` L3278: `14 + ((Σcharcode(cid)*31 + floor(now/20s)*7) % 53)` — 데이터 아님, 표시용 의사난수. 고객 홈 "지금 보는 중" = Σ viewersOf(LIVE) + 41 L3290; 알림 수 = 12 + viewersOf L3273.
- 방문/전환 추정 L2361-2362: `visits = round((paidCnt+refCnt)*17.3)`, `conv = 건수/visits`.

### 7.3 주문 피드·조회 범위

- 실시간 매출 L2347-2386: LIVE 캠페인만; 오늘 매출 = `at==today && PAID`; 최근 7일 막대 = `status!='CANCELED'` 합; 피드 = 최근 10건 역순.
- 브랜드 주문 탭 L2769-2800: 내 상품 캠페인 주문 최근 40건 역순; 배송 상태 파생 = REFUNDED→'환불', PAID&&tracking→'배송중', PAID→'결제완료' (L2797). 미발송 = `PAID && !tracking` L2774.
- 관리자 주문 L3048-3065: 전체를 at 내림차순·id 내림차순, 필터 all/PAID(미발송)/SHIP(배송중)/REFUNDED, 최근 60건. 정산 완료 캠페인 주문은 '환불 불가' 표시.
- 고객 홈 실시간 순위 L3294: `status ∈ LIVE/SCHEDULE_CONFIRMED/CLEARING && custVisible` 를 soldQty 내림차순 TOP5. 진행 중 정렬: homeFeatured 우선 → soldQty 내림차순; 예정: homeFeatured → start 오름차순 (L3285-3286). 오늘 판매 개수 = `at==today && PAID && !sample` 의 Σqty L3289.

### 7.4 발주서·송장 CSV (BOM + CRLF, 모든 셀 따옴표, L1603-1608)

- 발주서 `poCSV` L4145-4154: 파일 `발주서_{brand}_{ymd}.csv`; 헤더 `['주문번호','일자','상품','인플루언서','구매자','수량','단가','금액','상태']`; 값 = `id.toUpperCase(), at, p.name, seller.handle, buyer, qty, unit, unit*qty, PAID?'결제완료':'환불'`; 대상 = 브랜드 상품의 모든 캠페인 주문(상태 무관, 샘플 주문 포함).
- 송장 양식 `trackCSVTemplate` L4111-4118: `['주문번호','운송장번호']`, 대상 `PAID && !tracking`, 파일 `송장양식_{ymd}.csv`.
- 송장 업로드 `trackCSVPick` L4119-4144: BOM 제거, 줄 단위, 구분자 `,` 또는 탭, 따옴표 제거; 헤더('주문번호' 포함) 스킵; `id` 대소문자 무시 매칭; `status==='PAID'` 인 주문에만 `tracking` 세팅 (**courier 는 세팅 안 함**). 이미 tracking 있는 주문도 덮어씀.
- 단건 `saveTrackOne` L4105-4110: 택배사 5종 선택(`CJ대한통운, 우체국택배, 한진택배, 롯데택배, 로젠택배`) + 운송장 → `tracking, courier`. 시드 택배사 4종 L1340.
- 이메일 발주 `poEmail` L4155-4159: 토스트만(시뮬). 자동 발주 `saveAutoPO` L4160-4165: `autoPO={on:!on, email}` (전역 단일 객체 — 브랜드별 아님), 기본 `logistics@brand.co`; 문구 "매일 09:00 발송 + 판매 종료 시 최종 발주서"; endCamp 시 sys (T15).

---

## 8. 랭킹·등급·익명성

### 8.1 인플루언서 등급 L1488-1498, L1516

| 등급 | min(m3Sales) | bonus(%p) | 상위% | 샘플/월 | tierIdx |
|---|---|---|---|---|---|
| 블랙 | 100,000,000 | 3 | 1 | 5 | 0 |
| 다이아 | 50,000,000 | 2 | 3 | 5 | 1 |
| 플래티넘 | 30,000,000 | 1.5 | 8 | 5 | 2 |
| 골드 | 15,000,000 | 1 | 18 | 2 | 3 |
| 실버 | 8,000,000 | 0.5 | 35 | 2 | 4 |
| 브론즈 | 3,000,000 | 0.3 | 60 | 1 | 5 |
| 스타터 | 0 | 0 | 100 | 1 | 6 |

`gradeOf(m) = GRADES.find(t => m >= t.min)` (내림차순 첫 매치), `gname(s) = gradeOf(s.m3Sales).g`, `tierIdx(g)` = 배열 인덱스(작을수록 상위). 등급은 저장하지 않고 매번 계산. `m3Sales` 는 시드값 + 정산 시 누적(§2.4-2)만 존재.

- 다음 등급 진행률 `pct = min(100, round(m3Sales / next.min * 100))` L1823, L2097.
- 성장세 `growthOf(s)` L1405: `recentLikes` 후반 평균 / 전반 평균 − 1 (%).
- 외부 판매 추정 `estExternal` L1480: `orders = followers*(likesAvg/followers)*6*0.015`, `mid = orders*price`, 범위 ±25% (가계산 표기 L2651).

### 8.2 리더보드·익명 L2093-2126

- 정렬 = `m3Sales` 내림차순 전체 판매자(hidden 포함). 본인 행만 실명+MY, 타인은 '○○○ 인플루언서' + 플랫폼 아이콘·카테고리·3개월 매출·매출/팔로워·매출/좋아요·등급 공개 (L2118-2123, 각주 L2125 "저격 불가").
- 상품 실적 표(L2296-2299)도 판매자 익명(팔로워·좋아요·참여율·기간·확정매출·상태만).
- 브랜드 홈 TOP5 L2476-2479: hidden 이면 '○○○', 클릭 시 `topSeller` → hidden&&미열람이면 유료 열람 모달 L3902-3911.
- 갤러리 등급 필터 `tierIdx(gname(s)) <= tierIdx(gf)` L2671; 탐색 "동급 이상 베스트셀링" `m3Sales >= myTier.min` L1953.
- `hidden` 토글은 관리자만 (`admToggleHidden` L4439); 관리자는 실명 표시 L3120.
- 인플루언서 갤러리 추천 점수 L2674: `(catFit?2:0) + (m3Sales/followers)/300 + (featured 7일?5:0)`; 브랜드 홈 추천 L2452: `(catFit?2:0) + growth/50 + (m3Sales/followers)/300`.

### 8.3 브랜드 등급 L1520-1536

| 등급 | min(bGmv) | 수수료 할인 | 상위% |
|---|---|---|---|
| 블랙 | 1,000,000,000 | −2%p | 1 |
| 다이아 | 500,000,000 | −1.5%p · 데이터 열람 월 5회 무료 | 3 |
| 플래티넘 | 200,000,000 | −1%p | 8 |
| 골드 | 80,000,000 | −0.5%p | 18 |
| 실버 | 30,000,000 | 0 | 35 |
| 브론즈 | 10,000,000 | 0 | 60 |
| 스타터 | 0 | 0 | 100 |

`bgname(b) = bgradeOf(bGmv(b)).g`; 할인은 `BG_DISC` (L1382) 로 정산에 반영(§2.1 bDisc); 무료 열람은 §5.3.

### 8.4 채널 인증 L2193-2227, L3935-3973

- 채널 추가 → `verified:false`; 인증 모달에서 `vcode='SLRY-'+4자리(base36 대문자)` 생성 저장 L2208; `confirmVerify` → `verified=true, vcode 삭제` (프로토타입 즉시 성공). 핸들/플랫폼 변경 시 `verified=false, vcode 삭제` L2944.
- 메인 채널: `setPrimaryCh` 는 `verified` 채널만 L3961; 성공 시 `seller.platform/handle/followers` 를 채널값으로 동기화 L3963. 메인 채널 삭제 불가 L3954. 판매 인증 모달·고객 화면은 verified 채널만 표시 L4407.

---

## 9. 관리자 기능

### 9.1 상품 검수 상태 (L2968 PSTATS: pending·listed·paused·rejected)

| 전이 | 트리거 | 효과 |
|---|---|---|
| (신규) → pending | `createProduct` L4309-4319 | 상품 생성 (`em:'📦'`, thumb/imgs dataURL, options 파싱 `"옵션명 | 가격"` 줄단위, samplePolicy, exclusive) |
| pending → listed | `approveProduct(pid)` L4275 | `rejectReason` 삭제, `stock = stock || 500` |
| pending → rejected | `rejectProduct(pid)` L4276 | `rejectReason = prompt(...) || '검수 기준 미달'` (브랜드 화면에 표시 L2605) |
| rejected → listed | `approveProduct` (관리자 '승인으로 변경' L3004) | 동일 |
| rejected → pending | `saveProduct` L4294 | 브랜드가 수정 저장 시 자동 재검수 요청, reason 삭제 |
| listed → pending | `saveProduct` L4293 | 미잠금 상태에서 gp/rate 변경 시 |
| listed ↔ paused | `toggleListing` L4304-4308 | pending/rejected 에서는 불가 |
| pending → listed (전부) | `buyItem('fastreview')` L4029 | 브랜드 🥬1 로 검수 우회 |
| 삭제 | `deleteProduct` L4297-4303 | §1.3 가드 |

검수 정책 문구: 건강·웰니스 카테고리 한정, 표시광고 사전심의 체크리스트 (L1946, L3083). 카테고리 값은 `CATS` 중 '전체' 제외 (L3762, L4312 기본 '건기식' 은 CATS 밖 값 — 불일치 기록).

### 9.2 자동 매칭 `autoMatches()` L1409-1419 / `autoTick` L1422-1429

```
for b in brands where autoPropose:
  for p in products where brandId==b.id && status=='listed' && !exclusiveSellerId:
    cands = sellers where catFit(p,s)  // CATMAP 그룹 동일  L1407
            && !∃ campaign(productId==p.id && sellerId==s.id && status ∉ ['REJECTED','PASSED','DECLINED','SETTLED'])
    score = round(growthOf(s)*0.6 + (m3Sales/followers)/10 + (hidden?0:5))
    take top 2 by score
return all sorted by score desc
```
`runAutoPropose` 는 상위 5건 발송(T3'). 브랜드별 ON/OFF `toggleAutoPropose` L4447. `autoTick` 은 스케줄러 대행(T14/T15) — 실서비스에서는 cron/Edge Function 필요 (**추정**).

### 9.3 매출·OPEX 시뮬 — §2.6. `saveOpex` L4428 는 `OPEX_DEF` 키 전부를 `data.opex` 에 저장, `resetOpex` L4429 삭제.

### 9.4 정산 실행 화면 L3091-3109
- 대기 = CLEARING 전체; 실행 가능 = `settleDue<=today`; 미도래는 `D-n` + ffwd 시뮬. 정산 정보 미등록 경고는 `!seller.settleInfo || !brand.settleInfo` 객체 존재 여부만 검사(L3100) — runSettle 의 `account` 검사와 다름.
- 완료 표 = `settlements` (보류 플래그 표시).

### 9.5 CS·기타 역할
- 관리자는 CS 목록 열람만(§6.2), 스레드 발신은 브랜드 대행(§6.1), 🥬 +3 지급(§5.2), 비공개 토글(§8.2), 데이터 초기화 `reset` L3858.
- 관리자 홈 할 일 L2932-2935: 검수 대기 / 정산 실행 가능 / 독점권 PENDING / 미발송(PAID&&!tracking) / 미인증 채널 수 / 정산정보 미등록 계정(`!settleInfo.account`, 브랜드+판매자) / 자동 제안 후보.

---

## 10. DB가 강제해야 할 불변식 요약 (코드 근거)

1. 캠페인 status ∈ 14개 열거값 (L1194-1209); 전이는 §1.2 표만 허용. 종결 상태 DECLINED/REJECTED/PASSED/SETTLED 에서 나가는 전이 없음(재판매는 새 행).
2. `(seller, product)` 에 활성 캠페인(status ∉ REJECTED/PASSED/DECLINED/SETTLED)은 최대 1개 — UI 가드(L1473)이므로 DB 부분 유니크 인덱스로 승격 권장.
3. `invited=true` ⇔ status 가 INVITED 로 시작한 행; `purchased=true` ⇒ `samplePaid` 존재 & `sample=true` 주문 1건 존재 (L3883-3884).
4. `SCHEDULE_PROPOSED` ⇒ propStart/propEnd/propQty not null; `SCHEDULE_CONFIRMED` 이후 ⇒ start/end/qty not null, `end >= start`, `qty > 0`; `SETTLED` ⇒ settledAt not null.
5. 같은 상품의 SCHEDULE_CONFIRMED/LIVE 캠페인 qty 합 ≤ product.stock (L1687-1688, 승인 시점 검사).
6. 같은 상품·겹치는 기간(inclusive)에 플래티넘↑ 확정/LIVE 캠페인이 있으면 골드↓ 판매자 캠페인 확정 불가 (L1680-1685). 배타 제약이 아니라 등급 조건부 — 트리거/RPC 에서 검사.
7. 주문 status ∈ {PAID, REFUNDED} (CANCELED 미사용); `sample=true` 주문은 환불 불가; 캠페인 SETTLED 후 환불 불가 (L4246-4248). PAID 주문 Σqty ≤ campaign.qty (L4360, 고객 경로).
8. 상품 status ∈ {pending, listed, paused, rejected}; `rejected` ⇒ rejectReason; listed→pending 은 가격/수수료 변경 시; 확정/LIVE/CLEARING 캠페인 존재 시 cp/gp/rate 불변 (L4282).
9. `product.rate ≥ 0.05` (L4291/L4315 max(5,…)), 총 수수료 = rate + 0.10.
10. 원장 delta 정수(±), 잔액(파생 획득 + Σdelta) ≥ 0 은 `celSpend` 가드로만 보장 (L1483) — DB 에서는 잔액 뷰 + 차감 RPC 에서 검사.
11. 샘플: 판매자당 상품당 무상 샘플(!invited && !purchased && status ∉ REJECTED/DECLINED) 최대 1행 (L1467); 월 한도 = quota(grade)+sampleExtra (L1458-1460).
12. `settlements` 는 캠페인당 1행(runSettle 이 SETTLED 로 바꾸므로 재실행 없음 — 단 runSettle 자체에 status 가드가 없어 UI에만 의존, DB 유니크 필요). `sampleRefunded` 는 1회만.
13. 독점: `exclusiveReqs` PENDING 은 (product, seller) 당 1건(UI L2282); APPROVED ⇒ `product.exclusiveSellerId = sellerId`.
14. 채널: 판매자당 `primary=true` 정확히 1개(시드 기준, 삭제 금지 L3954), `primary ⇒ verified` (L3961; 시드 ch1 은 verified&&primary).
15. CS status ∈ {OPEN, ANSWERED, CLOSED}; ANSWERED ⇒ reply/repliedAt.
16. 판매자 정산정보 `type ∈ {personal, biz}`, `biz ⇒ bizNo` (L3978); 브랜드 정산정보는 bank/account/holder/bizNo 필수 (L3807).
17. 브랜드 `freeRefUsed[YYYY-MM] ≤ 5` 는 `freeRefLeft` 로 보장 (다이아/블랙만 의미).
18. 링크 진입 보호는 클라이언트 localStorage 전용 (DB 대상 아님); 판매 링크 식별자는 `(seller.handle, campaign.id)`.

## 11. 코드에서 발견된 비일관·미구현 (설계 시 결정 필요)

- 판매자 정산 탭/실시간 매출은 사업자 여부 무시하고 3.3% 공제 표시 (L2087, L2373) vs 그 외는 `sellerWht` — 서버 계산은 `sellerWht` 로.
- `unlockedRefs` 가 브랜드 스코프가 아님 (한 브랜드가 열람하면 모든 브랜드에 공개) — DB 는 `(brand_id, seller_id)` 로.
- `autoPO` 가 전역 단일 객체 — 브랜드별 컬럼으로.
- `SHOP.seller` 에 'sample' 항목 없음 → `sampleExtra` 증가 경로 없음; `it.repeat` 미정의.
- `sampleUsed` 가 REJECTED/PASSED/regongu 캠페인까지 월 한도로 계산.
- `runSettle` 에 status/기준일 가드 없음(UI 의존); `confirmSampleBuy` 에 독점/노출상태 가드 없음(UI 의존).
- 캠페인이 상품 가격/수수료를 스냅샷하지 않음(잠금으로 우회) — 스냅샷 컬럼 권장.
- 샘플 현금 환급(refundCash)의 부담 주체가 손익에 미반영.
- `createProduct` 기본 cat '건기식' 은 `CATS` 에 없음.
- 추천 코드 입력·회원가입·고객 계정·PG·알림톡·이메일·스케줄러는 전부 시뮬/미구현 (문구만).
