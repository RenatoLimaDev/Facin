<p align="center">
  <img src="https://raw.githubusercontent.com/RenatoLimaDev/Facin/main/public/facin-logo.svg" alt="Facin." height="40" />
</p>

> Converta listas de questões em XML Moodle com um clique — sem instalar nada, sem enviar dados para servidores.

![Stack](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6?logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?logo=tailwindcss&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)
![Unit Tests](https://img.shields.io/badge/unit_tests-60%20passed-brightgreen)
![E2E Tests](https://img.shields.io/badge/e2e_tests-11%20passed-brightgreen)
![Coverage](https://img.shields.io/badge/coverage-92%25-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Preview

| Importar arquivo | Verificar duplicatas |
|:---:|:---:|
| ![Import](docs/preview-import.png) | ![Duplicatas](docs/preview-duplicates.png) |

| Editor por cards | Saída XML |
|:---:|:---:|
| ![Editor](docs/preview-editor.png) | ![XML](docs/preview-xml.png) |

---

## O que é

**Facin.** é uma aplicação web client-side que transforma arquivos de texto com questões (`.docx`, `.odt`, `.txt`, `.md`, `.rtf`) em XML compatível com a importação do Moodle. Todo o processamento acontece no navegador — nenhum dado sai do seu computador.

---

## Funcionalidades

### Importação
- Arraste ou selecione arquivos `.docx`, `.odt`, `.txt`, `.md`, `.rtf`
- Cole texto diretamente no editor
- Detecção automática de encoding (UTF-8, UTF-16, Windows-1252)
- Criação de questões manualmente, sem precisar importar arquivo

### Verificação de Duplicatas
- Detecção de questões duplicadas por texto ou código interno
- Cruzamento com banco Moodle XML existente
- Preview e remoção individual antes de converter

### Editor por Cards
- Edição completa de enunciado, alternativas e feedbacks
- Suporte a **múltipla escolha** e **dissertativa** (`essay`)
- Toggle de feedback com 3 modos: desligado · geral · por alternativa
- Reordenação por drag & drop entre unidades
- Validação em tempo real com bloqueio de XML inválido

### Geração de XML
- Saída compatível com importação nativa do Moodle
- Nomenclatura automática por padrão de código detectado
  - Segmentos configuráveis: `PROD.ANO.UNIDADE.MODULO.TIPO.Qn`
  - Tipos: `O` (objetiva) e `D` (dissertativa)
- Organização por unidades com numeração configurável
- Opções: penalidade, embaralhar alternativas, feedback por questão
- Download individual por unidade ou ZIP com todos os arquivos

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| UI | React 18 + TypeScript 5.5 |
| Build | Vite 5 |
| Estilo | Tailwind CSS v4 (plugin nativo Vite) |
| Estado | Zustand 4 |
| Testes unitários | Vitest 4 + @vitest/coverage-v8 |
| Testes E2E | Playwright 1.58 (Chromium) |
| Parser DOCX | Mammoth |
| Parser ODT/ZIP | Implementação própria (Web Streams API) |

---

## Testes

```bash
# Unitários (Vitest)
npm test           # modo watch
npm run test:run   # uma execução
npm run coverage   # relatório de cobertura

# E2E (Playwright)
npm run e2e        # roda todos os testes E2E + gera screenshots em docs/
npm run e2e:ui     # modo interativo com UI do Playwright
```

```
 Test Files  2 passed
      Tests  60 passed

 % Coverage report from v8
 --------------|---------|----------|---------|---------
 File          | % Stmts | % Branch | % Funcs | % Lines
 --------------|---------|----------|---------|---------
 parser.ts     |   91.21 |    81.11 |     100 |   90.51
 xmlBuilder.ts |   95.12 |    73.43 |     100 |   94.66
 --------------|---------|----------|---------|---------
 All files     |   92.60 |    77.92 |     100 |   91.98
 --------------|---------|----------|---------|---------
```

Os testes cobrem as funções puras de parsing e geração de XML (`parser.ts`, `xmlBuilder.ts`). Componentes React e extração de arquivos (`extractor.ts`) ficam fora do escopo por dependerem de APIs de browser.

---

## Rodando localmente

```bash
# Clone
git clone https://github.com/seu-usuario/Facin.git
cd Facin

# Instale dependências
npm install

# Inicie o servidor de desenvolvimento
npm run dev
```

Build de produção:

```bash
npm run build
npm run preview
```

---

## Estrutura do projeto

```
src/
├── components/
│   ├── steps/
│   │   ├── StepImport.tsx   # Upload, colar texto, verificar duplicatas
│   │   └── StepEdit.tsx     # Editor de questões e geração de XML
│   └── ui/
│       └── StepIndicator.tsx
├── lib/
│   ├── __tests__/
│   │   ├── parser.test.ts
│   │   └── xmlBuilder.test.ts
│   ├── extractor.ts         # Extração de texto (DOCX, ODT, RTF, TXT)
│   ├── parser.ts            # Parser de questões e detector de duplicatas
│   └── xmlBuilder.ts        # Construtor de XML
├── store/
│   └── index.ts             # Estado global (Zustand)
└── types/
    └── index.ts             # Interfaces TypeScript
```

---

## Formato de entrada suportado

O parser reconhece dois formatos de questão:

**Formato A** — numeração simples:
```
1. Qual é a capital do Brasil?
A) São Paulo
B) Brasília *
C) Rio de Janeiro
ANSWER: B
```

**Formato B** — com código de percurso:
```
Questão 1 (001.261.U1.2.O.Q1)
Enunciado da questão
a) Alternativa A
b) Alternativa B *
ANSWER: B; Feedback: Explicação da resposta correta.
```

Questões dissertativas não possuem alternativas — apenas enunciado e feedback para o avaliador (`graderinfo` no XML).

---

## Privacidade

Todo o processamento acontece localmente no navegador. Nenhum arquivo ou conteúdo é enviado para servidores externos. A única requisição de rede opcional é o envio de sugestões de funcionalidades via formulário integrado.

---

## Roadmap

- [ ] Suporte a imagens nas questões
- [ ] Importação de múltiplos arquivos simultâneos
- [ ] Exportação para formato GIFT
- [ ] Tema claro

---

## Licença

MIT © Renato Lima

<p align="center">
  <img src="https://raw.githubusercontent.com/RenatoLimaDev/Facin/main/public/sed-icon.svg" alt="SEDLABS" height="36" />
</p>
