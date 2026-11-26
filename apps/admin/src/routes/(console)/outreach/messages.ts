import type { MetaConnectFailCode } from '@sellery/db/admin/meta-connect';

/** `/outreach?msg=<key>` 안내 문구 — 목록 page 와 `meta/callback` 이 같이 쓴다 */
export const OUTREACH_MSG: Record<string, string> = {
  added: '후보를 추가했어요',
  imported: '가져오기 완료',
  status: '상태를 바꿨어요',
  collected: '조건으로 수집 완료',
  not_configured: '수집 설정이 없어요 — 위의 [Instagram 연결] 로 메타 계정을 연결하거나, Vercel sellery-admin 에 MODASH_API_KEY 를 넣으면 버튼이 켜져요',
  provider_error: '제공사 응답 오류',
  err: '처리하지 못했어요 — 입력을 확인해주세요',
  meta_connected: 'Instagram 계정을 연결했어요',
  meta_disconnected: 'Instagram 연결을 해제했어요',
  meta_denied: 'Facebook 로그인 창에서 취소했어요 — 연결하지 않았습니다',
  meta_state: '로그인 요청을 확인하지 못했어요(시간 초과 또는 다른 창에서 시작) — [Instagram 연결] 을 다시 눌러주세요',
  meta_not_configured: 'Instagram 연결 설정이 없어요 — Vercel sellery-admin 에 META_APP_ID + META_APP_SECRET 을 넣어주세요',
  meta_exchange: 'Facebook 로그인 처리에 실패했어요',
  meta_no_instagram: '선택한 페이지에 Instagram 비즈니스 계정이 연결돼 있지 않아요 — 로그인 창에서 페이지와 Instagram 계정을 함께 선택해주세요',
  meta_need_choice: 'Instagram 계정이 여러 개 선택됐어요 — 로그인 창에서 연결할 계정 하나만 선택해주세요',
  meta_token_invalid: '받은 토큰을 확인하지 못했어요 — 다시 시도해주세요',
  meta_missing_scope: '필수 권한이 빠졌어요 — 로그인 창에서 요청한 권한을 모두 허용해주세요',
  meta_save: '연결을 저장하지 못했어요'
};

/** 연결 실패 코드 → 안내 키 */
export const META_FAIL_MSG: Record<MetaConnectFailCode, string> = {
  NOT_CONFIGURED: 'meta_not_configured',
  EXCHANGE_FAILED: 'meta_exchange',
  NO_INSTAGRAM: 'meta_no_instagram',
  NEED_CHOICE: 'meta_need_choice',
  TOKEN_INVALID: 'meta_token_invalid',
  MISSING_SCOPE: 'meta_missing_scope',
  SAVE_FAILED: 'meta_save'
};
