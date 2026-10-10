import * as THREE from 'three';
import { makePlanetTex, makeSunGlowTex, makeTextSprite } from './textures.js';
import { makeOrbitLine } from './orbit.js';
import { createSunMaterial } from './sunShader.js';

const SUN_RADIUS = 13; // raio base do sol

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
	const surface = new THREE.Mesh(new THREE.SphereGeometry(SUN_RADIUS, 96, 96), material);
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
export function createPlanet(track, color, radius, inclination) {
	const mesh = new THREE.Mesh(
		new THREE.SphereGeometry(7, 48, 48),
		new THREE.MeshStandardMaterial({
			map: makePlanetTex(color), roughness: 0.78, metalness: 0.1,
			emissive: new THREE.Color(color), emissiveIntensity: 0.18
		})
	);
	mesh.castShadow = mesh.receiveShadow = true;
	mesh.userData.removable = true;
	mesh.userData.planetId  = track.id;

	const label = makeTextSprite(track.nome, color);
	label.userData.removable = true;

	const orbitLine = makeOrbitLine(radius, inclination);
	orbitLine.userData.removable = true;

	return { mesh, label, orbitLine };
}

/**
 * Cria o mesh, label e linha de órbita de uma lua.
 * @param style  entrada de STATUS_STYLE (cor + emissive intensity)
 * @returns { mesh, label, orbitLine }
 */
export function createMoon(topic, style, radius, inclination) {
	const mesh = new THREE.Mesh(
		new THREE.SphereGeometry(3.5, 32, 32),
		new THREE.MeshStandardMaterial({
			map: makePlanetTex(style.color, 128), roughness: 0.85,
			emissive: new THREE.Color(style.color), emissiveIntensity: style.ei + 0.12
		})
	);
	mesh.castShadow = true;
	mesh.userData.removable = true;

	const label = makeTextSprite(topic.nome, style.color, 10);
	label.userData.removable = true;

	const orbitLine = makeOrbitLine(radius, inclination, new THREE.Vector3(), 0x1a2a3a);
	orbitLine.userData.removable = true;

	return { mesh, label, orbitLine };
}
