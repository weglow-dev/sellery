-- ============================================================
-- 셀러리 시드 — 프로토타입 seedData() (OLD/index.html L1219-1370) + 정책 상수 (L1212, L1374-1382, L1433-1451, L1488-1528)
--
-- **개발·스테이징 전용 — 프로덕션 프로젝트에서는 절대 실행하지 않는다** (가짜 계좌·사업자번호·이메일이 들어간다).
-- 실행: 마이그레이션 0001~0006 적용 후. `supabase db reset` 은 로컬에서 자동 실행하지만
--       원격(db push)은 seed 를 실행하지 않으므로 Dashboard → SQL Editor 에 붙여 넣어 실행한다.
-- 재실행 가능: 모든 행이 고정 uuid(핵심 엔티티) 또는 md5(키)::uuid(대량 행)를 쓰고 `on conflict do nothing`.
--   날짜는 프로토타입처럼 "오늘 기준 상대일"(current_date ± n) 이므로, 다른 날 재실행해도 이미 있는 행은 그대로 둔다.
-- 계좌번호·사업자번호는 프로토타입 시드의 가짜 값 그대로(DUMMY). 이메일은 인플루언서 `*@sellery.demo` 그대로,
--   브랜드는 실제 등록 가능한 도메인(vyneherb.co / weglow.biz) 대신 예약 도메인 `*.example` 로, b2 예금주는 운영사 실명
--   '(주)위글로우' 대신 브랜드명 '(주)글로헬스' 로 바꿨다 (시드에서만 — 프로토타입 L1224-1225 와 다른 유일한 값).
-- auth.users / profiles 는 시드하지 않는다. 파트너 계정 연결은 **이메일 일치 자동 연결이 아니라** 관리자가 승인한 신청
--   (glo 0013 seller_applications 흐름)을 서버(service role)가 처리하며 profiles.role 갱신 + sellers/brands.user_id 연결을
--   같은 트랜잭션에서 한다 (auth.users.email_confirmed_at is not null 인 계정만). 시드 이메일로 가입해도 아무것도 연결되지 않는다.
--
-- 고정 uuid 규칙: brands b0000000-…-00000000000N · sellers a0000000-… · seller_channels e0000000-…
--                products d0000000-…-0000000000NN · campaigns c0000000-…-0000000000NN
-- ============================================================

-- ============================================================
-- 1) 정책 상수 platform_settings (L1212, L1374-1377, L1398-1401, L1451, L1462-1463, L1541, L1575, L3261, L3691, L4192, L4291, L4440)
--   여기 없는 상수는 마스터 테이블이 단일 소스다: 우선권 등급 하한 PRIORITY_TIER → grade_tiers.is_priority,
--   다이아·블랙 제안권 10🥬 → grade_tiers.invite_cost_cel, 등급별 열람 가격 DATA_PRICE → grade_tiers.data_price_cel,
--   브랜드 등급 할인 BG_DISC → brand_grade_tiers.fee_discount. 앱 코드에 남는 것: estExternal 계수(L1480, 표시용 추정치),
--   자동 매칭 점수 가중치(L1414, L2674), 연락처 감지 정규식(L1662).
-- ============================================================
insert into public.platform_settings (key, value, description) values
  ('pg_rate',          '0.019',    'PG 수수료율 (PG_RATE)'),
  ('platform_rate',    '0.10',     '플랫폼 수수료율 (PLAT_RATE) — 인플루언서 수수료율과 별도'),
  ('wht_rate',         '0.033',    '원천징수율 (WHT). sellers.settle_type = ''biz'' 만 0, personal 과 null(미등록)은 이 값 (sellerWht L1656)'),
  ('clear_days',       '21',       '판매 종료 후 정산 기준일까지 일수 (CLEAR_DAYS)'),
  ('celery_per_won',   '5000000',  '확정 매출 ₩500만당 🥬1 획득 (CELERY_PER)'),
  ('sample_cel_won',   '20000',    '샘플 결제 시 🥬1 = ₩20,000 (SAMPLE_CEL_WON) — campaigns_sample_split_consistent 제약의 20000 과 같이 바꾼다'),
  ('ref_rate',         '0.02',     '인플루언서 추천 보상 — 추천인에게 확정 매출(net)의 2% (REF_RATE)'),
  ('ref_boost',        '0.01',     '피추천 인플루언서 수수료 +1%p (net 기준, REF_BOOST)'),
  ('ref_times',        '5',        '추천 보상 적용 판매 횟수 (REF_TIMES)'),
  ('brand_ref_rate',   '0.01',     '브랜드 추천 보상 — 추천 브랜드에게 net 의 1% (BREF_RATE)'),
  ('brand_ref_disc',   '0.01',     '피추천 브랜드 플랫폼 수수료 −1%p (net 기준, BREF_DISC)'),
  ('brand_ref_times',  '3',        '브랜드 추천 보상 적용 판매 횟수 (BREF_TIMES)'),
  ('test_days',        '14',       '샘플 수령 후 테스트 기한 일수 (L4192)'),
  ('period_len_days',  '[3,5,7]',  '판매 기간 선택지 (L3691)'),
  ('min_seller_rate',  '0.05',     '인플루언서 수수료율 하한 (L4291)'),
  ('default_stock_on_approve', '500', '검수 승인 시 재고 0이면 500 (L4275, L4029)'),
  ('sample_default_free_grade', '{"tiers":[{"below":30000,"grade":"브론즈"},{"below":80000,"grade":"실버"},{"grade":"골드"}],"buyMode":"auto","fixedPrice":0,"refund":false}', 'products.sample_* 가 전부 null 일 때 판매가 구간별 기본 샘플 정책 (spOf L1463)'),
  ('option_bundle_defaults', '{"bundles":[{"n":1,"disc":0},{"n":2,"disc":0.05},{"n":3,"disc":0.10}],"round":100}', 'products.options 가 비었을 때 1/2/3개 세트 기본 옵션 (optsOf L1398-1401, 100원 단위 반올림)'),
  ('home_feature_days', '7',       '고객 홈 상단 노출 유효 일수 (isHomeFeat L3261)'),
  ('link_protect_days', '7',       '판매 링크 진입 보호 — 판매 종료 후 해제까지 일수 (loadLinkCtx L1575)'),
  ('signup_bonus_cel',  '3',       '인플루언서 가입 축하 🥬 (시드 L1231)'),
  ('onboarding_bonus_cel', '5',    '브랜드 입점 이벤트 🥬 (시드 L1236)'),
  ('admin_grant_cel',   '3',       '관리자 이벤트 지급 🥬 (admGrant L4440)'),
  ('topup',            '[{"n":5,"won":100000},{"n":10,"won":190000},{"n":30,"won":540000}]', '🥬 충전 패키지 (TOPUP)'),
  ('opex_default',     '{"server":30000,"db":35000,"cs":50000,"domain":15000,"misc":30000,"pgFixed":0,"kakaoPer":15,"claudePerCrawl":120,"claudePerMatch":300}', '운영비 기본값 월·₩ (OPEX_DEF, 불변). 관리자 오버라이드는 별도 키 ''opex'' (saveOpex 가 upsert, resetOpex 가 삭제 — 기본엔 행 없음, L3160/L4428-4429)'),
  ('shop_items',       '{"seller":[{"id":"samplepay","name":"샘플 구매 셀러리 결제","price":null,"auto":true},{"id":"datapass","name":"매출 데이터 확인권","price":2,"days":null},{"id":"featured","name":"프로필 상단 노출 (7일)","price":3,"days":7},{"id":"homefeature","name":"고객 홈 상단 노출 (7일)","price":3,"days":7},{"id":"regongu","name":"재판매 우선권 (30일)","price":2,"days":30}],"brand":[{"id":"diamond","name":"다이아↑ 인플루언서 제안권","price":10,"auto":true},{"id":"ref","name":"익명 레퍼런스 열람권","price":"grade","auto":true},{"id":"sdata","name":"인플루언서 데이터 확인","price":"grade","auto":true},{"id":"datapass","name":"인플루언서 데이터 패스 (30일)","price":30,"days":30},{"id":"boost","name":"상품 상단 부스트 (7일)","price":3,"days":7},{"id":"homefeature","name":"고객 홈 상단 노출 (7일)","price":5,"days":7},{"id":"fastreview","name":"우선 검수권","price":1}]}', '🥬 샵 카탈로그 (SHOP L1433-1450). 매핑: samplepay.price ''1 = ₩20,000'' → null (sample_cel_won 참조) · ref/sdata.price ''1–5'' → "grade" (grade_tiers.data_price_cel) · diamond.price 10 은 표시용 (차감액은 grade_tiers.invite_cost_cel). days 는 SHOP 에 datapass(30) 만 있었으나 소비 측 상수(featured/homefeature/boost 7일 L2674/L3261/L1921, regongu 30일 L4208)를 카탈로그에 명시해 영구 보유 결함(points-policy §9-9)을 해소한 의도적 보강 (design-notes §3-18, 추정)')
