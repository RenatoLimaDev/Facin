export interface Alternative {
  letra: string
  texto: string
  correta: boolean
  feedback: string
}

export interface Question {
  texto: string
  tituloHint: string
  codigoQ: string
  seqNum: string
  unitKey: string | null
  alternativas: Alternative[]
  feedbackGeral: string
  linha: number
  formato: 'A' | 'B'
}

export interface ParseResult {
  perguntas: Question[]
  avisos: string[]
}

export type QMode = 'reset' | 'continue' | 'offset'

export interface ConvertOptions {
  questionType: 'multichoice' | 'multichoice_multi'
  prefix: string
  codeTemplate: string
  penalty: string
  shuffle: boolean
  fbCorrect: string
  fbIncorrect: string
  useAltFeedback: boolean
  splitByUnit: boolean
  qmode: QMode
  unitOffsets: Record<string, number>
  unitTemplates: Record<string, string>
}

export interface CodeSegments {
  prod: string
  ano: string
  unit: string
  mod: string
  tipo: 'O' | 'D'
  [key: string]: string
}

export interface Profile {
  id: string
  name: string
  segments: CodeSegments
  options: Partial<ConvertOptions>
  createdAt: number
}

export interface UnitGroup {
  unitKey: string
  questions: Question[]
  startQ: number
  xml: string
}

export type Step = 1 | 2 | 3
