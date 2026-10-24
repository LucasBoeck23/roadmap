
---
inclusion: auto
name: frontend-audit
description: Use when auditing, refactoring, optimizing, debugging or reviewing Svelte components, CSS, SCSS, responsive layouts, duplicated styles or frontend architecture.
---

# Frontend Audit and Refactoring

## Fase 1: Mapear antes de modificar

1. Identifique a estrutura do frontend, as páginas e os componentes reutilizáveis.
2. Localize os estilos globais, estilos locais, tokens, breakpoints e mecanismos de estilização.
3. Inspecione as dependências e os scripts existentes.
4. Pesquise duplicações e conflitos nos arquivos relacionados ao problema.
5. Diferencie problemas comprovados de suspeitas que precisam de validação.

Não modifique arquivos nesta fase.

## Fase 2: Produzir diagnóstico

Para cada problema encontrado, informe:

- Arquivo e localização aproximada.
- Evidência observada.
- Causa provável ou confirmada.
- Impacto visual, funcional ou de manutenção.
- Risco de regressão.
- Correção mínima recomendada.

Priorize problemas que quebram a responsividade, duplicam regras ou dificultam a manutenção.

Não recomende remover regras apenas porque parecem redundantes. Verifique sua utilização e seus efeitos antes de propor a remoção.

## Fase 3: Planejar a menor refatoração possível

- Separe correções funcionais de melhorias cosméticas.
- Preserve o design atual, salvo quando a tarefa pedir mudanças visuais.
- Evite reescritas abrangentes.
- Não introduza dependências sem benefício demonstrável.
- Identifique quais páginas e componentes podem ser afetados.
- Solicite confirmação antes de mudanças arquiteturais abrangentes ou de alto risco.

## Fase 4: Implementar incrementalmente

- Corrija primeiro a causa raiz.
- Reutilize padrões e tokens existentes.
- Faça alterações localizadas.
- Revise o diff depois de cada etapa.
- Não misture refatorações não relacionadas à tarefa.

## Fase 5: Verificar

Execute os scripts existentes de lint, checagem de tipos, testes e build, conforme aplicável.

Se houver ferramenta de navegador disponível, teste os viewports relevantes e verifique possíveis regressões.

Não considere a ausência de erros de lint como prova de responsividade.

## Resultado

Apresente:
- Problemas corrigidos.
- Arquivos modificados.
- CSS redundante removido, quando comprovado.
- Verificações executadas e resultados.
- Riscos restantes ou validações não realizadas.

