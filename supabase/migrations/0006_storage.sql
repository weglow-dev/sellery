-- ============================================================
-- 0006 — Storage 버킷 (아바타·로고·상품 이미지 = 공개 / 사업자등록증 사본 = 비공개)
--
-- 원본: 프로토타입은 파일을 data-URI(logo, img, thumb, imgs — L1224, L1241, L3824, L3842, L4010) 또는 파일명
--       (settleInfo.bizDoc — L3982-3990) 으로 localStorage 에 두었다. 실서비스는 Supabase Storage.
-- 실행: 0005 이후. 재실행 가능 (glo 0008 의 storage.buckets upsert 관례).
--
-- 규칙:
--   · public-assets : 공개 읽기. brands.logo_url / sellers.avatar_url / products.thumb_url·image_urls 의 대상.
--                     업로드는 서버(service role)가 서명 URL 로만 — storage.objects 에 anon/authenticated 정책을 두지 않는다.
--   · partner-docs  : 비공개. sellers.biz_doc_url / brands.biz_doc_url 에는 **object path 만** 저장한다(공개 URL 금지).
--                     열람은 관리자 심사 화면에서 서버가 발급한 단기 서명 URL 로만. 테이블 RLS 로 컬럼을 막아도 파일이
--                     공개 버킷에 있으면 경로 유출만으로 열리므로 버킷 자체를 비공개로 둔다.
--   · 두 버킷 모두 storage.objects 정책 없음 → 클라이언트 키로는 목록·다운로드·업로드 불가 (public-assets 는 공개 URL 로만 읽힘).
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'public-assets', 'public-assets', true, 10485760,   -- 10MB
    array['image/jpeg','image/png','image/webp','image/gif','image/svg+xml']
  )
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'partner-docs', 'partner-docs', false, 20971520,    -- 20MB (사업자등록증 image/pdf — bizDocPick accept L3985)
    array['image/jpeg','image/png','image/webp','application/pdf']
  )
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
