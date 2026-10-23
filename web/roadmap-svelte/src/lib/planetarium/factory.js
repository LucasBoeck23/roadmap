import * as THREE from 'three';
import { makeSunGlowTex, makeTextSprite } from './textures.js';
import { makeOrbitLine } from './orbit.js';
import { createSunMaterial } from './sunShader.js';
import { createPlanetMaterial, createMoonMaterial } from './planetShader.js';

const SUN_RADIUS = 13; // raio base do sol

// ── Geometrias compartilhadas ──────────────────────────────────────────────
// Esferas pequenas na tela não precisam de malha densa; 48×48 já fica liso num
// planeta de raio 7 e 32×24 numa lua de raio 3.5. Compartilhar uma única
// geometria entre todos os planetas (e outra entre as luas) reduce drasticamente
// vértices enviados à GPU e evita recriar buffers a cada build.
const PLANET_GEOMETRY = new THREE.SphereGeometry(7, 48, 48);
const MOON_GEOMETRY   = new THREE.SphereGeometry(3.5, 32, 24);
// Marca geometrias compartilhadas para o dispose NÃO liberá-las (senão o
// próximo build — ou os demais corpos — ficariam sem buffer na GPU).
PLANET_GEOMETRY.userData.shared = true;
MOON_GEOMETRY.userData.shared = true;

/** Campo de estrelas de fundo (3000 pontos aleatórios). */
export function createStarfield() {
	const n = 3000, pos = new Float32Array(n * 3);
	for (let i = 0; i < n; i++) {
		pos[i*3]   = (Math.random()-.5) * 4000;
		pos[i*3+1] = (Math.random()-.5) * 2000;
		pos[i*3+2] = (Math.random()-.5) * 4000;
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
	return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, sizeAttenuation: false }));
}

/**
 * Sol central com plasma animado (shader) + corona.
 * Retorna { parts, surface, material, radius } onde:
 *  - parts    array p/ ocultar em bloco no modo foco
 *  - surface  Mesh da fotosfera (ShaderMaterial de plasma)
 *  - material atalho para surface.material (uniform uTime animado)
 *  - radius   raio base
 */
export function createSun() {
	const group = new THREE.Group();
	group.userData.removable = true;

	// Superfície: shader de plasma animado
	const material = createSunMaterial();
	const surface = new THREE.Mesh(new THREE.SphereGeometry(SUN_RADIUS, 64, 64), material);
	group.add(surface);

	// Corona moderada (Fase 1 — estrela estável): glow discreto + halo suave
	const glowTex = makeSunGlowTex(256);
	const glow = new THREE.Sprite(new THREE.SpriteMaterial({
		map: glowTex, transparent: true, opacity: 0.35,
		depthTest: false, blending: THREE.AdditiveBlending
	}));
	glow.scale.set(SUN_RADIUS * 3.0, SUN_RADIUS * 3.0, 1);
	group.add(glow);

	const halo = new THREE.Sprite(new THREE.SpriteMaterial({
		map: glowTex, transparent: true, opacity: 0.15,
		depthTest: false, blending: THREE.AdditiveBlending
	}));
	halo.scale.set(SUN_RADIUS * 6.0, SUN_RADIUS * 6.0, 1);
	group.add(halo);

	return { parts: [group], surface, material, radius: SUN_RADIUS };
}

/**
 * Cria o mesh, label e linha de órbita de um planeta.
 * @returns { mesh, label, orbitLine }
 */
export function createPlanet(track, color, radius, inclination, profile = null) {
	// Superfície procedural na GPU (shader). O próprio shader faz a iluminação
	// e o rim light atmosférico, então usamos ShaderMaterial direto.
	const prof = profile ?? { kind: 'gas', palette: [color, color, color, color] };
	const material = createPlanetMaterial(prof);
	const mesh = new THREE.Mesh(PLANET_GEOMETRY, material);
	mesh.userData.removable = true;
	mesh.userData.planetId  = track.id;
	mesh.userData.planetMat = material; // referência p/ animar uTime / uLightDir

	const label = makeTextSprite(track.nome, color);
	label.userData.removable = true;

	const orbitLine = makeOrbitLine(radius, inclination);
	orbitLine.userData.removable = true;

	return { mesh, label, orbitLine };
}

/**
 * Cria o mesh, label e linha de órbita de uma lua, com superfície procedural
 * (shader). O perfil (tipo + paleta) é atribuído por semente do tópico.
 * @param profile  { kind, palette:[hex,hex,hex] }
 * @returns { mesh, label, orbitLine, material }
 */
export function createMoon(topic, profile, radius, inclination) {
	const material = createMoonMaterial(profile);
	const mesh = new THREE.Mesh(MOON_GEOMETRY, material);
	mesh.userData.removable = true;
	mesh.userData.moonMat   = material; // p/ animar uTime

	// Label na cor de destaque da paleta da lua
	const labelHex = (profile.palette?.[2]) ?? 0xcccccc;
	const label = makeTextSprite(topic.nome, labelHex, 10);
	label.userData.removable = true;

	const orbitLine = makeOrbitLine(radius, inclination, new THREE.Vector3(), 0x1a2a3a);
	orbitLine.userData.removable = true;

	return { mesh, label, orbitLine, material };
}
