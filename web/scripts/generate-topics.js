#!/usr/bin/env node
/**
 * generate-topics.js
 *
 * Escaneia ../../src/ (as trilhas de estudo na raiz do repo), gera
 * static/data/topics.json e copia README.md + *.cs/*.dart para static/src/
 * (servidos como assets estáticos pelo SvelteKit).
 *
 * topics.json: { [trackId]: Topic[] }
 * Topic = {
 *   id, nome, nivel, pasta, temReadme, status, download,
 *   arquivos: string[],   // lista PLANA (retrocompatível) de caminhos relativos a `pasta`
 *   tree: Node            // hierarquia recursiva de pastas (nova fonte da verdade)
 * }
 * Node = {
 *   nome,                 // nome de exibição da pasta
 *   caminho,              // caminho relativo a `pasta` ('' para a raiz)
 *   temReadme,            // README.md existe nesta pasta?
 *   readme,               // caminho relativo do README.md desta pasta, ou null
 *   arquivos: Array<{ nome, caminho }>,  // .cs/.dart diretamente nesta pasta
 *   subpastas: Node[]     // filhos recursivos, mesma forma
 * }
 *
 * Rodado automaticamente via "prebuild" e "predev" no package.json.
 */

import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SRC_DIR     = join(__dirname, '..', '..', 'src');
const OUT_JSON    = join(__dirname, '..', 'static', 'data', 'topics.json');
const OUT_SRC     = join(__dirname, '..', 'static', 'src');
const OUT_ZIP_DIR = join(__dirname, '..', 'static', 'downloads');

// Pastas/arquivos que nunca entram no zip nem na árvore (lixo de build / vcs)
const ZIP_IGNORE = new Set(['bin', 'obj', '.git', '.vs', '.idea', 'node_modules', '.dart_tool']);

// Extensões de código que são expostas no viewer
const CODE_EXTS = ['.cs', '.dart'];

// Mesmo mapeamento da MSBuild task
const NIVEL_MAP = {
	'01': 'trainee', '02': 'trainee',
	'03': 'junior',  '04': 'junior', '05': 'junior', '06': 'junior', '07': 'junior',
	'08': 'pleno',   '09': 'pleno',  '10': 'pleno',  '11': 'pleno',
	'12': 'senior',  '13': 'senior'
};

function isDir(p) {
	return statSync(p).isDirectory();
}

function listDirs(p) {
	return readdirSync(p)
		.map(name => ({ name, full: join(p, name) }))
		.filter(e => isDir(e.full))
		.sort((a, b) => a.name.localeCompare(b.name));
}

function isCodeFile(name) {
	return CODE_EXTS.some(ext => name.endsWith(ext));
}

function toPosix(p) {
	return p.replace(/\\/g, '/');
}

/** Copia um arquivo garantindo que o diretório de destino exista */
function copyFile(src, dest) {
	mkdirSync(dirname(dest), { recursive: true });
	copyFileSync(src, dest);
}

/** Coleta TODOS os arquivos de uma pasta (recursivo), ignorando ZIP_IGNORE. */
function collectAllFiles(dir) {
	const results = [];
	function walk(current) {
		for (const entry of readdirSync(current)) {
			if (ZIP_IGNORE.has(entry)) continue;
			const full = join(current, entry);
			if (isDir(full)) walk(full);
			else results.push(full);
		}
	}
	walk(dir);
	return results;
}

/**
 * Carrega o JSZip de forma preguiçosa/dinâmica. Retorna a classe JSZip ou null
 * quando o pacote não está disponível (ex.: node_modules ausente / registry
 * bloqueado). Avisa apenas uma vez.
 */
let jszipState; // undefined = não tentado; null = indisponível; Class = disponível
async function loadJSZip() {
	if (jszipState !== undefined) return jszipState;
	try {
		const mod = await import('jszip');
		jszipState = mod.default ?? mod;
	} catch {
		console.warn('[generate-topics] jszip indisponível — pulando geração de .zip');
		jszipState = null;
	}
	return jszipState;
}

/**
 * Empacota a pasta de um tópico num .zip (todos os arquivos exceto ZIP_IGNORE),
 * para que alguém possa baixar e rodar o projeto sem clonar o repositório.
 * O conteúdo do zip fica dentro de uma pasta raiz com o nome do tópico.
 * Retorna o número de arquivos empacotados, ou -1 quando jszip está indisponível.
 */
async function zipTopic(topicDir, topicName, destZip) {
	const JSZip = await loadJSZip();
	if (!JSZip) return -1;
	const zip = new JSZip();
	const root = zip.folder(topicName);
	const files = collectAllFiles(topicDir);
	for (const file of files) {
		const rel = toPosix(relative(topicDir, file));
		root.file(rel, readFileSync(file));
	}
	const buf = await zip.generateAsync({
		type: 'nodebuffer',
		compression: 'DEFLATE',
		compressionOptions: { level: 6 }
	});
	mkdirSync(dirname(destZip), { recursive: true });
	writeFileSync(destZip, buf);
	return files.length;
}

