/** MYR 운영사 정보 — 셀러리와 같은 (주)위글로우(packages/db/src/company.ts 와 같은 값 · MYR 은 셀러리 패키지를 import 하지 않아 복사). 메일 푸터 · 통신판매중개자 고지.
 *  두 파일의 값이 다르면 CI 가 실패한다(scripts/check-boundaries.mjs "운영사 정보") — 한쪽만 바꾸면 막힌다 */
export const COMPANY = {
	name: '(주)위글로우',
	ceo: '강신욱',
	bizNo: '517-86-00666',
	mailOrderNo: '제2022-서울강남-00726호',
	address: '서울시 성동구 왕십리로 38(홍성빌딩), 3층',
	email: 'official@weglow.biz',
	csUrl: 'mailto:official@weglow.biz'
} as const;
