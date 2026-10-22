// ──────────────────────────────────────────────────────────────────────────
//  Navegação do planetário — transformação PURA de dados (sem Three.js).
//
//  O planetário é uma pilha (stack) de "níveis". Cada nível é uma lista de
//  "corpos" (bodies) que orbitam uma estrela central:
//    - folder : uma subpasta que AINDA tem conteúdo (subpastas e/ou arquivos)
//               → é drillable: clicar entra numa nova galáxia construída a
//                 partir dos filhos desse nó.
//    - file   : um arquivo (.cs/.dart) → é uma folha (leaf): clicar abre o
//               painel liquid glass com o código + README da parte.
//    - topic  : um tópico no nível raiz (uma "lua" da track). Se o `tree` do
//               tópico tem subpastas/arquivos, é drillable; se estiver vazio,
//               comporta-se como folha (abre o painel, como hoje).
//
//  Tudo aqui é JS puro e determinístico, para poder ser revisado/testado em
//  Node sem GPU (ver FEAT-004). Nenhuma dependência de Three.js ou do DOM.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Um nó tem filhos quando possui subpastas OU arquivos próprios.
 * @param {object} node  nó do tree ({ arquivos, subpastas, ... })
 */
export function nodeHasChildren(node) {
	if (!node) return false;
	const nSub = node.subpastas?.length ?? 0;
	const nArq = node.arquivos?.length ?? 0;
	return nSub + nArq > 0;
}

/**
 * Converte os filhos de um nó-pasta numa lista de corpos (bodies) para um
 * nível do planetário. Subpastas viram corpos "folder" (ou "file" se já forem
 * folhas vazias — defensivo), arquivos viram corpos "file".
 *
 * Ordem: subpastas primeiro (planetas internos), depois arquivos (luas-folha).
 * Cada corpo carrega uma `seed` estável (o caminho) para que os visuais
 * (perfis de planeta/lua) sejam sempre os mesmos para a mesma pasta/arquivo.
 *
 * @param {object} node   nó-pasta cujo conteúdo vira o nível
 * @param {object} topic  o tópico dono deste subtree (para abrir o painel)
 * @returns {Array<Body>} lista de corpos do nível
 *
 * Body = {
 *   kind: 'folder' | 'file',
 *   nome: string,            // rótulo exibido
 *   caminho: string,         // caminho relativo ao topic.pasta
 *   seed: string,            // semente estável para visuais
 *   drillable: boolean,      // true → clicar entra; false → clicar abre painel
 *   node?: object,           // (folder) nó para drillar
 *   file?: string,           // (file) caminho do arquivo p/ pré-selecionar
 *   topic: object            // tópico dono (contexto do painel)
 * }
 */
export function bodiesFromNode(node, topic) {
	if (!node) return [];
	const bodies = [];

	for (const sub of node.subpastas ?? []) {
		const hasChildren = nodeHasChildren(sub);
		bodies.push({
			kind: 'folder',
			nome: sub.nome,
			caminho: sub.caminho,
			seed: `${topic?.id ?? ''}::${sub.caminho}`,
			drillable: hasChildren,
			node: sub,
			topic
		});
	}

	for (const arq of node.arquivos ?? []) {
		bodies.push({
			kind: 'file',
			nome: arq.nome,
			caminho: arq.caminho,
			seed: `${topic?.id ?? ''}::${arq.caminho}`,
			drillable: false,
			file: arq.caminho,
			topic
		});
	}

	return bodies;
}

/**
 * Decide o nível inicial ao drillar num TÓPICO (lua da track).
 * Se o tree do tópico tem filhos, retorna os corpos dos filhos da raiz;
 * se não tem (tópico vazio / sem subpastas), retorna null para sinalizar que
 * o tópico deve abrir o painel direto (comportamento de hoje).
 *
 * @param {object} topic  tópico com `.tree`
 * @returns {Array<Body>|null}
 */
export function bodiesFromTopic(topic) {
	const root = topic?.tree;
	if (!nodeHasChildren(root)) return null; // folha: abre painel como hoje
	return bodiesFromNode(root, topic);
}

/**
 * Pilha de navegação (drill-down). Imutável por convenção: cada operação
 * retorna um NOVO array de frames. Um frame descreve um nível aberto.
 *
 * Frame = {
 *   node: object,     // o nó-pasta cujo conteúdo é este nível
 *   topic: object,    // tópico dono
 *   nome: string,     // rótulo para o breadcrumb
 *   caminho: string   // caminho relativo (p/ debug/seed)
 * }
 */

/** Empilha um novo frame ao drillar numa pasta. */
export function pushFrame(stack, frame) {
	return [...stack, frame];
}

/** Desempilha o último frame (sobe um nível). Nunca abaixo de vazio. */
export function popFrame(stack) {
	if (!stack.length) return [];
	return stack.slice(0, -1);
}

/**
 * Cria um frame a partir de um corpo "folder" que será drillado,
 * ou a partir de um tópico (nível raiz do tópico).
 */
export function frameForBody(body) {
	return {
		node: body.node,
		topic: body.topic,
		nome: body.nome,
		caminho: body.caminho
	};
}

export function frameForTopic(topic) {
	return {
		node: topic.tree,
		topic,
		nome: topic.nome,
		caminho: ''
	};
}

/**
 * Monta o breadcrumb textual a partir da pilha. Começa com o nome do tópico
 * raiz (primeiro frame) e segue com os nomes das pastas drilladas.
 * @returns {string[]} segmentos do caminho (ex.: ['02-POO','Exemplos','Heranca'])
 */
export function breadcrumbFromStack(stack) {
	return stack.map(f => f.nome).filter(Boolean);
}

/**
 * Retorna os corpos do nível atual (topo da pilha). Vazio → null.
 */
export function bodiesForTopFrame(stack) {
	if (!stack.length) return null;
	const top = stack[stack.length - 1];
	return bodiesFromNode(top.node, top.topic);
}
