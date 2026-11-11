-- pgTAP — 0094 판매가 범위: 1,000만 원 초과는 아주 큰 값(정수 범위 밖)이어도 DB 오류 없이 INVALID_INPUT · field price. 저장 · 수정본 제출 둘 다
begin;
select plan(8);

insert into public.sellers (id, name, handle, platform, active) values ('00000000-0000-4000-8000-00000000b911', '민지 루틴', '@pgtap.price', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-00000000b921', 'pgtap-price-a', '00000000-0000-4000-8000-00000000b911', 'diet', '레몬 스틱', 36000, 50, 'listed', 'pill');

-- 저장(임시저장)
select is(public.myr_app_seller_save_product('00000000-0000-4000-8000-00000000b911', null, '{"name":"테스트","price":10000000,"category":"diet"}', false) ->> 'ok', 'true', '1,000만 원 → 저장');
select is(public.myr_app_seller_save_product('00000000-0000-4000-8000-00000000b911', null, '{"name":"테스트","price":10000001,"category":"diet"}', false) ->> 'field', 'price', '1,000만 1원 → field price');
select is(public.myr_app_seller_save_product('00000000-0000-4000-8000-00000000b911', null, '{"name":"테스트","price":2147483648,"category":"diet"}', false) - 'status',
          '{"ok": false, "code": "INVALID_INPUT", "field": "price"}'::jsonb, '정수 범위 밖(2,147,483,648) → DB 오류 없이 INVALID_INPUT · price');
select is(public.myr_app_seller_save_product('00000000-0000-4000-8000-00000000b911', null, '{"name":"테스트","price":12345678900,"category":"diet"}', false) ->> 'field', 'price', '123억 → field price');
select is(public.myr_app_seller_save_product('00000000-0000-4000-8000-00000000b911', null, '{"name":"테스트","price":-1,"category":"diet"}', false) ->> 'field', 'price', '음수 → field price(그대로)');
select is(public.myr_app_seller_save_product('00000000-0000-4000-8000-00000000b911', null, '{"name":"테스트","category":"diet"}', false) ->> 'ok', 'true', '판매가 없음 → 임시저장은 된다(그대로)');

-- 수정본 제출(판매 중 상품)
select is(public.myr_app_seller_submit_revision('00000000-0000-4000-8000-00000000b911', '00000000-0000-4000-8000-00000000b921', '{"name":"레몬 스틱","price":99999999999,"category":"diet","note":"노트"}') ->> 'field', 'price', '수정본 — 아주 큰 판매가 → field price(DB 오류 아님)');
select is((select price from public.myr_products where id = '00000000-0000-4000-8000-00000000b921'), 36000, '거절되면 상품 가격은 그대로');

select * from finish();
rollback;
