-- pgTAP — 0075 크리에이터 콘솔 고객 문의 답변: 권한 · 답변 등록(0063 reply) · 목록의 answer · 계정으로 목록 · 답변 대기 수 (답변 수정은 없음)
begin;
select plan(18);

-- ---------- 권한 ----------
select function_privs_are('public', 'myr_app_seller_cs_of_user', '{uuid}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 seller_cs_of_user 불가');
select function_privs_are('public', 'myr_app_seller_cs_of_user', '{uuid}'::text[], 'anon', '{}'::text[], 'anon 은 seller_cs_of_user 불가');
select function_privs_are('public', 'myr_app_seller_cs_waiting_of_user', '{uuid}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 cs_waiting 불가');
select function_privs_are('public', 'myr_app_seller_cs_waiting_of_user', '{uuid}'::text[], 'anon', '{}'::text[], 'anon 은 cs_waiting 불가');

-- ---------- 픽스처 ----------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000e81', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-csa1@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
       ('00000000-0000-4000-8000-000000000e82', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-csa-none@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active, user_id)
values ('00000000-0000-4000-8000-000000000e91', '민지 루틴', '@pgtap.csa1', 'instagram', true, '00000000-0000-4000-8000-000000000e81'),
       ('00000000-0000-4000-8000-000000000e92', '하루 웰', '@pgtap.csa2', 'instagram', true, null);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-000000000ea1', 'pgtap-csa-p1', '00000000-0000-4000-8000-000000000e91', 'diet', '포도 젤리', 32000, 10, 'listed', 'grape'),
       ('00000000-0000-4000-8000-000000000ea2', 'pgtap-csa-p2', '00000000-0000-4000-8000-000000000e92', 'diet', '남의 상품', 30000, 10, 'listed', 'pill');
create temp table t_q1 as select public.myr_app_cs_open('00000000-0000-4000-8000-000000000ea1', null, null, '김하린', '상품 문의', '저녁에 먹어도 되나요?') as r;
create temp table t_q2 as select public.myr_app_cs_open('00000000-0000-4000-8000-000000000ea1', null, null, '오지수', '배송 문의', '언제 와요?') as r;
create temp table t_q3 as select public.myr_app_cs_open('00000000-0000-4000-8000-000000000ea2', null, null, '남', '상품 문의', '남의 문의') as r;
create temp table c as select (select r ->> 'conversation_code' from t_q1) as q1, (select r ->> 'conversation_code' from t_q2) as q2, (select r ->> 'conversation_code' from t_q3) as q3;

-- ---------- 계정으로 목록 · 대기 수 ----------
select is(public.myr_app_seller_cs_of_user('00000000-0000-4000-8000-000000000e81'), public.myr_app_cs_list('seller', '00000000-0000-4000-8000-000000000e91', null), '계정으로 목록 = 연결된 크리에이터 목록(모양 · 순서 같음)');
select is(jsonb_array_length(public.myr_app_seller_cs_of_user('00000000-0000-4000-8000-000000000e81')), 2, '내 상품 문의만(남의 상품 문의 제외)');
select is(public.myr_app_seller_cs_of_user('00000000-0000-4000-8000-000000000e82'), '[]'::jsonb, '크리에이터 연결 없는 계정은 빈 목록');
select is(public.myr_app_seller_cs_waiting_of_user('00000000-0000-4000-8000-000000000e81'), 2, '답변 대기 2');
select is(public.myr_app_seller_cs_waiting_of_user('00000000-0000-4000-8000-000000000e82'), 0, '연결 없는 계정은 0');
select is((select e -> 'answer' from jsonb_array_elements(public.myr_app_seller_cs_of_user('00000000-0000-4000-8000-000000000e81')) e where e ->> 'code' = (select q1 from c)), 'null'::jsonb, '답변 전 answer 는 null');

-- ---------- 답변 등록(0063 reply) ----------
select is(public.myr_app_cs_reply((select q1 from c), 'seller', '00000000-0000-4000-8000-000000000e91', null, '00000000-0000-4000-8000-000000000e81', '네, 저녁 식후도 괜찮아요!') ->> 'status', 'ANSWERED', '답변 등록 → ANSWERED');
select is(public.myr_app_seller_cs_waiting_of_user('00000000-0000-4000-8000-000000000e81'), 1, '답변하면 대기 1');
select is((select e #>> '{answer,body}' from jsonb_array_elements(public.myr_app_seller_cs_of_user('00000000-0000-4000-8000-000000000e81')) e where e ->> 'code' = (select q1 from c)), '네, 저녁 식후도 괜찮아요!', '목록 answer = 내 답변');
select is((select e ->> 'first_body' from jsonb_array_elements(public.myr_app_seller_cs_of_user('00000000-0000-4000-8000-000000000e81')) e where e ->> 'code' = (select q1 from c)), '저녁에 먹어도 되나요?', '목록 first_body = 고객 질문');

select is(public.myr_app_cs_reply((select q2 from c), 'admin', null, null, null, '운영팀 대행 답변') ->> 'status', 'ANSWERED', '운영 대행 답변(sender seller)');
select is((select e #>> '{answer,body}' from jsonb_array_elements(public.myr_app_seller_cs_of_user('00000000-0000-4000-8000-000000000e81')) e where e ->> 'code' = (select q2 from c)), '운영팀 대행 답변', '대행 답변도 목록 answer(크리에이터 이름으로 보인다)');
select is(public.myr_app_seller_cs_waiting_of_user('00000000-0000-4000-8000-000000000e81'), 0, '둘 다 답변하면 대기 0');
select ok(not exists (select 1 from pg_proc where proname = 'myr_app_cs_edit_reply'), '답변 수정 함수는 없다');

select * from finish();
rollback;
