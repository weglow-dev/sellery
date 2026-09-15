# 셀러리 프로토타입 — 영속 데이터 모델 추출 (OLD/index.html + login.html)

- 원본: `E:/위글로우/셀러리/index.html` (4,533줄, 읽기 전용) · `E:/위글로우/셀러리/login.html` (297줄)
- 기준일: 2026-09-14 · 시드 버전 키 `sellery-proto-v29` (L1373)
- 표기: 줄 번호는 index.html 기준 `L####`. login.html 은 `login.html L###`.
- "추정" 표시가 없는 내용은 코드에서 직접 확인한 사실이다.

---

## 0. 저장 구조 개요

| 항목 | 값 | 근거 |
|---|---|---|
| 저장소 | `localStorage[LS]` 에 `JSON.stringify(S.data)` 통째로 저장 | `save()` L1561, `load()` L1556 |
| LS 키 | `'sellery-proto-v29'` | L1373 |
| 루트 객체 | `S.data` = `seedData()` 반환 객체 (아래 컬렉션 목록) | L1219–1370 |
| 시퀀스 | `S.data.seq` (int, 시드 시작 100) — 모든 신규 id 는 `'<prefix>'+(seq++)` | L1324, L1330, L3869 등 |
| id 접두사 | `b`=brand, `s`=seller, `p`=product, `c`=campaign, `o`=order, `cs`=cs 문의, `x`=exclusiveReq, `ch`=channel | 시드 + ACT 생성부 |
| 날짜 형식 | 모두 `'YYYY-MM-DD'` 문자열 (`ymd()` L1189), 파싱은 `P()` L1190 (`T00:00:00` 로컬) | — |
| 금액 | 정수 KRW (`Math.round`/`fmt`) | — |
| 비율 | 소수 float (0.20 = 20%) | — |
| 이미지 | data-URI 문자열(canvas `toDataURL`) 또는 상대경로 `'assets/…'` | L1215–1218, L3824, L4010, L3730 |

### 0.1 S.data 하위 컬렉션 전체 목록 (grep `D_().X`, `S.data.X`, `data.X`)

| # | 키 | 형태 | 시드 건수 | 정의 | 접근 횟수 |
|---|---|---|---|---|---|
| 1 | `brands` | array | 2 | L1223 | 13 |
| 2 | `sellers` | array | 8 | L1240 | 23 |
| 3 | `products` | array | 10 | L1287 | 34 |
| 4 | `campaigns` | array | 13 | L1302 | 72 |
| 5 | `orders` | array | 34+57+412+548+1 = 1,052 (mkOrders) | L1317, L1327–1338 | 18 |
| 6 | `messages` | **object** `{[campaignId]: Message[]}` | 11 캠페인 스레드 | L1322, L1343–1368 | 8 |
| 7 | `celeryLedger` | array | 10 | L1230 | 14 |
| 8 | `cs` | array | 2 | L1318 | 2 (+ `csList()` 헬퍼 L1691) |
| 9 | `settlements` | array | 0 | L1323 | 2 |
| 10 | `exclusiveReqs` | array | 1 | L1281 | 8 |
| 11 | `refEarnings` | array | 1 | L1284 | 3 |
| 12 | `brandRefEarnings` | array | 1 | L1227 | 3 |
| 13 | `productViews` | array | 6 | L1261 | 1 (읽기만, 시드 전용) |
| 14 | `external` | **object** `{[sellerId]: ExternalItem[]}` | 8 셀러 | L1271 | 2 (읽기만, 시드 전용) |
| 15 | `unlockedRefs` | array of sellerId | 0 | L1269 | 6 |
| 16 | `brandDataUnlocks` | **object** `{[brandId]: sellerId[]}` | `{b1:['s1'],b2:['s7']}` | L1270 | 3 |
| 17 | `autoPO` | **object** `{on,email}` (단일 전역) | 없음(undefined) | L4163 | 6 |
| 18 | `opex` | **object** (관리자 운영비 오버라이드, 단일 전역) | 없음 | L4428 | 4 |
| 19 | `seq` | int | 100 | L1324 | 13 |

> 시드에 없고 런타임에만 생기는 키: `autoPO`, `opex`. 시드에만 있고 쓰기 코드가 없는 키: `productViews`, `external`.

### 0.2 S.data 밖의 브라우저 저장 키 (참고 — 영속 데이터 아님)

| 키 | 저장소 | 형태 | 근거 |
|---|---|---|---|
| `sellery-session` | localStorage | 로그인 세션 (6장) | L1585, login.html L174 |
| `slry-linkctx` | localStorage | `{cid, at}` — 판매 링크 진입 보호 | L1566–1578 |
| `slry-stage` | localStorage | UI 스킨 문자열 | L3854 |
| `slry-boot` | sessionStorage | 부트 화면 1회 표시 플래그 | L4483 |

---

## 1. brands

배열. 시드 L1223–1226. 브랜드 신규 생성 코드는 index.html 에 없음(login.html 가입은 데모 `b1` 로 매핑 — 6장).

| field | type | nullable | example (seed) | set-where |
|---|---|---|---|---|
| `id` | string `'b'+n` | N | `'b1'` | 시드 L1224 |
| `name` | string | N | `'바인허브'` | 시드 |
| `cat` | string (브랜드 카테고리) | N | `'건강기능식품'`, `'이너뷰티·피부'` | 시드 · 읽기 `CATMAP[b.cat]` L2672 |
| `manager` | string (담당자명) | N | `'김바인'` | 시드 · `saveBrandInfo` L3805 |
| `email` | string | Y (`b.email||''` L2834) | `'partner@vyneherb.co'` | 시드 · L3806 |
| `settleInfo` | object (아래) | Y (`b.settleInfo||{}`) | — | 시드 · L3808 · L3842 |
| `settleInfo.bank` | string enum(은행 목록 §3.12) | N(저장 시 필수) | `'기업'` | L3808 |
| `settleInfo.account` | string(숫자만) | N | `'12345678901234'` | L3808 |
| `settleInfo.holder` | string | N | `'(주)바인허브'` | L3808 |
| `settleInfo.bizNo` | string `'000-00-00000'` | N(브랜드는 필수) | `'214-88-01234'` | L3808 |
| `settleInfo.mailOrder` | string 통신판매업 신고번호 | Y | `'제2024-서울강남-01234호'` | 시드 b1 · L3808 |
| `settleInfo.bizDoc` | string (파일명만) | Y | — | `brandDocPick` L3842 |
| `gmvBase` | int KRW (시드 이전 누적 GMV) | Y (`b.gmvBase||0`) | `52000000` | 시드만 · 읽기 `bGmv` L1531, `platformGmv` L3279 |
| `logo` | data-URI string (SVG/JPEG/PNG) | Y (`b.logo?`) | `BLOGO1` (svg data-URI) | 시드 · `brandLogoPick` L3824 (192px canvas) |
| `refCode` | string | Y (`b.refCode||'—'` L2546) | `'VYNE-01'`, `'GLO-002'` | 시드만 |
| `autoPropose` | bool | Y (b2 undefined) | `true` | 시드 b1 · `toggleAutoPropose` L4447 |
| `referredBy` | string brandId | Y | b2 → `'b1'` | 시드만 |
| `freeRefUsed` | object `{'YYYY-MM': int}` | Y | `{'2026-09':1}` | `spendData` L1389 (다이아·블랙 월 5회 무료 열람 카운터) |
| `celeryItems` | object `{[shopItemId]: 'YYYY-MM-DD'}` | Y | `{datapass:'2026-09-14'}` | `buyItem` L4027 (`ent` 가 브랜드일 때) · 읽기 `passActive` L1481 |
| `sampleExtra` | int | Y | — | `buyItem` L4026 (id==='sample' 분기 — SHOP 에 해당 id 없음, 사실상 데드코드) |

