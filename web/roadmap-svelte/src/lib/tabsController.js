/**
 * Lógica pura de gerenciamento de abas (tabs) da IDE.
 *
 * Opera sobre estruturas simples { tabs: string[], activeId: string|null }
 * e retorna sempre um NOVO estado (imutável), facilitando o uso com a
 * reatividade do Svelte e os testes unitários.
 *
 * `tabs` é uma lista de ids (ou objetos com .id); aqui tratamos por id string
 * para a lógica ser agnóstica ao conteúdo.
 */

/** Abre uma aba (ou ativa se já existir). Retorna novo estado. */
export function openTab(state, id) {
	const exists = state.tabs.includes(id);
	const tabs = exists ? state.tabs : [...state.tabs, id];
	return { tabs, activeId: id };
}

/** Ativa uma aba existente. Se não existir, mantém o estado. */
export function activateTab(state, id) {
	if (!state.tabs.includes(id)) return state;
	return { ...state, activeId: id };
}

/**
 * Fecha uma aba. Se era a ativa, ativa a vizinha (a da direita; se não houver,
 * a da esquerda). Se fechar a última, activeId vira null.
 */
export function closeTab(state, id) {
	const idx = state.tabs.indexOf(id);
	if (idx === -1) return state;

	const tabs = state.tabs.filter(t => t !== id);

	let activeId = state.activeId;
	if (state.activeId === id) {
		if (tabs.length === 0) {
			activeId = null;
		} else {
			// vizinha: mesma posição (que agora é a da direita) ou a anterior
			activeId = tabs[Math.min(idx, tabs.length - 1)];
		}
	}
	return { tabs, activeId };
}

/** Fecha todas as abas. */
export function closeAll() {
	return { tabs: [], activeId: null };
}

/** Estado inicial vazio. */
export function emptyTabs() {
	return { tabs: [], activeId: null };
}
