# Facin — Contexto de Sessão

Conversor de questões para Moodle XML/GIFT. Serve em `/Facin/` (Vite base path).

## Stack

- **Frontend**: React + TypeScript + Vite + Zustand
- **Testes unitários**: Vitest (Node env) — `npx vitest run`
- **Testes E2E**: Playwright (Chromium 1194) — `npx playwright test`
- **Cobertura**: `npx vitest run --coverage`
- **Dev server**: `npm run dev` → `http://localhost:5173/Facin/`

## Estrutura principal

```
src/lib/
  parser.ts          — parseia texto bruto → Question[]
  xmlBuilder.ts      — Question[] → Moodle XML
  giftBuilder.ts     — Question[] → GIFT
  extractor.ts       — extrai texto de XML Moodle (importação)
  profiles.ts        — perfis salvos no localStorage
  __tests__/         — specs Vitest (5 arquivos, 121 testes)
e2e/app.spec.ts      — specs Playwright (21 testes)
src/components/steps/
  StepImport.tsx     — passo 1: upload / colar texto
  StepEdit.tsx       — passo 2: editar questões + gerar XML/GIFT
```

## Estado atual dos testes

| Suite | Testes | Status |
|-------|--------|--------|
| xmlBuilder | 28 | ✅ passando |
| giftBuilder | 28 | ✅ passando |
| parser | 25 | ✅ passando |
| profiles | 15 | ✅ passando |
| extractor | 20 | ✅ passando (excluído da cobertura) |
| **Total unitários** | **121** | ✅ |
| E2E Playwright | 21 | ⚠️ ver seção abaixo |

**Cobertura**: 94.31% statements / 80.2% branches / 100% functions

## Problema conhecido: E2E

`waitUntil: 'domcontentloaded'` trava no Chromium 1194 com Vite dev mode.
`waitUntil: 'commit'` funciona para navegação.

**Próximo passo**: mudar `goto()` para `waitUntil: 'commit'` e `waitReady` para aguardar elemento React:

```typescript
async function waitReady(page: Page) {
  await page.getByAltText('Facin.').waitFor({ timeout: 15000 })
}
```

## Branch de trabalho

`claude/review-app-spec-driven-gvfXl`

---

## Rotina Diária (Spec-Driven)

A cada sessão, executar nesta ordem:

### 1. Verificar estado
```bash
npx vitest run --coverage   # todos os 121+ devem passar
git status                  # sem sujeira
```

### 2. Consultar backlog
Ver seção **Backlog** abaixo. Pegar o item de maior prioridade.

### 3. Workflow spec-first
1. **Escrever specs** para o comportamento desejado (teste falha — red)
2. **Implementar** o mínimo para passar (green)
3. **Refatorar** se necessário (refactor)
4. Rodar `npx vitest run` — confirmar tudo verde
5. Commit com mensagem descritiva

### 4. Atualizar este arquivo
- Mover item do backlog para "Concluído"
- Atualizar tabela de testes se houver novos
- Registrar qualquer decisão técnica importante em "Decisões"

---

## Backlog

### Alta prioridade
- [ ] **E2E: corrigir waitReady** — trocar `domcontentloaded` por aguardar elemento `Facin.` (ver seção E2E acima)
- [ ] **parser.ts: aumentar cobertura de branches** — atualmente 81.11%; linhas 53-66, 71-72, 125-126 descobertas

### Média prioridade
- [ ] **xmlBuilder.ts: cobrir branches** — linhas 29-31, 137 descobertas (72.58% branches)
- [ ] **giftBuilder.ts: cobrir branches** — linha 18, 21-33, 98 descobertas
- [ ] **E2E: testar download real** — verificar se o arquivo quiz.xml é baixado corretamente

### Baixa prioridade
- [ ] **StepEdit.tsx: spec de integração** — testar fluxo completo import → edit → export no nível de componente
- [ ] **Perfis: spec de UI** — testar salvar/carregar perfil pela interface

---

## Concluído

- [x] Setup Vitest com cobertura v8
- [x] Setup Playwright com Chromium 1194 + no-sandbox
- [x] 121 testes unitários passando (94.31% cobertura)
- [x] giftBuilder.ts implementado via spec-first (28 specs antes do código)
- [x] profiles.ts bug de ID duplicado corrigido
- [x] xmlBuilder.test.ts spec incorreto corrigido (multichoice_multi → single>false)
- [x] E2E: URLs corrigidas para /Facin/ base path

---

## Decisões técnicas

- **IDs de perfil**: `p_${Date.now()}_${Math.random().toString(36).slice(2,7)}` — sufixo aleatório evita colisão em testes rápidos
- **Moodle multichoice multi**: usa `type="multichoice"` + `<single>false</single>`, não existe `type="multichoice_multi"`
- **GIFT escape**: caracteres `~=#{}\\` precisam de `\` antes; `&` não precisa em GIFT
- **extractor.ts excluído da cobertura**: depende de DOMParser (browser API), difícil no Node env

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
