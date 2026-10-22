-- 0055 크리에이터 아웃리치 (관리자 콘솔 "아웃리치" 탭 · 대표 요청 2026-10-22)
-- MYR(Make Your Recipe) 인플루언서 브랜드 제조의뢰(sellery.life/influencer/oem)를 제안할 인스타그램 크리에이터 **후보 큐**.
--   · 발굴은 반자동(수동 입력 · CSV 가져오기 · 2단계에서 그래프 API 해시태그/비즈니스 디스커버리), **DM 발송은 사람이 한다**
--     (콜드 DM 자동 발송은 메타 약관·정보통신망법 위반 — docs/admin-console-plan.md "아웃리치").
--   · 관리자(service_role) 전용 — anon/authenticated 접근 없음.
create table if not exists public.outreach_creators (
  id               uuid primary key default gen_random_uuid(),
  handle           text not null unique,                         -- '@' 없이 소문자 (outreach-rules normalizeHandle)
  ig_user_id       text,                                         -- 그래프 API 수집 시 (2단계)
  name             text,
  platform         text not null default 'instagram' check (platform in ('instagram','youtube','tiktok','naver')),
  followers        integer check (followers is null or followers >= 0),
  media_count      integer,
  engagement_rate  numeric(6,4),                                  -- 최근 게시물 (좋아요+댓글)/팔로워 (0.0312 = 3.12%)
  trend            text check (trend is null or trend in ('up','flat','down')),   -- 1년 반응 추세
  category         text,
  bio              text,
  audience         jsonb,                                        -- {female_pct, age_20_40_pct, kr_pct, source} — 분석사 추정/수동
  score            numeric(5,2),                                 -- outreach-rules outreachScore (적합 조건 충족 수 기반)
  status           text not null default 'candidate'
                     check (status in ('candidate','queued','sent','replied','meeting','joined','declined','excluded')),
  source           text not null default 'manual' check (source in ('manual','csv','hashtag','discovery')),
  note             text,
  dm_draft         text,
  sent_at          timestamptz,
  replied_at       timestamptz,
  assigned_to      text,                                         -- 담당 운영자 이메일
  last_checked_at  timestamptz,                                  -- 지표 갱신 시각
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.outreach_creators is '크리에이터 아웃리치 후보 큐 (0055) — 관리자 콘솔 /admin/outreach';
create index if not exists outreach_creators_status_idx on public.outreach_creators (status, score desc nulls last, updated_at desc);
drop trigger if exists outreach_creators_updated_at on public.outreach_creators;
create trigger outreach_creators_updated_at before update on public.outreach_creators
  for each row execute function public.set_updated_at();

create table if not exists public.outreach_events (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references public.outreach_creators (id) on delete cascade,
  kind        text not null check (kind in ('collected','status','note','dm_sent','reply','edit')),
  body        text,
  actor       text,                                              -- 운영자 이메일 · 'system'
  created_at  timestamptz not null default now()
);
create index if not exists outreach_events_creator_idx on public.outreach_events (creator_id, created_at desc);

alter table public.outreach_creators enable row level security;
alter table public.outreach_events   enable row level security;
revoke all on public.outreach_creators from anon, authenticated;
revoke all on public.outreach_events   from anon, authenticated;
grant select, insert, update, delete on public.outreach_creators to service_role;
grant select, insert, update, delete on public.outreach_events   to service_role;