브랜드 `settleInfo` 에는 `type` 이 없음(항상 사업자). 정산 보류 판정은 `!(b.settleInfo&&b.settleInfo.account)` L4259.

---

## 2. sellers (인플루언서)

배열. 시드 L1240–1259. 신규 생성 코드 없음(login.html 가입은 `s1` 매핑).

| field | type | nullable | example (seed) | set-where |
|---|---|---|---|---|
| `id` | string `'s'+n` | N | `'s1'` | 시드 |
| `name` | string (활동명) | N | `'지유'` | 시드 |
| `handle` | string `'@…'` | N | `'@jiyu_beauty'` | 시드 · `setPrimaryCh` L3963 (메인 채널 핸들로 동기화) |
| `email` | string | N | `'jiyu@sellery.demo'` | 시드 (login.html ACCOUNTS 와 동일) |
| `platform` | enum `instagram\|youtube\|naver\|tiktok` | N | `'instagram'` | 시드 · L3963 (메인 채널 플랫폼으로 동기화) |
| `settleInfo` | object | Y (s4–s8 없음; `me.settleInfo||{}`) | — | 시드 · `saveSettleInfo` L3979 · L3990 |
| `settleInfo.type` | enum `'personal'\|'biz'` | N(저장 시) | `'personal'` | L3979 · 읽기 `sellerWht` L1656 |
| `settleInfo.bank` | string enum(§3.12) | N | `'카카오뱅크'` | L3979 |
| `settleInfo.account` | string | N | `'3333012345678'` | L3979 |
| `settleInfo.holder` | string | N | `'김지유'` | L3979 |
| `settleInfo.bizNo` | string | Y (type==='biz' 시 필수) | `'512-21-00987'` | L3979 |
| `settleInfo.bizDoc` | string (파일명) | Y | — | `bizDocPick` L3990 |
| `img` | data-URI(jpeg base64) 또는 상대경로 | Y (`s.img?`) | `AV1` / `'assets/av-s2.svg'` | 시드 · `avatarPick` L4010 (256px jpeg .82) |
| `followers` | int | N | `84300` | 시드 · L3963 (메인 채널 followers 로 동기화) |
| `cat` | enum 7 카테고리(§3.8) | N | `'이너뷰티·피부'` | 시드만 |
| `likesAvg` | int | N | `3100` | 시드만 |
| `recentLikes` | int[] (5–6개) | Y (`s.recentLikes||[]`) | `[2900,3400,…]` | 시드만 · 읽기 `growthOf` L1405 |
| `m3Sales` | int KRW 최근 3개월 매출 | N | `15600000` | 시드 · **`runSettle` L4256** (`+c.id.slice(1)>=100` 인 캠페인만 `+= k.net`) |
| `refCode` | string | N | `'JIYU10'` | 시드만 |
| `referredBy` | string sellerId | Y | s3 → `'s1'` | 시드만 |
| `hidden` | bool (비공개 프로필) | Y | s4,s5 `true` | 시드 · `admToggleHidden` L4439 |
| `intro` | string | N | `'스킨케어·이너뷰티 리뷰 전문…'` | 시드만 |
| `channels` | array of Channel(아래) | Y (`me.channels||[]`) | — | 시드 · `saveCh` L3939–3948 · `delCh` L3955 |
| `celeryItems` | object `{[shopItemId]: 'YYYY-MM-DD'}` | Y | `{datapass:'2026-09-14'}` | `buyItem` L4027 · `buyDataPass` L4046 |
| `sampleExtra` | int | Y | — | `buyItem` L4026 (데드코드) · 읽기 `sampleLeft` L1460 |

### 2.1 sellers[].channels[] (Channel)

| field | type | nullable | example | set-where |
|---|---|---|---|---|
| `id` | string `'ch'+n` | N | `'ch1'` | 시드 · `saveCh` L3947 (`'ch'+seq++`) |
| `platform` | enum `instagram\|youtube\|naver\|tiktok` | N | `'instagram'` | 시드 · L3943 |
| `handle` | string | N | `'@jiyu_beauty'`, `'지유의 뷰티랩'` | 시드 · L3943 |
| `url` | string (스킴 없는 URL) | Y | `'instagram.com/jiyu_beauty'` | 시드 · L3943 |
| `followers` | int | Y (`ch.followers||0`) | `84300` | 시드 · L3943 |
| `verified` | bool | N | `true` | 시드 · L3944(false) · `confirmVerify` L3971(true) |
| `primary` | bool | Y | `true` (ch1) | 시드 · `setPrimaryCh` L3962 |
| `vcode` | string `'SLRY-XXXX'` | Y (인증 대기 중에만) | `'SLRY-A1B2'` | `verifyModal` L2208 · 삭제 L3944, L3971 |

---

## 3. products

배열. 시드 L1287–1301. 생성 `createProduct` L4309–4319, 수정 `saveProduct` L4279–4296, 삭제 L4302.

