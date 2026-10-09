/**
 * Libera geometria e materiais de um objeto Three.js e o remove da cena.
 * Three.js não faz GC de recursos de GPU automaticamente, então isso
 * evita vazamento de memória ao reconstruir a cena.
 */
export function disposeObject(scene, obj) {
	obj.traverse(child => {
		child.geometry?.dispose();
		[child.material].flat().forEach(m => m?.dispose());
	});
	scene.remove(obj);
}
