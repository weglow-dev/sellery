/**
 * 발주 · 송장 수집(0077 · docs/myr.md §6.8 E2 · E3) — 바인허브 OrderStatusToPreparing · OrderStatusToDeliveringOrDelivered 를 MYR 로.
 *   runEbutPrepare(now)     평일 11시 크론 — 오늘 11시(KST) 전 결제 주문의 결제완료 줄 → 이벗 등록 → 성공한 줄만 배송준비중 · 주문 단위 3회 재시도
 *   runEbutShipSync(now)    매일 18시 크론 — 이벗에 등록된 배송준비중 · 배송중 줄 → 송장 · 배송완료 · 새 송장이면 고객 배송 시작 메일 → 남은 배송준비중 지연 표시
 *   prepareManually(cutoff, dryRun)   이벗 연동 전 운영 수동 전환(운영 스크립트 `myr-ops.mjs prepare`) — 같은 대상 함수 · 이벗 등록 시각 없이
 * 이벗 키가 없으면 두 크론은 아무것도 하지 않고 { skipped: 'disabled' } — 판정 · 상태 전이는 전부 0077 RPC(백엔드 원칙 1).
 */
import { buildOrderList, groupByOrder, lineUpdatesFromStatus, parsePrepareLines, parseSyncLines, prepareCutoff, registeredItemIds, type PrepareLine } from '../ebut';
import { isCourier } from '../ship-rules';
import { admin } from './admin.server';
import { ebutConfig, ebutOrderStatus, ebutRegisterOrders } from './ebut.server';
import { notifyOrderShipped } from './mail-events.server';

const TRIES = 3;

async function prepareCandidates(cutoff: Date): Promise<PrepareLine[]> {
	const { data, error } = await admin().rpc('myr_app_admin_prepare_candidates', { p_cutoff: cutoff.toISOString() });
	if (error) throw new Error(`myr_app_admin_prepare_candidates failed: ${error.message}`);
	return parsePrepareLines(data);
}

async function markPrepared(itemIds: string[], ebut: boolean): Promise<{ count: number; orders: string[] }> {
	if (!itemIds.length) return { count: 0, orders: [] };
	const { data, error } = await admin().rpc('myr_app_admin_mark_prepared', { p_item_ids: itemIds, p_ebut: ebut });
	if (error) throw new Error(`myr_app_admin_mark_prepared failed: ${error.message}`);
	const r = (data ?? {}) as { count?: number; orders?: string[] };
	return { count: r.count ?? 0, orders: Array.isArray(r.orders) ? r.orders : [] };
}

export type PrepareRun = { skipped?: 'disabled'; candidates: number; registered: number; failedOrders: string[] };

export async function runEbutPrepare(now = new Date()): Promise<PrepareRun> {
	const cfg = ebutConfig();
	if (!cfg.ready) return { skipped: 'disabled', candidates: 0, registered: 0, failedOrders: [] };
	const lines = await prepareCandidates(prepareCutoff(now));
	let pending = groupByOrder(lines);
	let registered = 0;
	for (let t = 1; t <= TRIES && pending.size; t++) {
		const failed = new Map<string, PrepareLine[]>();
		for (const [orderId, orderLines] of pending) {
			try {
				const res = await ebutRegisterOrders(buildOrderList(orderLines, cfg));
				const ok = registeredItemIds(res).filter((id) => orderLines.some((l) => l.itemId === id));
				const marked = await markPrepared(ok, true);
				registered += marked.count;
				const left = orderLines.filter((l) => !ok.includes(l.itemId));
				if (left.length) failed.set(orderId, left);
			} catch (e) {
				console.error(`[ebut] prepare order ${orderId} try ${t} failed:`, e instanceof Error ? e.message : e);
				failed.set(orderId, orderLines);
			}
		}
		pending = failed;
	}
	const failedOrders = [...pending.values()].map((ls) => ls[0]?.orderCode ?? '');
	if (failedOrders.length) console.error(`[ebut] CRITICAL 결제완료 > 배송준비중 실패:\n${failedOrders.join('\n')}`);
	return { candidates: lines.length, registered, failedOrders };
}

