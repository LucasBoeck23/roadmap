/** Metadados visuais de cada track */
const TRACK_META = {
	csharp: {
		nome: 'C# / .NET',
		icone: 'img/csharp.svg',
		cor: '#512bd4'
	},
	flutter: {
		nome: 'Flutter / Dart',
		icone: 'img/flutter.svg',
		cor: '#02569B'
	}
};

export function trackInfoFromId(id, totalTopicos) {
	const meta = TRACK_META[id] ?? { nome: id, icone: '', cor: '#4a88c7' };
	return { id, totalTopicos, ...meta };
}

export function statusLabel(status) {
	const labels = {
		'nao-iniciado': '⬜ Não iniciado',
		'em-progresso': '🔄 Estudando',
		'concluido':    '✅ Concluído'
	};
	return labels[status] ?? status;
}

/**
 * Status de um tópico → rótulo + cor. Fonte única usada pela home e pelo modal
 * (antes estava duplicado em cada componente). A cor é usada em CSS via
 * custom property (badge/dot).
 */
export const STATUS = {
	'nao-iniciado': { label: 'Não iniciado', cor: '#64748b' },
	'em-progresso': { label: 'Estudando',    cor: '#38bdf8' },
	'concluido':    { label: 'Concluído',    cor: '#4ade80' }
};

/** Cor do status (com fallback cinza). */
export function statusColor(status) {
	return STATUS[status]?.cor ?? '#64748b';
}

/** Rótulo curto do status (sem emoji), com fallback para o próprio código. */
export function statusText(status) {
	return STATUS[status]?.label ?? status;
}
