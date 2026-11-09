-- ============================================================
-- 0083 — MYR 크리에이터는 판매 일시중지도 하지 않는다(2026-11-09 대표 결정 · 0082 의 판매 종료와 같은 이유)
--
--   판매 상태(일시중지 · 다시 판매 · 판매 종료)는 운영이 정한다 — 어드민 전까지 `myr-products.mjs review <code> pause|approve|end`.
--   크리에이터에게 남는 상태 동작은 **임시저장 삭제**뿐이다. 내용 수정은 수정 심사(0074)로 그대로.
--
--   myr_app_seller_set_status(seller, id, action)   delete 만 — pause · resume · end 는 BAD_ACTION
--   (이미 일시중지된 상품은 그대로 · 다시 판매는 운영 approve)
--
--   권한: service role 만(그대로). 테스트: supabase/tests/myr_seller_product_save.test.sql. 재실행 가능.
-- ============================================================

create or replace function public.myr_app_seller_set_status(p_seller uuid, p_id uuid, p_action text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p        public.myr_products%rowtype;
  v_action text := lower(btrim(coalesce(p_action, '')));
begin
  -- 판매 상태는 운영만(0082 end · 0083 pause · resume) — 크리에이터는 임시저장 삭제만
  if v_action <> 'delete' then return jsonb_build_object('ok', false, 'code', 'BAD_ACTION'); end if;
  select * into p from public.myr_products where id = p_id and seller_id = p_seller and deleted_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if p.status <> 'draft' then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', p.status); end if;
  update public.myr_products set deleted_at = now() where id = p.id;
  return jsonb_build_object('ok', true, 'status', 'deleted');
end;
$$;
revoke all on function public.myr_app_seller_set_status(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.myr_app_seller_set_status(uuid, uuid, text) to service_role;