| field | type | nullable | example (seed) | set-where |
|---|---|---|---|---|
| `id` | string `'p'+n` | N | `'p1'` | 시드 · L4312 (`'p'+seq++`) |
| `brandId` | string → brands.id | N | `'b1'` | 시드 · L4312 (`S.actingBrand`) |
| `name` | string | N | `'버닝온'` | 시드 · L4284 · L4312 |
| `desc` | string 한 줄 설명 | N (`'—'` 기본) | `'다이어트 부스터 · 6,000mg × 30포'` | L4284 · L4312 |
| `em` | string 이모지(썸네일 대체) | N | `'🔥'` (신규 `'📦'`) | 시드 · L4312 |
| `thumb` | string 상대경로 `'assets/x.webp'` 또는 data-URI(360px) | Y (`null`) | `'assets/burningon.webp'` | 시드 · `NP.thumb` L4285/L4313 (`fileToDataURL` L3730) |
| `imgs` | string[] data-URI(700px), 최대 4 | Y | — | L4286 · L4313 |
| `cat` | enum 7 카테고리 | N | `'다이어트·체형'` | 시드 · L4284 · L4312 (기본값 `'건기식'` — CATS 에 없음, 추정 버그) |
| `cp` | int KRW 소비자가 | N | `39000` | 시드 · L4292 (잠금 시 변경 불가) · L4315 |
| `gp` | int KRW 판매가 | N | `29900` | 시드 · L4292 · L4315 |
| `rate` | float 인플루언서 수수료율 | N | `.20` | 시드 · L4291 (`max(5, total−10)/100`) · L4315 |
| `sample` | string 샘플 내용 설명 | N | `'무상 1박스'` (신규 기본 `'무상 1개'`) | 시드 · L4287 · L4315 |
| `stock` | int | N (`||0`, 승인 시 `||500` L4275/L4029) | `2000` | 시드 · L4287 · L4315 |
| `status` | enum `listed\|pending\|rejected\|paused` | N | `'listed'` | 시드 · L4275, L4276, L4293, L4294, L4306, L4029, L4315 |
| `t` | object `{g:'+240%', note}` 트렌드 배지 | Y (p1,p4,p7 만) | `{g:'+240%',note:'분기 매출 급등'}` | 시드만 · 읽기 L1880, L1921, L1950 |
| `exclusive` | object `{grade, label}` 독점권 오퍼 | Y | `{grade:'다이아',label:'인스타그램 판매 독점권 · 3개월'}` | 시드 · L4290 · L4316 · 삭제 L4290 |
| `exclusive.grade` | enum GRADES 상위 4 (`블랙\|다이아\|플래티넘\|골드`) | N | `'다이아'` | L3759 옵션 |
| `exclusive.label` | string | N (`grade+' 등급 독점권'` 기본) | — | L4290 |
| `exclusive.min` | int KRW (레거시 폴백) | Y | — | 읽기만 `exGradeOf` L1517 (쓰기 코드 없음) |
| `exclusiveSellerId` | string → sellers.id | Y | — | `approveExcl` L3926 |
| `samplePolicy` | object | Y (없으면 `spOf()` L1463 가 gp 기준 기본 생성) | — | 시드 p1,p4,p9 · L4289 · L4315 |
| `samplePolicy.freeGrade` | enum GRADES.g (7단계) | N | `'실버'` | L4289 |
| `samplePolicy.buyMode` | enum `'auto'\|'fixed'` | N | `'auto'` | L4289 |
| `samplePolicy.fixedPrice` | int KRW | N (`0`) | `15000` (p9) | L4289 |
| `samplePolicy.refund` | bool 판매 확정 시 환급 | N | `true` (p4) | L4289 |
| `options` | array `{n:string, price:int}` | Y (없거나 빈 배열이면 `optsOf()` L1398 가 1/2/3개 세트 자동 생성) | `[{n:'1박스 (30포)',price:29900},…]` | 시드 · L4288 · L4314 |
| `rejectReason` | string | Y | `'검수 기준 미달'` | `rejectProduct` L4276 · 삭제 L4275, L4294 |
| `boosted` | bool | Y | — | `buyItem('boost')` L4028 |
| `celeryItems` | object `{boost:'YYYY-MM-DD'}` | Y | — | L4028 · 읽기 `passActive(p,'boost',7)` L1921 |

---

## 4. campaigns (판매/협업 스레드 — 인플루언서 × 상품 1건)

배열. 시드 L1302–1316. 생성: `reqSample` L3870, `confirmSampleBuy` L3883, `confirmInvite` L4064, `regongu` L4170, `runAutoPropose` L4456.

| field | type | nullable | example (seed) | set-where |
|---|---|---|---|---|
| `id` | string `'c'+n` | N | `'c1'` | 시드 · `'c'+seq++` |
| `sellerId` | string → sellers.id | N | `'s1'` | 생성 시 |
| `productId` | string → products.id | N | `'p1'` | 생성 시 |
| `status` | enum ST 키(§3.1) | N | `'LIVE'` | `transition()` L3790 · `autoTick` L1425–1426 · `runSettle` L4255 |
| `createdAt` | date | N | `D(-14)` | 생성 시 `ymd(today())` |
| `start` | date 판매 시작 | Y (일정 확정 후) | `D(-2)` | `confirmSchedule` L4221 · L4209(재판매 우선권) · `goLive` L4228 |
| `end` | date 판매 종료 | Y | `D(2)` | L4221 · L4209 · L4228 · `endCamp` L4234 · `ffwd` L4241 |
| `qty` | int 배정 재고 | Y (`c.qty||0`) | `800` | L4221 · L4209 |
| `propStart` | date 제안 시작일 | Y | `D(12)` (c9) | `proposeSchedule` L4206 |
| `propEnd` | date | Y | `D(16)` | L4206 |
| `propQty` | int | Y | `600` | L4206 |
| `testDue` | date 테스트 기한 (+14일) | Y | `D(11)` (c3) | `receiveSample` L4192 · `regongu` L4170 |
| `tracking` | string 샘플 운송장 | Y | `'6890-1234-5678'` | `shipSample` L4188 |
| `settledAt` | date | Y | `D(-14)` (c6) | `runSettle` L4255 |
| `purchased` | bool 샘플 구매(무상 아님) | Y | `true` (c2) | L3883 · 읽기 `sampleUsed` L1459, `hadFreeSample` L1467 |
| `samplePaid` | object `{price:int, cel:int, cash:int, method:'cash'\|'cel'}` | Y | `{price:75650,cel:0,cash:75650,method:'cash'}` | L3880–3883 · 읽기 L4258, L3150 |
| `sampleRefunded` | bool | Y | — | `runSettle` L4258 |
| `invited` | bool 브랜드 직접 제안 | Y | `true` (c13) | L4064 · L4456 |
| `celUsed` | int 제안권 셀러리(0 또는 10) | Y | `0` | L4064 · L4456 |
| `celRefunded` | int | Y | — | `declineInvite` L4078 |
| `auto` | bool 자동 제안 | Y | — | L4456 · 읽기 L3115, L3166, L2964 |
| `regongu` | bool 재판매 캠페인 | Y | — | L4170 · 읽기 L4208 |
| `homeFeatured` | date 고객 홈 상단 노출 시작일(7일) | Y | — | `buyItem('homefeature')` L4033 · 읽기 `isHomeFeat` L3261 |

비영속(합성) 필드: `storeCamp('p:'+pid)` L3485–3489 가 `{id:'p:p1', status:'PREVIEW', preview:true, qty}` 임시 객체를 만든다 — `S.data` 에 저장되지 않음.

---

## 5. orders

배열. 시드 `mkOrders` L1327–1338 + 배송 시드 L1341. 생성: `confirmSampleBuy` L3884, `toggleLive` L4091, `buyNow` L4363, `simSell` L4475.

