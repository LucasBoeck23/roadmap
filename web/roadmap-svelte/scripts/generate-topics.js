#!/usr/bin/env node
/**
 * generate-topics.js
 *
 * Substitui a MSBuild inline task do RoadmapApp.csproj.
 * Escaneia ../../src/, gera static/data/topics.json e
 * copia README.md + *.cs para static/src/ (servidos como assets estáticos).
 *
 * Rodado automaticamente via "prebuild" e "predev" no package.json.
 */

import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SRC_DIR     = join(__dirname, '..', '..', '..', 'src');
const OUT_JSON    = join(__dirname, '..', 'static', 'data', 'topics.json');
const OUT_SRC     = join(__dirname, '..', 'static', 'src');
const OUT_ZIP_DIR = join(__dirname, '..', 'static', 'downloads');

// Pastas/arquivos que nunca entram no zip (lixo de build / vcs)
const ZIP_IGNORE = new Set(['bin', 'obj', '.git', '.vs', '.idea', 'node_modules', '.dart_tool']);

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

/** Coleta arquivos recursivamente, excluindo bin/ e obj/ */
function collectFiles(dir, ext) {
	const results = [];
	function walk(current) {
		for (const entry of readdirSync(current)) {
			if (entry === 'bin' || entry === 'obj') continue;
			const full = join(current, entry);
			if (isDir(full)) {
				walk(full);
			} else if (entry.endsWith(ext)) {
				results.push(full);
			}
		}
	}
	walk(dir);
	return results.sort();
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
 * Empacota a pasta de um tópico num .zip (todos os arquivos exceto ZIP_IGNORE),
 * para que alguém possa baixar e rodar o projeto sem clonar o repositório.
 * O conteúdo do zip fica dentro de uma pasta raiz com o nome do tópico.
 */
async function zipTopic(topicDir, topicName, destZip) {
	const zip = new JSZip();
	const root = zip.folder(topicName);
	const files = collectAllFiles(topicDir);
	for (const file of files) {
		const rel = relative(topicDir, file).replace(/\\/g, '/');
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

			// README
			const readmePath = join(topicDir.full, 'README.md');
			const temReadme  = existsSync(readmePath);
			let status = 'nao-iniciado';
			if (temReadme) {
				const content = readFileSync(readmePath, 'utf8');
				if (content.length > 100) status = 'em-progresso';
				copyFile(readmePath, join(OUT_SRC, track.name, topicDir.name, 'README.md'));
				totalFiles++;
			}

			// Arquivos .cs e .dart copiados individualmente (para o viewer)
			const csFiles = collectFiles(topicDir.full, '.cs');
			const arquivos = csFiles.map(f => relative(topicDir.full, f).replace(/\\/g, '/'));
			for (const csFile of csFiles) {
				const rel  = relative(topicDir.full, csFile).replace(/\\/g, '/');
				copyFile(csFile, join(OUT_SRC, track.name, topicDir.name, rel));
				totalFiles++;
			}
			const dartFiles = collectFiles(topicDir.full, '.dart');
			for (const dartFile of dartFiles) {
				const rel  = relative(topicDir.full, dartFile).replace(/\\/g, '/');
				copyFile(dartFile, join(OUT_SRC, track.name, topicDir.name, rel));
				totalFiles++;
			}

			// ZIP do projeto completo — só gera se houver arquivos de código
			// (um tópico só com README não precisa de download executável)
			let download = null;
			if (csFiles.length || dartFiles.length) {
				const zipRel = `downloads/${track.name}/${topicDir.name}.zip`;
				const n = await zipTopic(topicDir.full, topicDir.name, join(OUT_ZIP_DIR, track.name, `${topicDir.name}.zip`));
				download = zipRel;
				totalZips++;
				if (n === 0) download = null;
			}

			tracks[track.name].push({
				id:        topicDir.name,
				nome,
				nivel,
				pasta,
				temReadme,
				status,
				download,  // caminho do zip relativo ao base, ou null
				arquivos:  [
					...arquivos,
					...dartFiles.map(f => relative(topicDir.full, f).replace(/\\/g, '/'))
				]
			});

			totalTopics++;
		}
	}

	writeFileSync(OUT_JSON, JSON.stringify(tracks, null, 2), 'utf8');

	const trackNames = Object.keys(tracks).join(', ');
	console.log(`[generate-topics] topics.json gerado — ${Object.keys(tracks).length} tracks (${trackNames}), ${totalTopics} tópicos, ${totalFiles} arquivos, ${totalZips} zips`);
}

main().catch(err => { console.error('[generate-topics] erro:', err); process.exit(1); });
