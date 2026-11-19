/**
 * 토스페이먼츠 지급대행 — 서버 기본 인스턴스(키는 앱 `$lib/server/env.ts` 의 configureMyrCore 값 · TOSS_PAYOUT_SECRET_KEY · TOSS_PAYOUT_SECURITY_KEY).
 * 호출 코드 · 반환 모양은 순수 모듈 `toss-payouts-client.ts`(createTossPayouts). 키는 호출할 때마다 읽는다(앱이 나중에 넣어도 된다).
 */
import { createTossPayouts, type TossPayoutsApi } from '../toss-payouts-client';
import { myrConfig } from './config.server';

export { createTossPayouts, isUncertainPayout } from '../toss-payouts-client';
export type { TossBalance, TossPayoutError, TossPayoutResult, TossPayoutsApi } from '../toss-payouts-client';

/** 지급대행 키가 둘 다 들어 있는지 — 화면 · 크론이 "연동 꺼짐" 을 가를 때 */
export const hasTossPayouts = (): boolean => !!myrConfig().tossPayoutSecretKey && !!myrConfig().tossPayoutSecurityKey;

const api = createTossPayouts({ keys: () => ({ secretKey: myrConfig().tossPayoutSecretKey, securityKey: myrConfig().tossPayoutSecurityKey }) });
export const registerTossSeller: TossPayoutsApi['registerSeller'] = (b) => api.registerSeller(b);
export const updateTossSeller: TossPayoutsApi['updateSeller'] = (id, b) => api.updateSeller(id, b);
export const deleteTossSeller: TossPayoutsApi['deleteSeller'] = (id) => api.deleteSeller(id);
export const getTossSeller: TossPayoutsApi['getSeller'] = (id) => api.getSeller(id);
export const listTossSellers: TossPayoutsApi['listSellers'] = (o) => api.listSellers(o);
export const getTossBalance: TossPayoutsApi['getBalance'] = () => api.getBalance();
export const requestTossPayouts: TossPayoutsApi['requestPayouts'] = (items, o) => api.requestPayouts(items, o);
export const cancelTossPayout: TossPayoutsApi['cancelPayout'] = (id) => api.cancelPayout(id);
export const getTossPayout: TossPayoutsApi['getPayout'] = (id) => api.getPayout(id);
