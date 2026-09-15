# 셀러리 접근 모델 (access-model) — 누가 무엇을 읽고 쓰는가

- 대상: 셀러리 프로토타입(`E:/위글로우/셀러리/index.html`, 이하 OLD · `login.html`)의 4개 역할과 데이터 컬렉션을 Supabase Auth + RLS 로 옮길 때의 권한 설계.
- 관례 출처: glo 마이그레이션(`E:/위글로우/Glo/web/supabase/migrations`, 이하 GLO) — 특히 `0001_init.sql`, `0012_groupbuy.sql`, `0013_seller_applications.sql`, `0014_seller_handle_rounds.sql`, `0015_cs_chat.sql`.
- 표기: 코드에서 확인한 사실은 `OLD L####` / `GLO 00##` 로 인용한다. 코드에 없는 설계 판단은 **추정** 으로 표시한다.
- 이 문서는 스키마 자체를 정의하지 않는다(테이블·컬럼명은 제안). 컬럼명은 `docs/data-model.md` / 마이그레이션 작성 시 확정한다.

---

## 0. 한 줄 결론

1. **모든 테이블 RLS ON.** 기본값은 "정책 없음 = anon/authenticated 접근 차단" (GLO 0015 L39-41 패턴). 민감 테이블은 `revoke all ... from anon, authenticated` 까지 건다 (GLO 0012 L30, 0013 L39).
2. **공개 데이터(고객 판매센터·판매 링크 페이지)만** 컬럼 단위 `grant select (col, ...)` + `select` 정책으로 anon 에게 연다 (GLO 0012 L70-79, 0014 L13-23 패턴).
3. **파트너(인플루언서·브랜드) 센터의 읽기는 서버(service role) 경유를 표준으로 한다.** 좁은 RLS 정책은 `profiles`(본인), `orders`(구매자 본인, GLO 0001 L108-111), 그리고 공개 카탈로그에만 둔다. 이유는 §4.1.
4. **모든 쓰기는 service role.** 상태 전이·셀러리 차감·정산·연락처 유출 감지 등이 전부 서버 로직이라 클라이언트 직접 insert/update 정책은 만들지 않는다 (GLO 0001 L104-107 주석과 동일 원칙).
5. **익명화·데이터 열람권·경쟁 판매 비노출은 RLS 가 아니라 앱(서버) 규칙이다.** RLS 는 "행/컬럼을 볼 수 있는가" 까지만 담당하고, "같은 행을 상대에 따라 다르게 보여주기"(○○○ 마스킹, 🥬 게이트, 링크 진입 보호)는 서버 응답 조립 단계에서 처리한다. §2, §3.4.

---

## 1. 역할(Role)과 인증

### 1.1 프로토타입의 역할 4개

| 역할 | 프로토타입 진입 | 근거 |
|---|---|---|
| `customer` (고객) | `index.html#customer` / `#shop`, 판매 링크 `#s/c1` · `#link/c1`. 로그인 없음. 구매·문의는 시뮬. "주문 조회는 셀러리 고객센터(카카오 로그인)에서" | OLD L1582, L1591, L4374, L4424 (`custJoin`: "카카오 로그인 가입은 실서비스에서 제공") |
| `seller` (인플루언서) | `login.html?role=seller` → `index.html#influencer` | login.html L186-189, L205 |
| `brand` (브랜드) | `login.html?role=brand` → `index.html#brand` | login.html L186-189 |
| `admin` (운영팀) | 어느 탭에서든 `admin@sellery.co.kr` 로 로그인 → `index.html#admin` | login.html L172, L199, L205 |

### 1.2 login.html 의 이메일 → 역할/ID 매핑 (현재)

- 데모 계정 디렉터리 `ACCOUNTS[{role,id,name,handle,email}]` (login.html L161-173). `id` 는 OLD 시드의 `sellers[].id`(s1…s8) / `brands[].id`(b1,b2) 와 동일하다 (login.html L160 주석).
- 로그인 성공 시 `localStorage['sellery-session'] = {role,id,email,name,at,keep,provider,autoJoined}` (login.html L202-205, `SESSION_KEY` L174).
- index.html 부팅 시 세션을 읽어 `S.session` 에 두고, `role==='seller'` 면 `S.actingSeller=ss.id`, `role==='brand'` 면 `S.actingBrand=ss.id` 로 "접속 계정"을 고정한다 (OLD L1584-1589).
- 역할 불일치 로그인은 거부한다: 인플루언서 이메일로 브랜드 탭 로그인 시 오류 (login.html L267). 단 admin 은 어느 탭이든 통과.
- Google 로그인: 등록된 이메일이면 그 계정의 역할로, 처음 오는 이메일이면 **현재 탭 역할로 자동 가입** (login.html L208-217). 프로토타입은 신규 계정을 데모 첫 계정(s1/b1) 데이터로 입장시킨다 (L217, L280 주석).
- 파트너 계정은 이메일(+Google) 전용이고 고객은 카카오라는 분리가 문구로 명시돼 있다 (login.html L188 "인플루언서·브랜드 파트너 계정은 이메일로만 가입·로그인합니다").

### 1.3 제안: Supabase Auth 매핑

```
auth.users ──1:1──> public.profiles (id = auth.users.id)        -- GLO 0001 L20-27 그대로
                      role text not null default 'customer'
                        check (role in ('customer','seller','brand','admin'))
public.sellers.user_id  uuid unique references auth.users        -- GLO 0012 L13 그대로
public.brands.user_id   uuid unique references auth.users        -- sellers 와 대칭 (추정: 초기엔 브랜드당 담당자 1명. OLD 는 brand.manager 단일 필드 L1224)
```