on conflict do nothing;

-- ============================================================
-- 2) 인플루언서 등급 (GRADES L1488-1496 · DATA_PRICE L1379 · sampleQuota L1458 · PRIORITY_TIER L1673 · 제안권 10🥬 L4061)
-- ============================================================
insert into public.grade_tiers (name, sort_order, min_m3_sales, bonus_pp, top_pct, sample_quota, data_price_cel, is_priority, invite_cost_cel, perk) values
  ('블랙',     0, 100000000, 3.00,   1, 5, 5, true,  10, '수수료 +3%p · 샘플 월 5회 · 전담 매니저 · 판매 기간 우선권 · 독점권 우선 협상'),
  ('다이아',   1,  50000000, 2.00,   3, 5, 4, true,  10, '수수료 +2%p · 샘플 월 5회 · 독점권 신청 · 판매 기간 우선권 · 스카우트 최상단'),
  ('플래티넘', 2,  30000000, 1.50,   8, 5, 3, true,   0, '수수료 +1.5%p · 샘플 월 5회 · 신상품 우선 제안권 · 판매 기간 우선권'),
  ('골드',     3,  15000000, 1.00,  18, 2, 2, false,  0, '수수료 +1%p · 샘플 월 2회'),
  ('실버',     4,   8000000, 0.50,  35, 2, 2, false,  0, '수수료 +0.5%p · 샘플 월 2회'),
  ('브론즈',   5,   3000000, 0.30,  60, 1, 1, false,  0, '수수료 +0.3%p · 샘플 월 1회'),
  ('스타터',   6,         0, 0.00, 100, 1, 1, false,  0, '기본 수수료율 · 샘플 월 1회')
on conflict do nothing;

-- 브랜드 등급 (BGRADES L1520-1528 · BG_DISC L1382 · freeRefLeft L1386)
insert into public.brand_grade_tiers (name, sort_order, min_gmv, fee_discount, top_pct, free_ref_per_month, perk) values
  ('블랙',     0, 1000000000, 0.0200,   1, 5, '플랫폼 수수료 −2%p · 전담 파트너 매니저 · 기획전 최상단'),
  ('다이아',   1,  500000000, 0.0150,   3, 5, '수수료 −1.5%p · 스카우트 열람권 월 5회 무료'),
  ('플래티넘', 2,  200000000, 0.0100,   8, 0, '수수료 −1%p · 상위 인플루언서 우선 매칭'),
  ('골드',     3,   80000000, 0.0050,  18, 0, '수수료 −0.5%p · 카탈로그 상단 노출'),
  ('실버',     4,   30000000, 0.0000,  35, 0, '상품 검수 우선 처리'),
  ('브론즈',   5,   10000000, 0.0000,  60, 0, '인증 브랜드 뱃지'),
  ('스타터',   6,          0, 0.0000, 100, 0, '기본 조건')
on conflict do nothing;

-- ============================================================
-- 3) 카테고리 7종 (CATS L1936, CAT_INFO L1937-1944) + 상위 그룹 (CATMAP L1406)
-- ============================================================
insert into public.categories (name, group_name, name_en, description, examples, sort_order) values
  ('다이어트·체형', '건강기능식품', 'Body',           '체지방·탄수화물 컷·식욕 조절',        '가르시니아, 시서스, 프로틴 쉐이크', 1),
  ('이너뷰티·피부', '이너뷰티',     'Inner Beauty',   '먹는 피부 관리와 더마 스킨케어',       '콜라겐, 글루타치온, 히알루론산, 세라마이드', 2),
  ('비타민·영양',   '건강기능식품', 'Nutrition',      '매일 채우는 기본 영양',               '멀티비타민, 오메가3, 마그네슘, 비타민D', 3),
  ('눈·뇌 건강',    '건강기능식품', 'Eye & Brain',    '눈 피로·집중력·기억력',               '루테인, 아스타잔틴, 포스파티딜세린', 4),
  ('장·소화',       '건강기능식품', 'Gut',            '장 건강과 소화 편안함',               '프로바이오틱스, 식이섬유, 소화효소', 5),
  ('활력·수면',     '건강기능식품', 'Energy & Sleep', '피로 회복과 편안한 밤',               '홍삼, 테아닌, 마그네슘, 밀크씨슬', 6),
  ('웰니스 푸드',   '건강기능식품', 'Wellness Food',  '건강한 식습관을 위한 식품',           '저당 간식, 곤약, 단백질 식품, 건강차', 7)
on conflict do nothing;

-- ============================================================
-- 4) 브랜드 b1, b2 (L1224-1225). 계좌·사업자번호는 프로토타입 DUMMY 값. b2 의 cat '이너뷰티·피부' 는 CATMAP 키 '이너뷰티' 로 정규화.
--    이메일은 예약 도메인(.example), b2 예금주는 '(주)글로헬스' — 시드 전용 치환 (헤더 참고).
-- ============================================================
insert into public.brands (id, code, name, category, manager_name, email, logo_url, biz_no, mail_order_no, bank_info, gmv_base, ref_code, referred_by, auto_propose) values
  ('b0000000-0000-4000-8000-000000000001', 'b1', '바인허브', '건강기능식품', '김바인', 'partner@vyneherb.example',
   'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2096%2096%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20fill%3D%22%2341464c%22%2F%3E%3Ctext%20x%3D%2248%22%20y%3D%2253%22%20font-family%3D%22Arial%2CHelvetica%2Csans-serif%22%20font-size%3D%2210.5%22%20letter-spacing%3D%223.2%22%20fill%3D%22%23ffffff%22%20text-anchor%3D%22middle%22%3EVYNEHERB%3C%2Ftext%3E%3C%2Fsvg%3E',
   '214-88-01234', '제2024-서울강남-01234호',
   '{"bank":"기업","account":"12345678901234","holder":"(주)바인허브"}'::jsonb,
   52000000, 'VYNE-01', null, true),
  ('b0000000-0000-4000-8000-000000000002', 'b2', '글로헬스', '이너뷰티', '박글로', 'official@glohealth.example',
   'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2096%2096%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20fill%3D%22%23f4ebeb%22%2F%3E%3Ctext%20x%3D%2246%22%20y%3D%2260%22%20font-family%3D%22Georgia%2Cserif%22%20font-size%3D%2234%22%20font-weight%3D%22300%22%20fill%3D%22%233a1a22%22%20text-anchor%3D%22middle%22%3Eglo%3Ctspan%20fill%3D%22%238a4a52%22%20font-style%3D%22italic%22%3E.%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fsvg%3E',
   '331-87-02211', null,
   '{"bank":"신한","account":"11022233344455","holder":"(주)글로헬스"}'::jsonb,
   382000000, 'GLO-002', 'b0000000-0000-4000-8000-000000000001', false)
