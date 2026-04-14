import { describe, it, expect } from 'vitest'
import { buildXml } from '../xmlBuilder'
import { parseText, findCrossDuplicates } from '../parser'
import { extractXmlQuestions } from '../extractor'

const SAMPLE_TXT = `1) Qual é a capital do Brasil?
A) São Paulo
B) Brasília *
C) Rio de Janeiro
D) Salvador

2) Quanto é 2 + 2?
A) 3
B) 5
C) 4 *
D) 6`

describe('round-trip: txt → XML → verificar duplicatas', () => {
  it('detecta todas as questões do txt no XML gerado', () => {
    const { perguntas } = parseText(SAMPLE_TXT)
    const xml = buildXml(perguntas, {
      questionType: 'multichoice', prefix: 'Questão', codeTemplate: '',
      penalty: '0', shuffle: false, fbCorrect: '', fbIncorrect: '',
      useAltFeedback: false, splitByUnit: false, qmode: 'reset',
      unitOffsets: {}, unitTemplates: {},
    }, 1, '')
    const refQs = extractXmlQuestions(xml)
    const cross = findCrossDuplicates(perguntas, refQs)
    expect(refQs.length).toBe(perguntas.length)
    expect(cross.length).toBe(perguntas.length)
  })

  it('detecta duplicatas entre dois XMLs idênticos', () => {
    const { perguntas } = parseText(SAMPLE_TXT)
    const opts = {
      questionType: 'multichoice' as const, prefix: 'Questão', codeTemplate: 'Q{n}',
      penalty: '0', shuffle: false, fbCorrect: '', fbIncorrect: '',
      useAltFeedback: false, splitByUnit: false, qmode: 'reset' as const,
      unitOffsets: {}, unitTemplates: {},
    }
    const xml = buildXml(perguntas, opts, 1, '')
    const file1 = extractXmlQuestions(xml)
    const file2 = extractXmlQuestions(xml)
    const asPerguntas = file1.map((q, i) => ({
      texto: q.texto, tituloHint: '', codigoQ: q.name,
      seqNum: String(i + 1), unitKey: null as null, percursoMod: '',
      alternativas: [], feedbackGeral: '', linha: i, formato: 'A' as const,
    }))
    const cross = findCrossDuplicates(asPerguntas, file2)
    expect(cross.length).toBe(file1.length)
  })
})