| field | type | nullable | example | set-where |
|---|---|---|---|---|
| `id` | string `'o'+n` | N | `'o101'` | `'o'+seq++` |
| `campaignId` | string → campaigns.id | N | `'c1'` | 생성 시 |
| `buyer` | string 마스킹 이름 | N | `'김*은'`, `'지유 (샘플 구매)'`, `'고객(구매 페이지)'` | 생성 시 |
| `qty` | int | N | `1`/`2` | 생성 시 |
| `unit` | int KRW 단가 | N | `29900` | 생성 시 (옵션가 또는 `p.gp` 또는 샘플가) |
| `opt` | string 옵션명 | Y | `'1박스 (30포)'` | `buyNow` L4363 만 |
| `status` | enum `PAID\|REFUNDED` (`CANCELED` 는 `calc` L1636 에서 읽기만) | N | `'PAID'` | 생성 시 · `refund` L4249 |
| `at` | date 주문일 | N | `D(-2)` | 생성 시 |
| `sample` | bool 인플루언서 샘플 구매 주문 | Y | `true` | L1338 · L3884 · 읽기 `calc` L1641, `refund` L4248, L3289 |
| `tracking` | string 운송장 | Y | `'6890-1037-1053'` | 시드 L1341 · `saveTrackOne` L4108 · CSV 업로드 L4134 |
| `courier` | string 택배사 | Y | `'CJ대한통운'` | L1341 · L4108 (`CJ대한통운\|우체국택배\|한진택배\|롯데택배\|로젠택배`) |

배송 상태는 별도 필드 없이 `status==='PAID' && tracking` 으로 판정 (L3051–3052, L3062).

---

## 6. messages (캠페인 스레드) — `S.data.messages[campaignId] = Message[]`

객체(맵). 시드 L1343–1368. 쓰기: `pushSys` L1658, `pushChat` L1659–1665, `transition` L3790.

| field | type | nullable | example | set-where |
|---|---|---|---|---|
| (키) | campaignId | — | `'c1'` | — |
| `type` | enum `'sys'\|'chat'\|'warn'` | N | `'sys'` | L1343/L1344/L1658/L1661/L1663 |
| `role` | enum `'seller'\|'brand'` (렌더는 `'admin'` 도 처리 L3564, 쓰기 없음 — `sendChat` 은 관리자를 `'brand'` 로 발신 L4467) | chat 만 | `'seller'` | L1661 |
| `txt` | string — `sys` 는 **HTML 포함**(`<b>`), `chat`/`warn` 은 `esc()` 로 렌더 | N | `'판매 링크 활성화 — 판매 시작'` | — |
| `at` | date | N | `D(-2)` | — |

`warn` 은 `pushChat` 이 연락처/카톡 정규식 감지 시 자동 추가(L1662–1664). 시스템 이벤트 종류는 §3.5.

읽기: 마지막 메시지가 `chat` 이고 `role!==myRole` 이면 "안 읽음" (L2003, L2741) — 읽음 상태 필드는 없음.

---

## 7. celeryLedger (🥬 포인트 원장)

배열. 시드 L1230–1239.

| field | type | nullable | example | set-where |
|---|---|---|---|---|
| `who` | string sellerId 또는 brandId (`'s1'`/`'b1'`; 접두사로 구분 `who[0]==='s'` L1453) | N | `'s1'` | — |
| `at` | date | N | `D(-30)` | — |
| `delta` | int (+지급/−차감) | N | `3`, `-2` | — |
| `memo` | string 자유 텍스트 | N | `'가입 축하 지급'` | — |
| `won` | int KRW 충전 결제액 | Y (충전만) | `100000` | `topup` L4041 · 읽기 L3154, L3157 |

쓰기 위치와 memo 패턴 (§3.6 참조): L1484 `celSpend`, L4041 `topup`, L4078 제안 거절 환급, L4258 샘플 환급, L4440 관리자 지급, L4032 `pop()` (homefeature 적용 실패 시 직전 항목 롤백).

---

## 8. refEarnings (인플루언서 추천 보상) / brandRefEarnings (브랜드 추천 리워드)

| field | type | nullable | example | set-where |
|---|---|---|---|---|
| `at` | date | N | `D(-24)` | `runSettle` L4264 / L4269 |
| `referrerId` | string sellerId / brandId | N | `'s1'` / `'b1'` | — |
| `fromSellerId` (refEarnings) / `fromBrandId` (brandRefEarnings) | string | N | `'s3'` / `'b2'` | — |
| `campaignId` | string → campaigns.id (시드는 `'(지난 판매)'` 플레이스홀더 문자열) | N | `'c5'` | — |
| `amt` | int KRW (net×2% / net×1%) | N | `186400` | — |

읽기: `vRef` L2233, `brandRefHtml` L2537.

---

## 9. cs (고객 문의)

배열. 시드 L1318–1321. 생성 `submitCS` L4383.

| field | type | nullable | example | set-where |
|---|---|---|---|---|
| `id` | string `'cs'+n` | N | `'cs1'` | `'cs'+seq++` |
| `cid` | string → campaigns.id | N | `'c1'` | — |
| `orderId` | string → orders.id | Y (`null`) | `'o101'` | L4383 |
| `buyer` | string | N | `'김*은'`, `'고객'` | — |
| `type` | enum CS_TYPES `배송 문의\|교환·반품\|상품 문의\|기타` | N | `'배송 문의'` | L1690 |
| `msg` | string | N | — | — |
| `status` | enum `OPEN\|ANSWERED\|CLOSED` | N | `'OPEN'` | L4383 · `saveCSReply` L4400 · `csClose` L4404 |
| `at` | date | N | — | — |
| `reply` | string | Y | — | L4400 |
| `repliedAt` | date | Y | — | L4400 |

브랜드 배정은 저장하지 않고 `csBrandId()` L1692 로 `cid → product → brandId` 파생.

---

## 10. settlements (정산 실행 기록)

배열. 시드 없음. 생성 `runSettle` L4260.

| field | type | nullable | example | set-where |
|---|---|---|---|---|
| `at` | date | N | — | L4260 |
| `cid` | string → campaigns.id | N | — | — |
| `title` | string `'{p.name} · {s.handle}'` | N | — | — |
| `net` | int KRW 확정 매출 | N | — | `calc().net` |
| `brandPay` | int KRW | N | — | `calc().brandPay` |
| `sellerPay` | float KRW (`sfTotal*(1−wht)+refundCash`, 반올림 안 함) | N | — | — |
| `platFee` | float KRW (`calc().pf`) | N | — | — |
| `pfNet` | float KRW | N | — | — |
| `holdS` | bool 인플루언서 계좌 미등록 보류 | N | — | L4259 |
| `holdB` | bool 브랜드 계좌 미등록 보류 | N | — | L4259 |

---

## 11. exclusiveReqs (독점권 신청)

