import type { MetaConnectFailCode } from '@sellery/db/admin/meta-connect';

/** 연결 실패 코드 → 안내 키. 문구는 `$lib/outreach-text` 의 `msg`(한국어 · 영어) — 목록 page 가 `?msg=<key>` 로 받아 그린다 */
export const META_FAIL_MSG: Record<MetaConnectFailCode, string> = {
  NOT_CONFIGURED: 'meta_not_configured',
  EXCHANGE_FAILED: 'meta_exchange',
  NO_INSTAGRAM: 'meta_no_instagram',
  NEED_CHOICE: 'meta_need_choice',
  TOKEN_INVALID: 'meta_token_invalid',
  MISSING_SCOPE: 'meta_missing_scope',
  SAVE_FAILED: 'meta_save'
};
