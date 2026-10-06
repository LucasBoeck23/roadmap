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

const __dirname = dirname(fileURLToPath(import.meta.url));

const SRC_DIR   = join(__dirname, '..', '..', '..', 'src');
const OUT_JSON  = join(__dirname, '..', 'static', 'data', 'topics.json');
const OUT_SRC   = join(__dirname, '..', 'static', 'src');

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

if (!existsSync(SRC_DIR)) {
	console.warn(`[generate-topics] Diretório src não encontrado: ${SRC_DIR}`);
	process.exit(0);
}

mkdirSync(dirname(OUT_JSON), { recursive: true });
mkdirSync(OUT_SRC, { recursive: true });

const tracks = {};
let totalTopics = 0;
let totalFiles = 0;

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

			// Copia README para static/src/
			copyFile(readmePath, join(OUT_SRC, track.name, topicDir.name, 'README.md'));
			totalFiles++;
		}

		// Arquivos .cs
		const csFiles = collectFiles(topicDir.full, '.cs');
		const arquivos = csFiles.map(f => relative(topicDir.full, f).replace(/\\/g, '/'));

		for (const csFile of csFiles) {
			const rel  = relative(topicDir.full, csFile).replace(/\\/g, '/');
			const dest = join(OUT_SRC, track.name, topicDir.name, rel);
			copyFile(csFile, dest);
			totalFiles++;
		}

		// Arquivos .dart (track flutter)
		const dartFiles = collectFiles(topicDir.full, '.dart');
		for (const dartFile of dartFiles) {
			const rel  = relative(topicDir.full, dartFile).replace(/\\/g, '/');
			const dest = join(OUT_SRC, track.name, topicDir.name, rel);
			copyFile(dartFile, dest);
			totalFiles++;
		}

		tracks[track.name].push({
			id:        topicDir.name,
			nome,
			nivel,
			pasta,
			temReadme,
			status,
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
console.log(`[generate-topics] topics.json gerado — ${Object.keys(tracks).length} tracks (${trackNames}), ${totalTopics} tópicos, ${totalFiles} arquivos copiados`);
