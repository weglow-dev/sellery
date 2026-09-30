-- ============================================================
-- 0029 — 지급 보류 자동 해제 (정산 정보를 등록하면 다음 지급 배치에 포함)
--
-- 배경: 정산 정보가 없는 파트너의 지급은 정산 실행 때 `held` 로 기록된다(0020 · 0027 referrer).
--   인플루언서·브랜드 정산 화면과 스레드 보류 메시지는 "정보를 등록하면 다음 지급 배치에 포함" 이라고
--   안내하지만, 실제로는 관리자가 지급 건마다 [보류 해제](`app_admin_payout_release`)를 눌러야 풀렸다.
--   관리자는 파트너가 언제 등록했는지 알 방법이 없었다. 프로토타입은 보류 메시지만 남기고 해제 로직이 없다.
--
-- 방식
--   · `sellers` · `brands` 의 정산 정보 열이 바뀌면 그 파트너의 `held` 지급을 다시 검사해,
--     `admin_payout_hold_reason` 이 null(완비)이면 `pending` 으로 돌린다 — 수동 해제와 같은 검사 · 같은 갱신
--   · 아직 미완비면 보류를 유지하고 사유(`hold_code` · `hold_reason`)만 지금 상태로 맞춘다
--   · 운영자 보류(`hold_code` 'MANUAL' · null)는 풀지 않는다 — 사람이 건 보류는 사람이 푼다
--   · 추천인(`referrer`) 지급도 같은 인플루언서 행이라 함께 풀린다(계좌만 검사 — 0027)
--   · 해제되면 스레드에 시스템 메시지 `payout_released` 를 남긴다(감사 · 파트너에게도 보인다)
--   · "다음 지급 배치" = 다음 이체 파일(`app_admin_payout_export` 'pending') — 해제된 건이 여기에 들어간다
--
-- 함께 고침: `app_admin_payout_release` 가 `seller` 가 아닌 지급을 모두 브랜드로 보고 계좌 스냅샷을 읽어,
--   추천인 지급을 풀면 `bank_snapshot` 이 null 이 됐다(이체 파일은 원문을 따로 읽어 영향 없음 · 관리자 목록의
--   마스킹 계좌만 비었다). 본문은 0020 과 같고 그 분기 한 줄만 다르다.
--
-- 트리거는 파트너의 정보 저장과 같은 트랜잭션에서 돈다 — 해제 중 오류가 나도 저장은 실패시키지 않는다(경고만 · 보류 유지).
-- security definer · service_role 전용 · 트리거는 행 단위 AFTER UPDATE OF (정산 정보 열).
-- ============================================================

-- ------------------------------------------------------------
-- admin_payouts_auto_release(p_seller_id, p_brand_id) — 해당 파트너의 자동 보류를 다시 검사해 푼다. 푼 건수를 돌려준다.
-- ------------------------------------------------------------
create or replace function public.admin_payouts_auto_release(p_seller_id uuid, p_brand_id uuid)
returns integer
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  po      public.payouts%rowtype;
  v_bank  jsonb;
  v_cid   uuid;
  v_label text;
  v_hold  text;
  v_n     integer := 0;
