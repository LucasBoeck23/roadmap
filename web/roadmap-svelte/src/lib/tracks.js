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

export function nivelLabel(nivel) {
	const labels = {
		trainee: '🟢 Trainee',
		junior:  '🔵 Júnior',
		pleno:   '🟡 Pleno',
		senior:  '🔴 Sênior'
	};
	return labels[nivel] ?? nivel;
}

export function statusLabel(status) {
	const labels = {
		'nao-iniciado': '⬜ Não iniciado',
		'em-progresso': '🔄 Estudando',
		'concluido':    '✅ Concluído'
	};
	return labels[status] ?? status;
}
