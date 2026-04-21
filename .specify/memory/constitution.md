<!-- SYNC IMPACT REPORT
Version change: 0.0.0 → 1.0.0
Added sections: Core Principles (5), Stack & Constraints, Workflow, Governance
Templates requiring updates:
  ✅ constitution.md (this file)
  ⚠ plan-template.md (add Constitution Check section)
  ⚠ spec-template.md (reference test-first principle)
  ⚠ tasks-template.md (add test task category)
Deferred TODOs: none
-->

# Facin Constitution

## Core Principles

### I. Spec-First (NÃO-NEGOCIÁVEL)

Todo comportamento novo DEVE ter spec escrita ANTES da implementação.
O ciclo Red → Green → Refactor é obrigatório.
Nenhum código de produção pode ser adicionado sem um teste falhando que o justifique.
Specs unitárias usam Vitest; specs E2E usam Playwright.

**Rationale**: Garante que cada linha de código tem propósito verificável e evita regressões silenciosas.

### II. Formato Moodle Válido

Todo XML gerado DEVE ser compatível com importação Moodle.
Tipos suportados: `multichoice` (single e multi-resposta via `<single>false</single>`) e `essay`.
Não existe `type="multichoice_multi"` — usar `<single>false</single>`.
Todo GIFT gerado DEVE seguir a especificação oficial do formato GIFT.

**Rationale**: O produto só tem valor se o arquivo importar sem erros no Moodle.

### III. Feedback Sempre Visível

Nenhuma ação do usuário pode resultar em silêncio.
Estados de carregamento, erro e sucesso DEVEM ser exibidos explicitamente.
Quando 0 questões são encontradas, exibir mensagem com dica de formato.
Duplicatas encontradas DEVEM ser listadas com identificação da questão.

**Rationale**: Sem feedback, o usuário não sabe se a ação funcionou — UX quebrada é bug.

### IV. Parsing Multi-Formato

O parser DEVE suportar: `.docx`, `.odt`, `.txt`, `.md`, `.rtf`, `.xml` (Moodle).
Arquivos XML Moodle como entrada DEVEM usar `extractXmlQuestions`, não `parseText`.
Encoding não-UTF8 (windows-1252, utf-16) DEVE ser detectado automaticamente.
Erros de parsing DEVEM exibir mensagem descritiva, nunca falhar silenciosamente.

**Rationale**: Professores usam formatos variados — rejeitar formatos válidos é perda de usuário.

### V. Automação como Destino

A aplicação DEVE evoluir para suportar processamento em lote (batch) sem interface gráfica.
Toda lógica de negócio DEVE residir em `src/lib/` — componentes React são apenas apresentação.
Funções de `src/lib/` DEVEM ser importáveis como módulo Node.js puro (sem browser APIs).
O objetivo final é uma CLI/API que receba arquivos e produza XML/GIFT sem interação humana.

**Rationale**: A automação elimina trabalho repetitivo e permite integração com pipelines de CI/CD educacional.

## Stack & Restrições

- **Frontend**: React + TypeScript + Vite + Zustand
- **Testes unitários**: Vitest (Node env), cobertura mínima: 80% statements/functions/branches
- **Testes E2E**: Playwright com Chromium 1194 (`--no-sandbox`)
- **Build**: `npm run build` para produção; `npm run preview` para E2E
- **Base path**: `/Facin/` — todas as URLs internas DEVEM respeitar `import.meta.env.BASE_URL`
- **Sem CDN bloqueante**: dependências externas DEVEM estar no bundle (não em `<script src="cdn">`)
- **Branch de trabalho**: `claude/review-app-spec-driven-gvfXl`

## Workflow de Desenvolvimento

1. `npx vitest run --coverage` — verificar estado antes de qualquer mudança
2. Escolher item do backlog em `CLAUDE.md` por prioridade
3. Escrever spec (teste falha)
4. Implementar mínimo para passar
5. Refatorar se necessário
6. `git add + commit + push` com mensagem descritiva
7. Atualizar `CLAUDE.md`: mover item para "Concluído", registrar decisões

**Comandos spec-kit disponíveis**:
- `/speckit-specify` → especificação de feature
- `/speckit-plan` → plano de implementação
- `/speckit-tasks` → tarefas acionáveis
- `/speckit-implement` → execução

## Governance

Esta constituição supersede qualquer prática anterior não documentada aqui.
Emendas DEVEM atualizar `CONSTITUTION_VERSION` seguindo semver:
- MAJOR: remoção ou redefinição incompatível de princípio
- MINOR: novo princípio ou seção adicionada
- PATCH: clarificações e correções de redação

Todo PR DEVE verificar conformidade com os princípios I a V antes do merge.
Exceções DEVEM ser justificadas com comentário no código e registradas em "Decisões técnicas" no `CLAUDE.md`.

**Version**: 1.0.0 | **Ratified**: 2026-04-21 | **Last Amended**: 2026-04-21
