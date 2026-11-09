-- ============================================================
-- 0085 — MYR 크리에이터 사업자 · 정산 정보(docs/myr.md §4.2.1 9번 · §9-6 · 2026-11-09 대표 결정)
--
--   받는 것: 상호 · 사업자등록번호 · 대표자 · 정산 계좌(은행 · 계좌번호 · 예금주). 세금계산서 이메일 = 초대받은 이메일(sellers.email · 따로 받지 않는다).
--   셀러는 사업자만(§9-6) — settle_type = 'biz'. 칸은 셀러리 0013 의 sellers 칸을 그대로 쓴다:
--     biz_no(숫자 10자리) · tax_info { company, ceo } · bank_info { bank, account, holder }
--   계좌는 개인 계좌도 받는다 — 단 예금주가 상호 또는 대표자와 같아야 한다(HOLDER_MISMATCH).
--
--   운영 확인(새 칸): myr_settle_status  none(미입력) · pending(확인 중) · verified(확인 완료) · rejected(다시 입력 요청)
--                    myr_settle_note(다시 입력 요청 사유) · myr_settle_submitted_at · myr_settle_checked_at · myr_settle_checked_by
--     - 저장하면 pending. 단 확인 완료 상태에서 **상호만** 바꾸면 확인 완료 그대로(계좌 · 사업자번호 · 대표자를 바꾸면 다시 확인).
--     - 정산은 계산되고 **지급만** 확인 완료가 될 때까지 보류(정산 실행은 작업 순서 5 — 이 칸을 본다).
--     - 국세청 휴 · 폐업 자동 확인은 나중(공공데이터 API 키 필요).
--
--   myr_biz_no_valid(text)                              사업자등록번호 체크섬(10자리)
--   myr_app_seller_settle_info_of_user(user)            크리에이터 본인 — 가린 값만(사업자번호 ***-**-12345 · 계좌 뒤 4자리)
--   myr_app_seller_settle_info_save(user, company, ceo, biz_no, bank, account, holder)
--       biz_no · account 가 null 이면 저장된 값 그대로(화면은 가린 값만 가져서 다시 입력하지 않아도 된다 · 없으면 필수)
--       거부: NOT_FOUND · BAD_COMPANY · BAD_CEO · BAD_BIZ_NO · BAD_BANK · BAD_ACCOUNT · BAD_HOLDER · HOLDER_MISMATCH
--   myr_app_admin_settle_infos(status)                  운영 — 원문(확인용) · 상태별(null 이면 미입력 빼고 전부)
--   myr_app_admin_settle_info_check(seller, decision, note, admin)   verify(확인 중만) · reject(사유 필수)
--       거부: NOT_FOUND · BAD_DECISION · NOT_PENDING · NOTE_REQUIRED
--
--   프로필 사진(9번 · 내 정보에서만 바꾼다 — 홈의 사진 변경은 뺐다 · 2026-11-09):
--   Storage 공개 버킷 myr-avatars — <seller id>/<uuid>.<ext> · jpg/png/webp · 4MB · 올리기는 콘솔 서버(service role)만
--   myr_app_seller_avatar_set(user, url)   sellers.avatar_url — 내 폴더의 공개 URL 만(BAD_URL) · null 이면 지운다 · 이전 값(previous)을 돌려준다(서버가 그 파일을 지운다)
--       거부: NOT_FOUND · BAD_URL
--
--   권한: 전부 service role 만(anon · authenticated EXECUTE 회수). 크리에이터 · 운영자 id 는 서버 세션에서. 테스트: supabase/tests/myr_settle_info.test.sql. 재실행 가능.
-- ============================================================

alter table public.sellers add column if not exists myr_settle_status text not null default 'none';
alter table public.sellers add column if not exists myr_settle_note text;
alter table public.sellers add column if not exists myr_settle_submitted_at timestamptz;
alter table public.sellers add column if not exists myr_settle_checked_at timestamptz;
alter table public.sellers add column if not exists myr_settle_checked_by uuid;
do $$ begin
  alter table public.sellers add constraint sellers_myr_settle_status_check check (myr_settle_status in ('none', 'pending', 'verified', 'rejected'));
exception when duplicate_object then null; end $$;
comment on column public.sellers.myr_settle_status is 'MYR 사업자 · 정산 정보 운영 확인 none · pending · verified · rejected — 0085';

