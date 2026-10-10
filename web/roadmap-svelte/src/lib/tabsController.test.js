import { describe, it, expect } from 'vitest';
import {
	openTab, activateTab, closeTab, closeAll, emptyTabs
} from './tabsController.js';

describe('openTab', () => {
	it('abre a primeira aba e a torna ativa', () => {
		const s = openTab(emptyTabs(), 'a');
		expect(s.tabs).toEqual(['a']);
		expect(s.activeId).toBe('a');
	});

	it('abre várias abas em ordem', () => {
		let s = emptyTabs();
		s = openTab(s, 'a');
		s = openTab(s, 'b');
		s = openTab(s, 'c');
		expect(s.tabs).toEqual(['a', 'b', 'c']);
		expect(s.activeId).toBe('c');
	});

	it('reabrir uma aba existente apenas a ativa (sem duplicar)', () => {
		let s = openTab(openTab(emptyTabs(), 'a'), 'b');
		s = openTab(s, 'a');
		expect(s.tabs).toEqual(['a', 'b']); // não duplica
		expect(s.activeId).toBe('a');
	});
});

describe('activateTab', () => {
	it('ativa uma aba existente', () => {
		let s = openTab(openTab(emptyTabs(), 'a'), 'b');
		s = activateTab(s, 'a');
		expect(s.activeId).toBe('a');
		expect(s.tabs).toEqual(['a', 'b']);
	});

	it('ignora aba inexistente', () => {
		const s = openTab(emptyTabs(), 'a');
		expect(activateTab(s, 'zzz')).toBe(s);
	});
});

describe('closeTab', () => {
	it('fechar a única aba zera o estado', () => {
		const s = closeTab(openTab(emptyTabs(), 'a'), 'a');
		expect(s.tabs).toEqual([]);
		expect(s.activeId).toBeNull();
	});

	it('fechar aba ativa no meio ativa a vizinha da direita', () => {
		let s = emptyTabs();
		['a', 'b', 'c'].forEach(id => (s = openTab(s, id)));
		s = activateTab(s, 'b');
		s = closeTab(s, 'b');
		expect(s.tabs).toEqual(['a', 'c']);
		expect(s.activeId).toBe('c'); // vizinha da direita
	});

	it('fechar a última aba (ativa) ativa a anterior', () => {
		let s = emptyTabs();
		['a', 'b', 'c'].forEach(id => (s = openTab(s, id)));
		// ativa 'c' (já é), fecha 'c'
		s = closeTab(s, 'c');
		expect(s.tabs).toEqual(['a', 'b']);
		expect(s.activeId).toBe('b');
	});

	it('fechar aba NÃO ativa mantém a ativa', () => {
		let s = emptyTabs();
		['a', 'b', 'c'].forEach(id => (s = openTab(s, id)));
		s = activateTab(s, 'a');
		s = closeTab(s, 'c');
		expect(s.tabs).toEqual(['a', 'b']);
		expect(s.activeId).toBe('a');
	});

	it('fechar aba inexistente não altera o estado', () => {
		const s = openTab(emptyTabs(), 'a');
		expect(closeTab(s, 'zzz')).toBe(s);
	});

	it('fechar todas uma a uma termina em estado vazio', () => {
		let s = emptyTabs();
		['a', 'b', 'c'].forEach(id => (s = openTab(s, id)));
		s = closeTab(s, 'a');
		s = closeTab(s, 'b');
		s = closeTab(s, 'c');
		expect(s.tabs).toEqual([]);
		expect(s.activeId).toBeNull();
	});
});

describe('closeAll', () => {
	it('limpa tudo', () => {
		const s = closeAll();
		expect(s.tabs).toEqual([]);
		expect(s.activeId).toBeNull();
	});
});
