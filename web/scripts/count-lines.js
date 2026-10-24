#!/usr/bin/env node
/**
 * count-lines.js
 *
 * Conta linhas de código em web/src (a UI SvelteKit). Para cada arquivo:
 *   - total    : todas as linhas
 *   - código   : linhas não vazias que não são comentários de linha simples
 *   - branco   : linhas vazias ou só com espaços
 *   - comentário: linhas que começam com // ou * ou <!-- (aproximação)
 *
 * Agrupa por extensão e lista os maiores arquivos. É uma aproximação:
 * não parseia blocos /* *​/ nem strings, serve para ter um panorama e
 * decidir o que vale refatorar.
 *
 * Uso: node scripts/count-lines.js [--top=N] [dir]
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, extname } from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- args ---
const args = process.argv.slice(2);
let topN = 10;
let targetArg = null;
for (const a of args) {
	if (a.startsWith('--top=')) topN = Number(a.slice('--top='.length)) || topN;
	else if (!a.startsWith('--')) targetArg = a;
}

const SRC_DIR = targetArg
	? join(process.cwd(), targetArg)
	: join(__dirname, '..', 'src');

// Extensões que contam como "código/fonte" da UI
const EXTS = new Set(['.js', '.ts', '.svelte', '.css', '.html']);
const IGNORE_DIRS = new Set(['node_modules', '.svelte-kit', 'build', '.git']);

/** Lista recursiva de arquivos sob `dir`, ignorando IGNORE_DIRS. */
function walk(dir) {
	const out = [];
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) {
			if (IGNORE_DIRS.has(name)) continue;
			out.push(...walk(full));
		} else if (EXTS.has(extname(name))) {
			out.push(full);
		}
	}
	return out;
}

/** Classifica as linhas de um arquivo (aproximação por linha). */
function classify(text) {
	const lines = text.split(/\r?\n/);
	// split deixa uma linha vazia extra no fim se o arquivo termina com \n
	if (lines.length && lines[lines.length - 1] === '') lines.pop();

	let total = lines.length;
	let blank = 0;
	let comment = 0;
	for (const raw of lines) {
		const line = raw.trim();
		if (line === '') { blank++; continue; }
		if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*') ||
			line.startsWith('<!--') || line.startsWith('*/')) {
			comment++;
		}
	}
	const code = total - blank - comment;
	return { total, blank, comment, code };
}

function pad(s, n) { return String(s).padStart(n); }

function main() {
	const files = walk(SRC_DIR).sort();
	if (!files.length) {
		console.log(`Nenhum arquivo encontrado em ${SRC_DIR}`);
		return;
	}

	const perFile = [];
	const byExt = {};
	const totals = { total: 0, blank: 0, comment: 0, code: 0, files: 0 };

	for (const file of files) {
		const { total, blank, comment, code } = classify(readFileSync(file, 'utf8'));
		const rel = relative(SRC_DIR, file);
		perFile.push({ rel, total, code });

		const ext = extname(file);
		const b = byExt[ext] ??= { files: 0, total: 0, blank: 0, comment: 0, code: 0 };
		b.files++; b.total += total; b.blank += blank; b.comment += comment; b.code += code;

		totals.files++;
		totals.total += total; totals.blank += blank; totals.comment += comment; totals.code += code;
	}

	// --- por extensão ---
	console.log(`\nLinhas em ${relative(process.cwd(), SRC_DIR) || SRC_DIR}\n`);
	console.log('  ext       arquivos    total    código   branco   coment.');
	console.log('  ' + '-'.repeat(58));
	for (const ext of Object.keys(byExt).sort()) {
		const b = byExt[ext];
		console.log(`  ${ext.padEnd(8)} ${pad(b.files, 8)} ${pad(b.total, 8)} ${pad(b.code, 9)} ${pad(b.blank, 8)} ${pad(b.comment, 9)}`);
	}
	console.log('  ' + '-'.repeat(58));
	console.log(`  ${'TOTAL'.padEnd(8)} ${pad(totals.files, 8)} ${pad(totals.total, 8)} ${pad(totals.code, 9)} ${pad(totals.blank, 8)} ${pad(totals.comment, 9)}`);

	// --- maiores arquivos ---
	console.log(`\nMaiores arquivos (por total de linhas) — top ${topN}:\n`);
	perFile.sort((a, b) => b.total - a.total);
	for (const f of perFile.slice(0, topN)) {
		console.log(`  ${pad(f.total, 5)}  (${pad(f.code, 4)} cód.)  ${f.rel}`);
	}
	console.log('');
}

main();
