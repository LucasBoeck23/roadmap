/**
 * Split panel drag-to-resize.
 * Chame initResizer() no onMount da página.
 * Retorna uma função de cleanup para o onDestroy.
 */
export function initResizer() {
	function onMouseDown(e) {
		const resizer = e.target.closest('.split-resizer');
		if (!resizer) return;

		const splitView = resizer.parentElement;
		const left = resizer.previousElementSibling;
		const right = resizer.nextElementSibling;
		if (!splitView || !left || !right) return;

		resizer.classList.add('active');
		const startX = e.clientX;
		const startLeftWidth = left.getBoundingClientRect().width;
		const totalWidth = splitView.getBoundingClientRect().width;

		function onMove(ev) {
			const delta = ev.clientX - startX;
			const pct = ((startLeftWidth + delta) / totalWidth) * 100;
			if (pct > 20 && pct < 80) {
				left.style.flex = 'none';
				left.style.width = pct + '%';
				right.style.flex = '1';
			}
		}

		function onUp() {
			resizer.classList.remove('active');
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
		}

		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
		e.preventDefault();
	}

	document.addEventListener('mousedown', onMouseDown);

	return () => document.removeEventListener('mousedown', onMouseDown);
}
