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

// ──────────────────────────────────────────────────────────────────────────
// Helpers puros para navegar a árvore (`tree`) já carregada de um tópico.
// Não fazem fetch — operam sobre o nó recursivo { nome, caminho, temReadme,
// readme, arquivos: [{ nome, caminho }], subpastas: Node[] }.
// ──────────────────────────────────────────────────────────────────────────

/** Lista plana { nome, caminho } de todos os arquivos do subtree (profundidade ilimitada). */
export function flattenFiles(node) {
	if (!node) return [];
	const out = [...(node.arquivos ?? [])];
	for (const child of node.subpastas ?? []) {
		out.push(...flattenFiles(child));
	}
	return out;
}

/** Primeiro arquivo em ordem depth-first (arquivos da pasta antes das subpastas), ou null. */
export function findFirstFile(node) {
	if (!node) return null;
	if (node.arquivos && node.arquivos.length) return node.arquivos[0];
	for (const child of node.subpastas ?? []) {
		const found = findFirstFile(child);
		if (found) return found;
	}
	return null;
}

/** Quantidade total de arquivos no subtree. */
export function countFiles(node) {
	return flattenFiles(node).length;
}