- **`profiles.role` 이 역할의 단일 진실.** 기본값 `customer` (카카오 가입은 `handle_new_user` 트리거로 자동 생성 — GLO 0001 L35-51). `seller`/`brand` 로의 승격은 심사 승인 시 서버(service role)가 `profiles.role` 갱신 + `sellers`/`brands` 행 생성·연결 (GLO 0013 헤더 L4-6 흐름과 동일). `admin` 은 대시보드/SQL 로만 지정.
- **역할 컬럼은 사용자가 절대 수정 못 하게 한다.** GLO 0001 의 `profiles_update_own` (L60-63) 은 행 전체 update 를 허용하므로, 셀러리에서는 `revoke update on profiles from authenticated` 후 `grant update (full_name, phone) on profiles to authenticated` 로 컬럼을 좁힌다. 그렇지 않으면 고객이 스스로 `role='admin'` 으로 바꿀 수 있다.
- 역할 확인 헬퍼(정책·서버 공용):
  ```sql
  create or replace function public.app_role() returns text
  language sql stable security definer set search_path = public as
  $$ select role from public.profiles where id = auth.uid() $$;
  revoke all on function public.app_role() from public, anon;   -- GLO 0009 L72 패턴
  grant execute on function public.app_role() to authenticated;
  ```
  이름을 `current_role()` 로 짓지 않는다 — `CURRENT_ROLE` 은 Postgres 예약어(내장 함수)라 스키마 없이 호출하면 내장이 잡히고, 정의하려면 따옴표가 필요해 정책 SQL 에서 실수하기 쉽다.
  선택: 서버가 승격 시 `auth.users.raw_app_meta_data.role` 에도 미러해 JWT 클레임(`auth.jwt() -> 'app_meta_data' ->> 'role'`)으로 싸게 검사할 수 있다 (**추정**, 2단계 최적화).
- **한 이메일 = 한 역할.** login.html L267 의 거부 규칙을 그대로 옮긴다: `profiles.role` 이 `seller` 인 계정은 브랜드 센터에 들어갈 수 없다(서버 미들웨어). 인플루언서이면서 브랜드인 경우는 별도 계정.
- 판매 링크·판매센터는 로그인 없이 열린다 (OLD L1591: 해시만으로 고객 화면 진입). 결제·주문 조회·문의는 카카오 로그인 후 `orders.user_id` 로 귀속 (**추정**: glo 0001 L73 처럼 `user_id` nullable 로 비회원 결제도 허용할지는 결정 필요. 프로토타입 문구(L4374)는 회원 조회를 전제로 한다).

### 1.4 각 역할이 보는 화면 (권한 범위의 근거)

- seller: home / explore(상품 갤러리) / camps / dm / shop / sales / rank / ref / settle / my (OLD L1745)
- brand: home / camps / products / gallery(인플루언서 갤러리) / requests(dm) / sales / orders / cs / settle / my (L1746)
- admin: home / products(검수) / influencers / brands / orders(주문·CS) / match(자동 제안) / revenue(매출·순수익) / settle(정산 실행) (L1712, L1747)
- customer: home / influencers / about, 그리고 store(판매 링크 페이지) (L1713, L1748, L3491)

---

## 2. 컬렉션별 필드 가시성

프로토타입의 `seedData()` 컬렉션(OLD L1219-1371)을 기준으로, 역할별로 "볼 수 있는 필드"를 정리한다. 열 의미:

- **anon/고객**: 판매센터·판매 링크 페이지(로그인 없음 또는 카카오 고객).
- **본인**: 그 행의 주인(인플루언서 자신 / 브랜드 자신 / 구매자 자신).
- **상대 파트너**: 캠페인으로 묶인 상대(브랜드↔인플루언서).
- **타 파트너**: 관계없는 인플루언서/브랜드.
- **admin**: 전부. 아래 표에서 admin 열은 생략(항상 전체).

### 2.1 sellers (인플루언서)

시드 필드: `id,name,handle,email,platform,settleInfo{type,bank,account,holder,bizNo,bizDoc},img,followers,cat,likesAvg,recentLikes[],m3Sales,refCode,referredBy,intro,hidden,channels[],celeryItems{},sampleExtra` (OLD L1241-1259, L3979, L4026, L4046).

| 필드 | anon/고객 | 본인 | 브랜드(상대·타) | 타 인플루언서 |
|---|---|---|---|---|
| id, handle, name, img, platform, cat, intro | O — 인플루언서 목록·카운트는 공개(`!hidden`) 인플루언서만 (L3291, L3474). 판매 카드·링크 페이지·인증 모달은 **캠페인이 공개면 `hidden` 과 무관하게** 이름·핸들·아바타를 표시 (L3269, L3510, L4412 — `custVisible` L3255-3260 은 `hidden` 을 보지 않음) | O | O — 단 `hidden` 이면 **○○○ 마스킹** (§2.1.1) | 랭킹에서 ○○○ 만 (L2120, L2125) |
| 등급(grade) | O (L3269 배지) | O | O (마스킹 상태에서도 등급은 보임, L2679) | O (L2123) |
| followers | O (L3479 "팔로워 n · 채널 인증 ✓") | O | 공개 인플루언서: O (L2635). 비공개: **레퍼런스 열람권** 후 (L2681 vs L2683) | 랭킹의 매출/팔로워 비율로 간접 노출 (L2122) |
| likesAvg, recentLikes(참여율·스파크라인) | X | O | **데이터 확인 게이트** (L2628 `unlocked`) / 비공개는 레퍼런스 열람 후 (L2681) | 상품 실적표에서 익명 행으로 (L2276) |
| m3Sales(3개월 매출), 판매당 평균, 진행 이력 | X | O | 공개 인플루언서: 데이터 확인 게이트 (L2638-2662). 비공개: 스카우트 카드에 **m3Sales 는 게이트 없이 노출** (L2680) | 랭킹에서 익명으로 전원 노출 (L2118-2123) |
| email | X | O (본인 세션 표시, L1728) | **X** | X |
| settleInfo (bank, account, holder, bizNo, bizDoc) | X | O (마이페이지 L2171-2189) | **X** | X |
| refCode, referredBy | X | O (L2149-2153) | X | referredBy 는 추천인 쪽 화면에 피추천인 이름으로 (L2262-2264) |
| hidden 플래그 | 간접(목록 제외) | O | 간접(○○○) | X |
| celeryItems, sampleExtra (구매한 열람권·부스트·샘플 추가권) | X | O | X (featured 는 갤러리 정렬로만 간접, L2674) | X |
| channels[] | **인증된 채널만** (L4407-4413 판매 인증 모달) | O (미인증 포함, L2157-2170) | 인증된 채널만 (L2157 "인증된 채널만 브랜드에 노출") | X |
| user_id (auth 연결) | X | — | X | X |

#### 2.1.1 비공개(hidden) 인플루언서의 신원 공개 시점