on conflict do nothing;

-- ============================================================
-- 5) 인플루언서 s1~s8 (L1241-1259). grade 는 트리거가 m3_sales 로 계산. s1 아바타는 data-URI(AV1) 대신 폴백 경로.
-- ============================================================
insert into public.sellers (id, code, name, handle, email, platform, avatar_url, followers, category, intro, likes_avg, recent_likes, m3_sales, ref_code, referred_by, hidden, settle_type, bank_info, biz_no) values
  ('a0000000-0000-4000-8000-000000000001', 's1', '지유', '@jiyu_beauty',  'jiyu@sellery.demo',   'instagram', 'assets/av-s1.svg',  84300, '이너뷰티·피부', '스킨케어·이너뷰티 리뷰 전문. 평균 판매 전환율 상위 10%.',                  3100, '{2900,3400,2800,3600,3100,3500}', 15600000, 'JIYU10', null, false, 'personal', '{"bank":"카카오뱅크","account":"3333012345678","holder":"김지유"}'::jsonb, null),
  ('a0000000-0000-4000-8000-000000000002', 's2', '혜린', '@hyerin_pick',  'hyerin@sellery.demo', 'instagram', 'assets/av-s2.svg', 126000, '웰니스 푸드',   '웰니스 라이프 큐레이션(건강식·홈트). 재판매율 78%.',                          4200, '{3900,4600,4100,4400,4000,4700}', 22840000, 'HYERIN', null, false, 'biz',      '{"bank":"국민","account":"94820111222333","holder":"혜린스튜디오"}'::jsonb, '512-21-00987'),
  ('a0000000-0000-4000-8000-000000000003', 's3', '민지', '@minji_diet',   'minji@sellery.demo',  'naver',     'assets/av-s3.svg',  45200, '다이어트·체형', '다이어트 여정 기록 4년차. 팔로워 충성도 높음.',                               1900, '{1700,2100,1800,2000,1900,2200}', 13221900, 'MINJI5', 'a0000000-0000-4000-8000-000000000001', false, 'personal', '{"bank":"토스뱅크","account":"100012345678","holder":"박민지"}'::jsonb, null),
  ('a0000000-0000-4000-8000-000000000004', 's4', '서아', '@seoa_health',  'seoa@sellery.demo',   'youtube',   'assets/av-s4.svg', 118000, '비타민·영양',   '건기식 전문. 비공개 프로필.',                                                  5400, '{5100,5800,5200,5600,5400}',      52000000, 'SEOA88', null, true,  null, null, null),
  ('a0000000-0000-4000-8000-000000000005', 's5', '로라', '@lola_beauty',  'lola@sellery.demo',   'tiktok',    'assets/av-s5.svg', 210000, '이너뷰티·피부', '이너뷰티 메가 인플루언서. 비공개 프로필.',                                    12800, '{12100,13400,12600,13100,12800}', 87000000, 'LOLA00', null, true,  null, null, null),
  ('a0000000-0000-4000-8000-000000000006', 's6', '하늘', '@haneul_fit',   'haneul@sellery.demo', 'instagram', 'assets/av-s6.svg',  62000, '다이어트·체형', '홈트·바디 프로필 크리에이터. 다이어트 판매 반응 좋음.',                        2400, '{2100,2600,2300,2700,2500,2900}',  9800000, 'HANEUL', null, false, null, null, null),
  ('a0000000-0000-4000-8000-000000000007', 's7', '소민', '@somin_beauty', 'somin@sellery.demo',  'youtube',   'assets/av-s7.svg',  38000, '이너뷰티·피부', '이너뷰티·더마 리뷰 유튜버. 구독자 신뢰도·댓글 반응 상위.',                     5100, '{4600,5300,4900,5500,5200}',       6200000, 'SOMIN7', null, false, null, null, null),
  ('a0000000-0000-4000-8000-000000000008', 's8', '유나', '@yuna_healthy', 'yuna@sellery.demo',   'naver',     'assets/av-s8.svg',  71000, '비타민·영양',   '건기식·영양제 블로거. 검색 유입 강함, 재판매율 71%.',                          1600, '{1400,1700,1500,1800,1700,1900}', 18400000, 'YUNA88', null, false, null, null, null)
on conflict do nothing;

-- 채널 ch1~ch9 (L1243-1259)
insert into public.seller_channels (id, code, seller_id, platform, handle, url, followers, verified, is_primary) values
  ('e0000000-0000-4000-8000-000000000001', 'ch1', 'a0000000-0000-4000-8000-000000000001', 'instagram', '@jiyu_beauty',   'instagram.com/jiyu_beauty',    84300, true,  true),
  ('e0000000-0000-4000-8000-000000000002', 'ch2', 'a0000000-0000-4000-8000-000000000001', 'youtube',   '지유의 뷰티랩',   'youtube.com/@jiyulab',         12400, false, false),
  ('e0000000-0000-4000-8000-000000000003', 'ch3', 'a0000000-0000-4000-8000-000000000002', 'instagram', '@hyerin_pick',   'instagram.com/hyerin_pick',   126000, true,  true),
  ('e0000000-0000-4000-8000-000000000004', 'ch4', 'a0000000-0000-4000-8000-000000000003', 'naver',     '@minji_diet',    'blog.naver.com/minji_diet',    45200, true,  true),
  ('e0000000-0000-4000-8000-000000000005', 'ch5', 'a0000000-0000-4000-8000-000000000004', 'youtube',   '@seoa_health',   'youtube.com/@seoa_health',    118000, true,  true),
  ('e0000000-0000-4000-8000-000000000006', 'ch6', 'a0000000-0000-4000-8000-000000000005', 'tiktok',    '@lola_beauty',   'tiktok.com/@lola_beauty',     210000, true,  true),
  ('e0000000-0000-4000-8000-000000000007', 'ch7', 'a0000000-0000-4000-8000-000000000006', 'instagram', '@haneul_fit',    'instagram.com/haneul_fit',     62000, true,  true),
  ('e0000000-0000-4000-8000-000000000008', 'ch8', 'a0000000-0000-4000-8000-000000000007', 'youtube',   '@somin_beauty',  'youtube.com/@somin_beauty',    38000, true,  true),
  ('e0000000-0000-4000-8000-000000000009', 'ch9', 'a0000000-0000-4000-8000-000000000008', 'naver',     '@yuna_healthy',  'blog.naver.com/yuna_healthy',  71000, true,  true)
on conflict do nothing;