/**
 * Constrói recursivamente o nó de uma pasta e copia seus assets (README +
 * arquivos de código em qualquer profundidade) para static/src.
 *
 * @param absDir      caminho absoluto da pasta atual
 * @param relFromTopic caminho relativo à raiz do tópico ('' para a raiz)
 * @param destBase    pasta de destino em static/src para este tópico
 * @param flat        acumulador da lista plana de caminhos (retrocompatível)
 * @param counters    contador de arquivos copiados
 */
function buildNode(absDir, relFromTopic, destBase, flat, counters) {
	const displayName = relFromTopic === ''
		? ''
		: relFromTopic.split('/').pop();

	// README desta pasta
	const readmeAbs = join(absDir, 'README.md');
	const temReadme = existsSync(readmeAbs);
	let readme = null;
	if (temReadme) {
		readme = relFromTopic === '' ? 'README.md' : `${relFromTopic}/README.md`;
		copyFile(readmeAbs, join(destBase, readme));
		counters.files++;
	}

	const entries = readdirSync(absDir)
		.filter(name => !ZIP_IGNORE.has(name))
		.map(name => ({ name, full: join(absDir, name) }));

	// Arquivos de código diretamente nesta pasta
	const arquivos = entries
		.filter(e => !isDir(e.full) && isCodeFile(e.name))
		.sort((a, b) => a.name.localeCompare(b.name))
		.map(e => {
			const caminho = relFromTopic === '' ? e.name : `${relFromTopic}/${e.name}`;
			copyFile(e.full, join(destBase, caminho));
			counters.files++;
			flat.push(caminho);
			return { nome: e.name, caminho };
		});

	// Subpastas (recursão de profundidade ilimitada), ordenadas por nome
	const subpastas = entries
		.filter(e => isDir(e.full))
		.sort((a, b) => a.name.localeCompare(b.name))
		.map(e => {
			const childRel = relFromTopic === '' ? e.name : `${relFromTopic}/${e.name}`;
			return buildNode(e.full, childRel, destBase, flat, counters);
		});

	return {
		nome: displayName,
		caminho: relFromTopic,
		temReadme,
		readme,
		arquivos,
		subpastas
	};
}

if (!existsSync(SRC_DIR)) {
	console.warn(`[generate-topics] Diretório src não encontrado: ${SRC_DIR}`);
	process.exit(0);
}

async function main() {
	mkdirSync(dirname(OUT_JSON), { recursive: true });
	mkdirSync(OUT_SRC, { recursive: true });

	const tracks = {};
	let totalTopics = 0;
	let totalFiles = 0;
	let totalZips = 0;

	for (const track of listDirs(SRC_DIR)) {
		tracks[track.name] = [];

		for (const topicDir of listDirs(track.full)) {
			const prefix = topicDir.name.slice(0, 2);
			const nivel  = NIVEL_MAP[prefix] ?? 'outro';
			const nome   = topicDir.name.replace(/^\d+-/, '');
			const pasta  = `src/${track.name}/${topicDir.name}`;
			const destBase = join(OUT_SRC, track.name, topicDir.name);

			// README do tópico (raiz) — determina status
			const readmePath = join(topicDir.full, 'README.md');
			const temReadme  = existsSync(readmePath);
			let status = 'nao-iniciado';
			if (temReadme) {
				const content = readFileSync(readmePath, 'utf8');
				if (content.length > 100) status = 'em-progresso';
			}

			// Árvore recursiva (também copia README/código em qualquer profundidade)
			const flat = [];
			const counters = { files: 0 };
			const tree = buildNode(topicDir.full, '', destBase, flat, counters);
			totalFiles += counters.files;

			// ZIP do projeto completo — só gera se houver arquivos de código
			// (um tópico só com README não precisa de download executável)
			let download = null;
			if (flat.length) {
				const zipRel = `downloads/${track.name}/${topicDir.name}.zip`;
				const n = await zipTopic(topicDir.full, topicDir.name, join(OUT_ZIP_DIR, track.name, `${topicDir.name}.zip`));
				if (n > 0) {
					download = zipRel;
					totalZips++;
				}
			}

			tracks[track.name].push({
				id:        topicDir.name,
				nome,
				nivel,
				pasta,
				temReadme,
				status,
				download,  // caminho do zip relativo ao base, ou null
				arquivos:  flat, // lista PLANA retrocompatível (todos os caminhos do subtree)
				tree       // hierarquia recursiva (nova fonte da verdade)
			});

			totalTopics++;
		}
	}

	writeFileSync(OUT_JSON, JSON.stringify(tracks, null, 2), 'utf8');

	const trackNames = Object.keys(tracks).join(', ');
	console.log(`[generate-topics] topics.json gerado — ${Object.keys(tracks).length} tracks (${trackNames}), ${totalTopics} tópicos, ${totalFiles} arquivos, ${totalZips} zips`);
}

main().catch(err => { console.error('[generate-topics] erro:', err); process.exit(1); });
