-- 0128 아웃리치 메타 연결 (관리자 콘솔 "아웃리치" → [Instagram 연결] 버튼 · 2026-11-26)
-- 메타 앱 검수(instagram_basic · instagram_creator_marketplace_discovery)가 두 번 "스크린캐스트가 엔드투엔드를 보여주지 못함"으로 거부됐다
-- (2026-11-05 · 2026-11-26). 로그인·권한 부여가 우리 앱 밖(그래프 API 탐색기)에서 일어났기 때문 — 콘솔 안에서 Facebook 로그인으로
-- Instagram 비즈니스 계정을 연결하고, 그 연결로 크리에이터 마켓플레이스를 조회하게 한다.
--   · 한 줄만 둔다(slot = 'outreach') — 연결 계정은 브랜드 계정 하나.
--   · 페이지 액세스 토큰은 앱 서버가 AES-256-GCM 으로 암호화한 값(token_enc)만 넣는다 — 키는 서버 환경변수에서 유도, DB 에는 평문이 없다.
--   · 관리자(service_role) 전용 — anon/authenticated 접근 없음(0055 outreach_creators 와 같은 방식). RPC 없음(앱 서버가 service_role 로 직접 읽고 쓴다).
create table if not exists public.outreach_meta_connection (
  slot          text primary key default 'outreach' check (slot = 'outreach'),
  page_id       text not null,                       -- 연결된 Facebook 페이지 id
  page_name     text,
  ig_user_id    text not null,                       -- 그 페이지의 Instagram 비즈니스 계정 id (17841…)
  ig_username   text,
  token_enc     text not null,                       -- 'v1.<iv>.<ciphertext+tag>' (base64url) — 평문 토큰 금지
  scopes        text[] not null default '{}',        -- 부여된 권한(debug_token)
  connected_by  text,                                -- 연결한 운영자 이메일
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint outreach_meta_connection_token_enc_format check (token_enc like 'v1.%')
);
comment on table public.outreach_meta_connection is '아웃리치 메타(Instagram) 연결 한 줄 (0128) — 관리자 콘솔 /admin/outreach · 토큰은 암호문만';
drop trigger if exists outreach_meta_connection_updated_at on public.outreach_meta_connection;
create trigger outreach_meta_connection_updated_at before update on public.outreach_meta_connection
  for each row execute function public.set_updated_at();

alter table public.outreach_meta_connection enable row level security;
revoke all on public.outreach_meta_connection from anon, authenticated;
grant select, insert, update, delete on public.outreach_meta_connection to service_role;
