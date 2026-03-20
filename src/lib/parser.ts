import type { Question, Alternative, ParseResult } from '@/types'

const RE_QUESTAO_WORD = /^Quest[aã]o\s+\d+/i
const RE_QUESTAO_NUM  = /^[0-9]+[).]\s+/
const RE_ALTERNATIVA  = /^[A-Ea-e][).]\s+/
const RE_ANSWER       = /^ANSWER\s*:\s*([A-Ea-e?])(?:\s*;(?:\s*Feedback\s*:\s*(.+))?)?/i
const RE_FEEDBACK_LINE= /^Feedback\s*:\s*(.+)/i
const RE_CODE_PATTERN = /\b(\d{2,6})\.(\d{2,5}(?:\.\d)?)\.([Uu]\d+)\.(\d+(?:\.\d+)*)\.([OoDd])\.([Qq]\d+)\b/

export function parseText(texto: string): ParseResult {
  const linhas = texto
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .split('\n')

  const perguntas: Question[] = []
  const avisos: string[] = []
  let perguntaAtual: Question | null = null
  let numeroLinha = 0
  let awaitingFeedback = false

  for (const rawLine of linhas) {
    numeroLinha++
    const l = rawLine.trim()
    if (!l) continue

    // Line after ANSWER that starts with "Feedback:"
    if (awaitingFeedback && perguntaAtual) {
      const fbLine = l.match(RE_FEEDBACK_LINE)
      if (fbLine) {
        perguntaAtual.feedbackGeral = fbLine[1].trim()
        awaitingFeedback = false
        continue
      }
      awaitingFeedback = false
    }

    // Format B: "Questão N (...)"
    if (RE_QUESTAO_WORD.test(l)) {
      const codeMatch  = l.match(/[(（]([\w.]+(?:\.[\w]+)*)[)）]/)
      const codigoQ    = codeMatch ? codeMatch[1] : ''
      const parenMatch = l.match(/[(（](.*?)[)）]/)
      const tituloHint = parenMatch ? parenMatch[1].trim() : ''

      // "Percurso 1.2" → unitKey=P1 (group by percurso), percursoMod=2
      // "Percurso 1"   → unitKey=P1, percursoMod=''
      const percFullMatch   = tituloHint.match(/Percurso\s+(\d+)\.(\d+)/i)
      const percSimpleMatch = tituloHint.match(/Percurso\s+(\d+)/i)

      let unitKey: string | null = null
      let percursoMod = ''

      if (percFullMatch) {
        unitKey     = `P${percFullMatch[1]}`   // group by percurso number only
        percursoMod = percFullMatch[2]          // store module separately
      } else if (percSimpleMatch) {
        unitKey = `P${percSimpleMatch[1]}`
      } else {
        const uzMatch = codigoQ.match(/\.(U\d+)\./i)
        unitKey = uzMatch ? uzMatch[1].toUpperCase() : null
      }

      const numMatch = l.match(/^Quest[aã]o\s+(\d+)/i)

      perguntaAtual = {
        texto: '', tituloHint, codigoQ,
        seqNum: numMatch ? numMatch[1] : '',
        unitKey, percursoMod, alternativas: [], feedbackGeral: '',
        linha: numeroLinha, formato: 'B'
      }
      perguntas.push(perguntaAtual)
      awaitingFeedback = false
      continue
    }

    // Format A: "1) ..."
    if (RE_QUESTAO_NUM.test(l)) {
      const textoSemNum = l.replace(/^[0-9]+[).]\s*/, '').trim()
      perguntaAtual = {
        texto: textoSemNum, tituloHint: '', codigoQ: '',
        seqNum: l.match(/^(\d+)/)?.[1] ?? '',
        unitKey: null, percursoMod: '', alternativas: [], feedbackGeral: '',
        linha: numeroLinha, formato: 'A'
      }
      perguntas.push(perguntaAtual)
      awaitingFeedback = false
      continue
    }

    // ANSWER line
    const ansMatch = l.match(RE_ANSWER)
    if (ansMatch && perguntaAtual) {
      const letraCorreta = ansMatch[1].toUpperCase()
      const fbTexto      = ansMatch[2] ? ansMatch[2].trim() : ''
      if (letraCorreta !== '?') {
        perguntaAtual.alternativas.forEach(a => {
          if (a.letra === letraCorreta) a.correta = true
        })
      }
      if (fbTexto) {
        perguntaAtual.feedbackGeral = fbTexto
        awaitingFeedback = false
      } else {
        awaitingFeedback = true
      }
      continue
    }

    // Alternative
    if (RE_ALTERNATIVA.test(l)) {
      if (!perguntaAtual) {
        avisos.push(`Linha ${numeroLinha}: alternativa sem questão`)
        continue
      }
      const letra    = l[0].toUpperCase()
      const correta  = l.includes('*')
      const fbMatch  = l.match(/\[fb:\s*(.*?)\]/i)
      const altFb    = fbMatch ? fbMatch[1].trim() : ''
      const textoAlt = l
        .replace(/\*/g, '')
        .replace(/\[fb:[^\]]*\]/gi, '')
        .replace(/^[A-Ea-e][).]\s*/, '')
        .trim()
      const alt: Alternative = { letra, texto: textoAlt, correta, feedback: altFb }
      perguntaAtual.alternativas.push(alt)
      continue
    }

    // Continuation / enunciado
    if (perguntaAtual && perguntaAtual.alternativas.length === 0) {
      perguntaAtual.texto = perguntaAtual.texto
        ? perguntaAtual.texto + ' ' + l
        : l
    }
  }

  return { perguntas, avisos }
}

export function detectCodeInText(texto: string): string[] {
  const matches: string[] = []
  for (const l of texto.split('\n')) {
    const m = l.match(RE_CODE_PATTERN)
    if (m) matches.push(m[0])
    if (matches.length >= 3) break
  }
  return matches
}

export function inferTemplate(code: string): string {
  return code.replace(/[Qq](\d+)$/, 'Q{n}')
}

export function groupByUnit(perguntas: Question[]): Array<{ unitKey: string; questions: Question[] }> {
  const map = new Map<string, Question[]>()
  const order: string[] = []
  for (const p of perguntas) {
    const k = p.unitKey ?? 'P?'
    if (!map.has(k)) { map.set(k, []); order.push(k) }
    map.get(k)!.push(p)
  }
  return order.map(k => ({ unitKey: k, questions: map.get(k)! }))
}
