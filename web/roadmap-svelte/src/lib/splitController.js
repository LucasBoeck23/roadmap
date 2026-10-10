/**
 * Lógica pura do split-view horizontal (painel esquerdo | resizer | painel direito).
 *
 * Mantida separada do DOM/Svelte para ser testável de forma isolada.
 * O componente guarda apenas uma porcentagem (0–100) da largura do painel
 * esquerdo; quando o painel direito fecha, a porcentagem volta a 100.
 */

export const SPLIT_MIN = 20;   // % mínima do painel esquerdo
export const SPLIT_MAX = 80;   // % máxima do painel esquerdo
export const SPLIT_DEFAULT = 55; // % inicial quando o painel direito abre

/** Limita um valor ao intervalo [min, max]. */
export function clampPct(pct, min = SPLIT_MIN, max = SPLIT_MAX) {
	if (Number.isNaN(pct)) return min;
	return Math.min(max, Math.max(min, pct));
}

/**
 * Calcula a nova % do painel esquerdo durante um arraste.
 * @param {number} startPct   % no início do arraste
 * @param {number} deltaPx    deslocamento do mouse em pixels (dx)
 * @param {number} totalPx    largura total do split-view em pixels
 * @returns {number} nova % já limitada ao intervalo permitido
 */
export function pctFromDrag(startPct, deltaPx, totalPx) {
	if (!totalPx) return clampPct(startPct);
	const deltaPct = (deltaPx / totalPx) * 100;
	return clampPct(startPct + deltaPct);
}

/**
 * Estado do split dado se o painel direito está aberto.
 * Fonte única de verdade para a largura — garante que ao fechar o painel
 * direito o esquerdo volte a ocupar 100%.
 * @param {boolean} rightOpen  há painel direito aberto?
 * @param {number}  currentPct % atual (quando aberto)
 * @returns {{ leftPct: number, rightVisible: boolean }}
 */
export function resolveSplit(rightOpen, currentPct = SPLIT_DEFAULT) {
	if (!rightOpen) return { leftPct: 100, rightVisible: false };
	return { leftPct: clampPct(currentPct), rightVisible: true };
}