- 브랜드 홈 소식·TOP5·갤러리 스카우트 카드·제안 모달에서 `hidden` 인플루언서는 `○○○ 인플루언서` 로만 표시 (L2469, L2479, L2679, L3720, L3905). 반면 관리자 화면(매칭·자동 제안 후보)은 "비공개 인플루언서도 실명 표시" (L3120, L3122, L3142).
- **레퍼런스 열람권(🥬 등급별 1–5)** 을 쓰면 팔로워·좋아요·참여율·매출/팔로워 지표가 열리지만 **이름·핸들은 여전히 비공개** (L2681, L3896-3898 `unlockedRefs`).
- **신원 공개** 조건 (코드에서 확인):
  1. 브랜드 제안을 인플루언서가 **수락**(`acceptInvite`, L4073 "🔓 익명 인플루언서 신원 공개").
  2. 인플루언서가 그 브랜드 상품에 **독점권 신청** (L2288 title "신청 시 브랜드에 프로필(이름·채널·지표)이 공개됩니다", L2762, L3922).
  3. **추정**: 비공개 인플루언서가 스스로 샘플을 요청한 캠페인(`SAMPLE_REQUESTED`)은 시스템 메시지에 이름·핸들이 찍힌다(L1355 패턴)고 보고 신원 공개로 취급.
- 프로토타입의 캠페인 스레드 헤더(L3552)와 메시지 발신자명(L3564)은 `hidden` 여부와 무관하게 `s.name` 을 출력한다 → INVITED 상태의 비공개 인플루언서가 스레드에서 새어 나갈 수 있는 **프로토타입의 빈틈**. 실서비스에서는 서버가 아래 술어로 마스킹한다:

```sql
-- 브랜드 b 가 인플루언서 s 의 실명·핸들을 볼 수 있는가 (서버 응답 조립용; RLS 아님)
seller_identity_visible(s, b) :=
     not s.hidden
  or exists (select 1 from campaigns c join products p on p.id = c.product_id
             where c.seller_id = s.id and p.brand_id = b.id
               and c.status not in ('INVITED','DECLINED'))           -- 수락 이후 또는 인플루언서 발의
  or exists (select 1 from exclusive_requests x join products p on p.id = x.product_id
             where x.seller_id = s.id and p.brand_id = b.id)          -- 독점권 신청
```

- 지표(팔로워·참여율·매출 등) 게이트 (L2628, L2677):

```sql
seller_metrics_unlocked(s, b) :=
     worked_together(s, b)                                   -- LIVE/CLEARING/SETTLED 캠페인 존재 (L2626)
  or brand_pass_active(b, 'datapass', 30 days)               -- 30일 데이터 패스 (L1445, L1481)
  or exists (select 1 from brand_data_unlocks where brand_id = b.id and seller_id = s.id)  -- 건당 열람 (L1270, L3891)
  -- 비공개 인플루언서의 팔로워·좋아요 열람은 별도 테이블 unlocked_refs (L1269, L3897)
```

### 2.2 brands (브랜드)

시드 필드: `id,name,cat,manager,email,settleInfo{bank,account,holder,bizNo,mailOrder,bizDoc},gmvBase,logo,refCode,referredBy,autoPropose,freeRefUsed{},celeryItems{}` (L1224-1225, L3808, L3842, L4027). 자동 발주 설정 `{on,email}` 은 프로토타입에서 브랜드 id 없는 전역 객체 `D_().autoPO` (L4163, 읽기 L2773·L4157·L4236) 이지만 브랜드별 컬럼(`po_enabled, po_email`)으로 옮긴다 (**추정**).

| 필드 | anon/고객 | 본인 | 인플루언서 | 타 브랜드 |
|---|---|---|---|---|
| id, name, logo, cat, 등급 | O (L3271 브랜드명, L4414 등급) | O | O (상품 카드·상세 L2293) | O (상품 갤러리는 전 브랜드 공개) |
| settleInfo.bizNo, mailOrder | **O** — 판매 인증 모달에 사업자번호 표시 (L4414). 전자상거래법상 표기 의무 항목이라 공개 컬럼으로 분리 (`biz_no`, `mail_order_no`) | O | X | X |
| settleInfo.bank/account/holder/bizDoc | X | O (L2856-2869) | **X** | X |
| manager, email | X | O (L2834, L2840-2841) | **X** (스레드에서 브랜드명만, L3564) | X |
| gmvBase / 누적 GMV | X (판매센터 "누적 판매액"은 플랫폼 합계로만, L3304) | O (L2850) | 등급으로만 간접 | X |
| autoPropose, freeRefUsed, celeryItems, po(자동 발주 이메일) | X | O | X | X |
| refCode, referredBy | X | O | X | 추천인 브랜드 화면에 피추천 브랜드명 (L2537) |

### 2.3 products (상품)

시드 필드: `id,brandId,name,desc,em,thumb,imgs[],cat,cp,gp,rate,sample,stock,status(listed|pending|rejected|paused),t{},exclusive{grade,label},exclusiveSellerId,samplePolicy{freeGrade,buyMode,fixedPrice,refund},options[],rejectReason,boosted,celeryItems` (L1288-1300, L3745-3785, L4275-4276).

| 필드 | anon/고객 | 브랜드 본인 | 인플루언서 | 타 브랜드 |
|---|---|---|---|---|
| id, brand_id, name, desc, em, thumb, imgs, cat, cp, gp, options | O — **공개 캠페인이 걸린 상품** (판매센터는 캠페인 기준으로 보여줌, L3285-3286; 상품 단독 목록 없음). `paused` 여도 진행 중 판매는 유지되므로(L2615 "노출 중단 시 새 샘플 요청만 막히고 진행 중 판매는 유지", L4307) 공개 여부를 `status='listed'` 로만 판정하면 링크 페이지가 깨진다 (§3.2) | O | O (`listed` 전체, L1949) | O |
| rate(수수료율) | **X** (판매 페이지는 "인플루언서는 판매 수수료를 받습니다" 문구만, L3535) | O | O — "브랜드가 판매가·수수료율을 공개 책정" (L1962, L2293) | O (**추정**: 갤러리가 전 브랜드 공개이므로) |
| stock, 잔여 재고 | X (캠페인 `qty` 기준 잔여만, L3273) | O | 일정 제안 시 `stockLeft` 로 잔여 확인 (L1688) | X |
| sample, samplePolicy | X | O | O (L2294) | O (**추정**) |
| exclusive{}, exclusiveSellerId | X | O | O — 확정 인플루언서는 `○○○` (L2286) | O (**추정**) |
| status, rejectReason | listed 만 | O | listed 만 | listed 만 |
| celeryItems/boosted, t(트렌드) | X | O | 부스트 배지·트렌드 배지로 간접 (L1921) | 간접 |