-- ============================================================
-- 6) 상품 p1~p10 (L1288-1300). rate 는 인플루언서 몫(플랫폼 10%p 별도).
-- ============================================================
insert into public.products (id, code, brand_id, name, description, emoji, thumb_url, category, consumer_price, sale_price, commission_rate, sample_text, stock, status,
                             trend, exclusive_grade, exclusive_label, sample_free_grade, sample_buy_mode, sample_fixed_price, sample_refund, options) values
  ('d0000000-0000-4000-8000-000000000001', 'p1',  'b0000000-0000-4000-8000-000000000001', '버닝온',            '다이어트 부스터 · 6,000mg × 30포',      '🔥', 'assets/burningon.webp',  '다이어트·체형',  39000,  29900, 0.2000, '무상 1박스', 2000, 'listed',
   '{"g":"+240%","note":"분기 매출 급등"}'::jsonb, '다이아', '인스타그램 판매 독점권 · 3개월', '실버', 'auto', 0, false,
   '[{"n":"1박스 (30포)","price":29900},{"n":"2박스 세트 (60포)","price":56800},{"n":"3박스 + 쉐이커 증정","price":79900}]'::jsonb),
  ('d0000000-0000-4000-8000-000000000002', 'p2',  'b0000000-0000-4000-8000-000000000001', '치팅온',            '탄수화물 컷 · 2,400mg × 30포',          '🍚', 'assets/cheatingon.webp', '다이어트·체형',  35000,  26900, 0.2000, '무상 1박스', 1500, 'listed',
   null, null, null, null, null, null, null,
   '[{"n":"1박스 · 오리지널","price":26900},{"n":"1박스 · 레몬맛","price":26900},{"n":"2박스 세트 (맛 선택 혼합)","price":49900}]'::jsonb),
  ('d0000000-0000-4000-8000-000000000003', 'p3',  'b0000000-0000-4000-8000-000000000001', '벨리라잇',          '차전자피 식이섬유 · 5.5g × 30포',       '✨', 'assets/bellylight.webp', '다이어트·체형',  33000,  24900, 0.1800, '무상 1박스', 1200, 'listed',
   null, null, null, null, null, null, null, '[]'::jsonb),
  ('d0000000-0000-4000-8000-000000000004', 'p4',  'b0000000-0000-4000-8000-000000000002', 'GL-01 스킨 샷',     '스킨 롱제비티 액상샷 · 20g × 30포',     '🍍', 'assets/gl01.webp',       '이너뷰티·피부', 119000,  89000, 0.1500, '무상 2주분',  800, 'listed',
   '{"g":"+38%","note":"이너뷰티 상승세"}'::jsonb, '플래티넘', '이너뷰티 단독 판매권 · 2개월', '플래티넘', 'auto', 0, true,
   '[{"n":"1개월분 (30포)","price":89000},{"n":"3개월분 (90포) · 12% 할인","price":235000},{"n":"6개월분 (180포) · 20% 할인","price":427000}]'::jsonb),
  ('d0000000-0000-4000-8000-000000000005', 'p5',  'b0000000-0000-4000-8000-000000000001', '데일리 플랜트 프로틴', '식물성 단백질 18g · 40g × 7포',      '🌱', 'assets/protein.webp',    '웰니스 푸드',    42000,  31900, 0.2200, '무상 1통',    900, 'listed',
   null, null, null, null, null, null, null, '[]'::jsonb),
  ('d0000000-0000-4000-8000-000000000007', 'p7',  'b0000000-0000-4000-8000-000000000001', '아이클리어 루테인',  '마리골드 루테인 20mg · 60캡슐',         '👁️', null,                     '눈·뇌 건강',     36000,  27900, 0.2000, '무상 1병',   1000, 'listed',
   '{"g":"+112%","note":"루테인 카테고리 급상승"}'::jsonb, null, null, null, null, null, null, '[]'::jsonb),
  ('d0000000-0000-4000-8000-000000000008', 'p8',  'b0000000-0000-4000-8000-000000000001', '데일리 멀티비타민',  '비타민 13종 올인원 · 90정',             '💊', null,                     '비타민·영양',    32000,  23900, 0.1800, '무상 1병',   1400, 'listed',
   null, null, null, null, null, null, null, '[]'::jsonb),
  ('d0000000-0000-4000-8000-000000000009', 'p9',  'b0000000-0000-4000-8000-000000000002', '글로우 시카 세럼',   '더마 진정 세럼 · 50ml',                 '🧴', null,                     '이너뷰티·피부',  45000,  33900, 0.2500, '무상 1개',    700, 'listed',
   null, null, null, '골드', 'fixed', 15000, false, '[]'::jsonb),
  ('d0000000-0000-4000-8000-000000000010', 'p10', 'b0000000-0000-4000-8000-000000000002', '수분광 앰플 마스크', '더마 보습 앰플 마스크 · 10매',          '🎭', null,                     '이너뷰티·피부',  24000,  17900, 0.2200, '무상 3매',   1800, 'listed',
   null, null, null, null, null, null, null, '[]'::jsonb),
  ('d0000000-0000-4000-8000-000000000006', 'p6',  'b0000000-0000-4000-8000-000000000002', '글로우 콜라겐 젤리', '저분자 콜라겐 스틱 젤리 · 14포',        '🍑', null,                     '이너뷰티·피부',  29000,  21900, 0.2000, '무상 1박스',    0, 'pending',
   null, null, null, null, null, null, null, '[]'::jsonb)
on conflict do nothing;