-- 사업자등록번호 체크섬 — 가중치 1,3,7,1,3,7,1,3,5 · 9번째 자리 ×5 의 10의 자리를 더한다
create or replace function public.myr_biz_no_valid(p text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  d   text := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
  w   int[] := array[1, 3, 7, 1, 3, 7, 1, 3, 5];
  s   int := 0;
  i   int;
begin
  if d !~ '^\d{10}$' then return false; end if;
  for i in 1..9 loop s := s + substr(d, i, 1)::int * w[i]; end loop;
  s := s + (substr(d, 9, 1)::int * 5) / 10;
  return (10 - s % 10) % 10 = substr(d, 10, 1)::int;
end;
$$;
revoke all on function public.myr_biz_no_valid(text) from public, anon, authenticated;

-- 예금주 비교용 — 공백 · (주) · ㈜ · 주식회사 를 빼고 비교
create or replace function public.myr_holder_key(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(regexp_replace(coalesce(p, ''), '\(주\)|㈜|주식회사', '', 'g'), '\s', '', 'g'))
$$;
revoke all on function public.myr_holder_key(text) from public, anon, authenticated;

create or replace function public.myr_settle_info_json(s public.sellers)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'company', s.tax_info ->> 'company',
    'ceo', s.tax_info ->> 'ceo',
    'biz_no_masked', case when s.biz_no ~ '^\d{10}$' then '***-**-' || right(s.biz_no, 5) end,
    'has_biz_no', coalesce(s.biz_no ~ '^\d{10}$', false),
    'bank', s.bank_info ->> 'bank',
    'holder', s.bank_info ->> 'holder',
    'account_masked', case when coalesce(s.bank_info ->> 'account', '') <> '' then '****' || right(s.bank_info ->> 'account', 4) end,
    'has_account', coalesce(s.bank_info ->> 'account', '') <> '',
    'tax_email', coalesce(s.email, (select u.email from auth.users u where u.id = s.user_id)),
    'status', s.myr_settle_status,
    'note', case when s.myr_settle_status = 'rejected' then s.myr_settle_note end,
    'submitted_at', s.myr_settle_submitted_at,
    'checked_at', s.myr_settle_checked_at)
$$;
revoke all on function public.myr_settle_info_json(public.sellers) from public, anon, authenticated;
grant execute on function public.myr_settle_info_json(public.sellers) to service_role;

create or replace function public.myr_app_seller_settle_info_of_user(p_user uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select public.myr_settle_info_json(s) from public.sellers s where s.user_id = p_user and p_user is not null
$$;
revoke all on function public.myr_app_seller_settle_info_of_user(uuid) from public, anon, authenticated;
grant execute on function public.myr_app_seller_settle_info_of_user(uuid) to service_role;

create or replace function public.myr_app_seller_settle_info_save(p_user uuid, p_company text, p_ceo text, p_biz_no text, p_bank text, p_account text, p_holder text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  s         public.sellers%rowtype;
  v_company text := btrim(coalesce(p_company, ''));
  v_ceo     text := btrim(coalesce(p_ceo, ''));
  v_bank    text := btrim(coalesce(p_bank, ''));
  v_holder  text := btrim(coalesce(p_holder, ''));
  v_biz     text;
  v_account text;
  v_status  text;
  v_recheck boolean;
begin
  select * into s from public.sellers where user_id = p_user and p_user is not null for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  -- null 이면 저장된 값(가린 값만 가진 화면이 다시 입력하지 않아도 되게)
  v_biz := case when p_biz_no is null then s.biz_no else regexp_replace(p_biz_no, '[^0-9]', '', 'g') end;
  v_account := case when p_account is null then s.bank_info ->> 'account' else regexp_replace(p_account, '[^0-9]', '', 'g') end;

  if char_length(v_company) not between 1 and 50 then return jsonb_build_object('ok', false, 'code', 'BAD_COMPANY'); end if;
  if char_length(v_ceo) not between 1 and 30 then return jsonb_build_object('ok', false, 'code', 'BAD_CEO'); end if;
  if not public.myr_biz_no_valid(v_biz) then return jsonb_build_object('ok', false, 'code', 'BAD_BIZ_NO'); end if;
  if char_length(v_bank) not between 1 and 20 then return jsonb_build_object('ok', false, 'code', 'BAD_BANK'); end if;
  if coalesce(v_account, '') !~ '^\d{8,16}$' then return jsonb_build_object('ok', false, 'code', 'BAD_ACCOUNT'); end if;
  if char_length(v_holder) not between 1 and 50 then return jsonb_build_object('ok', false, 'code', 'BAD_HOLDER'); end if;
  if public.myr_holder_key(v_holder) not in (public.myr_holder_key(v_company), public.myr_holder_key(v_ceo)) then
    return jsonb_build_object('ok', false, 'code', 'HOLDER_MISMATCH');
  end if;

  -- 다시 확인: 계좌 · 사업자번호 · 대표자가 바뀌면. 상호만 바뀌면 확인 완료 그대로
  v_recheck := s.myr_settle_status <> 'verified'
            or v_biz is distinct from s.biz_no
            or v_ceo is distinct from (s.tax_info ->> 'ceo')
            or v_bank is distinct from (s.bank_info ->> 'bank')
            or v_account is distinct from (s.bank_info ->> 'account')
            or v_holder is distinct from (s.bank_info ->> 'holder');
  v_status := case when v_recheck then 'pending' else s.myr_settle_status end;

  update public.sellers
     set biz_no = v_biz,
         tax_info = coalesce(tax_info, '{}'::jsonb) || jsonb_build_object('company', v_company, 'ceo', v_ceo),
         bank_info = jsonb_build_object('bank', v_bank, 'account', v_account, 'holder', v_holder),
         settle_type = 'biz',
         myr_settle_status = v_status,
         myr_settle_note = case when v_recheck then null else myr_settle_note end,
         myr_settle_submitted_at = case when v_recheck then now() else myr_settle_submitted_at end,
         myr_settle_checked_at = case when v_recheck then null else myr_settle_checked_at end,
         myr_settle_checked_by = case when v_recheck then null else myr_settle_checked_by end
   where id = s.id
  returning * into s;
  return jsonb_build_object('ok', true, 'recheck', v_recheck, 'info', public.myr_settle_info_json(s));
end;
$$;
revoke all on function public.myr_app_seller_settle_info_save(uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.myr_app_seller_settle_info_save(uuid, text, text, text, text, text, text) to service_role;

-- 운영 — 원문(확인용). 확인 중이 먼저 · 오래 기다린 순
create or replace function public.myr_app_admin_settle_infos(p_status text default 'pending')
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'seller_id', s.id, 'name', s.name, 'handle', s.handle, 'status', s.myr_settle_status,
           'company', s.tax_info ->> 'company', 'ceo', s.tax_info ->> 'ceo', 'biz_no', s.biz_no,
           'bank', s.bank_info ->> 'bank', 'account', s.bank_info ->> 'account', 'holder', s.bank_info ->> 'holder',
           'tax_email', coalesce(s.email, (select u.email from auth.users u where u.id = s.user_id)),
           'note', s.myr_settle_note, 'submitted_at', s.myr_settle_submitted_at, 'checked_at', s.myr_settle_checked_at)
         order by (s.myr_settle_status = 'pending') desc, s.myr_settle_submitted_at nulls last), '[]'::jsonb)
    from public.sellers s
   where s.user_id is not null
     and case when p_status is null then s.myr_settle_status <> 'none' else s.myr_settle_status = p_status end
