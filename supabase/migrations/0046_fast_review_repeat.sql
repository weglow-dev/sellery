-- ============================================================
-- 0046 — 우선 검수권: 1회용 결함 해소 + 사후 점검 큐
--
-- 배경 1 (재구매 불가): `fastreview` 는 기간형이 아니라 **1회 소모품**인데 `celery_purchases` ·
--   `shop_item_active` 가 "기간 동안 유효한 권리" 모델이다. `days` 가 없어 `expires_on` 이 null 이고
--   `shop_item_active` 가 `expires_on is null` 을 **영구 보유**로 판정해(0037:77) 한 번 사면
--   `app_shop_buy` 가 영원히 `ALREADY` 를 돌려준다 — **브랜드당 평생 1회**가 된다.
--
--   문서가 이 기전을 결함으로 지목해 뒀다 — docs/period-policy.md §10 미정 "…한 번 사면 영구히
--   '보유 중' 으로 표시되고 재구매 버튼이 나오지 않는다 → 계정당 1회용이 된다. **코드 수정 과제**",
--   docs/points-policy.md §9-9. 시드는 `homefeature` · `boost` · `featured` 에 `days` 를 넣어 그
--   결함을 고쳤지만(seed.sql shop_items 주석 "영구 보유 결함을 해소한 의도적 보강") **`fastreview` 만
--   남았다** — 기간형이 아니어서 `days` 로는 표현할 수 없기 때문이다.
--
--   프로토타입에도 재구매 어휘가 있다: 샵 화면이 `owned && !it.repeat && passActive(…)` 로 버튼을
--   숨기므로(`packages/ui/src/views/Shop.svelte:34`) `repeat` 플래그가 붙은 항목은 다시 살 수 있다.
--   `fastreview` 에 그 플래그가 없어 1회용이 됐을 뿐이고, **데모의 `buyItem` 자체에는 가드가 없다**
--   (`packages/core/src/actions.ts:157-170` — 반복 적용된다). 운영 결정(2026-10-08): **문서를 따라
--   재사용 가능하게** 한다.
--
-- 배경 2 (사후 점검): 이 아이템은 관리자 검수를 건너뛴다. 0038 이 `products.fast_reviewed_at` 에
--   날짜를 남기고 관리자 화면이 "검수 생략" 칩으로 보여주지만, **관리자가 그걸 보러 갈 트리거가 없었다** —
--   상품이 `pending` → `listed` 로 바뀌어 검수 대기 큐에서 사라지고(관리자 홈 "검수 대기" 는
--   `status='pending'` 카운트), 상품 목록 필터도 네 상태뿐이어서 검수 생략만 거를 수 없었다.
--   `products_fast_reviewed_at_idx` 인덱스는 있는데 그걸 쓰는 쿼리가 없었다.
--   재사용을 열면 검수 생략 상품이 **더 자주** 생기므로 점검 큐를 같은 마이그레이션에서 만든다.
--
-- 건강·웰니스 상품은 표시광고 규제 대상이라 "누가·언제·무엇을 점검했는지" 가 남아야 한다.
-- ============================================================

