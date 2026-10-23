/**
 * Libera geometria e materiais de um objeto Three.js e o remove da cena.
 * Three.js não faz GC de recursos de GPU automaticamente, então isso
 * evita vazamento de memória ao reconstruir a cena.
 */
export function disposeObject(scene, obj) {
	obj.traverse(child => {
		// Geometrias marcadas como compartilhadas (ex.: a esfera única usada por
		// todos os planetas/luas) NÃO devem ser liberadas aqui — outros objetos
		// ainda as usam e o próximo build as reaproveita.
		if (child.geometry && !child.geometry.userData?.shared) child.geometry.dispose();
		[child.material].flat().forEach(m => m?.dispose());
	});
	scene.remove(obj);
}
