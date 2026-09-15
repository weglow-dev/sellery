-- ============================================================
-- 0007 — service_role 권한 부여 (앱 서버가 RLS 를 우회해 읽고 쓰기 위한 테이블 권한)
--
-- Supabase 프로젝트를 만들 때 "Automatically expose new tables" 를 껐다(권한을
-- 마이그레이션에서 명시적으로 관리하기 위해). 그 설정은 anon/authenticated 뿐 아니라
-- service_role 에도 새 테이블의 기본 권한을 주지 않는다. service_role 은 RLS 는
-- 우회하지만 테이블 권한(GRANT)은 필요하므로, 0001~0006 으로 만든 객체 전부와
-- 앞으로 postgres 가 만들 객체에 대해 service_role 에 전체 권한을 준다.
--
-- anon / authenticated 의 권한은 건드리지 않는다 (0001~0006 의 컬럼 단위 grant 유지).
-- 멱등: 여러 번 실행해도 같은 결과.
-- ============================================================

grant usage on schema public to service_role;

grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute        on all functions in schema public to service_role;

-- 앞으로 postgres(마이그레이션 실행 롤)가 만드는 객체에도 자동 적용
alter default privileges for role postgres in schema public grant all privileges on tables    to service_role;
alter default privileges for role postgres in schema public grant all privileges on sequences to service_role;
alter default privileges for role postgres in schema public grant execute        on functions to service_role;
