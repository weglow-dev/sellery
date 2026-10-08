/** 사이트 컴포넌트 공용 문구 상수 (web campaign-card.tsx · cs-modal.tsx 원문) */

/*
 * `NOTIFY_TOAST`('오픈 알림 신청 완료 — 판매 시작 시 카카오 알림톡으로 안내') 는 2026-10-08 에 제거했다.
 *
 * 신청을 저장하는 테이블도, 발송 경로도 없이 토스트만 띄우고 있었다 — 고객에게 "신청 완료" 라고
 * 말했지만 DB 에 한 줄도 남지 않았고 발송 대상이 아예 존재하지 않았다. 쓰던 곳은 `CampaignCard`(홈 카드)와
 * `store/BuyCta`(판매 페이지 CTA) 둘이고, 지금은 각각 "판매 페이지" 링크와 "{날짜} 오픈 예정"(비활성)이다.
 *
 * 되살리려면 ① 신청 테이블(`campaign_alerts` — docs/app-plan.md §13 슬라이스 5 에 예정) ②
 * `SCHEDULE_CONFIRMED → LIVE` 틱(`app_campaign_tick`)에 붙는 발송 훅이 함께 필요하다.
 * 채널은 **이메일**이 결정값이고(2026-09-22 · docs/launch-checklist.md §5 결정 3 · Resend),
 * 카카오 알림톡은 발신 프로필·템플릿 심사·대행사 계약이 필요해 보류 상태다 — **추후 도입 가능성이 있다.**
 */

/** 프로토타입 CS_TYPES 원문 (js/02-state.js L341) */
export const CS_TYPES = ['배송 문의', '교환·반품', '상품 문의', '기타'] as const;

/** 인증 정보 로드 실패 토스트 (web verify-modal.tsx) */
export const VERIFY_LOAD_FAIL = '인증 정보를 불러오지 못했어요';
