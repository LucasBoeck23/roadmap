import * as THREE from 'three';

/**
 * Câmera orbital descrita por (azimuth, elevation, distance, target).
 * A posição real é derivada desses parâmetros — nunca setada diretamente.
 * Mantém também valores "alvo" para interpolação suave a cada frame.
 */
export class OrbitalCamera {
	constructor(aspect) {
		this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 3000);

		this.azimuth   = Math.PI / 6;
		this.elevation = Math.PI / 3.5;
		this.distance  = 180;
		this.target    = new THREE.Vector3(0, 0, 0);

		// alvos de interpolação
		this.targetAzimuth   = this.azimuth;
		this.targetElevation = this.elevation;
		this.targetDistance  = this.distance;
		this.targetPos       = new THREE.Vector3(0, 0, 0);

		// limites
		this.minElevation = 0.08;
		this.maxElevation = Math.PI / 2 - 0.04;
		this.minDistance  = 30;
		this.maxDistance  = 600;

		this.apply();
	}

	/** Deriva camera.position a partir dos parâmetros orbitais. */
	apply() {
		const { azimuth, elevation, distance, target } = this;
		this.camera.position.set(
			target.x + distance * Math.cos(elevation) * Math.sin(azimuth),
			target.y + distance * Math.sin(elevation),
			target.z + distance * Math.cos(elevation) * Math.cos(azimuth)
		);
		this.camera.lookAt(target);
	}

	/** Interpola em direção aos valores alvo (independente de framerate). */
	lerp(dt) {
		const k = 1 - Math.pow(0.001, dt);
		this.azimuth   += (this.targetAzimuth   - this.azimuth)   * k;
		this.elevation += (this.targetElevation - this.elevation) * k;
		this.distance  += (this.targetDistance  - this.distance)  * k;
		this.target.lerp(this.targetPos, k);
		this.apply();
	}

	/** Rotaciona a câmera ao redor do alvo (drag esquerdo). */
	orbit(dx, dy, sensitivity = 0.005) {
		this.targetAzimuth   -= dx * sensitivity;
		this.targetElevation += dy * sensitivity;
		this.targetElevation = Math.max(this.minElevation, Math.min(this.maxElevation, this.targetElevation));
	}

	/** Move o alvo relativo à orientação da câmera (pan — drag direito/shift). */
	pan(dx, dy) {
		const sens = this.distance / 800;
		const right = new THREE.Vector3();
		this.camera.getWorldDirection(right);
		right.cross(this.camera.up).normalize();
		const up = this.camera.up.clone(); up.y = 0; up.normalize();
		this.targetPos.addScaledVector(right, -dx * sens);
		this.targetPos.addScaledVector(up,     dy * sens);
	}

	/** Aproxima/afasta modificando a distância (scroll). */
	zoom(deltaY) {
		const factor = deltaY > 0 ? 1.07 : 0.93;
		this.targetDistance = Math.max(this.minDistance, Math.min(this.maxDistance, this.targetDistance * factor));
	}

	/** Foca num ponto do mundo com uma distância alvo. */
	focusOn(position, distance) {
		this.targetPos.copy(position);
		this.targetDistance  = distance;
		this.targetElevation = Math.max(0.35, this.elevation);
	}

	/** Reseta para o centro do sistema. */
	reset(distance = 180) {
		this.targetPos.set(0, 0, 0);
		this.targetDistance = distance;
	}

	setAspect(aspect) {
		this.camera.aspect = aspect;
		this.camera.updateProjectionMatrix();
	}
}
