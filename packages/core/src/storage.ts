/* ============ 데이터 어댑터 ============
   앱은 이 인터페이스만 본다. 지금은 localStorage 구현(프로토타입).
   Supabase 구현은 같은 시그니처로 ./supabase.ts 에서 제공 예정 — 스키마는 supabase/migrations 참고. */
import type { Cust, CartItem, Data, Session } from './types';
import { LS, LINKCTX_KEY, CUST_KEY, CART_KEY, SESSION_KEY } from './constants';

export interface Storage {
	loadData(): Data | null;
	saveData(d: Data): void;
	clearData(): void;
	get<T>(key: string): T | null;
	set(key: string, v: unknown | null): void;
}

const hasLS = () => typeof localStorage !== 'undefined';

export const localStore: Storage = {
	loadData() { try { const raw = hasLS() ? localStorage.getItem(LS) : null; return raw ? (JSON.parse(raw) as Data) : null; } catch { return null; } },
	saveData(d) { try { if (hasLS()) localStorage.setItem(LS, JSON.stringify(d)); } catch { /* quota */ } },
	clearData() { try { if (hasLS()) localStorage.removeItem(LS); } catch { /* noop */ } },
	get(key) { try { const raw = hasLS() ? localStorage.getItem(key) : null; return raw ? JSON.parse(raw) : null; } catch { return null; } },
	set(key, v) { try { if (!hasLS()) return; if (v == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch { /* noop */ } }
};

let store: Storage = localStore;
export const getStore = () => store;
/** Supabase 등 다른 저장소로 교체하는 지점 */
export const setStore = (s: Storage) => { store = s; };

/* 키별 헬퍼 */
export const loadCust = () => { const v = store.get<Cust>(CUST_KEY); return v && v.id ? v : null; };
export const persistCust = (c: Cust | null) => store.set(CUST_KEY, c);
export const loadCart = () => { const v = store.get<CartItem[]>(CART_KEY); return Array.isArray(v) ? v : []; };
export const persistCart = (c: CartItem[]) => store.set(CART_KEY, c);
export const loadSession = () => { const v = store.get<Session>(SESSION_KEY); return v && v.role ? v : null; };
export const persistSession = (s: Session | null) => store.set(SESSION_KEY, s);
export const loadLinkCtxRaw = () => store.get<{ cid: string; at: string }>(LINKCTX_KEY);
export const persistLinkCtx = (v: { cid: string; at: string } | null) => store.set(LINKCTX_KEY, v);
