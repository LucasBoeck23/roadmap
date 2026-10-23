<script>
	import { page } from '$app/stores';
</script>

<div style="display:flex; align-items:center; justify-content:center; height:100vh;">
	<div style="text-align:center; color:var(--text-secondary); font-family:'JetBrains Mono',monospace;">
		<div style="font-size:3rem; margin-bottom:1rem;">⚠</div>
		<div style="font-size:1.2rem; color:var(--text-primary); margin-bottom:0.5rem;">
			{$page.status} — {$page.error?.message ?? 'Página não encontrada'}
		</div>
		<a href="/" style="color:var(--accent); font-size:12px;">← voltar ao início</a>
	</div>
</div>
