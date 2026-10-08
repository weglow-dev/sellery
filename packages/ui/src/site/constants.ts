/** 사이트 컴포넌트 공용 문구 상수 (web campaign-card.tsx · cs-modal.tsx 원문) */

/*
 * `NOTIFY_TOAST`('오픈 알림 신청 완료 — 판매 시작 시 카카오 알림톡으로 안내') 는 2026-10-08 에 제거했다.
 * 신청을 저장하는 테이블도, 발송 경로도 없이 토스트만 띄우고 있었다 — "신청 완료" 라고 말했지만
 * DB 에 한 줄도 남지 않았고 발송 대상이 아예 존재하지 않았다.
 *
 * **같은 날 실제로 구현했다(0043)** — `campaign_alerts` 테이블 + `app_campaign_alert_*` RPC +
 * `campaignOpenMail` 템플릿 + 틱 발송 훅. 문구·버튼 상태는 `@sellery/db/campaign-alerts` 의
 * `alertButtonView` · `ALERT_MESSAGES` 가 갖는다(이 파일이 아니다 — 서버 판정과 같은 모듈에 두어야
 * 상태와 문구가 어긋나지 않는다).
 *
 * 채널은 **이메일**(2026-09-22 · docs/launch-checklist.md §5 결정 3 · Resend)이고 이메일이 등록된
 * 회원만 신청할 수 있다. 카카오 알림톡은 발신 프로필·템플릿 심사·대행사 계약이 필요해 보류 상태다 —
 * **추후 도입 가능성이 있다**(도입하면 발송 경로만 늘리고 신청·수신거부는 그대로 쓴다).
 */

/** 프로토타입 CS_TYPES 원문 (js/02-state.js L341) */
export const CS_TYPES = ['배송 문의', '교환·반품', '상품 문의', '기타'] as const;

/** 인증 정보 로드 실패 토스트 (web verify-modal.tsx) */
export const VERIFY_LOAD_FAIL = '인증 정보를 불러오지 못했어요';