-- ------------------------------------------------------------
-- 1) shop_item_active — **1회 소모품은 '보유 중' 이 될 수 없다**
--   한 곳만 고치면 두 가지가 함께 해결된다:
--     · `app_shop_buy` 의 중복 가드(0039:166)가 통과한다 → 다시 살 수 있다
--     · `app_shop_catalog` 의 `active` 플래그(0039:286)가 false 가 된다 → 샵이 "보유 중" 대신 "구매" 를 보여준다
--   `datapass`(영구/30일) 같은 진짜 권리 항목은 그대로다.
-- ------------------------------------------------------------
create or replace function public.shop_item_active(p_owner_type text, p_owner_id uuid, p_item_id text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select case
    -- 1회 소모품: 사면 즉시 효과가 적용되고 소모된다. 보유 상태가 남지 않으므로 항상 false.
    --   (여기 넣는 항목은 `app_shop_buy` 에서 적용 대상이 없을 때 차감하지 않도록 `NO_TARGET_*` 가드가 있어야 한다)
    when p_item_id in ('fastreview') then false
    else exists (
      select 1 from public.celery_purchases cp
       where cp.owner_type = p_owner_type
         and ((p_owner_type = 'seller' and cp.seller_id = p_owner_id)
           or (p_owner_type = 'brand'  and cp.brand_id  = p_owner_id))
         and cp.item_id = p_item_id
         and (cp.expires_on is null or cp.expires_on > (now() at time zone 'Asia/Seoul')::date))
  end;
$$;
revoke all on function public.shop_item_active(text, uuid, text) from public, anon, authenticated;
grant execute on function public.shop_item_active(text, uuid, text) to service_role;

comment on function public.shop_item_active(text, uuid, text) is
  '셀러리 샵 아이템 보유 여부 (0037 → 0046). 1회 소모품(fastreview)은 항상 false — 보유 상태가 남지 않아 재구매가 가능하다';

-- ------------------------------------------------------------
-- 2) 사후 점검 기록
--   `fast_reviewed_at`(0038 · 검수 생략한 날)과 짝이다. 점검을 마치면 날짜·담당자를 남긴다.
--   **점검 대기** = `fast_reviewed_at is not null and fast_review_checked_at is null and status='listed'`
--   반려·노출 중단으로 상태가 바뀌면 큐에서 자연히 빠진다(그 행위가 곧 점검이다) — 0015
--   `app_admin_review_product` 를 손대지 않아도 되는 이유.
-- ------------------------------------------------------------
alter table public.products
  add column if not exists fast_review_checked_at date,
  add column if not exists fast_review_checked_by uuid references auth.users (id) on delete set null;

comment on column public.products.fast_review_checked_at is
  '우선 검수권으로 노출된 상품을 관리자가 사후 점검한 날 (0046). null 이면 점검 대기';
comment on column public.products.fast_review_checked_by is
  '사후 점검한 관리자 (0046 · 표시광고 규제 대응 — 누가 점검했는지)';

-- 점검 대기 큐 — 관리자 홈 카운트·목록 필터가 쓴다
create index if not exists products_fast_review_pending_idx
  on public.products (fast_reviewed_at)
  where fast_reviewed_at is not null and fast_review_checked_at is null;

-- ------------------------------------------------------------
-- app_admin_fast_review_check(p_product_id, p_actor_user_id) — 사후 점검 완료
--   상품을 그대로 두고(노출 유지) "확인했다" 만 기록한다. 문제가 있으면 관리자는 대신
--   반려(`app_admin_review_product` 'reject')나 노출 중단('pause')을 쓴다 — 그러면 상태가 바뀌어
--   큐에서 빠진다.
--   멱등 — 이미 점검한 건은 already.
--   반환: { ok:true, already, code, checked_on } | { ok:false, code:'NOT_FOUND'|'NOT_FAST_REVIEWED' }
-- ------------------------------------------------------------
create or replace function public.app_admin_fast_review_check(p_product_id uuid, p_actor_user_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p       public.products%rowtype;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  select * into p from public.products where id = p_product_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if p.fast_reviewed_at is null then
    -- 검수 생략으로 올라온 상품이 아니다 — 점검할 대상이 아니다
    return jsonb_build_object('ok', false, 'code', 'NOT_FAST_REVIEWED');
  end if;
  if p.fast_review_checked_at is not null then
    return jsonb_build_object('ok', true, 'already', true, 'code', p.code,
                              'checked_on', p.fast_review_checked_at);
  end if;

  update public.products
     set fast_review_checked_at = v_today,
         fast_review_checked_by = p_actor_user_id
   where id = p.id;

  return jsonb_build_object('ok', true, 'already', false, 'code', p.code, 'checked_on', v_today);
end;
$$;
revoke all on function public.app_admin_fast_review_check(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_admin_fast_review_check(uuid, uuid) to service_role;