### 2.4 campaigns (캠페인 = 판매 1건)

시드 필드: `id,sellerId,productId,status(ST 14종 L1194-1209),start,end,qty,createdAt,testDue,propStart,propEnd,propQty,invited,auto,celUsed,celRefunded,purchased,samplePaid{price,cel,cash,method},sampleRefunded,regongu,homeFeatured,settledAt` (L1303-1315, L4033, L4064, L4255-4258).

| 필드 | anon/고객 | 당사자(인플·브랜드) | 타 파트너 |
|---|---|---|---|
| id, seller_id, product_id, status, start, end, qty, home_featured | O — `status in ('LIVE','SCHEDULE_CONFIRMED')` 는 홈 목록 (L3285-3286), 랭킹은 `CLEARING` 포함 (L3294), **판매 링크 페이지는 종료 후에도 열린다**("판매가 종료되었습니다", L3525) | O | 실적표(익명, L2271-2276)·기간 선점 확인(L1674-1685) 용도로 일부 |
| 판매 수량(sold_qty), 잔여 | O (L3273, L3522 — orders 집계) | O | 익명 실적표에서 확정 매출로 |
| propStart/propEnd/propQty, testDue, invited, auto, celUsed, celRefunded, purchased, samplePaid, sampleRefunded, regongu, settledAt | X | O | X |
| 정산 미리보기(calc: gross/refund/net/pg/sf/pf/brandPay) | X | O — 양 당사자 모두 동일 표를 본다 (L3574-3588; 수수료 구조가 공개 정책이라 브랜드 정산액도 인플루언서에게 보임) | X |

### 2.5 messages (캠페인 스레드) — `D_().messages[cid][] = {type:'sys'|'chat'|'warn', role:'seller'|'brand'|'admin', txt, at}` (L1343-1344, L1658-1665)

| 항목 | anon/고객 | 당사자 | 타 파트너 |
|---|---|---|---|
| 스레드 전체 | X | O — 인플루언서는 자기 캠페인, 브랜드는 자기 상품의 캠페인 (L1995-1996) | X |
| 발신자 표시 | — | 브랜드는 `b.name`, 인플루언서는 `s.name`(마스킹 규칙 §2.1.1 적용), admin 은 "셀러리 운영팀" (L3564) | — |
| 연락처 유출 경고 | — | 서버가 insert 시 정규식(휴대폰 `01x-xxxx-xxxx`, 카톡/카카오톡/kakao)으로 감지해 `type='warn'` 행을 덧붙인다 (L1662-1664) | — |
| admin 발신 | — | 관리자는 **브랜드 대행**으로 발신 (L4467 주석 "관리자는 브랜드 대행으로 발신 (사용자 결정)") | — |

브랜드↔인플루언서 **연락처 차단 원칙**: 상대의 `email`/`phone` 컬럼은 어떤 API 응답에도 싣지 않는다(§2.1, §2.2). 대화는 플랫폼 스레드 안에서만 ("플랫폼 밖 거래는 정산·분쟁 보호를 받지 못합니다", L1663).

### 2.6 orders (주문)

시드 필드: `id,campaignId,buyer(마스킹된 이름 '김*은'),qty,unit,opt,status(PAID|REFUNDED|CANCELED),at,sample,tracking,courier` (L1327-1341, L4363). 프로토타입에는 실명·연락처·주소가 없다. 실서비스는 glo 0001 L80-84 처럼 `customer_name, customer_phone, shipping_address jsonb` + 결제 필드(`payment_key, raw_payment`)가 붙는다 (**추정**).

| 필드 | 구매자 본인 | 브랜드(공급사) | 인플루언서(판매자) | anon |
|---|---|---|---|---|
| 주문번호, 상품·옵션·수량·금액, 상태, 일자 | O (GLO 0001 `orders_select_own` L108-111) | O — 자기 상품의 주문 (L2769-2799) | O — 자기 캠페인의 주문, **구매자명은 마스킹** (L2381 실시간 피드, L2793) | X (집계 `sold_qty` 만) |
| 수취인 실명·연락처·주소 | O | **O — 직배송 주체이므로 필요** (L3533 "브랜드에서 직배송", L2781-2784 송장 일괄 업로드) | **X** | X |
| tracking, courier | O | O (입력 주체) | O (**추정**: 배송 현황 확인 필요) | X |
| payment_key, raw_payment, PG 응답 | X (**추정**: 구매자에게도 영수증 요약만) | X | X | X |
| 환불 처리 | — | O (L2798 `refund`) | X | admin 도 O (L3064) |
| 샘플 구매 주문(`sample=true`) | — | O (일반 판매와 동일 정산, L3708) | 본인 것 O | X |

### 2.7 cs (고객 문의) — `{id,cid,orderId,buyer,type,msg,status(OPEN|ANSWERED|CLOSED),at,reply,repliedAt}` (L1319-1320, L4383)

| 역할 | 권한 | 근거 |
|---|---|---|
| 고객(작성자) | 자기 문의 생성·조회 (**추정**: `user_id` 로 귀속; 프로토타입은 익명 '고객') | L2906-2915, L4378-4387 |
| 브랜드 | 자기 상품 캠페인의 문의 조회·답변·종료 | L1689-1694 `csOf/csBrandId`, L2880-2905 |
| 인플루언서 | **X** — 문의는 브랜드로 직행 (L2909 "이 문의는 브랜드에 바로 전달"), 스레드에 sys 라인만 (L4384) | |
| admin | 전체 현황 조회 (L3066-3068 "관리자는 처리 현황을 확인") | |

### 2.8 celeryLedger (🥬 원장) — `{who(s*/b*),at,delta,memo,won?}` (L1231-1239, L1484, L4041, L4078, L4440)

| 역할 | 권한 |
|---|---|
| 본인(인플루언서/브랜드) | 자기 원장 조회 (잔액 `celBal` L1456, 샵 L2309). **쓰기 없음** — 충전/차감/환급/지급 전부 서버 |
| 상대·타 파트너 | X |
| admin | 전체 + 지급(`admGrant` L4440) + 충전 매출 집계 (L3153-3157) |