begin
  for po in
    select * from public.payouts
     where status = 'held'
       and hold_code is not null and hold_code <> 'MANUAL'
       and ((p_seller_id is not null and seller_id = p_seller_id)
         or (p_brand_id is not null and brand_id = p_brand_id))
     order by created_at, id
     for update
  loop
    v_hold := public.admin_payout_hold_reason(po.payee_type, po.seller_id, po.brand_id);
    if v_hold is not null then
      -- 아직 미완비 — 사유만 지금 상태로 맞춘다(예: 계좌 등록 → 남은 사유 주민번호)
      if v_hold is distinct from po.hold_code then
        update public.payouts set hold_code = v_hold, hold_reason = public.admin_hold_label(v_hold) where id = po.id;
      end if;
    else
      if po.payee_type = 'brand' then
        select public.admin_bank_snapshot(bank_info) into v_bank from public.brands where id = po.brand_id;
      else
        select public.admin_bank_snapshot(bank_info) into v_bank from public.sellers where id = po.seller_id;
      end if;
      update public.payouts
         set status = 'pending', hold_code = null, hold_reason = null, bank_snapshot = v_bank
       where id = po.id;
      perform public.admin_settlement_sync_status(po.settlement_id);

      select campaign_id into v_cid from public.settlements where id = po.settlement_id;
      v_label := case po.payee_type when 'seller' then '인플루언서' when 'referrer' then '추천인' else '브랜드' end;
      insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
      values (v_cid, 'system', 'system', 'system',
              '▶ 지급 보류 해제 — ' || v_label || ' 정산 정보 등록 확인 · 다음 지급 배치에 포함됩니다 (₩'
                || to_char(po.amount, 'FM999,999,999,999') || ')',
              'payout_released',
              jsonb_build_object('payout_id', po.id, 'payee_type', po.payee_type, 'amount', po.amount,
                                 'hold_code', po.hold_code, 'auto', true));
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.admin_payouts_auto_release(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_payouts_auto_release(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- 트리거 — 정산 정보 열이 실제로 바뀐 경우만 (`admin_payout_hold_reason` 이 보는 열과 같다)
--   sellers: bank_info · settle_type · biz_no · tax_info · rrn_set_at
--   brands : bank_info · biz_no (`brand_settle_info_complete` 0019)
-- ------------------------------------------------------------
create or replace function public.sellers_payout_auto_release()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- 해제가 실패해도 파트너의 정보 저장은 막지 않는다 — 보류는 그대로 남고 관리자 [보류 해제]로 풀 수 있다
  begin
    perform public.admin_payouts_auto_release(new.id, null);
  exception when others then
    raise warning 'payout auto release failed (seller %): %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.sellers_payout_auto_release() from public, anon, authenticated;

drop trigger if exists sellers_payout_auto_release on public.sellers;
create trigger sellers_payout_auto_release
  after update of bank_info, settle_type, biz_no, tax_info, rrn_set_at on public.sellers
  for each row
  when (old.bank_info   is distinct from new.bank_info
     or old.settle_type is distinct from new.settle_type
     or old.biz_no      is distinct from new.biz_no
     or old.tax_info    is distinct from new.tax_info
     or old.rrn_set_at  is distinct from new.rrn_set_at)
  execute function public.sellers_payout_auto_release();

create or replace function public.brands_payout_auto_release()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- 해제가 실패해도 파트너의 정보 저장은 막지 않는다 — 보류는 그대로 남고 관리자 [보류 해제]로 풀 수 있다
  begin
    perform public.admin_payouts_auto_release(null, new.id);
  exception when others then
    raise warning 'payout auto release failed (brand %): %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.brands_payout_auto_release() from public, anon, authenticated;

drop trigger if exists brands_payout_auto_release on public.brands;
create trigger brands_payout_auto_release
  after update of bank_info, biz_no on public.brands
  for each row
  when (old.bank_info is distinct from new.bank_info
     or old.biz_no    is distinct from new.biz_no)
  execute function public.brands_payout_auto_release();

-- ------------------------------------------------------------
-- app_admin_payout_release — 0020 과 같고, 계좌 스냅샷 분기만 `brand` 기준으로 바꿨다(referrer 는 sellers).
-- ------------------------------------------------------------
create or replace function public.app_admin_payout_release(p_payout_id uuid)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  po      public.payouts%rowtype;
  v_hold  text;
  v_bank  jsonb;
begin
  select * into po from public.payouts where id = p_payout_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if po.status = 'paid' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_PAID');
  end if;
  if po.status = 'pending' then
    return jsonb_build_object('ok', true, 'already', true, 'payout', public.admin_payout_json(po),
                              'settlement_status', (select status from public.settlements where id = po.settlement_id));
  end if;
  v_hold := public.admin_payout_hold_reason(po.payee_type, po.seller_id, po.brand_id);
  if v_hold is not null then
    return jsonb_build_object('ok', false, 'code', 'STILL_INCOMPLETE', 'hold_code', v_hold, 'label', public.admin_hold_label(v_hold));
  end if;
  if po.payee_type = 'brand' then
    select public.admin_bank_snapshot(bank_info) into v_bank from public.brands where id = po.brand_id;
  else
    select public.admin_bank_snapshot(bank_info) into v_bank from public.sellers where id = po.seller_id;
  end if;
  update public.payouts
     set status = 'pending', hold_code = null, hold_reason = null, bank_snapshot = v_bank
   where id = po.id
  returning * into po;
  return jsonb_build_object('ok', true, 'already', false, 'payout', public.admin_payout_json(po),
                            'settlement_status', public.admin_settlement_sync_status(po.settlement_id));
end;
$$;
revoke all on function public.app_admin_payout_release(uuid) from public, anon, authenticated;
grant execute on function public.app_admin_payout_release(uuid) to service_role;
