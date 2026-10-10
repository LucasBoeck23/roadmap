import * as THREE from 'three';

/** Textura procedural de planeta: cor base + faixas atmosféricas + manchas. */
export function makePlanetTex(hex, size = 256) {
	const c = document.createElement('canvas');
	c.width = c.height = size;
	const ctx = c.getContext('2d');
	const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;

	ctx.fillStyle = `rgb(${r},${g},${b})`;
	ctx.fillRect(0, 0, size, size);

	// faixas atmosféricas horizontais
	for (let i = 0; i < 12; i++) {
		const y = (i / 12) * size, h = size / 12 + Math.random() * 10;
		ctx.fillStyle = `rgba(${Math.random()>0.5?255:0},${Math.random()>0.5?255:0},${Math.random()>0.5?255:0},${0.05+Math.random()*0.09})`;
		ctx.fillRect(0, y, size, h);
	}
	// manchas (continentes / nuvens)
	for (let i = 0; i < 16; i++) {
		ctx.beginPath();
		ctx.ellipse(Math.random()*size, Math.random()*size, 5+Math.random()*22, 3+Math.random()*12, Math.random()*Math.PI, 0, Math.PI*2);
		ctx.fillStyle = `rgba(255,255,255,${0.03+Math.random()*0.07})`;
		ctx.fill();
	}
	return new THREE.CanvasTexture(c);
}

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

/** Sprite de texto (label) que sempre encara a câmera. */
export function makeTextSprite(text, hex = 0xffffff, fs = 13) {
	const c = document.createElement('canvas');
	c.width = 320; c.height = 64;
	const ctx = c.getContext('2d');
	const r = (hex>>16)&0xff, g = (hex>>8)&0xff, b = hex&0xff;
	ctx.font = `${fs}px 'JetBrains Mono',monospace`;
	ctx.fillStyle = `rgba(${r},${g},${b},0.92)`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(text, 160, 32);
	const spr = new THREE.Sprite(new THREE.SpriteMaterial({
		map: new THREE.CanvasTexture(c), transparent: true, depthTest: false
	}));
	spr.scale.set(50, 12, 1);
	return spr;
}