| field | type | nullable | example | set-where |
|---|---|---|---|---|
| `id` | string `'x'+n` | N | `'x1'` | 시드 L1282 · `reqExclusive` L3921 |
| `productId` | string | N | `'p1'` | — |
| `sellerId` | string | N | `'s4'` | — |
| `status` | enum `PENDING\|APPROVED\|REJECTED` | N | `'PENDING'` | L3921 · L3926 · L3931 |
| `at` | date | N | — | — |

승인 시 `products.exclusiveSellerId = sellerId` (L3926).

---

## 12. productViews (시드 전용 · 브랜드 홈 "최근 조회")

| field | type | nullable | example | set-where |
|---|---|---|---|---|
| `sellerId` | string | N | `'s6'` | 시드 L1262 |
| `productId` | string | N | `'p1'` | 시드 |
| `ago` | string 표시용(`'2시간 전'`, `'어제'`) — 타임스탬프 아님 | N | — | 시드 · 읽기 L2453–2460 |

## 13. external (시드 전용 · 외부 판매 감지) — `S.data.external[sellerId] = Item[]`

| field | type | nullable | example | set-where |
|---|---|---|---|---|
| `name` | string 상품명 | N | `'저분자 피쉬콜라겐 스틱'` | 시드 L1272 |
| `brand` | string 타사 브랜드명 | N | `'타사 A'` | 시드 |
| `src` | enum platform | N | `'instagram'` | 시드 |
| `at` | date | N | — | 시드 |
| `price` | int KRW | N | `32000` | 시드 · 읽기 `estExternal` L1480 |

## 14. unlockedRefs — `string[]` (sellerId)

브랜드가 익명 레퍼런스를 열람한 인플루언서 목록. **브랜드별로 스코프되지 않은 전역 배열**(L1269, L3897, L3915; 읽기 L2668, L3903). 추정: 실서비스에서는 `(brandId, sellerId)` 쌍이어야 함.

## 15. brandDataUnlocks — `{[brandId]: sellerId[]}`

브랜드별 데이터 열람 인플루언서. L1270 시드, L3891–3892 쓰기, L2628 읽기.

## 16. autoPO — `{on: bool, email: string}`

브랜드 자동 발주 설정. 전역 단일 객체(브랜드 id 없음) L4163; 읽기 L2773, L4156, L4236. 추정: 브랜드별 설정이어야 함.

## 17. opex — 관리자 운영비 오버라이드 (OPEX_DEF L1377 키와 동일)

`{server, db, cs, domain, misc, pgFixed, kakaoPer, claudePerCrawl, claudePerMatch}` 모두 int(₩/월 또는 건당). 쓰기 `saveOpex` L4428, 삭제 `resetOpex` L4429, 읽기 L3160.

## 18. seq — int (시드 100, 생성마다 ++)

---

## 3. 열거형(enum) · 고정 값 집합

### 3.1 캠페인 상태 `ST` (L1194–1209)

| key | label (`l`) | color (`c`) | `turn` | FLOW 순서 |
|---|---|---|---|---|
| `SAMPLE_REQUESTED` | 샘플 요청 | blue | brand | 1 |
| `INVITED` | 브랜드 제안 · 수락 대기 | blue | seller | (스테퍼: =SAMPLE_REQUESTED 위치 L1792) |
| `DECLINED` | 제안 거절 | gray | — | 종료 |
| `REJECTED` | 거절됨 | red | — | 종료 |
| `SAMPLE_APPROVED` | 샘플 발송 대기 | blue | brand | 2 |
| `SAMPLE_PURCHASED` | 샘플 구매 · 발송 대기 | blue | brand | (스테퍼: =SAMPLE_APPROVED 위치) |
| `SAMPLE_SHIPPED` | 샘플 배송중 | blue | seller | 3 |
| `TESTING` | 테스트 중 | amber | seller | 4 |
| `PASSED` | 인플루언서 패스 | gray | — | 종료 |
| `SCHEDULE_PROPOSED` | 일정 승인 대기 | amber | brand | 5 |
| `SCHEDULE_CONFIRMED` | 일정 확정 | green | — | 6 |
| `LIVE` | 판매 진행중 | live | — | 7 |
| `CLEARING` | 교환·환불 기간 | amber | — | 8 |
| `SETTLED` | 정산 완료 | green | — | 9 |

`FLOW` L1210 = `SAMPLE_REQUESTED → SAMPLE_APPROVED → SAMPLE_SHIPPED → TESTING → SCHEDULE_PROPOSED → SCHEDULE_CONFIRMED → LIVE → CLEARING → SETTLED` (라벨 `FLOW_L` L1211).

전이 표 (ACT):

| from | to | 액션 | 근거 |
|---|---|---|---|
| (신규) | SAMPLE_REQUESTED | reqSample | L3870 |
| (신규) | SAMPLE_PURCHASED | confirmSampleBuy | L3883 |
| (신규) | INVITED | confirmInvite / runAutoPropose | L4064, L4456 |
| (신규) | TESTING (regongu, 샘플 생략) | regongu | L4170 |
| INVITED | SAMPLE_APPROVED / DECLINED | acceptInvite / declineInvite | L4073, L4079 |
| SAMPLE_REQUESTED | SAMPLE_APPROVED / REJECTED | approveSample / rejectSample | L4184, L4185 |
| SAMPLE_APPROVED, SAMPLE_PURCHASED | SAMPLE_SHIPPED | shipSample | L4189 |
| SAMPLE_SHIPPED | TESTING | receiveSample | L4193 |
| TESTING | PASSED / SCHEDULE_PROPOSED / SCHEDULE_CONFIRMED(우선권) | passCamp / proposeSchedule | L4195, L4213, L4210 |
| SCHEDULE_PROPOSED | SCHEDULE_CONFIRMED / TESTING(반려) | confirmSchedule / rejectSchedule | L4222, L4225 |
| SCHEDULE_CONFIRMED | LIVE | goLive / autoTick(start≤today) | L4229, L1425 |
| LIVE | CLEARING | endCamp / autoTick(end<today) | L4235, L1426 |
| CLEARING | SETTLED (settleDue≤today) | runSettle / runSettleAll | L4255, L4441 |

"진행 중" 판정 집합: `!['REJECTED','PASSED','DECLINED','SETTLED']` (L1413, L1473, L4299). 확정·진행 집합 `['SCHEDULE_CONFIRMED','LIVE']` (L1676, L1687). 매출 인정 집합 `['LIVE','CLEARING','SETTLED']` (L1620 등).

### 3.2 product.status — `listed | pending | rejected | paused` (L2605, L4275–4306). 신규 등록은 `pending`.

### 3.3 order.status — `PAID | REFUNDED` (쓰기). `CANCELED` 는 `calc` L1636 에서만 참조(쓰기 없음).

### 3.4 message.type — `sys | chat | warn`; message.role — `seller | brand` (+ `admin` 렌더 전용).

