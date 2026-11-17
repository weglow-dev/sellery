-- pgTAP — 0119 DB 판정 정리: 공구 기본가(결제 단가와 같은 myr_product_unit_price · 대체값 없음 · NO_PRICE) · 초대 상태(myr_invite_list_state · myr_invite_outstanding) ·
--   환불 사진 한도(myr_refund_photos_too_many — 바로 환불도 거절). 문의 주문 주인(myr_order_owned_by)은 myr_cs.test.sql 이 고정한다.
begin;
select plan(13);

select function_privs_are('public', 'myr_refund_photos_too_many', '{text[]}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 refund_photos_too_many 불가');
select function_privs_are('public', 'myr_invite_list_state', '{myr_invites}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 invite_list_state 불가');
select function_privs_are('public', 'myr_invite_outstanding', '{myr_invites}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 invite_outstanding 불가');

-- ---------- 환불 사진 한도 ----------
select is(array[public.myr_refund_photos_too_many('{}'), public.myr_refund_photos_too_many(array['a', 'b', 'c']), public.myr_refund_photos_too_many(array['a', 'b', 'c', 'd']), public.myr_refund_photos_too_many(null)],
          array[false, false, true, false], '사진 한도 — 0 · 3장 통과 · 4장 넘음 · 없으면 통과');

-- ---------- 초대 상태 ----------
create function pg_temp.inv(p_used boolean, p_revoked boolean, p_expired boolean) returns public.myr_invites language sql as $$
  select jsonb_populate_record(null::public.myr_invites, jsonb_build_object('id', gen_random_uuid(),
           'used_at', case when p_used then now() - interval '1 day' end, 'revoked_at', case when p_revoked then now() - interval '1 day' end,
           'expires_at', case when p_expired then now() - interval '1 hour' else now() + interval '1 day' end))
$$;
-- 0119 전 운영 목록의 상태 식과 모든 조합에서 같다
select is((select count(*)::int from (select pg_temp.inv(u, r, e) as i from unnest(array[false, true]) u, unnest(array[false, true]) r, unnest(array[false, true]) e) x
            where public.myr_invite_list_state(x.i) is distinct from
                  case when (x.i).used_at is not null then 'used' when (x.i).revoked_at is not null then 'revoked' when (x.i).expires_at <= now() then 'expired' else 'pending' end), 0,
          '목록 상태 = 0119 전 식(사용 · 취소 · 만료 8조합)');
select is(array[public.myr_invite_list_state(pg_temp.inv(false, false, false)), public.myr_invite_list_state(pg_temp.inv(true, false, false)),
                public.myr_invite_list_state(pg_temp.inv(false, true, false)), public.myr_invite_list_state(pg_temp.inv(false, false, true))],
          array['pending', 'used', 'revoked', 'expired'], '목록 상태 — 대기 · 사용 · 취소 · 만료');
select is(array[public.myr_invite_outstanding(pg_temp.inv(false, false, false)), public.myr_invite_outstanding(pg_temp.inv(false, false, true)),
                public.myr_invite_outstanding(pg_temp.inv(true, false, false)), public.myr_invite_outstanding(pg_temp.inv(false, true, false))],
          array[true, true, false, false], '살아 있는 초대 — 대기 · 만료 ○(재발급 · 취소가 거둔다) / 사용 · 취소 ×(0119 전 used_at · revoked_at 둘 다 비었음과 같다)');

-- ---------- 공구 기본가 ----------
insert into public.sellers (id, name, handle, platform, active) values ('00000000-0000-4000-8000-00000000fa61', '민지 루틴', '@pgtap.gbbase', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon, options)
values ('00000000-0000-4000-8000-00000000fa71', 'pgtap-gbbase-ok', '00000000-0000-4000-8000-00000000fa61', 'diet', '정상', 20000, 50, 'listed', 'pill', '[{"n":"1개","price":"18000"}]'::jsonb),
       ('00000000-0000-4000-8000-00000000fa72', 'pgtap-gbbase-bad', '00000000-0000-4000-8000-00000000fa61', 'diet', '옵션 가격 틀림', 20000, 50, 'listed', 'pill', '[{"n":"1개","price":"오류"}]'::jsonb);
select is(public.myr_app_groupbuy_preview('00000000-0000-4000-8000-00000000fa61', '00000000-0000-4000-8000-00000000fa71', 10) - 'ok',
          '{"base_price": 18000, "price": 16200}'::jsonb, '정상 상품 — 기본가 = 옵션 0번 가격(결제 단가와 같다) · 공구가 10%');
select is(public.myr_app_groupbuy_preview('00000000-0000-4000-8000-00000000fa61', '00000000-0000-4000-8000-00000000fa72', 10) ->> 'code', 'NO_PRICE',
          '옵션 0번 가격이 틀린 상품 — 미리보기 없음(0119 전에는 상품가 20,000 으로 보였지만 결제는 BAD_OPTION)');
select is((select (p.r ->> 'base_price')::int from (select public.myr_line_price(x, 0, null) r from public.myr_products x where x.id = '00000000-0000-4000-8000-00000000fa72') p), null,
          '결제 단가도 없다(같은 함수)');
select is(public.myr_app_seller_groupbuys('00000000-0000-4000-8000-00000000fa61', '00000000-0000-4000-8000-00000000fa72') #> '{product,price}', 'null'::jsonb, '공구 목록 상품가도 비운다');

-- ---------- 바로 환불 사진 4장 — 잘라내지 않고 거절 ----------
insert into public.myr_orders (id, code, status, paid_at, buyer_name, shipping, order_name, items_amount, payment_key)
values ('00000000-0000-4000-8000-00000000fa81', 'pgtap-gbbase-1', 'PAID', now(), '김지은', '{}', '정상', 18000, 'pk-gbbase');
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, option_name, qty, unit_price)
values ('00000000-0000-4000-8000-00000000fa91', '00000000-0000-4000-8000-00000000fa81', '00000000-0000-4000-8000-00000000fa71', '00000000-0000-4000-8000-00000000fa61', '정상', '1개', 1, 18000);
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-00000000fa81', '[{"item_id":"00000000-0000-4000-8000-00000000fa91","qty":1,"photos":["a","b","c","d"]}]', 'admin', null) #>> '{items,0,reason}',
          'BAD_PHOTOS', '사진 4장 — BAD_PHOTOS(0119 전에는 3장까지 잘라 통과)');
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-00000000fa81', '[{"item_id":"00000000-0000-4000-8000-00000000fa91","qty":1,"photos":["a","b","c"]}]', 'admin', null) ->> 'ok',
          'true', '사진 3장 — 통과');

select * from finish();
rollback;