파생 상태(열람권·부스트·패스 구매)는 `sellers.celeryItems`/`brands.celeryItems`/`products.celeryItems` 에 날짜로 저장된다 (L1481, L4027-4028). 실서비스는 별도 `celery_purchases(owner, item_id, purchased_at, expires_at)` 테이블 권장 (**추정**).

### 2.9 데이터 열람(data views) 관련 컬렉션

| 컬렉션 | 내용 | 읽기 | 쓰기 |
|---|---|---|---|
| `brandDataUnlocks {brandId:[sellerId]}` (L1270, L3891) | 브랜드가 🥬 로 연 인플루언서 성과 데이터 | 해당 브랜드 본인(서버가 게이트 판정에 사용) | 서버 |
| `unlockedRefs [sellerId]` (L1269, L3897) | 비공개 인플루언서 레퍼런스 열람. 프로토타입은 브랜드 구분 없이 전역 배열이지만 실서비스는 `(brand_id, seller_id)` 로 (**추정**, `spendData` 가 브랜드 잔액을 차감하므로 브랜드 귀속이 맞다) | 해당 브랜드 | 서버 |
| `sellers.celeryItems.datapass` (L2274, L4046) | 인플루언서용 "매출 데이터 확인권"(영구) — 상품 실적표 2행째부터 열람 | 본인 | 서버 |
| `brands.freeRefUsed {yyyy-mm: n}` (L1386-1389) | 다이아·블랙 브랜드 월 5회 무료 열람 사용량 | 본인 | 서버 |
| `productViews [{sellerId,productId,ago}]` (L1261-1268, L2453-2460) | 인플루언서가 상품을 조회한 기록 — 브랜드 홈에 **인플루언서 이름·팔로워·참여율이 게이트 없이** 표시 | 브랜드(자기 상품) | 서버(상품 상세 열 때 기록) |
| `external {sellerId:[{name,brand,src,at,price}]}` (L1271-1280, L2651-2654) | 크롤링한 외부 판매 감지 + 예상 매출(가계산) | 브랜드 — 데이터 게이트 안 (L2638) ; admin(운영비 산정 L3161) | 서버(크롤러) |

인플루언서에게 열리는 타 인플루언서 데이터는 **모두 익명·집계**다: 랭킹 리더보드(L2118-2125, "저격 불가"), 상품별 익명 실적표(L2296 "인플루언서 익명"), 등급 이상 베스트셀러 TOP5(L1951-1959, 상품 단위 합계). 이 세 화면은 서버 RPC/뷰에서 `seller_id`·이름을 제거한 결과만 돌려준다. 제안서에도 같은 원칙이 있다 (PDFTXT L511 "실적은 인플루언서 익명으로 보이되 팔로워 규모와 참여율이 함께").

### 2.10 그 밖의 컬렉션

| 컬렉션 | 읽기 | 쓰기 | 근거 |
|---|---|---|---|
| `exclusiveReqs {id,productId,sellerId,status,at}` | 신청 인플루언서 본인 / 상품 브랜드(신청자 프로필 공개, L2762) / admin(대기 건수 L2927) | 서버 (L3921, L3926, L3931) | |
| `refEarnings`, `brandRefEarnings` | 추천인 본인 (L2233, L2537) / admin | 서버(정산 시, L4264, L4269) | |
| `settlements {at,cid,title,net,brandPay,sellerPay,platFee,pfNet,holdS,holdB}` | 인플루언서: 자기 캠페인 행의 `net, sellerPay, holdS` / 브랜드: `net, brandPay, holdB` / **`platFee, pfNet` 은 admin 전용** (L3105-3106) | 서버(`runSettle` L4253-4274) | 개인 원천징수 3.3% 는 `sellers.settleInfo.type` 으로 결정 (L1656) |
| `opex` (OPEX_DEF 오버라이드) | **admin 전용** (L3159-3174, L4428-4429) | admin → 서버 | glo 0010 `app_settings` 류의 service-role 전용 테이블 권장 |
| 매출·순수익(`calc().pfNet, vat, costs`, 셀러리 충전 매출) | **admin 전용** (L2948, L3149-3250) | — | 파생값. 저장한다면 settlements 에만 |
| 자동 제안 후보/실행 (`autoMatches`, `runAutoPropose`) | admin | 서버 | L1409-1420, L4448-4461 |
| 상품 검수(approve/reject), 인플루언서 공개/비공개 전환, 🥬 지급, 브랜드 자동 제안 토글 | admin | 서버 | L4275-4276, L4439-4440, L4447 |
| 링크 진입 보호 `slry-linkctx` | 브라우저 로컬(쿠키/LS) — DB 아님 | — | L1566-1578 |

---

## 3. 익명(anon) 읽기 — 고객 판매센터가 필요로 하는 것

### 3.1 화면별 필요 데이터

| 화면 | 필요 데이터 | 근거 |
|---|---|---|
| 홈 `진행 중 / 오픈 예정` | campaigns(`LIVE`, `SCHEDULE_CONFIRMED`) + product 공개 필드 + seller 공개 필드(이름·핸들·아바타·등급·플랫폼) + brand name + `sold_qty`, 잔여, D-day, `home_featured` | L3262-3275, L3285-3286 |
| 실시간 판매 순위 | `LIVE/SCHEDULE_CONFIRMED/CLEARING` 캠페인의 `sold_qty` 상위 5 + 상품명 + 인플루언서 이름 | L3294, L3322 |
| 상단 통계 | "지금 보는 중"(시뮬), 오늘 판매 수량(오늘 PAID 주문 합계), 누적 판매액(`platformGmv`), 공개 인플루언서 수·브랜드 수 | L3289-3291, L3302-3305 |
| 인플루언서 목록 | 공개(`!hidden`) 인플루언서의 이름·등급·플랫폼·핸들·팔로워·소개 + 진행/예정/완료 캠페인 수 | L3473-3483 |
| 셀러리 소개(about) | `platformGmv`, 공개 인플루언서 수 등 집계 | L3344-3345 |
| 판매 링크 페이지 `/s/{handle}/{cid}` | campaign(상태 무관 — 종료 후에도 "판매 종료" 안내, `PREVIEW` 는 파트너 전용) + product(옵션·이미지·가격) + seller 공개 필드 + brand name + 같은 인플루언서의 다른 LIVE/예정 캠페인 | L3491-3536, L3498, L3502 |
| 판매 인증 모달 | 링크 유효성, 인플루언서 이름·핸들·등급, **인증된 채널 목록**, 브랜드명·등급·**사업자등록번호**, 판매 기간 | L4405-4419 |
| 문의하기 | 캠페인→브랜드명 (안내문), 문의 insert 는 서버 | L2906-2915 |

