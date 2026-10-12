import * as THREE from 'three';

/** Glow/corona quente do Sol (gradiente radial laranja → transparente). */
export function makeSunGlowTex(size = 256) {
	const c = document.createElement('canvas');
	c.width = c.height = size;
	const ctx = c.getContext('2d');
	const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
	g.addColorStop(0,    'rgba(255,240,180,0.9)');
	g.addColorStop(0.25, 'rgba(255,180,60,0.6)');
	g.addColorStop(0.55, 'rgba(255,120,20,0.25)');
	g.addColorStop(1,    'rgba(255,80,0,0)');
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, size, size);
	return new THREE.CanvasTexture(c);
}

/**
 * Sprite de texto (label) que sempre encara a câmera.
 * Mesmo layout do original (canvas 320×64, escala 50×12) mas renderizado em
 * 4× mais pixels → nítido sem mudar o tamanho.
 */
export function makeTextSprite(text, hex = 0xffffff, fs = 13) {
	const SS = 4;
	const BASE_W = 320, BASE_H = 64;

	const c = document.createElement('canvas');
	c.width = BASE_W * SS; c.height = BASE_H * SS;
	const ctx = c.getContext('2d');
	ctx.scale(SS, SS);

	const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
	ctx.font = `600 ${fs}px 'JetBrains Mono', monospace`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.shadowColor = 'rgba(0,0,0,0.5)';
	ctx.shadowBlur = 2;
	ctx.fillStyle = `rgba(${r},${g},${b},0.94)`;
	ctx.fillText(text, BASE_W / 2, BASE_H / 2);

	const tex = new THREE.CanvasTexture(c);
	tex.minFilter = THREE.LinearMipmapLinearFilter;
	tex.magFilter = THREE.LinearFilter;
	tex.generateMipmaps = true;
	tex.anisotropy = 8;

	const spr = new THREE.Sprite(new THREE.SpriteMaterial({
		map: tex, transparent: true, depthTest: false
	}));
	spr.scale.set(50, 12, 1);
	return spr;
}
