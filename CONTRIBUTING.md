# 수정하고 올리는 법

glo(`weglow-glo/glo-us`)와 같은 방식입니다. **main에 직접 올리지 않고, 브랜치 → PR → 병합** 순서로 갑니다.

## 0. 처음 한 번만

```bash
git clone https://github.com/weglow-glo/sellery.git sellery
cd sellery
```

빌드도 설치도 없습니다. `index.html`을 브라우저로 열면 그대로 돕니다.
(파일을 더블클릭해도 되지만, 로그인·링크 흐름까지 보려면 로컬 서버로 여는 게 정확합니다.)

```bash
python -m http.server 8000
```

→ http://localhost:8000

## 1. 수정할 때

```bash
git switch main
git pull
git switch -c fix/cart-button
```

브랜치 이름은 `fix/…`(고치기), `feat/…`(새 기능), `copy/…`(문구), `docs/…` 정도로 씁니다.

고칠 파일은 사실상 셋뿐입니다.

| 파일 | 무엇 |
|---|---|
| `index.html` | 인플루언서·브랜드·관리자·고객 4개 센터 전부 (단일 파일) |
| `login.html` | 로그인 / 가입 / 구글 로그인 |
| `assets/` | 아바타 SVG, 상품 이미지 |

## 2. 올리기 전에

```bash
node scripts/check.mjs
```

인라인 스크립트 문법, 시드 키, 화면 함수, 자산 경로를 확인합니다. 여기서 걸리면 배포해도 화면이 깨집니다.

**데이터 구조(상품·캠페인·주문 필드)를 바꿨다면** `index.html`의 `const LS='sellery-proto-vNN'` 숫자를 하나 올려주세요. 안 올리면 기존 방문자의 localStorage에 옛 데이터가 남아 화면이 깨집니다.

## 3. PR 올리기

```bash
git add -A
git commit -m "고객 문의를 브랜드사로 바로 연결"
git push -u origin fix/cart-button
gh pr create --fill
```

`gh`가 없으면 push 후 GitHub이 띄워주는 "Compare & pull request" 버튼을 누르면 됩니다.

CI(`node scripts/check.mjs`)가 자동으로 돌고, 초록불이면 병합합니다.

```bash
gh pr merge --squash --delete-branch
```

## 4. 배포

main에 병합되면 GitHub Pages가 자동으로 올립니다.
→ https://weglow-glo.github.io/sellery/

## Claude에게 시키기

PR이나 이슈 본문/댓글에 `@claude` 를 쓰면 Claude가 읽고 답하거나 직접 고쳐서 커밋합니다.
(저장소 Settings → Secrets에 `ANTHROPIC_API_KEY` 가 등록돼 있어야 동작합니다.)

```
@claude 브랜드 센터 정산 탭에서 원천징수 계산이 주문 취소분을 빼지 않는 것 같아. 확인해줘.
```

## 커밋 메시지

한글로, 무엇이 달라졌는지 한 줄. 파일명이 아니라 화면·기능 이름으로 씁니다.

- 좋음: `플래티넘이 잡은 기간은 상위 등급만 진입하도록 변경`
- 나쁨: `index.html 수정`