### 3.2 anon 이 읽어야 하는 컬럼 (grant 대상)

- `campaigns`: `id, seller_id, product_id, status, start_at, end_at, qty, sold_qty, home_featured_at` — 정책: `status in ('SCHEDULE_CONFIRMED','LIVE','CLEARING','SETTLED')` (링크 페이지가 종료 건도 렌더링, L3525). 협상 단계(`SAMPLE_*`, `TESTING`, `SCHEDULE_PROPOSED`, `INVITED` 등)는 비공개.
- `products`: `id, brand_id, name, description, emoji, thumb_url, image_urls, category, consumer_price, sale_price, options, status` — 정책: `status in ('listed','paused') or exists (select 1 from campaigns c where c.product_id = products.id and c.status in ('SCHEDULE_CONFIRMED','LIVE','CLEARING','SETTLED'))`. `listed` 만 열면 (a) 노출 중단(`paused`) 중에도 유지되는 진행 중 판매(L2615, L4307)와 (b) 판매가 변경으로 재검수(`pending`)에 들어간 상품의 종료 캠페인 링크(L4293)가 anon 에게 깨진다. `pending`/`rejected` 신규 상품은 캠페인이 없으므로 여전히 비공개. **`commission_rate, stock, sample_text, sample_policy, exclusive_*, reject_reason` 는 grant 에서 제외.**
- `sellers`: `id, handle, name, avatar_url, platform, category, intro, followers, grade` — 정책: `hidden = false or exists(공개 캠페인)` (§3.3). GLO 0014 L15-20 (`grant select (id, handle, active)` + `using (active)`) 의 확장.
- `seller_channels`: `seller_id, platform, handle, url, followers` — 정책: `verified = true` (L4407, L2157).
- `brands`: `id, name, logo_url, category, grade, biz_no, mail_order_no` — 정책: `active` (또는 상품이 listed 인 브랜드). **`bank_info, manager, email, gmv_base, auto_propose, ...` 는 제외.**
- 집계: `sold_qty`(캠페인당 PAID 수량 합, L1403), 오늘 판매 수량, 누적 판매액, 공개 인플루언서 수.
  - 권장: `campaigns.sold_qty integer` 카운터 컬럼을 서버가 주문 생성/환불과 같은 트랜잭션에서 갱신 (쓰기가 전부 service role 이라 정합성 유지가 쉽다). `orders` 는 anon 에게 절대 열지 않는다.
  - 홈 통계는 `public.site_stats` 1행 테이블(서버 크론 갱신) 또는 `security definer` RPC `public_stats()` 로 제공 (**추정**; 둘 다 orders 를 직접 노출하지 않는다).
- "👀 n명 보는 중"은 프로토타입에서 의사난수(`viewersOf` L3278)다. 실서비스는 Supabase Realtime Presence 로 세는 것이 자연스럽고 **DB 컬럼이 아니다** (**추정**).

### 3.3 등급(grade) 노출

등급은 `m3Sales` 의 파생값(`gname` L1497-1498)이고 고객·브랜드·타 인플루언서 모두에게 보이지만 `m3Sales` 자체는 공개 대상이 아니다. `sellers.grade text` 를 서버가 정산 시(`runSettle` L4256 `m3Sales` 누적) 재계산해 저장하고 그 컬럼만 grant 한다. 브랜드 등급도 동일 (`bGmv` L1529-1536 → `brands.grade`).

### 3.4 판매 링크로 들어온 방문에서 **보이지 않아야** 하는 것 (앱 규칙 — RLS 아님)

- 규칙(`custVisible` L3255-3260): 링크 컨텍스트가 있으면 **그 판매의 인플루언서가 아닌** 캠페인 중 **같은 상품이거나 같은 카테고리**인 캠페인을 홈·인플루언서 목록·순위·"다른 판매"에서 모두 숨긴다. 표시 문구 L3308.
- 유지 기간: 브라우저 `localStorage['slry-linkctx'] = {cid, at}`; 해당 판매 종료 후 7일 경과 또는 캠페인 소멸 시 해제 (L1566-1578). 홈으로 이동해도 유지 (L4352).
- **DB 로 표현할 수 없고, 해서도 안 된다.** 같은 anon 이 링크 없이 홈에 오면 전부 보여야 하므로 행 가시성은 방문 컨텍스트에 달려 있다. Next.js 에서 쿠키(예: `slry_linkctx=cid`)를 읽어 서버 컴포넌트/route handler 가 결과를 필터링한다. RLS 는 "공개 캠페인 전체 읽기 가능"까지만 보장한다.
- 판매 페이지의 "다른 판매 보기"는 **같은 인플루언서**의 다른 LIVE/예정 캠페인만 (L3498, L3534) — 이것도 서버 쿼리 조건.

---

## 4. 권장 패턴 (glo 방식) 과 테이블별 grant/policy

### 4.1 원칙과 근거

| 원칙 | glo 근거 | 셀러리 적용 |
|---|---|---|
| 모든 테이블 `enable row level security` | 0001 L53, L102 · 0012 L29, L68 · 0013 L38 · 0015 L39-40 | 예외 없음 |
| 민감 테이블은 정책 없이 두거나 `revoke all from anon, authenticated` | 0012 L9-10, L30 ("계좌 등 민감 정보 포함 — service_role 전용") · 0013 L39 · 0015 L5-6, L41 ("정책 없음 → anon/authenticated 직접 접근 차단, service role만 통과") | sellers/brands 의 정산·연락처, orders 결제 필드, ledger, settlements, opex, unlock 테이블, messages, cs |
| 공개는 컬럼 grant + select 정책의 조합 | 0012 L70-79 (`revoke all` 후 `grant select (col...)` + `using (status='approved')`) · 0014 L13-23 | campaigns/products/sellers/seller_channels/brands 의 공개 컬럼 |
| 본인 행 읽기 정책은 `auth.uid() = <owner>` | 0001 L55-58 (profiles), L108-111 (orders) | profiles, orders(구매자), 그리고 선택적으로 celery_ledger/settlements 본인 행 |
| 모든 쓰기는 서버(service role) | 0001 L104-107 주석 · 0015 L4-5 | 상태 전이·🥬·정산·검수·메시지·문의·주문 전부 |
| 실시간은 postgres_changes 대신 Broadcast (비회원은 JWT 없음) | 0015 L6-8 | 고객 화면(구매 카운트·문의)은 동일. 파트너 스레드는 로그인 상태이므로 2단계에서 `campaign_messages` 에 당사자 select 정책 + postgres_changes 가능 (**추정**) |
| `set_updated_at` 트리거, `created_at/updated_at timestamptz` | 0001 L7-15, L29-32 | 전 테이블 |