export type ShipSyncRun = { skipped?: 'disabled'; checked: number; shipped: number; delivered: number; mailed: number; delayed: number; failedOrders: string[] };

export async function runEbutShipSync(now = new Date()): Promise<ShipSyncRun> {
	const cfg = ebutConfig();
	if (!cfg.ready) return { skipped: 'disabled', checked: 0, shipped: 0, delivered: 0, mailed: 0, delayed: 0, failedOrders: [] };
	const db = admin();
	const { data, error } = await db.rpc('myr_app_admin_ship_sync_candidates');
	if (error) throw new Error(`myr_app_admin_ship_sync_candidates failed: ${error.message}`);
	const all = parseSyncLines(data);
	const courier = cfg.courier && isCourier(cfg.courier) ? cfg.courier : null;
	let pending = groupByOrder(all);
	let shipped = 0;
	let delivered = 0;
	let mailed = 0;
	const mailedKeys = new Set<string>();
	for (let t = 1; t <= TRIES && pending.size; t++) {
		const failed = new Map<string, typeof all>();
		for (const [orderId, lines] of pending) {
			try {
				const status = await ebutOrderStatus(lines.map((l) => ({ orderCodeNo: l.itemId })));
				for (const u of lineUpdatesFromStatus(status, lines, now)) {
					const { data: r, error: e } = await db.rpc('myr_app_admin_ship_line', { p_item_id: u.itemId, p_courier: courier, p_tracking_no: u.trackingNo, p_delivered: u.delivered });
					if (e || !(r as { ok?: boolean })?.ok) throw new Error(`ship_line ${u.itemId}: ${e?.message ?? JSON.stringify(r)}`);
					const res = r as { newly_shipped?: boolean; order_id: string; tracking_no: string; ship_status: string };
					if (res.ship_status === 'DELIVERED' && u.delivered) delivered++;
					if (res.newly_shipped) {
						shipped++;
						// 같은 주문 · 같은 송장(한 박스)은 메일 한 통
						const key = `${res.order_id}:${res.tracking_no}`;
						if (!mailedKeys.has(key)) {
							mailedKeys.add(key);
							if ((await notifyOrderShipped(res.order_id, { courier: courier ?? '택배', trackingNo: res.tracking_no }))?.ok) mailed++;
						}
					}
				}
			} catch (e) {
				console.error(`[ebut] ship sync order ${orderId} try ${t} failed:`, e instanceof Error ? e.message : e);
				failed.set(orderId, lines);
			}
		}
		pending = failed;
	}
	const failedOrders = [...pending.keys()];
	if (failedOrders.length) console.error(`[ebut] CRITICAL 배송준비중/배송중 > 배송중/배송완료 실패:\n${failedOrders.join('\n')}`);
	// 바인허브와 같다 — 송장 수집이 끝난 뒤에도 배송준비중인 줄은 지연
	const { data: d, error: de } = await db.rpc('myr_app_admin_mark_delayed');
	if (de) console.error('[ebut] mark_delayed failed:', de.message);
	return { checked: all.length, shipped, delivered, mailed, delayed: typeof d === 'number' ? d : 0, failedOrders };
}

export type ManualPrepare = { dryRun: boolean; lines: PrepareLine[]; count: number; orders: string[] };

/** 이벗 연동 전 — 운영팀이 물류센터에 주문을 넘길 때 "지금 결제완료인 줄 → 배송준비중". dryRun 이면 대상만 돌려준다(CSV) */
export async function prepareManually(cutoff: Date, dryRun: boolean): Promise<ManualPrepare> {
	const lines = await prepareCandidates(cutoff);
	if (dryRun) return { dryRun, lines, count: 0, orders: [...new Set(lines.map((l) => l.orderCode))] };
	const r = await markPrepared(
		lines.map((l) => l.itemId),
		false
	);
	return { dryRun, lines, count: r.count, orders: r.orders };
}