-- ============================================================
-- 7) 캠페인 c1~c13 (L1303-1315). brand_id 는 트리거가 product 에서 채운다. 날짜는 오늘 기준 상대일.
--    c6 은 SETTLED 이지만 settlements/payouts/referral_earnings/sample_refund 행이 **의도적으로 없다** — 프로토타입 시드도
--    settlements:[] (L1323) 라서 parity 를 지킨다. 관리자 '정산 완료' 표는 비어 있고, 서버 코드는 SETTLED ⇒ 스냅샷 존재를
--    가정하면 안 된다 (0004 settlements 헤더).
-- ============================================================
insert into public.campaigns (id, code, seller_id, product_id, status, start_date, end_date, qty, created_at,
                              test_due, proposed_start, proposed_end, proposed_qty, settled_at,
                              purchased, sample_price, sample_cel, sample_cash, sample_method, invited, cel_used) values
  ('c0000000-0000-4000-8000-000000000001', 'c1',  'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'LIVE',               current_date - 2,  current_date + 2,   800, (current_date - 14)::timestamptz, null, null, null, null, null, false, null, 0, 0, null, false, 0),
  ('c0000000-0000-4000-8000-000000000002', 'c2',  'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004', 'SAMPLE_PURCHASED',   null, null, 0, (current_date - 1)::timestamptz,  null, null, null, null, null, true, 75650, 0, 75650, 'cash', false, 0),
  ('c0000000-0000-4000-8000-000000000003', 'c3',  'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'TESTING',            null, null, 0, (current_date - 6)::timestamptz,  current_date + 11, null, null, null, null, false, null, 0, 0, null, false, 0),
  ('c0000000-0000-4000-8000-000000000004', 'c4',  'a0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'SCHEDULE_CONFIRMED', current_date + 7,  current_date + 11, 1000, (current_date - 10)::timestamptz, null, null, null, null, null, false, null, 0, 0, null, false, 0),
  ('c0000000-0000-4000-8000-000000000005', 'c5',  'a0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000003', 'CLEARING',           current_date - 18, current_date - 13,  500, (current_date - 30)::timestamptz, null, null, null, null, null, false, null, 0, 0, null, false, 0),
  ('c0000000-0000-4000-8000-000000000006', 'c6',  'a0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000005', 'SETTLED',            current_date - 40, current_date - 35,  600, (current_date - 55)::timestamptz, null, null, null, null, (current_date - 14)::timestamptz, false, null, 0, 0, null, false, 0),
  ('c0000000-0000-4000-8000-000000000007', 'c7',  'a0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000001', 'SAMPLE_REQUESTED',   null, null, 0, current_date::timestamptz,        null, null, null, null, null, false, null, 0, 0, null, false, 0),
  ('c0000000-0000-4000-8000-000000000008', 'c8',  'a0000000-0000-4000-8000-000000000008', 'd0000000-0000-4000-8000-000000000007', 'SAMPLE_REQUESTED',   null, null, 0, (current_date - 1)::timestamptz,  null, null, null, null, null, false, null, 0, 0, null, false, 0),
  ('c0000000-0000-4000-8000-000000000009', 'c9',  'a0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000003', 'SCHEDULE_PROPOSED',  null, null, 0, (current_date - 8)::timestamptz,  null, current_date + 12, current_date + 16, 600, null, false, null, 0, 0, null, false, 0),
  ('c0000000-0000-4000-8000-000000000010', 'c10', 'a0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000002', 'SAMPLE_APPROVED',    null, null, 0, (current_date - 2)::timestamptz,  null, null, null, null, null, false, null, 0, 0, null, false, 0),
  ('c0000000-0000-4000-8000-000000000011', 'c11', 'a0000000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000009', 'SAMPLE_REQUESTED',   null, null, 0, current_date::timestamptz,        null, null, null, null, null, false, null, 0, 0, null, false, 0),
  ('c0000000-0000-4000-8000-000000000012', 'c12', 'a0000000-0000-4000-8000-000000000008', 'd0000000-0000-4000-8000-000000000002', 'LIVE',               current_date - 3,  current_date + 3,   600, (current_date - 16)::timestamptz, null, null, null, null, null, false, null, 0, 0, null, false, 0),
  ('c0000000-0000-4000-8000-000000000013', 'c13', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000010', 'INVITED',            null, null, 0, current_date::timestamptz,        null, null, null, null, null, false, null, 0, 0, null, true, 0)
on conflict do nothing;

-- ============================================================
-- 8) 주문 — mkOrders (L1327-1338): 배치별 i 로 buyer/qty/status/일자, 전역 index g 로 운송장 (L1340-1341)
--   seq 100 부터: c1 o100~o133 (34) · c12 o134~o190 (57) · c5 o191~o602 (412) · c6 o603~o1150 (548) · 샘플 o1151
-- ============================================================
insert into public.orders (id, code, campaign_id, buyer_name, qty, unit_price, status, paid_at, refunded_at, courier, tracking_no, shipped_at)
select
  md5('sellery:order:o' || (100 + b.off + j))::uuid,
  'o' || (100 + b.off + j),
  b.cid,
  (array['김*은','이*아','박*희','최*진','정*수','한*별','윤*서','장*미','오*랑','신*혜'])[(j % 10) + 1],
  1 + case when j % 3 = 0 then 1 else 0 end,
  b.gp,
  case when j < b.nref then 'REFUNDED' else 'PAID' end,
  (current_date + b.fromd + (j % b.span))::timestamptz,
  case when j < b.nref then (current_date + b.fromd + (j % b.span) + 1)::timestamptz else null end,
  case when j >= b.nref and (b.ccode in ('c5','c6') or (b.fromd + (j % b.span)) < 0)
       then (array['CJ대한통운','우체국택배','한진택배','롯데택배'])[((b.off + j) % 4) + 1] end,
  case when j >= b.nref and (b.ccode in ('c5','c6') or (b.fromd + (j % b.span)) < 0)
       then '6890-' || lpad((1000 + ((b.off + j) * 37) % 9000)::text, 4, '0') || '-' || lpad((1000 + ((b.off + j) * 53) % 9000)::text, 4, '0') end,
  case when j >= b.nref and (b.ccode in ('c5','c6') or (b.fromd + (j % b.span)) < 0)
       then (current_date + b.fromd + (j % b.span) + 1)::timestamptz end
from (values
  ('c0000000-0000-4000-8000-000000000001'::uuid, 'c1',  29900,  34,  1,  -2, 4,   0),
  ('c0000000-0000-4000-8000-000000000012'::uuid, 'c12', 26900,  57,  2,  -3, 5,  34),
  ('c0000000-0000-4000-8000-000000000005'::uuid, 'c5',  24900, 412, 14, -18, 5,  91),
  ('c0000000-0000-4000-8000-000000000006'::uuid, 'c6',  31900, 548, 11, -40, 5, 503)
) as b(cid, ccode, gp, n, nref, fromd, span, off)
cross join lateral generate_series(0, b.n - 1) as j
on conflict do nothing;

-- 인플루언서 샘플 구매 주문 (c2, L1338) — 전역 index 1051 → 어제 주문이라 발송 처리됨 (L1341)
insert into public.orders (id, code, campaign_id, buyer_name, qty, unit_price, status, paid_at, is_sample, courier, tracking_no, shipped_at) values
  (md5('sellery:order:o1151')::uuid, 'o1151', 'c0000000-0000-4000-8000-000000000002', '지유 (샘플 구매)', 1, 75650, 'PAID', (current_date - 1)::timestamptz, true,
   (array['CJ대한통운','우체국택배','한진택배','롯데택배'])[(1051 % 4) + 1],
   '6890-' || lpad((1000 + (1051 * 37) % 9000)::text, 4, '0') || '-' || lpad((1000 + (1051 * 53) % 9000)::text, 4, '0'),
   current_date::timestamptz)
on conflict do nothing;

-- ============================================================
-- 9) 캠페인 스레드 (L1345-1368). sys → kind 'system' (HTML 제거, event_type + payload) · chat → 'chat'
--    프로토타입 c3 의 sys 2행("수령 확인됨" + "테스트 기한")은 실제 흐름(receiveSample L4192-4193)대로 sample_received 1행
--    + payload.test_due 로 합쳤다 (총 23행). actor_role = sender (시드에 대행 발신 없음).
-- ============================================================
insert into public.campaign_events (id, campaign_id, kind, sender, actor_role, body, event_type, payload, created_at) values
  (md5('sellery:event:c2:1')::uuid,  'c0000000-0000-4000-8000-000000000002', 'system', 'system', 'system', '인플루언서 지유(@jiyu_beauty)가 샘플을 구매했습니다 · ₩75,650 (현금) · 무상 기준 플래티넘 미달 → 구매 · 판매 확정 시 환급 상품', 'sample_purchased', '{"seller":"지유","handle":"@jiyu_beauty","price":75650,"method":"cash","refundable":true}', (current_date - 1)::timestamptz + interval '1 minute'),
  (md5('sellery:event:c2:2')::uuid,  'c0000000-0000-4000-8000-000000000002', 'chat',   'seller', 'seller', '안녕하세요! GL-01 직접 한 달 먹어보고 진행 결정하고 싶어요. 성분표도 같이 받아볼 수 있을까요?', null, '{}', (current_date - 1)::timestamptz + interval '2 minute'),
  (md5('sellery:event:c3:1')::uuid,  'c0000000-0000-4000-8000-000000000003', 'system', 'system', 'system', '인플루언서가 샘플을 수령했습니다 · 테스트 기한 ' || to_char(current_date + 11, 'FMMM/FMDD') || ' 까지 진행 여부 응답', 'sample_received', jsonb_build_object('test_due', current_date + 11), (current_date - 3)::timestamptz + interval '1 minute'),
  (md5('sellery:event:c3:3')::uuid,  'c0000000-0000-4000-8000-000000000003', 'chat',   'brand',  'brand',  '치팅온은 식전 30분 섭취 기준으로 안내 부탁드려요. 상세페이지 가이드 첨부합니다 📎 cheatingon-guide.pdf', null, '{}', (current_date - 2)::timestamptz + interval '1 minute'),
  (md5('sellery:event:c3:4')::uuid,  'c0000000-0000-4000-8000-000000000003', 'chat',   'seller', 'seller', '네! 2주 먹어보고 후기 정리해서 일정 제안드릴게요.', null, '{}', (current_date - 2)::timestamptz + interval '2 minute'),
  (md5('sellery:event:c1:1')::uuid,  'c0000000-0000-4000-8000-000000000001', 'system', 'system', 'system', '일정 확정 ' || to_char(current_date - 2, 'FMMM/FMDD') || ' – ' || to_char(current_date + 2, 'FMMM/FMDD') || ' · 배정 재고 800', 'schedule_confirmed', jsonb_build_object('start', current_date - 2, 'end', current_date + 2, 'qty', 800), (current_date - 7)::timestamptz + interval '1 minute'),
  (md5('sellery:event:c1:2')::uuid,  'c0000000-0000-4000-8000-000000000001', 'system', 'system', 'system', '판매 링크 활성화 — 판매 시작', 'went_live', '{}', (current_date - 2)::timestamptz + interval '1 minute'),
  (md5('sellery:event:c5:1')::uuid,  'c0000000-0000-4000-8000-000000000005', 'system', 'system', 'system', '판매 종료 · 교환/환불 기간 시작 (정산 예정 ' || to_char(current_date - 13 + 21, 'FMMM/FMDD') || ')', 'ended', jsonb_build_object('settle_due', current_date - 13 + 21), (current_date - 13)::timestamptz + interval '1 minute'),
  (md5('sellery:event:c6:1')::uuid,  'c0000000-0000-4000-8000-000000000006', 'system', 'system', 'system', '정산 완료 · 명세 발행', 'settled', '{}', (current_date - 14)::timestamptz + interval '1 minute'),
  (md5('sellery:event:c7:1')::uuid,  'c0000000-0000-4000-8000-000000000007', 'system', 'system', 'system', '인플루언서 하늘(@haneul_fit)가 샘플을 요청했습니다', 'sample_requested', '{"seller":"하늘","handle":"@haneul_fit"}', current_date::timestamptz + interval '1 minute'),
  (md5('sellery:event:c7:2')::uuid,  'c0000000-0000-4000-8000-000000000007', 'chat',   'seller', 'seller', '안녕하세요! 홈트 루틴이랑 같이 버닝온 2주 챌린지 콘텐츠로 풀어보고 싶어요. 샘플 부탁드립니다 💪', null, '{}', current_date::timestamptz + interval '2 minute'),
  (md5('sellery:event:c8:1')::uuid,  'c0000000-0000-4000-8000-000000000008', 'system', 'system', 'system', '인플루언서 유나(@yuna_healthy)가 샘플을 요청했습니다', 'sample_requested', '{"seller":"유나","handle":"@yuna_healthy"}', (current_date - 1)::timestamptz + interval '1 minute'),
  (md5('sellery:event:c8:2')::uuid,  'c0000000-0000-4000-8000-000000000008', 'chat',   'seller', 'seller', '루테인 검색 유입 글로 리뷰 준비 중이에요. 성분표와 함께 샘플 받아볼 수 있을까요?', null, '{}', (current_date - 1)::timestamptz + interval '2 minute'),
  (md5('sellery:event:c9:1')::uuid,  'c0000000-0000-4000-8000-000000000009', 'system', 'system', 'system', '인플루언서가 판매 일정을 제안했습니다 · ' || to_char(current_date + 12, 'FMMM/FMDD') || ' – ' || to_char(current_date + 16, 'FMMM/FMDD') || ' · 재고 600', 'schedule_proposed', jsonb_build_object('start', current_date + 12, 'end', current_date + 16, 'qty', 600), current_date::timestamptz + interval '1 minute'),
  (md5('sellery:event:c9:2')::uuid,  'c0000000-0000-4000-8000-000000000009', 'chat',   'seller', 'seller', '추석 전 타이밍으로 잡아봤어요. 이 기간 승인 부탁드려요!', null, '{}', current_date::timestamptz + interval '2 minute'),
  (md5('sellery:event:c10:1')::uuid, 'c0000000-0000-4000-8000-000000000010', 'system', 'system', 'system', '브랜드가 샘플 요청을 승인했습니다 · 배송지 전달됨', 'sample_approved', '{}', (current_date - 1)::timestamptz + interval '1 minute'),
  (md5('sellery:event:c11:1')::uuid, 'c0000000-0000-4000-8000-000000000011', 'system', 'system', 'system', '인플루언서 소민(@somin_beauty)가 샘플을 요청했습니다', 'sample_requested', '{"seller":"소민","handle":"@somin_beauty"}', current_date::timestamptz + interval '1 minute'),
  (md5('sellery:event:c12:1')::uuid, 'c0000000-0000-4000-8000-000000000012', 'system', 'system', 'system', '일정 확정 ' || to_char(current_date - 3, 'FMMM/FMDD') || ' – ' || to_char(current_date + 3, 'FMMM/FMDD') || ' · 배정 재고 600', 'schedule_confirmed', jsonb_build_object('start', current_date - 3, 'end', current_date + 3, 'qty', 600), (current_date - 9)::timestamptz + interval '1 minute'),
  (md5('sellery:event:c12:2')::uuid, 'c0000000-0000-4000-8000-000000000012', 'chat',   'seller', 'seller', '블로그 리뷰 글 상단에 링크 고정했어요. 검색 유입이 꾸준해서 기간 내 목표 500개 갈 것 같습니다!', null, '{}', (current_date - 2)::timestamptz + interval '1 minute'),
  (md5('sellery:event:c12:3')::uuid, 'c0000000-0000-4000-8000-000000000012', 'chat',   'brand',  'brand',  '좋습니다 유나님, 재고 여유 있으니 필요하면 100개 추가 배정 가능해요.', null, '{}', (current_date - 2)::timestamptz + interval '2 minute'),
  (md5('sellery:event:c12:4')::uuid, 'c0000000-0000-4000-8000-000000000012', 'system', 'system', 'system', '판매 링크 활성화 — 판매 시작', 'went_live', '{}', (current_date - 3)::timestamptz + interval '1 minute'),
  (md5('sellery:event:c13:1')::uuid, 'c0000000-0000-4000-8000-000000000013', 'system', 'system', 'system', '브랜드 글로헬스가 수분광 앰플 마스크 판매를 직접 제안했습니다 · 인플루언서 수락 대기', 'invited', '{"brand":"글로헬스","product":"수분광 앰플 마스크"}', current_date::timestamptz + interval '1 minute'),
  (md5('sellery:event:c13:2')::uuid, 'c0000000-0000-4000-8000-000000000013', 'chat',   'brand',  'brand',  '지유님 안녕하세요, 글로헬스입니다. GL-01 리뷰 결이 좋아서 앰플 마스크도 함께 제안드려요. 수락해주시면 바로 샘플 보내드릴게요!', null, '{}', current_date::timestamptz + interval '2 minute')
on conflict do nothing;

-- ============================================================
-- 10) 🥬 원장 (L1231-1238) + 획득분(earned) 이관 행
--   프로토타입 잔액 = floor(m3Sales|bGmv / 500만) + Σdelta 였으므로, DB 모델(Σdelta 만)에서 같은 잔액이 나오도록
--   이관 시점 획득분을 reason='earned' 1행으로 적재한다 (추정 설계 — flows §5.1).
-- ============================================================
insert into public.celery_ledger (id, owner_type, seller_id, brand_id, delta, reason, memo, created_at) values
  (md5('sellery:ledger:1')::uuid,  'seller', 'a0000000-0000-4000-8000-000000000001', null,  3, 'signup_bonus',      '가입 축하 지급',                     (current_date - 30)::timestamptz),
  (md5('sellery:ledger:2')::uuid,  'seller', 'a0000000-0000-4000-8000-000000000001', null, -2, 'shop_item',         '매출 데이터 확인권 구매',            (current_date - 6)::timestamptz),
  (md5('sellery:ledger:3')::uuid,  'seller', 'a0000000-0000-4000-8000-000000000002', null,  3, 'signup_bonus',      '가입 축하 지급',                     (current_date - 40)::timestamptz),
  (md5('sellery:ledger:4')::uuid,  'seller', 'a0000000-0000-4000-8000-000000000003', null,  3, 'signup_bonus',      '가입 축하 지급',                     (current_date - 25)::timestamptz),
  (md5('sellery:ledger:5')::uuid,  'seller', 'a0000000-0000-4000-8000-000000000006', null,  3, 'signup_bonus',      '가입 축하 지급',                     (current_date - 5)::timestamptz),
  (md5('sellery:ledger:6')::uuid,  'seller', 'a0000000-0000-4000-8000-000000000007', null,  3, 'signup_bonus',      '가입 축하 지급',                     (current_date - 4)::timestamptz),
  (md5('sellery:ledger:7')::uuid,  'seller', 'a0000000-0000-4000-8000-000000000008', null,  3, 'signup_bonus',      '가입 축하 지급',                     (current_date - 9)::timestamptz),
  (md5('sellery:ledger:8')::uuid,  'brand',  null, 'b0000000-0000-4000-8000-000000000001',  5, 'onboarding_bonus',  '입점 이벤트 지급',                   (current_date - 45)::timestamptz),
  (md5('sellery:ledger:9')::uuid,  'brand',  null, 'b0000000-0000-4000-8000-000000000001', -2, 'ref_unlock',        '익명 레퍼런스 열람 · ○○○ 인플루언서', (current_date - 3)::timestamptz),
  (md5('sellery:ledger:10')::uuid, 'brand',  null, 'b0000000-0000-4000-8000-000000000002',  5, 'onboarding_bonus',  '입점 이벤트 지급',                   (current_date - 40)::timestamptz)
on conflict do nothing;

-- 획득분 이관: 인플루언서 floor(m3_sales/500만), 브랜드 floor(brand_gmv/500만) (celEarned L1452-1455). 0 이면 생략(delta<>0 제약).
insert into public.celery_ledger (id, owner_type, seller_id, delta, reason, memo, created_at)
select md5('sellery:ledger:earned:' || s.code)::uuid, 'seller', s.id, floor(s.m3_sales / 5000000.0)::integer, 'earned',
       '이관 시점 누적 획득분 (최근 3개월 확정 매출 ₩500만당 1🥬)', (current_date - 60)::timestamptz
  from public.sellers s
 where s.code in ('s1','s2','s3','s4','s5','s6','s7','s8') and floor(s.m3_sales / 5000000.0) >= 1
on conflict do nothing;

insert into public.celery_ledger (id, owner_type, brand_id, delta, reason, memo, created_at)
select md5('sellery:ledger:earned:' || b.code)::uuid, 'brand', b.id, floor(public.brand_gmv(b.id) / 5000000.0)::integer, 'earned',
       '이관 시점 누적 획득분 (누적 확정 GMV ₩500만당 1🥬)', (current_date - 60)::timestamptz
  from public.brands b
 where b.code in ('b1','b2') and floor(public.brand_gmv(b.id) / 5000000.0) >= 1
on conflict do nothing;

-- ============================================================
-- 11) 데이터 열람 (brandDataUnlocks L1270: b1→s1, b2→s7), 독점권 신청 (x1 L1282), 상품 조회 (L1261-1268), 외부 판매 (L1271-1280)
-- ============================================================
insert into public.data_views (id, brand_id, seller_id, kind, price_cel, free, viewed_at) values
  (md5('sellery:dataview:b1:s1:data')::uuid, 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'data', 0, false, (current_date - 6)::timestamptz),
  (md5('sellery:dataview:b2:s7:data')::uuid, 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000007', 'data', 0, false, (current_date - 4)::timestamptz)
on conflict do nothing;

insert into public.exclusive_requests (id, code, product_id, seller_id, status, created_at) values
  (md5('sellery:exclusive:x1')::uuid, 'x1', 'd0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'PENDING', (current_date - 1)::timestamptz)
on conflict do nothing;

-- 표시 문자열('2시간 전','어제')을 타임스탬프로 근사 (추정)
insert into public.product_views (id, product_id, seller_id, viewed_at) values
  (md5('sellery:view:s6:p1')::uuid, 'd0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006', now() - interval '2 hours'),
  (md5('sellery:view:s8:p7')::uuid, 'd0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000008', now() - interval '3 hours'),
  (md5('sellery:view:s3:p2')::uuid, 'd0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003', now() - interval '5 hours'),
  (md5('sellery:view:s7:p9')::uuid, 'd0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000007', now() - interval '4 hours'),
  (md5('sellery:view:s2:p4')::uuid, 'd0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000002', now() - interval '1 day'),
  (md5('sellery:view:s6:p5')::uuid, 'd0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000006', now() - interval '1 day')
on conflict do nothing;

insert into public.seller_external_sales (id, seller_id, product_name, brand_name, source, price, seen_on) values
  (md5('sellery:ext:s1:1')::uuid, 'a0000000-0000-4000-8000-000000000001', '저분자 피쉬콜라겐 스틱', '타사 A', 'instagram', 32000, current_date - 5),
  (md5('sellery:ext:s2:1')::uuid, 'a0000000-0000-4000-8000-000000000002', '프로바이오틱스 30포',    '타사 B', 'instagram', 39000, current_date - 2),
  (md5('sellery:ext:s2:2')::uuid, 'a0000000-0000-4000-8000-000000000002', '저당 그래놀라 3팩',      '타사 C', 'instagram', 28000, current_date - 11),
  (md5('sellery:ext:s3:1')::uuid, 'a0000000-0000-4000-8000-000000000003', '곤약 젤리 30팩',         '타사 D', 'naver',     24900, current_date - 6),
  (md5('sellery:ext:s4:1')::uuid, 'a0000000-0000-4000-8000-000000000004', '오메가3 rTG',            '타사 E', 'youtube',   41000, current_date - 3),
  (md5('sellery:ext:s5:1')::uuid, 'a0000000-0000-4000-8000-000000000005', '글루타치온 필름',        '타사 F', 'tiktok',    33000, current_date - 1),
  (md5('sellery:ext:s5:2')::uuid, 'a0000000-0000-4000-8000-000000000005', '콜라겐 젤리 스틱',       '타사 G', 'tiktok',    29000, current_date - 8),
  (md5('sellery:ext:s6:1')::uuid, 'a0000000-0000-4000-8000-000000000006', '단백질 쉐이크 14팩',     '타사 H', 'instagram', 34000, current_date - 4),
  (md5('sellery:ext:s7:1')::uuid, 'a0000000-0000-4000-8000-000000000007', '비오틴 츄어블',          '타사 I', 'youtube',   24000, current_date - 7),
  (md5('sellery:ext:s8:1')::uuid, 'a0000000-0000-4000-8000-000000000008', '마그네슘 글리시네이트',  '타사 J', 'naver',     29000, current_date - 3)
on conflict do nothing;

-- ============================================================
-- 12) 추천 보상 (refEarnings L1285 s1←s3 / brandRefEarnings L1228 b1←b2) — campaignId '(지난 판매)' → null + memo
-- ============================================================
insert into public.referral_earnings (id, side, referrer_seller_id, referred_seller_id, referrer_brand_id, referred_brand_id, campaign_id, rate, amount, memo, earned_on) values
  (md5('sellery:ref:seller:1')::uuid, 'seller', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', null, null, null, 0.0200, 186400, '(지난 판매)', current_date - 24),
  (md5('sellery:ref:brand:1')::uuid,  'brand',  null, null, 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', null, 0.0100, 318000, '(지난 판매)', current_date - 20)
on conflict do nothing;

-- ============================================================
-- 13) 고객 문의 cs1, cs2 (L1319-1320) → 대화 + 메시지
-- ============================================================
--     order_code = 프로토타입 orderId 원문, order_id = 그 코드의 주문 행 (둘 다 시드 주문에 존재).
insert into public.cs_conversations (id, code, campaign_id, brand_id, order_code, order_id, buyer_name, type, status, last_preview, last_message_at, replied_at, created_at) values
  (md5('sellery:cs:cs1')::uuid, 'cs1', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'o101', md5('sellery:order:o101')::uuid, '김*은', '배송 문의', 'OPEN',
   '주문한 지 3일째인데 아직 운송장이 안 떠요. 언제쯤 발송되나요?', (current_date - 1)::timestamptz, null, (current_date - 1)::timestamptz),
  (md5('sellery:cs:cs2')::uuid, 'cs2', 'c0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001', 'o220', md5('sellery:order:o220')::uuid, '이*아', '교환·반품', 'ANSWERED',
   '불편을 드려 죄송합니다. 오늘 새 제품으로 재발송했고 기존 상품은 회수 신청해두었습니다.', (current_date - 11)::timestamptz, (current_date - 11)::timestamptz, (current_date - 12)::timestamptz)
on conflict do nothing;

insert into public.cs_messages (id, conversation_id, sender, actor_role, body, created_at) values
  (md5('sellery:csmsg:cs1:1')::uuid, md5('sellery:cs:cs1')::uuid, 'customer', 'customer', '주문한 지 3일째인데 아직 운송장이 안 떠요. 언제쯤 발송되나요?', (current_date - 1)::timestamptz),
  (md5('sellery:csmsg:cs2:1')::uuid, md5('sellery:cs:cs2')::uuid, 'customer', 'customer', '포장이 찌그러진 상태로 왔습니다. 교환 가능할까요?', (current_date - 12)::timestamptz),
  (md5('sellery:csmsg:cs2:2')::uuid, md5('sellery:cs:cs2')::uuid, 'brand',    'brand',    '불편을 드려 죄송합니다. 오늘 새 제품으로 재발송했고 기존 상품은 회수 신청해두었습니다.', (current_date - 11)::timestamptz)
on conflict do nothing;

-- ============================================================
-- 14) 캐시 재계산 — 브랜드 등급(bgname: gmv_base + Σ PAID 주문). 인플루언서 등급·sold_qty 는 트리거가 이미 채웠다.
-- ============================================================
update public.brands b
   set grade = public.brand_grade_for_gmv(public.brand_gmv(b.id))
 where b.code in ('b1','b2');

-- ============================================================
-- 15) 앱 검증용 LIVE 캠페인 — 실행일 기준 30일 (app-plan §10.1 G 완료 기준: "오늘 기준 LIVE 캠페인 1건 이상")
--   7) 의 c1/c12 는 최초 투입일 기준 ±2~3일이라 며칠 뒤에는 end_date 가 지나 isBuyable/app_confirm_checkout 이 NOT_LIVE 가 된다.
--   이 절은 재투입(`npx supabase db push --linked --include-seed`)할 때마다 "오늘(KST)부터 30일" 인 LIVE 캠페인 2건을 보장한다.
--   · 기준일은 current_date(세션 UTC) 가 아니라 KST 날짜 — campaign_card().campaign.today · app_confirm_checkout 의 v_today 와 같은 식.
--   · on conflict do nothing 이라 이미 있는 c14/c15 의 날짜는 바뀌지 않는다. 30일이 지나 되살리려면 두 행(과 주문)을 지우고 재투입.
--   · (seller, product) 는 campaigns_active_pair_uidx(활성 캠페인 1개) 에 걸리지 않는 새 조합, 인플루언서는 공개(hidden=false).
--     c14 혜린(s2) × 데일리 플랜트 프로틴(p5, b1) · c15 소민(s7) × 수분광 앰플 마스크(p10, b2). 두 상품 모두 options='[]' 라
--     campaign_card 의 resolve_product_options(1개 / 2개 세트 · 5% 추가 할인 / 3개 세트 · 10% 추가 할인) 경로를 검증한다.
--   · 재고 500 (p5 stock 900 · p10 stock 1800, 다른 기간 점유 캠페인 없음). 주문 시드는 없음(sold_qty 0 → 잔여 500).
-- ============================================================
insert into public.campaigns (id, code, seller_id, product_id, status, start_date, end_date, qty, created_at,
                              purchased, sample_price, sample_cel, sample_cash, sample_method, invited, cel_used)
