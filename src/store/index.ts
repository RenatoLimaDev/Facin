import { create } from 'zustand'
import type { Step, ConvertOptions, CodeSegments, UnitGroup, Question } from '@/types'

interface AppState {
  // Navigation
  step: Step
  setStep: (s: Step) => void

  // Raw text (editor)
  rawText: string
  setRawText: (t: string) => void

  // Parsed questions
  perguntas: Question[]
  avisos: string[]
  setParsed: (perguntas: Question[], avisos: string[]) => void

  // Code builder
  segments: CodeSegments
  setSegments: (s: Partial<CodeSegments>) => void
  codeTemplate: string          // built from segments or manual override
  setCodeTemplate: (t: string) => void
  detectedPattern: string
  setDetectedPattern: (p: string) => void

  // Convert options
  options: ConvertOptions
  setOptions: (o: Partial<ConvertOptions>) => void

  // Output
  units: UnitGroup[]
  setUnits: (u: UnitGroup[]) => void
}

const DEFAULT_OPTIONS: ConvertOptions = {
  questionType: 'multichoice',
  prefix: 'Questão',
  codeTemplate: '',
  penalty: '0',
  shuffle: true,
  fbCorrect: '',
  fbIncorrect: '',
  useAltFeedback: false,
  splitByUnit: false,
  qmode: 'reset',
  unitOffsets: {},
  unitTemplates: {},
}

const DEFAULT_SEGMENTS: CodeSegments = {
  prod: '', ano: '', unit: '', mod: '', tipo: 'O'
}

export const useStore = create<AppState>((set) => ({
  step: 1,
  setStep: (step) => set({ step }),

  rawText: '',
  setRawText: (rawText) => set({ rawText }),

  perguntas: [],
  avisos: [],
  setParsed: (perguntas, avisos) => set({ perguntas, avisos }),

  segments: DEFAULT_SEGMENTS,
  setSegments: (s) => set(state => ({ segments: { ...state.segments, ...s } as CodeSegments })),
  codeTemplate: '',
  setCodeTemplate: (codeTemplate) => set({ codeTemplate }),
  detectedPattern: '',
  setDetectedPattern: (detectedPattern) => set({ detectedPattern }),

  options: DEFAULT_OPTIONS,
  setOptions: (o) => set(state => ({ options: { ...state.options, ...o } })),

  units: [],
  setUnits: (units) => set({ units }),
}))
