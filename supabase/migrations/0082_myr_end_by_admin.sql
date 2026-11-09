-- ============================================================
-- 0082 — MYR 판매 종료는 운영만(docs/myr.md §9-6 · 2026-11-09 대표 결정)
--
--   크리에이터는 판매를 종료하지 않는다. 재고가 0 이면 샵이 품절로 보여 주고(판매 상태는 그대로 · 재고를 다시 넣으면 다시 팔린다),
--   판매 종료는 운영(어드민 · 그 전까지 `myr-products.mjs review <code> end`)이 한다.
--
--   myr_app_seller_set_status(seller, id, action)   0074 정의에서 end 를 뺀다 — end 는 BAD_ACTION(pause · resume · delete 그대로)
--   myr_app_admin_review_product(id, decision, …)   decision 에 end 추가 — 판매 중 · 일시중지 → ended · 대기 중 수정본은 canceled(0074 가 크리에이터 end 때 하던 것)
--                                                   approve · reject · pause 는 0074 그대로
--
--   권한: service role 만(그대로). 테스트: supabase/tests/myr_seller_products.test.sql. 재실행 가능.
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
  v_from   text[];
  v_to     text;
begin
  case v_action
    when 'pause' then v_from := array['listed']; v_to := 'paused';
    when 'resume' then v_from := array['paused']; v_to := 'listed';
    when 'delete' then v_from := array['draft']; v_to := null;
    else return jsonb_build_object('ok', false, 'code', 'BAD_ACTION');   -- end 포함(판매 종료는 운영만 · 0082)
  end case;
  select * into p from public.myr_products where id = p_id and seller_id = p_seller and deleted_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if not (p.status = any (v_from)) then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', p.status); end if;
  if v_action = 'delete' then
    update public.myr_products set deleted_at = now() where id = p.id;
    return jsonb_build_object('ok', true, 'status', 'deleted');
  end if;
  update public.myr_products set status = v_to where id = p.id returning * into p;
  return jsonb_build_object('ok', true, 'status', p.status);
end;
$$;
revoke all on function public.myr_app_seller_set_status(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.myr_app_seller_set_status(uuid, uuid, text) to service_role;

-- 0074 정의 + end
create or replace function public.myr_app_admin_review_product(p_product_id uuid, p_decision text, p_reason text default null, p_reviewer uuid default null, p_items jsonb default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p          public.myr_products%rowtype;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_items    jsonb := public.myr_reject_items(p_items);
  v_reason   text := public.myr_reject_reason(p_reason, v_items);
begin
  select * into p from public.myr_products where id = p_product_id and deleted_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_decision not in ('approve', 'reject', 'pause', 'end') then return jsonb_build_object('ok', false, 'code', 'BAD_DECISION'); end if;
  if v_decision = 'reject' and v_reason is null then return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED'); end if;
  if v_decision = 'pause' and p.status <> 'listed' then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', p.status); end if;
  if v_decision = 'end' then
    if p.status not in ('listed', 'paused') then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', p.status); end if;
    update public.myr_products set status = 'ended', reviewed_at = now(), reviewed_by = p_reviewer where id = p.id;
    update public.myr_product_revisions set status = 'canceled' where product_id = p.id and status = 'pending';
    return jsonb_build_object('ok', true, 'code', p.code, 'status', 'ended');
  end if;
  update public.myr_products
     set status = case v_decision when 'approve' then 'listed' when 'reject' then 'rejected' else 'paused' end,
         reject_reason = case v_decision when 'reject' then v_reason else null end,
         reject_items = case v_decision when 'reject' then v_items else '[]'::jsonb end,
         reviewed_at = now(),
         reviewed_by = p_reviewer
   where id = p.id;
  return jsonb_build_object('ok', true, 'code', p.code, 'status', case v_decision when 'approve' then 'listed' when 'reject' then 'rejected' else 'paused' end);
end;
$$;
revoke all on function public.myr_app_admin_review_product(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_admin_review_product(uuid, text, text, uuid, jsonb) to service_role;
