import { describe, it, expect } from 'vitest';
import {
	clampPct, pctFromDrag, resolveSplit,
	SPLIT_MIN, SPLIT_MAX, SPLIT_DEFAULT
} from './splitController.js';

describe('clampPct', () => {
	it('mantém valores dentro do intervalo', () => {
		expect(clampPct(50)).toBe(50);
		expect(clampPct(SPLIT_MIN)).toBe(SPLIT_MIN);
		expect(clampPct(SPLIT_MAX)).toBe(SPLIT_MAX);
	});

	it('limita abaixo do mínimo', () => {
		expect(clampPct(5)).toBe(SPLIT_MIN);
		expect(clampPct(-100)).toBe(SPLIT_MIN);
	});

	it('limita acima do máximo', () => {
		expect(clampPct(95)).toBe(SPLIT_MAX);
		expect(clampPct(1000)).toBe(SPLIT_MAX);
	});

	it('trata NaN como mínimo', () => {
		expect(clampPct(NaN)).toBe(SPLIT_MIN);
	});
});

describe('pctFromDrag', () => {
	it('arrastar para a direita aumenta a % esquerda', () => {
		// começa em 50%, arrasta +100px num total de 1000px → +10% = 60%
		expect(pctFromDrag(50, 100, 1000)).toBe(60);
	});

	it('arrastar para a esquerda diminui a % esquerda', () => {
		expect(pctFromDrag(50, -100, 1000)).toBe(40);
	});

	it('respeita os limites ao arrastar demais', () => {
		expect(pctFromDrag(50, 10000, 1000)).toBe(SPLIT_MAX);
		expect(pctFromDrag(50, -10000, 1000)).toBe(SPLIT_MIN);
	});

	it('não quebra com largura total zero', () => {
		expect(pctFromDrag(50, 100, 0)).toBe(50);
	});
});

describe('resolveSplit', () => {
	it('painel direito fechado → esquerda ocupa 100% (bug de não restaurar)', () => {
		const r = resolveSplit(false, 55);
		expect(r.leftPct).toBe(100);
		expect(r.rightVisible).toBe(false);
	});

	it('painel direito aberto → usa a % atual limitada', () => {
		const r = resolveSplit(true, 60);
		expect(r.leftPct).toBe(60);
		expect(r.rightVisible).toBe(true);
	});

	it('painel aberto com % fora do limite é corrigida', () => {
		expect(resolveSplit(true, 5).leftPct).toBe(SPLIT_MIN);
		expect(resolveSplit(true, 99).leftPct).toBe(SPLIT_MAX);
	});

	it('usa o default quando nenhuma % é informada', () => {
		expect(resolveSplit(true).leftPct).toBe(SPLIT_DEFAULT);
	});

	it('ciclo abrir→arrastar→fechar sempre restaura 100%', () => {
		// abre
		let s = resolveSplit(true, SPLIT_DEFAULT);
		expect(s.leftPct).toBe(SPLIT_DEFAULT);
		// arrasta para 70
		const dragged = pctFromDrag(s.leftPct, 150, 1000); // +15 → 70
		s = resolveSplit(true, dragged);
		expect(s.leftPct).toBe(70);
		// fecha → DEVE voltar a 100 (este era o bug)
		s = resolveSplit(false, dragged);
		expect(s.leftPct).toBe(100);
	});
});