### 3.5 시스템 이벤트(sys) 종류 — `txt` 자유 텍스트이며 별도 event type 필드 없음. 발생 지점:

| 이벤트 | 위치 |
|---|---|
| 샘플 요청 / 샘플 구매 / 브랜드 직접 제안 / 자동 제안 | L3872, L3885, L4065, L4457 |
| 제안 수락(익명 신원 공개 포함) / 제안 거절(환급) | L4073, L4079 |
| 샘플 승인 / 거절 / 발송(운송장) / 수령(테스트 기한) / 패스 | L4184–4195 |
| 일정 제안 / 즉시 확정(우선권) / 승인 / 반려 | L4213, L4210, L4222, L4225 |
| 판매 시작 (수동/스케줄러) / 판매 종료 (수동/스케줄러) / 3주 경과 시뮬 | L4229, L1425, L4235, L1426, L4242 |
| 최종 발주서 자동 발송 | L4237 |
| 환불 처리 | L4250 |
| 샘플 구매액 환급 / 지급 보류 / 추천 보상 / 브랜드 추천 보상 / 정산 완료 | L4258, L4261, L4265, L4270, L4272 |
| 고객 문의 접수 / 브랜드 답변 | L4384, L4401 |
| 재판매 생성 | L4171 |

### 3.6 celeryLedger.memo 패턴 (실제 문자열)

`'가입 축하 지급'`, `'입점 이벤트 지급'`, `'관리자 이벤트 지급'`, `'매출 데이터 확인권 구매'`, `'익명 레퍼런스 열람 · ○○○ 인플루언서 ({등급})'`, `'데이터 확인 · {name} {handle} ({등급})'`, `'샘플 구매 · {p.name} (₩{n} 상당)'`, `'{item.name} 구매'`, `'셀러리 충전 (₩{won} 시뮬 결제)'`, `'{등급} 인플루언서 제안 · {p.name}'`, `'{등급} 인플루언서 자동 제안 · {p.name}'`, `'제안 거절 환급 · {p.name}'`, `'샘플 구매 환급 · {p.name}'`.

### 3.7 platform — `instagram | youtube | naver | tiktok` (`PLAT_NAMES` L1487: 인스타그램/유튜브/네이버 블로그/틱톡).

### 3.8 카테고리

- 상품·인플루언서 7 카테고리 `CATS` L1936 (`'전체'` 제외): `다이어트·체형 | 이너뷰티·피부 | 비타민·영양 | 눈·뇌 건강 | 장·소화 | 활력·수면 | 웰니스 푸드`
- `CAT_INFO` L1937 (en/desc/ex): Body / Inner Beauty / Nutrition / Eye & Brain / Gut / Energy & Sleep / Wellness Food
- `CATMAP` L1406 (브랜드 상위 카테고리 → 하위 그룹): `'건강기능식품'` → [다이어트·체형, 비타민·영양, 눈·뇌 건강, 장·소화, 활력·수면, 웰니스 푸드], `'이너뷰티'` → [이너뷰티·피부]
- 브랜드 `cat` 시드 값: `'건강기능식품'`, `'이너뷰티·피부'` — b2 값은 CATMAP 키(`'이너뷰티'`)와 불일치 (§8 참고)
- `CAT_TRENDS` L1550 (표시용 상수)

### 3.9 인플루언서 등급 `GRADES` L1488 (m3Sales 기준, 내림차순 매칭 `gradeOf` L1497)

| g | min (KRW) | bonus (%p, 플랫폼 부담) | pct(상위%) |
|---|---|---|---|
| 블랙 | 100,000,000 | 3 | 1 |
| 다이아 | 50,000,000 | 2 | 3 |
| 플래티넘 | 30,000,000 | 1.5 | 8 |
| 골드 | 15,000,000 | 1 | 18 |
| 실버 | 8,000,000 | 0.5 | 35 |
| 브론즈 | 3,000,000 | 0.3 | 60 |
| 스타터 | 0 | 0 | 100 |

파생 상수: `DATA_PRICE` L1379 (열람 🥬: 스타터·브론즈 1 / 실버·골드 2 / 플래티넘 3 / 다이아 4 / 블랙 5), `sampleQuota` L1458 (플래티넘↑ 5 / 실버·골드 2 / 그 외 1), `PRIORITY_TIER='플래티넘'` L1673.

### 3.10 브랜드 등급 `BGRADES` L1520 (`bGmv` = gmvBase + Σ확정매출 기준)

| g | min (KRW) | 수수료 할인 `BG_DISC` L1382 |
|---|---|---|
| 블랙 | 1,000,000,000 | 0.02 |
| 다이아 | 500,000,000 | 0.015 |
| 플래티넘 | 200,000,000 | 0.01 |
| 골드 | 80,000,000 | 0.005 |
| 실버 | 30,000,000 | — |
| 브론즈 | 10,000,000 | — |
| 스타터 | 0 | — |

다이아·블랙: 월 5회 무료 열람 (`freeRefLeft` L1386).

### 3.11 settleInfo.type — `personal`(원천징수 3.3%) | `biz`(세금계산서, 원천징수 0). 브랜드는 type 없음.

### 3.12 은행 목록 (L2180, L2859) — `국민 | 신한 | 우리 | 하나 | 농협 | 카카오뱅크 | 토스뱅크 | 기업 | SC제일` (`'선택'` 은 미입력).

### 3.13 samplePolicy.buyMode — `auto | fixed`; samplePaid.method — `cash | cel`.

### 3.14 cs.type — `CS_TYPES` L1690: `배송 문의 | 교환·반품 | 상품 문의 | 기타`; cs.status — `OPEN | ANSWERED | CLOSED`.

### 3.15 exclusiveReqs.status — `PENDING | APPROVED | REJECTED`.

### 3.16 셀러리 샵 아이템 `SHOP` L1433 (celeryItems 키)

- seller: `samplepay`(auto), `datapass`(2), `featured`(3, 7일), `homefeature`(3, 7일), `regongu`(2, 30일)
- brand: `diamond`(10, auto), `ref`(1–5, auto), `sdata`(1–5, auto), `datapass`(30, days:30), `boost`(3, 7일), `homefeature`(5), `fastreview`(1)
- `TOPUP` L1451: `{n:5,won:100000}`, `{n:10,won:190000}`, `{n:30,won:540000}`

### 3.17 정책 상수

`PG_RATE=0.019`, `PLAT_RATE=0.10`, `WHT=0.033`, `CLEAR_DAYS=21` (L1212) · `BREF_RATE=0.01`, `BREF_DISC=0.01`, `BREF_TIMES=3` (L1374) · `REF_RATE=0.02`, `REF_BOOST=0.01`, `REF_TIMES=5` (L1541) · `CELERY_PER=5,000,000` (L1376) · `SAMPLE_CEL_WON=20,000` (L1462) · `OPEX_DEF` L1377 · 테스트 기한 14일 (L4192) · 판매 기간 옵션 3/5/7일 (L3691) · 수수료율 하한 5% (L4291).

