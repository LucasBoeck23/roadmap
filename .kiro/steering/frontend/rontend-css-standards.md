
---
inclusion: fileMatch
fileMatchPattern:
  - "**/*.svelte"
  - "**/*.css"
  - "**/*.scss"
  - "**/*.sass"
  - "**/*.postcss"
---

# Frontend CSS Engineering Standards

## Objetivo

Produzir interfaces Svelte consistentes, responsivas, acessíveis e fáceis de manter, usando a menor quantidade de código necessária para atender ao requisito.

Prioridades:
1. Preservar o comportamento e o design existentes.
2. Corrigir a causa do problema, não esconder seus sintomas.
3. Reutilizar a arquitetura e os estilos existentes.
4. Minimizar duplicação, complexidade e impacto das alterações.
5. Validar a responsividade e a qualidade do resultado.

## 1. Inspeção obrigatória antes de codificar

Antes de modificar estilos:

- Inspecione o componente Svelte afetado e os componentes relacionados.
- Leia os estilos globais, tokens, variáveis, layouts compartilhados e componentes reutilizáveis relevantes.
- Identifique se o estilo vem de CSS local, CSS global, SCSS, classes utilitárias, CSS Modules ou outra abordagem presente no projeto.
- Consulte package.json e a configuração de build antes de sugerir ferramentas ou dependências.
- Investigue a cascata, a especificidade, a herança e as media queries que já controlam o elemento.
- Procure soluções existentes antes de criar novas classes, variáveis, seletores ou componentes.
- Se a causa do problema não estiver clara, investigue antes de alterar o código.

Não presuma que todo arquivo, classe ou regra existente é desnecessário sem verificar seu uso.

## 2. Princípio do menor CSS necessário

- Escreva somente as regras necessárias para resolver o requisito.
- Prefira modificar uma regra existente a adicionar outra regra concorrente.
- Não duplique propriedades, seletores, breakpoints, tokens ou declarações que já cumpram a mesma função.
- Não crie wrappers, classes auxiliares, arquivos, mixins, abstrações ou variáveis sem benefício concreto.
- Não crie uma nova classe para cada elemento se o padrão existente puder ser reutilizado.
- Não adicione !important, seletores excessivamente específicos ou sobrescritas em cascata para contornar conflitos sem investigar sua origem.
- Não adicione estilos inline quando o projeto já possui uma abordagem consistente de estilização.
- Não introduza dependências ou frameworks de UI para resolver problemas que podem ser tratados pela arquitetura existente.
- Preserve estilos e componentes não relacionados à tarefa.
- Não reescreva um componente inteiro quando uma alteração localizada for suficiente.

Antes de concluir, compare a solução com o código anterior e remova as regras desnecessárias introduzidas pela própria alteração.

## 3. Regras específicas para Svelte

- Respeite o escopo dos estilos locais de cada componente Svelte.
- Use :global() somente quando o estilo realmente precisar atingir elementos fora do escopo local.
- Não transforme estilos locais em globais para contornar problemas de seletor.
- Reutilize tokens e padrões globais para cores, espaçamentos, tipografia, raios, sombras e breakpoints.
- Não copie grandes blocos de CSS entre componentes quando houver uma solução de compartilhamento compatível com a arquitetura atual.
- Não extraia CSS para outro arquivo apenas para reorganizar o código sem uma vantagem real.
- Não introduza uma nova estratégia de estilização sem justificar como ela convive com a existente.
- Preserve a semântica, os estados e o comportamento dos componentes ao alterar a apresentação.
- Se houver classes condicionais, estados de carregamento, conteúdo dinâmico ou listas, garanta que os estilos funcionem em todos esses estados.

## 4. Responsividade por construção

- Prefira layouts fluidos com Flexbox, Grid e dimensionamento intrínseco.
- Utilize minmax(), min-width: 0, max-width, clamp() e unidades relativas quando forem adequados ao problema.
- Evite larguras e alturas rígidas que causem cortes, sobreposições ou overflow.
- Evite posicionamento absoluto para construir layouts que deveriam fluir naturalmente.
- Não corrija problemas estruturais com margens negativas, espaçamentos artificiais ou deslocamentos arbitrários.
- Não adicione media queries sem uma necessidade real demonstrada.
- Reutilize os breakpoints existentes; não invente novos sem justificativa.
- Considere textos longos, imagens, formulários, tabelas, botões, menus, cards e conteúdo dinâmico.
- Garanta que elementos flexíveis possam encolher e que o conteúdo não force a largura da página.
- Preserve a experiência em telas pequenas, médias e grandes.
- Não altere o layout desktop para corrigir o mobile sem verificar o impacto nos demais tamanhos.

## 5. Consistência e manutenção

- Siga o padrão de nomenclatura e organização já utilizado no projeto.
- Prefira seletores simples e com baixa especificidade.
- Evite seletores dependentes de estruturas HTML frágeis.
- Reutilize tokens existentes em vez de criar valores quase idênticos.
- Não introduza valores mágicos repetidos sem necessidade.
- Não aplique estilos globais para resolver um problema isolado de componente.
- Não misture novas convenções de CSS com as existentes sem uma justificativa clara.
- Considere acessibilidade, foco visível, contraste e estados interativos.

## 6. Validação das alterações

Após modificar estilos:

- Execute as verificações de qualidade disponíveis no projeto.
- Inspecione o diff para confirmar que apenas arquivos necessários foram alterados.
- Verifique se os estilos existentes continuam válidos e se componentes compartilhados não foram prejudicados.
- Quando houver navegador ou automação visual disponível, confira pelo menos um viewport móvel e um desktop.
- Verifique overflow horizontal, cortes, sobreposições, alinhamento, tipografia, espaçamento e estados interativos.
- Não afirme que realizou uma validação visual que não executou.
- Se não for possível executar a validação, informe a limitação.

## 7. Revisão final obrigatória

Antes de concluir uma tarefa de frontend, confirme:

1. Entendi a estrutura e a origem do estilo?
2. Reutilizei o que já existia?
3. Cada nova regra CSS é realmente necessária?
4. Introduzi duplicação, conflitos ou especificidade excessiva?
5. A solução permanece responsiva?
6. Posso resolver o problema com menos código e menor impacto?
7. Os testes e verificações disponíveis foram executados?

Se alguma alteração for desnecessária, remova-a antes de finalizar.

Ao responder ao usuário, resuma os arquivos modificados, o motivo das principais mudanças, as verificações executadas e quaisquer limitações encontradas.

