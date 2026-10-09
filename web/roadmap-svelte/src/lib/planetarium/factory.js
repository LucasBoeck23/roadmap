import * as THREE from 'three';
import { makePlanetTex, makeStarTex, makeTextSprite } from './textures.js';
import { makeOrbitLine } from './orbit.js';

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
 * Anã branca central. Retorna os 3 objetos que a compõem:
 * esfera branca sólida (sem textura → sem costura nos polos),
 * core azulado e sprite de glow aditivo.
 */
export function createStar() {
	const star = new THREE.Mesh(
		new THREE.SphereGeometry(13, 64, 64),
		new THREE.MeshBasicMaterial({ color: 0xffffff })
	);
	star.userData.removable = true;

	const core = new THREE.Mesh(
		new THREE.SphereGeometry(11, 64, 64),
		new THREE.MeshBasicMaterial({ color: 0xe8f0ff })
	);
	core.userData.removable = true;

	const glow = new THREE.Sprite(new THREE.SpriteMaterial({
		map: makeStarTex(256), transparent: true, opacity: 0.4,
		depthTest: false, blending: THREE.AdditiveBlending
	}));
	glow.scale.set(90, 90, 1);
	glow.userData.removable = true;

	return [star, core, glow];
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