---

## 4. 관계 · 키

| 참조 필드 | → 대상 | 비고 |
|---|---|---|
| `products.brandId` | brands.id | |
| `products.exclusiveSellerId` | sellers.id | nullable |
| `campaigns.sellerId` | sellers.id | |
| `campaigns.productId` | products.id | 브랜드는 `product.brandId` 로 파생(캠페인에 brandId 없음) |
| `orders.campaignId` | campaigns.id | |
| `messages[key]` | campaigns.id | 맵 키 |
| `celeryLedger.who` | sellers.id **또는** brands.id | 접두사 `s`/`b` 로 구분 (L1453) |
| `cs.cid` / `cs.orderId` | campaigns.id / orders.id | orderId nullable |
| `settlements.cid` | campaigns.id | |
| `exclusiveReqs.productId` / `.sellerId` | products / sellers | |
| `refEarnings.referrerId` / `.fromSellerId` / `.campaignId` | sellers / sellers / campaigns | |
| `brandRefEarnings.referrerId` / `.fromBrandId` / `.campaignId` | brands / brands / campaigns | |
| `sellers.referredBy` | sellers.id | 추천인 |
| `brands.referredBy` | brands.id | |
| `productViews.sellerId` / `.productId` | sellers / products | |
| `external[key]` | sellers.id | 맵 키 |
| `unlockedRefs[]` | sellers.id | 브랜드 스코프 없음 |
| `brandDataUnlocks[brandId][]` | brands.id → sellers.id[] | |
| `sellers.channels[].id` | 셀러 내부 | `'ch'+seq` 전역 유일 |

자연 키: `sellers.email`, `sellers.handle`, `sellers.refCode`, `brands.email`, `brands.refCode`, `brands.settleInfo.bizNo`, `channels.(platform,handle)`. 캠페인은 `(sellerId, productId)` 로 "진행 중 1건" 제약을 코드로 검사 (L1413, L1473).

캠페인 id 숫자 ≥100 (시드 이후 생성) 여부가 `m3Sales` 누적 조건으로 쓰임 (L4256).

---

## 5. 파생(계산) vs 저장

| 값 | 저장? | 계산 함수 | 근거 |
|---|---|---|---|
| 인플루언서 등급 | 파생 | `gname(s)=gradeOf(s.m3Sales).g` | L1497–1498 |
| 브랜드 누적 GMV / 등급 | 파생 | `bGmv(b)=gmvBase+Σ netOf(c)`; `bgname` | L1529–1536 |
| `m3Sales` | **저장 + 정산 시 증분** | `runSettle` (id≥100 만) | L4256 |
| 셀러리 획득량 | 파생 | `celEarned = floor(m3Sales/CELERY_PER)` 또는 `floor(bGmv/CELERY_PER)` | L1452 |
| 셀러리 잔액 | 파생 | `celBal = celEarned + Σ ledger.delta` | L1456 |
| 판매 수량 / 잔여 | 파생 | `soldQty(cid)` PAID 주문 합; `c.qty − soldQty` | L1403 |
| 상품 배정/잔여 재고 | 파생 | `allocated`, `stockLeft` | L1687–1688 |
| 정산 금액 일체 | 파생 (실행 시 `settlements` 에 스냅샷) | `calc(c)` → gross/refund/net/sampleNet/pg/sf/gBonus/sfTotal/boost/refReward/bBoost/bReward/bDisc/pfGross/costs/pf/vat/pfNet/brandPay/paidCnt/refCnt | L1634–1655 |
| 원천징수율 | 파생 | `sellerWht(s)` = biz ? 0 : 0.033 | L1656 |
| 정산 기준일 | 파생 | `settleDue(c)=end+21일` | L1657 |
| 추천 부스트 적용 여부 | 파생 | `isRefBoost` (첫 5회), `isBrandRefBoost` (첫 3회) | L1617–1633 |
| 샘플 한도/사용/잔여 | 파생 | `sampleQuota`, `sampleUsed`(이달 createdAt, !invited, !purchased), `sampleLeft` | L1458–1460 |
| 샘플 정책 기본값 / 샘플가 / 셀러리 분할 | 파생 | `spOf`, `samplePrice`, `sampleSplit` | L1463–1465 |
| 무상 자격 / 이미 받음 | 파생 | `freeEligible`, `hadFreeSample` | L1466–1467 |
| 옵션 기본값 | 파생 | `optsOf(p)` | L1398 |
| 성장세 | 파생 | `growthOf(s)` recentLikes 후반/전반 | L1405 |
| 외부 판매 예상 | 파생 | `estExternal` | L1480 |
| 패스 활성 여부 | 파생 | `passActive(ent,id,days)` celeryItems 날짜 + 기간 | L1481 |
| 자동 매칭 후보 | 파생 | `autoMatches()` | L1409 |
| 기간 우선권 차단 | 파생 | `periodHolders`, `periodBlock` | L1674–1685 |
| 독점권 기준 등급/자격 | 파생 | `exGradeOf`, `exEligible` | L1517–1518 |
| 무료 열람 잔여 | 파생 | `freeRefLeft(b)` (freeRefUsed[ym]) | L1386 |
| CS 배정 브랜드 | 파생 | `csBrandId(x)` | L1692 |
| DM 안 읽음 | 파생 | 마지막 메시지 chat && role≠me | L2003, L2741 |
| 뱃지 카운트 | 파생 | `counts()` | L1696 |
| 고객 홈 추천 | 파생 | `isHomeFeat(c)` homeFeatured+7일 | L3261 |
| 실시간 시청자 수 | 가짜(의사난수) | `viewersOf` | L3278 |
| 플랫폼 누적 판매액 | 파생 | `platformGmv` | L3279 |
| 스케줄러 상태 전이 | 렌더 시 실행 | `autoTick()` | L1422 |
| 외부 데이터 (`productViews`, `external`) | 시드 저장 (갱신 로직 없음) | — | — |

---

## 6. 인증 · 세션 모델 (login.html)

### 6.1 데모 계정 디렉터리 `ACCOUNTS` (login.html L161–173)

| role | id | name | handle | email |
|---|---|---|---|---|
| seller | s1..s8 | 지유/혜린/민지/서아/로라/하늘/소민/유나 | `@…` (index.html 시드와 동일) | `{x}@sellery.demo` |
| brand | b1 | 바인허브 | partner@vyneherb.co | partner@vyneherb.co |
| brand | b2 | 글로헬스 | official@weglow.biz | official@weglow.biz |
| admin | `'admin'` | 셀러리 운영팀 | admin@sellery.co.kr | admin@sellery.co.kr |

