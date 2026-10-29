## 무엇을 바꿨나

<!-- 한두 줄. 화면/기능 이름으로. 예: 고객 문의를 브랜드사로 바로 연결 -->

## 왜

<!-- 어떤 문제나 요청에서 나온 변경인지. 관련 이슈가 있으면 #번호 -->

## 확인한 것

- [ ] `npm run check` 통과 (앱 4개 svelte-check 0 errors)
- [ ] `npm run build` 통과 (CI · Vercel 과 같은 빌드)
- [ ] 브라우저에서 직접 눌러봄 (인플루언서 `/influencer` · 브랜드 `/brand` · 관리자 `/admin` · 고객 `/shop` 중 해당 화면) · 콘솔 에러 없음
- [ ] 데이터 구조를 바꿨다면 `packages/core/src/constants.ts` 의 `LS = 'sellery-proto-vNN'` 버전을 올렸음
- [ ] 기존 방문자가 "데이터 초기화" 없이 들어와도 화면이 깨지지 않음
- [ ] 수수료 · 등급 · 기간 · 샘플 · 포인트 숫자를 바꿨다면 `docs/`의 해당 정책 문서도 같이 고쳤음
- [ ] 상태를 바꾸는 코드는 `packages/core/src/actions.ts` 에만 넣었음 (렌더 중 상태 쓰기 금지)

### 백엔드를 건드렸다면 (`packages/db` · `packages/payments` · `*/lib/server` · `*/routes/api` · `supabase/migrations` — CLAUDE.md "백엔드 변경 원칙")

- [ ] 돈·판정 로직(정산 · 순매출 · 수수료 · 등급 · 환불)을 바꿨다면 **그 판정을 쓰는 곳 전부**를 아래 표에 적었음 (화면 · 기준 · 호출 코드)
- [ ] 같은 판정·계산을 새로 쓰지 않고 기존 함수/RPC 를 호출했음 — SQL 로 재현한 계산 없음
- [ ] 계산 결과가 바뀌면 안 되는 변경이면 "계산 결과 불변" 과 근거(테스트 · 전후 비교)를 적었음
- [ ] 전체 순회·배치 경로(CSV · 크론 · 정산 실행)를 바꿨다면 운영 규모 시드로 전후 시간·메모리를 적었음
- [ ] 권한(actor)은 서버 세션에서만 정했고, 새 `security definer` RPC 는 본문에서 권한을 검사하며 anon·authenticated EXECUTE 를 회수했음
- [ ] **테스트를 같이 썼고 돌렸음** — 순수 규칙·매핑은 vitest(`npm test`), 마이그레이션의 RPC·권한·상태 전이는 pgTAP(`npm run test:db`). 결과(통과 수)를 아래에 적음 (docs/testing.md)

| 사용처(화면·Job) | 판정 기준 | 호출 코드 |
|---|---|---|
| | | |

## 화면

<!-- 눈에 보이는 변경이면 스크린샷. Vercel 미리보기 URL이 PR 댓글로 달리면 거기서 확인 -->