**파트너의 "자기 행" 읽기: 서버 경유 vs 좁은 정책 — 서버 경유를 표준으로 한다.**

- 셀러리의 가시성 규칙은 행 단위가 아니라 **"같은 행을 상대·상태에 따라 다르게"** 보여주는 규칙이다: ○○○ 마스킹(§2.1.1), 🥬 게이트(§2.9), 인증된 채널만, 상대 파트너의 이메일 제거, 정산표에서 `platFee/pfNet` 제거, 익명 랭킹. Postgres 의 컬럼 권한은 역할(role)별이지 행별이 아니어서 "브랜드 b 는 인플루언서 s 의 followers 를 열람권을 샀을 때만" 같은 조건을 grant 로 표현할 수 없다. 뷰를 쌓아 올리면 가능하지만 뷰마다 `security_invoker` 여부와 RLS 우회 여부를 검토해야 해서 실수 여지가 크다.
- glo 도 셀러 포털·어드민 읽기를 전부 서버 액션(service role)으로 처리하고 있고(0012 L9-10, 0015 L4-5) 같은 코드베이스로 옮기므로 일관성이 있다.
- 클라이언트가 anon/authenticated 키로 직접 읽는 것은 **공개 카탈로그**와 **본인 profile / 본인 orders** 로 한정한다. 그 외 좁은 정책은 "있으면 편한" 정도이고 잘못 열면 사고가 되므로, 필요해지는 시점(Realtime 구독 등)에 개별 검토해 추가한다.

### 4.2 테이블별 제안 (grant / policy / 접근 경로)

표기: `S` = service role 만(정책·grant 없음, `revoke all`), `P` = policy, `G(cols)` = anon/authenticated 컬럼 grant.

| 테이블(제안명) | RLS | anon/authenticated grant | select 정책 | 파트너/관리자 읽기 | 쓰기 | 비고 |
|---|---|---|---|---|---|---|
| `profiles` | ON | `G(select: id, role, full_name, phone, email)` 본인만 · `G(update: full_name, phone)` | P `auth.uid() = id` (0001 L55-58) | 본인 직접 / admin 서버 | 서버(role) · 본인(이름·전화) | **role 컬럼 update 금지** (§1.3) |
| `sellers` | ON | `G(select: id, handle, name, avatar_url, platform, category, intro, followers, grade, hidden)` | P `not hidden or exists(공개 캠페인)` | 본인 전체·브랜드 마스킹본·admin: 서버 | 서버(마이페이지 저장 L3974-3981 도 서버 액션) | `email, phone, user_id, bank_info(jsonb), biz_no, biz_doc_url, m3_sales, likes_avg, recent_likes, ref_code, referred_by, celery_items, sample_extra` 는 grant 제외. 0012 L9-30 + 0014 L13-20 확장 |
| `seller_channels` | ON | `G(select: id, seller_id, platform, handle, url, followers, verified, is_primary)` | P `verified` and 부모 seller 공개 | 본인(미인증 포함): 서버 | 서버 | `vcode`(L2208) 제외 |
| `brands` | ON | `G(select: id, name, logo_url, category, grade, biz_no, mail_order_no)` | P `active` (**추정** 컬럼) | 본인·admin: 서버 | 서버 | `manager, email, user_id, bank_info, biz_doc_url, gmv_base, auto_propose, free_ref_used, celery_items, ref_code, referred_by, po_email, po_enabled` 제외 |
| `products` | ON | `G(select: id, brand_id, name, description, emoji, thumb_url, image_urls, category, consumer_price, sale_price, options, status)` | P `status in ('listed','paused') or exists(공개 캠페인)` (§3.2 — `paused` 상품의 진행 중 판매 L2615) | 인플루언서(rate·sample·exclusive 포함)·브랜드·admin: 서버 | 서버 (검수 승인·반려 포함) | `commission_rate, stock, sample_text, sample_policy, exclusive_grade, exclusive_label, exclusive_seller_id, reject_reason, boost_until, trend` 제외 |
| `campaigns` | ON | `G(select: id, seller_id, product_id, status, start_at, end_at, qty, sold_qty, home_featured_at)` | P `status in ('SCHEDULE_CONFIRMED','LIVE','CLEARING','SETTLED')` | 당사자·admin: 서버 | 서버 (`transition` L3790, 스케줄러 `autoTick` L1422 → 크론) | 협상 필드(`proposed_*`, `test_due`, `invited`, `auto`, `cel_used`, `sample_paid`, `regongu`, `settled_at`) 제외 |
| `campaign_messages` | ON | 없음 | 없음 (0015 L41 패턴) | 당사자·admin: 서버 | 서버 (연락처 감지 warn 삽입 L1662) | 2단계: 당사자 select 정책 + postgres_changes 검토 |
| `orders` | ON | `G(select: id, order_no, campaign_id, status, qty, unit_price, option_name, amount, tracking_no, courier, created_at)` 구매자용 | P `auth.uid() = user_id` (0001 L108-111) | 브랜드(수취인 PII 포함)·인플루언서(마스킹)·admin: 서버 | 서버 (PG 확인·환불·송장) | `payment_key, raw_payment` 는 구매자 grant 에서도 제외(**추정**). 비회원 주문 허용 시 0015 의 `client_token` 방식 참고 |
| `cs_inquiries` | ON | 없음 | 없음 | 브랜드(자기 캠페인)·admin: 서버 · 고객 본인: 서버(또는 P `auth.uid() = user_id`) | 서버 | 0015 `cs_conversations` 패턴 |
| `celery_ledger` | ON | 없음 | 없음 | 본인·admin: 서버 | 서버 | 선택: P `owner_user_id = auth.uid()` 로 잔액 표시를 클라이언트가 직접 읽게 할 수 있으나 표준은 서버 |
| `celery_purchases` (열람권·부스트·패스) | ON | 없음 | 없음 | 본인: 서버 | 서버 | `celeryItems` 대체 (**추정**) |
| `brand_data_unlocks`, `brand_ref_unlocks` | ON | 없음 | 없음 | 해당 브랜드: 서버(게이트 판정) | 서버 | `brandDataUnlocks`/`unlockedRefs` |
| `product_views` | ON | 없음 | 없음 | 브랜드(자기 상품): 서버 | 서버 | |
| `seller_external_sales` | ON | 없음 | 없음 | 브랜드(게이트 안)·admin: 서버 | 서버(크롤러) | |
| `exclusive_requests` | ON | 없음 | 없음 | 인플루언서 본인·브랜드·admin: 서버 | 서버 | |
| `referral_earnings` (seller/brand 통합 또는 2개) | ON | 없음 | 없음 | 추천인 본인·admin: 서버 | 서버(정산 시) | |
| `settlements` | ON | 없음 | 없음 | 인플루언서(`net, seller_pay, hold_seller`)·브랜드(`net, brand_pay, hold_brand`)·admin(전체): 서버 | 서버 | `platform_fee, platform_net` admin 전용 |
| `app_settings` (opex 등) | ON | 없음 | 없음 | admin: 서버 | 서버 | glo 0010 |
| `site_stats` (홈·소개 집계) | ON | `G(select: *)` | P `true` | — | 서버 크론 | 1행. 또는 RPC `public_stats()` security definer |
| `seller_applications`, `brand_applications` | ON | 없음 | 없음 | admin: 서버 · 본인: 서버 | 서버 | 0013 그대로 |

