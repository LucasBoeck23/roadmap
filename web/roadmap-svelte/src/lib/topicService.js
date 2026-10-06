import { trackInfoFromId } from './tracks.js';

/** Cache em memória — persiste durante a sessão do browser */
let cache = null;

async function fetchAll(base = '') {
	if (cache) return cache;
	const res = await fetch(`${base}data/topics.json`);
	if (!res.ok) throw new Error(`Falha ao carregar topics.json: ${res.status}`);
	cache = await res.json();
	return cache;
}

export async function getTrackList(base = '') {
	const all = await fetchAll(base);
	return Object.entries(all).map(([id, topics]) => trackInfoFromId(id, topics.length));
}

export async function getTopicsByTrack(trackId, base = '') {
	const all = await fetchAll(base);
	return all[trackId] ?? [];
}

/** Busca o README.md de um tópico. Retorna null se não existir. */
export async function getReadme(pasta, base = '') {
	try {
		const res = await fetch(`${base}${pasta}/README.md`);
		if (!res.ok) return null;
		return await res.text();
	} catch {
		return null;
	}
}

/** Busca o conteúdo de um arquivo .cs/.dart. Retorna null se não existir. */
export async function getFile(pasta, filePath, base = '') {
	try {
		const res = await fetch(`${base}${pasta}/${filePath}`);
		if (!res.ok) return null;
		return await res.text();
	} catch {
		return null;
	}
}

export function clearCache() {
	cache = null;
}