비밀번호 검증 없음(8자 이상만 검사, 데모 채우기 값 `'sellery2026'` L258). 실서비스 주석: bcrypt + 이메일 인증 + 5회 실패 10분 잠금 + HttpOnly 세션 쿠키 (L117).

### 6.2 세션 `localStorage['sellery-session']` (login.html L203)

| field | type | example |
|---|---|---|
| `role` | `seller \| brand \| admin` | `'seller'` |
| `id` | sellers.id / brands.id / `'admin'` | `'s1'` |
| `email` | string | |
| `name` | string | |
| `at` | ISO timestamp (`toISOString()`) | |
| `keep` | bool 로그인 유지 | |
| `provider` | `'google' \| 'email'` | |
| `autoJoined` | bool (Google 신규 자동 가입) | |

index.html 소비: L1585–1589 — `role==='seller'` 이고 id 가 시드에 있으면 `S.actingSeller=id`; brand 도 동일; 역할 고정(`S.lockedRole`). 로그아웃 L3793 (키 삭제 후 `login.html?role=`).

### 6.3 가입 폼 (login.html L121–134, L271–283)

입력: 활동명/브랜드명(`jName`), 사업자등록번호(`jBiz`, 브랜드만, `^\d{3}-?\d{2}-?\d{5}$`), 이메일, 비밀번호(영문+숫자 8자+), 추천 코드(`jRef`, 대문자), 약관 동의. 이메일 인증 대기 화면 후 `login()` — 프로토타입은 신규 계정을 `s1`/`b1` 데이터로 매핑 (L280). 추천 코드는 저장되지 않음(수집만).

### 6.4 Google 로그인 (login.html L175–255)

`GOOGLE_CLIENT_ID` 비어 있으면 시뮬 팝업(`GOOGLE_DEMO` 5계정). 규칙: 이메일이 ACCOUNTS 에 있으면 그 계정 역할로 즉시 로그인(탭 무관), 없으면 현재 탭 역할로 자동 가입(`autoJoined:true`, id `s1`/`b1`). 실서비스 흐름 주석: GIS ID 토큰 → `POST /auth/google` 검증(aud/iss/exp, `email_verified`) → 세션 쿠키.

### 6.5 고객(구매자)

계정 모델 없음. 카카오 로그인은 "실서비스에서 제공" 토스트만 (L3799, L4424). 주문의 `buyer` 는 마스킹 문자열.

### 6.6 역할 진입 해시

`#influencer|#seller → seller`, `#brand`, `#admin`, `#customer|#shop → customer`, `#s/c1|#link/c1` → 판매 링크 진입(고객 store) (L1580–1601).

---

## 7. 비영속 UI 상태 (S.*) — 스키마 대상 아님

`S.view{role,screen,cid,store}`, `S.actingSeller`, `S.actingBrand`, `S.session`, `S.lockedRole`, `S.linkCtx`, `S.catFilter`, `S.stage`, `S.calOff`, `S.galGrade`, `S.galPlat`, `S.profileOpen`, `S.storeOpt`, `S.storeQty`, `S.storeTop`, `S.custSel`, `S.custCat`, `S.faqOpen`, `S.reqOpen`, `S.dmQ`, `S.admPQ/admIQ/bcF/admPS/admPB/admPC/admIG/admOF/admCF`, `NP{thumb,imgs}` (상품 폼 임시), `liveTimer`.

---

## 8. 모호점 · 주의 (스키마 설계 시 결정 필요)

1. **`unlockedRefs` 가 브랜드 스코프 없음** — 전역 sellerId 배열. `brandDataUnlocks` 는 브랜드별. 실서비스는 둘 다 `(brandId, sellerId, kind, at)` 로 통합이 자연스러움(추정).
2. **`autoPO` 가 전역 단일 객체** — 브랜드별 설정으로 해석해야 함(추정). `opex` 는 관리자 전역 설정으로 유지 가능.
3. **`messages.sys.txt` 에 HTML 포함** — 이벤트 타입 필드가 없고 자유 텍스트. 스키마에서는 `kind`/`event` 컬럼 + 파라미터(jsonb)로 정규화할지 결정 필요.
4. **`m3Sales` 는 저장값이면서 정산 시 증분** — 시드 캠페인(id<100)은 제외. 실서비스는 정산 기록에서 롤링 3개월 합산으로 파생하는 것이 일관적(추정). `gmvBase` 도 "이관 전 누적" 성격.
5. **브랜드 `cat` 값 불일치** — b2 `'이너뷰티·피부'` vs `CATMAP` 키 `'이너뷰티'`; `createProduct` 기본 `'건기식'` 은 CATS 에 없음. 카테고리 마스터 테이블(상위 2 / 하위 7)로 정리 필요.
6. **`campaigns` 에 brandId 없음** — 항상 product 경유. 비정규화 여부 결정.
7. **`celeryLedger.who` 가 seller/brand 혼용 문자열** — 접두사 의존. 분리 컬럼(`seller_id`/`brand_id`) 또는 공통 `account` 개념 필요.
8. **`refEarnings.campaignId` 시드 값 `'(지난 판매)'`** — FK 불가 문자열. nullable FK 로 처리.
9. **`orders` 배송 상태** — 별도 상태 없이 `tracking` 유무. `CANCELED` 상태는 읽기만. 주문 옵션(`opt`)은 옵션명 문자열만 저장(옵션 id 없음).
10. **`settlements.sellerPay/platFee/pfNet`** 은 반올림 안 된 float. KRW integer 로 반올림 규칙 필요.
11. **`productViews.ago`** 는 표시용 문자열 — 실제 타임스탬프로 대체 필요. `external` 은 크롤링 시드로 갱신 코드 없음.
12. **이미지가 data-URI 로 저장** (`img`, `logo`, `thumb`, `imgs`) — Storage 버킷 + URL 로 이관 대상. `bizDoc` 은 파일명만.
13. **`channels[].vcode`** 는 인증 대기 중 임시 값(삭제됨) — 별도 verification 테이블 또는 nullable 컬럼.
14. **`exclusive.min`** 레거시 필드는 읽기 폴백만 존재(시드에 없음).
15. **`buyItem('sample')` 분기·`it.repeat`** 는 SHOP 정의에 해당 항목이 없어 데드코드 (`sampleExtra` 필드도 실질 미사용).
16. **로그인 계정 ↔ 프로필** — login.html 계정 목록은 index.html 시드 이메일과 1:1. 신규 가입은 데모 첫 계정으로 매핑되므로 실제 "계정 생성 → 프로필 생성" 흐름은 미구현. 추천 코드·사업자번호는 가입 폼에서 수집만.
17. **관리자**는 데이터 컬렉션에 없고 세션 `role:'admin', id:'admin'` 만 존재. 메시지 `role:'admin'` 은 렌더 분기만 있고 쓰기 없음.
18. **`campaigns.status='PREVIEW'`** 는 `storeCamp` 합성 객체 전용 — enum 에 넣지 말 것.