보조 함수(모두 `security definer`, `set search_path = public`):

- `app_role()` — §1.3.
- `campaign_public_stats(campaign_id)` 또는 `sold_qty` 카운터 — §3.2. 뷰로 만들 경우 소유자 권한으로 `orders` RLS 를 우회하므로 **집계 컬럼만** 노출하고 `grant select on view to anon, authenticated` 로 제한한다.
- 익명 집계 RPC: `product_sales_history(product_id)` (팔로워·좋아요·참여율·기간·확정매출·상태, seller_id 없음 — L2275-2276), `seller_leaderboard()` (m3_sales, 비율, 등급, 카테고리 — 이름 없음, 호출자 본인 행만 `is_me`), `peer_bestsellers(grade)` (상품 단위 합계 — L1951-1959). 호출은 서버가 하되 `authenticated` + `app_role() = 'seller'` 로 열어도 안전한 후보.
- **함수 실행 권한도 명시한다.** Supabase 는 `public` 스키마의 새 함수에 `execute` 를 `public`(→ anon/authenticated) 에게 기본 부여하므로, 서버 전용 RPC(정산·🥬 차감 등)는 GLO 0009 L72 처럼 `revoke all on function ... from public, anon, authenticated` 를 반드시 붙이고, anon 에게 열 집계 RPC(`public_stats()` 등)만 `grant execute ... to anon, authenticated` 로 예외 처리한다. `security definer` 함수는 GLO 0001 L38·0009 L39-40 처럼 항상 `set search_path = public` 을 단다.

### 4.3 서버(service role) 쪽에서 반드시 지켜야 할 마스킹 규칙 요약

RLS 가 못 막는 것들이므로 API 응답 조립 시 체크리스트로 쓴다.

1. 브랜드에게 인플루언서를 돌려줄 때: `seller_identity_visible` (§2.1.1) 거짓이면 `name → '○○○ 인플루언서'`, `handle → null`, `avatar_url → null`; `seller_metrics_unlocked` 거짓이면 `m3_sales, avg_net, likes_avg, engagement, history, external` 을 제거(단 비공개 스카우트 카드의 `m3_sales` 는 노출 — L2680 그대로 옮길지 결정 필요, **추정**: 노출 유지).
2. 인플루언서에게 타 인플루언서를 돌려줄 때: 항상 익명·집계 (§2.9).
3. 상대 파트너의 `email, phone, bank_info, biz_doc_url, user_id` 는 절대 응답에 싣지 않는다. 브랜드 `biz_no` 만 예외(공개 컬럼).
4. 인플루언서에게 `orders` 를 돌려줄 때 `customer_name` 은 마스킹(`김*은` 형식 L1328), `phone/address` 제거.
5. `settlements` 에서 `platform_fee, platform_net` 는 admin 응답에만.
6. 캠페인 스레드의 admin 발신은 브랜드 대행으로 표시(L4467) — 인플루언서 화면에서 발신자명이 브랜드로 보이게 할지, "셀러리 운영팀"으로 보이게 할지(L3564 는 운영팀) 프로토타입 내부에서도 두 갈래라 확정 필요 (**추정**: L3564 표시 유지, 발신 role 은 `admin` 저장).
7. 링크 진입 보호(§3.4)는 쿠키 기반 서버 필터.

---

## 5. 열린 결정 사항 (오케스트레이터/사용자 확인 필요)

1. 비회원(카카오 미로그인) 결제 허용 여부 — glo 0001 처럼 `orders.user_id` nullable 로 갈지. 허용하면 주문 조회·문의 귀속에 0015 의 `client_token` 방식이 필요.
2. 브랜드 계정 다인원 여부 — `brands.user_id` 단일로 시작할지 `brand_members` 로 갈지. 프로토타입은 담당자 1명(L1224 `manager`).
3. `unlockedRefs` 의 브랜드 귀속 — 프로토타입은 전역 배열(L1269)이지만 차감은 브랜드 잔액에서 하므로 `(brand_id, seller_id)` 로 정규화 권장.
4. 비공개 인플루언서 스카우트 카드의 `m3Sales` 무게이트 노출(L2680)을 유지할지.
5. 종료(`CLEARING/SETTLED`)된 캠페인의 링크 페이지 공개 유지 기간 — 프로토타입은 무기한(L3525), 링크 보호 해제는 종료 후 7일(L1575). 공개 정책의 `status` 목록에 반영.
6. 파트너 실시간(스레드 알림)을 postgres_changes 로 할지 Broadcast 로 할지 — 전자는 `campaign_messages` 에 당사자 select 정책이 필요하다.
