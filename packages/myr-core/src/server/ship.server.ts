/**
 * 발송 처리 — 0069 `myr_app_admin_ship` (service role) → 새로 기록했을 때만 고객 배송 시작 메일.
 *   shipOrder(input)             운영 API `/api/ops/ship`(S8 스크립트) · 나중에 myr-admin 주문 화면이 같은 함수를 복사·호출한다.
 *   listShipOrders(limit, shipped)  발송 대기(기본) / 발송된 주문 목록 — 수취인 이름까지만(주소는 싣지 않는다).
 * 권한은 라우트가 정한다(크론 시크릿 · 나중엔 관리자 세션). 여기서는 actor 를 받지 않는다.
 */
import { parseShipResult, parseShipRows, type ShipInput, type ShipResult, type ShipRow } from '../ship-rules';
import { admin } from './admin.server';
import { notifyOrderShipped } from './mail-events.server';

export async function shipOrder(input: ShipInput): Promise<ShipResult> {
	const { data, error } = await admin().rpc('myr_app_admin_ship', { p_order_code: input.orderCode, p_courier: input.courier, p_tracking_no: input.trackingNo });
	if (error) {
		console.error('[ship] myr_app_admin_ship failed:', error.message);
		return { ok: false, code: 'DB_ERROR' };
	}
	const res = parseShipResult(data);
	// 정정(다른 운송장으로 다시)도 새 기록이라 메일을 다시 보낸다 — 멱등 키가 운송장을 포함해 같은 운송장으로는 한 번만
	if (res.ok && !res.already) await notifyOrderShipped(res.orderId, { courier: res.courier, trackingNo: res.trackingNo });
	return res;
}

export async function listShipOrders(limit = 100, shipped = false): Promise<ShipRow[]> {
	const { data, error } = await admin().rpc('myr_app_admin_ship_pending', { p_limit: limit, p_shipped: shipped });
	if (error) throw new Error(`myr_app_admin_ship_pending failed: ${error.message}`);
	return parseShipRows(data);
}
