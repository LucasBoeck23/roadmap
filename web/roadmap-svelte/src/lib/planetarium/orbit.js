import * as THREE from 'three';

/**
 * Posição 3D de um corpo numa órbita circular inclinada ao redor de `center`.
 * A inclinação dá profundidade 3D — sem ela, todas as órbitas ficariam no mesmo plano.
 *
 * @param {number} angle        ângulo atual da órbita (radianos)
 * @param {number} radius       raio orbital
 * @param {number} inclination  inclinação do plano orbital (radianos)
 * @param {THREE.Vector3} center  posição do corpo pai (estrela ou planeta)
 * @returns {THREE.Vector3}
 */
export function orbitalPosition(angle, radius, inclination, center = new THREE.Vector3()) {
	const lx = Math.cos(angle) * radius;
	const lz = Math.sin(angle) * radius;
	return new THREE.Vector3(
		center.x + lx,
		center.y + lz * Math.sin(inclination),
		center.z + lz * Math.cos(inclination)
	);
}

/**
 * Gera os pontos de uma volta completa da órbita.
 * Usado tanto para desenhar a linha quanto para atualizá-la quando o pai se move.
 */
export function orbitPoints(radius, inclination, center = new THREE.Vector3(), steps = 180) {
	const pts = [];
	for (let i = 0; i <= steps; i++) {
		pts.push(orbitalPosition((i / steps) * Math.PI * 2, radius, inclination, center));
	}
	return pts;
}

/** Cria a linha visível de uma órbita. */
export function makeOrbitLine(radius, inclination, center = new THREE.Vector3(), color = 0x2a4466) {
	const geo = new THREE.BufferGeometry().setFromPoints(orbitPoints(radius, inclination, center));
	const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45 });
	return new THREE.Line(geo, mat);
}