select v.id, v.code, v.seller_id, v.product_id, 'LIVE', t.d, t.d + 30, 500, (t.d - 7)::timestamptz,
       false, null, 0, 0, null, false, 0
  from (select (now() at time zone 'Asia/Seoul')::date as d) t
 cross join (values
   ('c0000000-0000-4000-8000-000000000014'::uuid, 'c14', 'a0000000-0000-4000-8000-000000000002'::uuid, 'd0000000-0000-4000-8000-000000000005'::uuid),
   ('c0000000-0000-4000-8000-000000000015'::uuid, 'c15', 'a0000000-0000-4000-8000-000000000007'::uuid, 'd0000000-0000-4000-8000-000000000010'::uuid)
 ) as v(id, code, seller_id, product_id)
on conflict do nothing;

-- c14/c15 스레드: 일정 확정 + 판매 시작 (7)/9) 의 c1/c12 와 같은 형식)
insert into public.campaign_events (id, campaign_id, kind, sender, actor_role, body, event_type, payload, created_at)
select md5('sellery:event:' || c.code || ':' || e.n)::uuid, c.id, 'system', 'system', 'system',
       case e.n when 1 then '일정 확정 ' || to_char(c.start_date, 'FMMM/FMDD') || ' – ' || to_char(c.end_date, 'FMMM/FMDD') || ' · 배정 재고 ' || c.qty
                else '판매 링크 활성화 — 판매 시작' end,
       case e.n when 1 then 'schedule_confirmed' else 'went_live' end,
       case e.n when 1 then jsonb_build_object('start', c.start_date, 'end', c.end_date, 'qty', c.qty) else '{}'::jsonb end,
       case e.n when 1 then (c.start_date - 5)::timestamptz + interval '1 minute' else c.start_date::timestamptz + interval '1 minute' end
  from public.campaigns c
 cross join (values (1), (2)) as e(n)
 where c.code in ('c14', 'c15')
on conflict do nothing;