$$;
revoke all on function public.myr_app_admin_settle_infos(text) from public, anon, authenticated;
grant execute on function public.myr_app_admin_settle_infos(text) to service_role;

create or replace function public.myr_app_admin_settle_info_check(p_seller uuid, p_decision text, p_note text default null, p_admin uuid default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  s          public.sellers%rowtype;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_decision not in ('verify', 'reject') then return jsonb_build_object('ok', false, 'code', 'BAD_DECISION'); end if;
  select * into s from public.sellers where id = p_seller for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_decision = 'verify' and s.myr_settle_status <> 'pending' then return jsonb_build_object('ok', false, 'code', 'NOT_PENDING', 'status', s.myr_settle_status); end if;
  if v_decision = 'reject' and s.myr_settle_status not in ('pending', 'verified') then return jsonb_build_object('ok', false, 'code', 'NOT_PENDING', 'status', s.myr_settle_status); end if;
  if v_decision = 'reject' and (v_note is null or char_length(v_note) > 300) then return jsonb_build_object('ok', false, 'code', 'NOTE_REQUIRED'); end if;
  update public.sellers
     set myr_settle_status = case v_decision when 'verify' then 'verified' else 'rejected' end,
         myr_settle_note = case v_decision when 'reject' then v_note else null end,
         myr_settle_checked_at = now(),
         myr_settle_checked_by = p_admin
   where id = s.id;
  return jsonb_build_object('ok', true, 'status', case v_decision when 'verify' then 'verified' else 'rejected' end);
end;
$$;
revoke all on function public.myr_app_admin_settle_info_check(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.myr_app_admin_settle_info_check(uuid, text, text, uuid) to service_role;

-- ------------------------------------------------------------
-- 프로필 사진(9번) — 내 정보에서만 바꾼다
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('myr-avatars', 'myr-avatars', true, 4194304, array['image/jpeg','image/png','image/webp'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.myr_app_seller_avatar_set(p_user uuid, p_url text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  s      public.sellers%rowtype;
  v_prev text;
  v_url  text := nullif(btrim(coalesce(p_url, '')), '');
begin
  select * into s from public.sellers where user_id = p_user and p_user is not null for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_url is not null and v_url !~ ('^https?://[^/]+/storage/v1/object/public/myr-avatars/' || s.id::text || '/[A-Za-z0-9-]{8,64}\.(jpg|png|webp)$') then
    return jsonb_build_object('ok', false, 'code', 'BAD_URL');
  end if;
  v_prev := s.avatar_url;
  update public.sellers set avatar_url = v_url where id = s.id;
  return jsonb_build_object('ok', true, 'avatar_url', v_url, 'previous', v_prev);
end;
$$;
revoke all on function public.myr_app_seller_avatar_set(uuid, text) from public, anon, authenticated;
grant execute on function public.myr_app_seller_avatar_set(uuid, text) to service_role;
