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

## 화면

<!-- 눈에 보이는 변경이면 스크린샷. Vercel 미리보기 URL이 PR 댓글로 달리면 거기서 확인 -->
