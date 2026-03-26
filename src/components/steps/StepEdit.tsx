import { useState, useEffect, useRef } from 'react'
import { useStore } from '@/store'
import { parseText, findDuplicates, detectCodeInText, inferTemplate, groupByUnit } from '@/lib/parser'
import { buildAllUnits } from '@/lib/xmlBuilder'
import { triggerDownload } from '@/lib/extractor'
import type { Alternative, Question, UnitGroup } from '@/types'

export function StepEdit() {
  const rawText   = useStore(s => s.rawText)
  const setRawText= useStore(s => s.setRawText)
  const setParsed = useStore(s => s.setParsed)
  const perguntas = useStore(s => s.perguntas)
  const avisos    = useStore(s => s.avisos)
  const setStep     = useStore(s => s.setStep)
  const segments    = useStore(s => s.segments)
  const setSegments = useStore(s => s.setSegments)
  const options            = useStore(s => s.options)
  const setOptions         = useStore(s => s.setOptions)
  const codeTemplate       = useStore(s => s.codeTemplate)
  const setCodeTemplate    = useStore(s => s.setCodeTemplate)
  const detectedPattern    = useStore(s => s.detectedPattern)
  const setDetectedPattern = useStore(s => s.setDetectedPattern)
  const units              = useStore(s => s.units)
  const setUnits           = useStore(s => s.setUnits)

  const [viewMode, setViewMode] = useState<'text' | 'cards'>('cards')
  const [feedbackMode, setFeedbackMode] = useState<Map<number, 'geral' | 'item'>>(new Map())
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set())

  const cycleFeedback = (qi: number) => {
    setFeedbackMode(prev => {
      const next = new Map(prev)
      const cur = next.get(qi)
      if (!cur) next.set(qi, 'geral')
      else if (cur === 'geral') next.set(qi, 'item')
      else next.delete(qi)
      return next
    })
  }

  const toggleExpand = (qi: number) => {
    setExpandedCards(prev => {
      const next = new Set(prev)
      next.has(qi) ? next.delete(qi) : next.add(qi)
      return next
    })
  }

  // ── Convert state ──────────────────────────────────────────────────────────
  const [loading,         setLoading]         = useState(false)
  const [convertAvisos,   setConvertAvisos]   = useState<string[]>([])
  const [done,            setDone]            = useState(false)
  const [singleModOn,     setSingleModOn]     = useState(!!segments.mod)
  const [showOutput,      setShowOutput]      = useState(false)
  const [dragSrcIdx,      setDragSrcIdx]      = useState<number | null>(null)
  const [dragOverIdx,     setDragOverIdx]     = useState<number | null>(null)
  const [dragOverEnd,     setDragOverEnd]     = useState<string | null>(null)
  const cardRefs = useRef<Record<number, HTMLDivElement>>({});
  const [outputView,      setOutputView]      = useState<'xml' | 'preview'>('xml')
  const [selectedUnit,    setSelectedUnit]    = useState(0)

  const unitGroups = groupByUnit(perguntas)
  const multiUnit  = unitGroups.length > 1

  const unitLabel = (key: string) => {
    if (key === 'P?' && segments.unit) return `Unidade ${segments.unit}`
    if (key === 'P?') return 'P? (percurso não identificado)'
    const pm = key.match(/^P(\d+)$/)
    if (pm) return `Percurso / Unidade ${pm[1]}`
    const um = key.match(/^U(\d+)$/)
    if (um) return `Unidade ${um[1]}`
    const nm = key.match(/^(\d+)$/)
    if (nm) return `Percurso / Unidade ${nm[1]}`
    return key
  }

  const parseUnitKey = (key: string, groupMod?: string): { uz: string; mod: string } => {
    if (key === 'P?' && segments.unit) return { uz: `U${segments.unit}`, mod: groupMod || segments.mod }
    const num = key.match(/\d+/)
    if (num) return { uz: `U${num[0]}`, mod: groupMod || segments.mod }
    return { uz: key, mod: segments.mod }
  }

  const buildUnitTemplate = (unitKey: string, groupMod?: string): string => {
    const { prod, ano, tipo } = segments
    if (!prod || !ano || !tipo) return ''
    const { uz, mod } = parseUnitKey(unitKey, groupMod)
    if (!uz || !mod) return ''
    return `${prod}.${ano}.${uz}.${mod}.${tipo}.Q{n}`
  }


  const validationIssues = perguntas.flatMap((p, i) => {
    const issues: string[] = []
    if (!p.texto.trim()) issues.push(`Q${i+1}: sem enunciado`)
    if (p.questionType !== 'essay') {
      if (p.alternativas.length === 0) issues.push(`Q${i+1}: sem alternativas`)
      else if (p.alternativas.length === 1) issues.push(`Q${i+1}: apenas 1 alternativa`)
      if (p.alternativas.length > 0 && !p.alternativas.some(a => a.correta)) issues.push(`Q${i+1}: sem resposta correta`)
    }
    return issues
  })

  useEffect(() => {
    // Detect from raw text (full codes like 001.261.U1.1.O.Q1)
    const matches = detectCodeInText(rawText)
    if (matches.length > 0) {
      setDetectedPattern(inferTemplate(matches[0]))
      const m = matches[0].match(/(\d{2,6})\.(\d{2,5}(?:\.\d)?)\.([Uu]\d+)\.(\d+(?:\.\d+)*)\.([OoDd])/)
      if (m) {
        setSegments({ prod: m[1], ano: m[2], mod: m[4], tipo: m[5].toUpperCase() as 'O'|'D' })
        return
      }
    }
    // Fallback: detect from codigoQ fields of parsed questions
    const RE_GLOBAL = /\b(\d{2,6})\.(\d{2,5}(?:\.\d)?)\.[Uu]\d+\.\d+(?:\.\d+)*\.([OoDd])\.[Qq]\d+\b/i
    for (const p of perguntas) {
      const m = p.codigoQ?.match(RE_GLOBAL)
      if (m) {
        setSegments({ prod: m[1], ano: m[2], tipo: m[3].toUpperCase() as 'O'|'D' })
        break
      }
    }
  }, [])

  useEffect(() => {
    if (unitGroups.length === 1) {
      const t = buildUnitTemplate(unitGroups[0].unitKey)
      if (t) setCodeTemplate(t)
    }
  }, [segments.prod, segments.ano, segments.mod, segments.tipo, unitGroups.length])

  const needsGlobalFields = !detectedPattern && !perguntas.every(p => p.codigoQ)
  const missingFields = needsGlobalFields
    ? (['prod', 'ano', 'tipo'] as const).filter(k => !segments[k])
    : []
  const hasEmptyTexto   = perguntas.some(p => !p.texto.trim())
  const templateMissingN = !!codeTemplate && !codeTemplate.includes('{n}')

  const convert = () => {
    if (missingFields.length > 0) return
    setLoading(true)
    setDone(false)
    const warns: string[] = []
    perguntas.forEach((p, i) => {
      if (p.questionType === 'essay') return
      const corretas = p.alternativas.filter(a => a.correta).length
      if (corretas === 0) warns.push(`Questão ${i+1}: sem alternativa correta`)
      if (p.alternativas.length < 2) warns.push(`Questão ${i+1}: menos de 2 alternativas`)
    })
    setConvertAvisos(warns)
    const unitTemplates: Record<string, string> = {}
    unitGroups.forEach(g => {
      const mods = g.questions.map(q => q.percursoMod).filter(Boolean)
      const groupMod = mods.length > 0 ? mods[0] : segments.mod
      const t = buildUnitTemplate(g.unitKey, groupMod)
      if (t) unitTemplates[g.unitKey] = t
    })
    const opts = { ...options, codeTemplate, unitOffsets: {}, unitTemplates, segments }
    const result = buildAllUnits(perguntas, opts, detectedPattern)
    setUnits(result)
    setLoading(false)
    setOutputView('xml')
    setSelectedUnit(0)
    setDone(true)
    setShowOutput(true)
  }

  const downloadUnit = (u: UnitGroup) => triggerDownload(u.xml, `${u.unitKey.toLowerCase()}.xml`)
  const downloadAll  = () => units.forEach((u, i) => setTimeout(() => downloadUnit(u), i * 300))
  const downloadSingle = () => { if (units[0]) triggerDownload(units[0].xml, 'quiz.xml') }

  const updateText = (txt: string) => {
    setRawText(txt)
    const result = parseText(txt)
    setParsed(result.perguntas, result.avisos)
  }

  const autoNormalize = () => {
    const lines = rawText.split('\n')
    const out: string[] = []
    const reQuestaoWord = /^Quest[aã]o\s+(\d+)\s*([(（].*?[)）])?\s*/i
    const reQuestaoNum  = /^(\d+)\s*[).]\s+/
    const reAlternativa = /^[A-Ea-e]\s*[).]\s+/
    const reAnswer      = /^ANSWER\s*:/i
    // Matches a standalone code line or a code embedded anywhere
    const reCodeFull    = /\b\d{2,6}\.\d{2,5}(?:\.\d)?\.U\d+\.\d+(?:\.\d+)*\.[OoDd]\.[Qq]\d+\b/i
    const stripCodes    = (s: string) => s.replace(reCodeFull, '').replace(/[(（]\s*[)）]/g, '').trim()
    let qCount = 0
    let i = 0

    while (i < lines.length) {
      const l = lines[i].trim()
      if (!l) { i++; continue }
      // Skip lines that are purely a code (nothing else meaningful)
      if (reCodeFull.test(l) && stripCodes(l) === '') { i++; continue }

      if (reQuestaoWord.test(l)) {
        qCount++
        // Keep the header but strip any embedded code from the parenthetical
        const cleaned = l.replace(/[(（][^)）]*[)）]/g, m => {
          const inner = stripCodes(m.slice(1, -1))
          return inner ? `(${inner})` : ''
        }).trim()
        out.push(cleaned)
        i++
        while (i < lines.length) {
          const next = lines[i].trim()
          if (!next) { i++; continue }
          if (reAlternativa.test(next) || reAnswer.test(next)) break
          out.push(next)
          i++
        }
        continue
      }

      if (reQuestaoNum.test(l)) {
        qCount++
        const rest = stripCodes(l.replace(reQuestaoNum, '').trim())
        let enunciado = rest
        i++
        while (i < lines.length) {
          const next = lines[i].trim()
          if (!next) { i++; continue }
          if (reAlternativa.test(next) || reAnswer.test(next)) break
          if (reCodeFull.test(next) && stripCodes(next) === '') { i++; continue }
          enunciado = enunciado ? enunciado + ' ' + stripCodes(next) : stripCodes(next)
          i++
        }
        out.push(`${qCount}) ${enunciado}`)
        continue
      }

      if (reAlternativa.test(l)) {
        const letra = l[0].toUpperCase()
        const resto = stripCodes(l.replace(/^[A-Ea-e]\s*[).]\s*/, '').trim())
        out.push(`${letra}) ${resto}`)
        i++; continue
      }

      out.push(stripCodes(l))
      i++
    }

    updateText(out.join('\n'))
  }

  // ── Cards helpers ──────────────────────────────────────────────────────────
  const updateQuestion = (qi: number, changes: Partial<Question>) => {
    setParsed(perguntas.map((p, i) => i === qi ? { ...p, ...changes } : p), avisos)
  }

  const updateAlternative = (qi: number, ai: number, changes: Partial<Alternative>) => {
    setParsed(perguntas.map((p, i) => {
      if (i !== qi) return p
      return { ...p, alternativas: p.alternativas.map((a, j) => j === ai ? { ...a, ...changes } : a) }
    }), avisos)
  }

  const toggleCorreta = (qi: number, ai: number) => {
    updateAlternative(qi, ai, { correta: !perguntas[qi].alternativas[ai].correta })
  }

  const removeAlternative = (qi: number, ai: number) => {
    setParsed(perguntas.map((p, i) => {
      if (i !== qi) return p
      return { ...p, alternativas: p.alternativas.filter((_, j) => j !== ai) }
    }), avisos)
  }

  const addAlternative = (qi: number) => {
    const p = perguntas[qi]
    if (p.alternativas.length >= 5) return
    const letra = 'ABCDE'[p.alternativas.length]
    setParsed(perguntas.map((q, i) => {
      if (i !== qi) return q
      return { ...q, alternativas: [...q.alternativas, { letra, texto: '', correta: false, feedback: '' }] }
    }), avisos)
  }

  const remapAfterRemove = (qi: number) => {
    setFeedbackMode(prev => {
      const next = new Map<number, 'geral' | 'item'>()
      prev.forEach((v, k) => { if (k < qi) next.set(k, v); else if (k > qi) next.set(k - 1, v) })
      return next
    })
    setExpandedCards(prev => {
      const next = new Set<number>()
      prev.forEach(k => { if (k < qi) next.add(k); else if (k > qi) next.add(k - 1) })
      return next
    })
  }

  const remapAfterMove = (from: number, insertAt: number) => {
    const remap = (k: number) => {
      if (k === from) return insertAt
      if (from < insertAt && k > from && k <= insertAt) return k - 1
      if (from > insertAt && k >= insertAt && k < from) return k + 1
      return k
    }
    setFeedbackMode(prev => {
      const next = new Map<number, 'geral' | 'item'>()
      prev.forEach((v, k) => next.set(remap(k), v))
      return next
    })
    setExpandedCards(prev => {
      const next = new Set<number>()
      prev.forEach(k => next.add(remap(k)))
      return next
    })
  }

  const removeQuestion = (qi: number) => {
    remapAfterRemove(qi)
    setParsed(perguntas.filter((_, i) => i !== qi), avisos)
  }

  const addQuestion = () => {
    const lastUnit = unitGroups.length > 0 ? unitGroups[unitGroups.length - 1].unitKey : null
    const newQ: Question = {
      texto: '', tituloHint: '', codigoQ: '',
      seqNum: String(perguntas.length + 1),
      unitKey: lastUnit, percursoMod: segments.mod || '',
      alternativas: [], feedbackGeral: '',
      linha: 0, formato: 'A',
    }
    const newIdx = perguntas.length
    setParsed([...perguntas, newQ], avisos)
    setExpandedCards(prev => { const next = new Set(prev); next.add(newIdx); return next })
  }

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  const handleDndDrop = (e: React.DragEvent, targetQi: number, targetUnitKey: string) => {
    e.preventDefault()
    if (dragSrcIdx === null || dragSrcIdx === targetQi) {
      setDragSrcIdx(null); setDragOverIdx(null); return
    }
    const arr = [...perguntas]
    const [moved] = arr.splice(dragSrcIdx, 1)
    moved.unitKey = targetUnitKey
    const insertAt = dragSrcIdx < targetQi ? targetQi - 1 : targetQi
    arr.splice(insertAt, 0, moved)
    remapAfterMove(dragSrcIdx, insertAt)
    setParsed(arr, avisos)
    setDragSrcIdx(null); setDragOverIdx(null)
  }

  const handleDndDropOnGroup = (e: React.DragEvent, targetUnitKey: string) => {
    e.preventDefault()
    if (dragSrcIdx === null) return
    const arr = [...perguntas]
    const [moved] = arr.splice(dragSrcIdx, 1)
    moved.unitKey = targetUnitKey
    let insertAt = arr.length
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].unitKey === targetUnitKey) { insertAt = i + 1; break }
    }
    arr.splice(insertAt, 0, moved)
    remapAfterMove(dragSrcIdx, insertAt)
    setParsed(arr, avisos)
    setDragSrcIdx(null); setDragOverIdx(null)
  }

  const lines = rawText.split('\n').filter(l => l.trim()).length

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3">
        <h2 className="font-bold text-base">✏️ Revise o texto extraído</h2>
        <div className="flex-1" />
        <button onClick={() => setStep(1)} className="btn-secondary">← Voltar</button>
        <button onClick={() => { setRawText(''); setParsed([], []) }} className="btn-secondary">
          🗑 Limpar
        </button>
      </div>


      {/* View mode toggle */}
      <div className="flex gap-1 p-1 bg-surface rounded-xl border border-border shrink-0">
        {(['cards', 'text'] as const).map(v => (
          <button key={v} onClick={() => setViewMode(v)}
            className={`flex-1 py-2 px-3 rounded-lg text-[16px] font-mono font-bold transition-all
              ${viewMode === v
                ? 'bg-surface2 text-white border border-border'
                : 'text-white/30 hover:text-white/60'}`}>
            {v === 'text' ? '📝 Editar texto' : '🃏 Editar por cards'}
          </button>
        ))}
      </div>

      {/* ── Main editor area ── */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-0.5">

        {viewMode === 'text' ? (
          <>
            {/* Text mode sub-toolbar */}
            <div className="flex items-center gap-3">
              <button onClick={autoNormalize} className="btn-secondary border-accent3/40 text-accent3 hover:bg-accent3/10 text-xs py-1">
                ⚙️ Auto-normalizar
              </button>
              <span className="font-mono text-xs text-white/30">
                {lines} linhas · {rawText.length} chars
              </span>
            </div>
            {/* Editor */}
            <textarea
              value={rawText}
              onChange={e => updateText(e.target.value)}
              className="input min-h-52 resize-y leading-7 text-[13px]"
              spellCheck={false}
              placeholder="O texto extraído aparecerá aqui para você revisar e editar..."
            />

            {/* Hint */}
            <div className="card border-l-4 border-l-accent4 text-xs font-mono text-white/40 leading-relaxed space-y-1">
              <p><span className="text-white/60">Formato aceito:</span></p>
              <p><span className="text-accent">1)</span> Enunciado da questão &nbsp;·&nbsp; <span className="text-accent">A)</span> Alternativa</p>
              <p>Marque a correta com <span className="text-accent">*</span> no final &nbsp;·&nbsp; ou use <span className="text-accent">ANSWER: B; Feedback: texto</span></p>
              <p>Cabeçalho <span className="text-accent">Questão N (Percurso...)</span> também é reconhecido automaticamente</p>
              <p className="text-white/25 pt-1"><span className="text-accent3">⚙️ Auto-normalizar</span> converte formatos variados para o padrão</p>
            </div>
          </>
        ) : (
          /* Cards mode */
          perguntas.length === 0 ? (
            <div className="card text-center py-12 space-y-4">
              <div className="text-4xl opacity-40">📭</div>
              <div className="space-y-1">
                <p className="text-white/50 text-sm font-mono">Nenhuma questão criada.</p>
                <p className="text-white/20 text-xs font-mono">crie sua questão manualmente.</p>
              </div>
              <div className="flex flex-col items-center gap-2 pt-1">
                <button onClick={addQuestion}
                  className="flex items-center gap-2 font-mono text-sm font-bold px-6 py-2 rounded-lg
                    border border-dashed border-accent/40 text-accent/70
                    hover:border-accent hover:text-accent hover:bg-accent/8 transition-all">
                  + Nova questão
                </button>
              </div>
            </div>
          ) : (() => {
            return (
              <div className="space-y-2">
                {/* Global config bar */}
                <div className="flex items-center gap-x-4 gap-y-1 flex-wrap px-1 py-2 border-b border-border">
                  <span className="text-[10px] font-mono text-white/25 uppercase tracking-widest">Campos globais</span>
                  {([
                    { key: 'prod', label: 'Prod',    ph: '001' },
                    { key: 'ano',  label: 'Ano/Sem', ph: '261' },
                  ] as const).map(f => {
                    const hasError = missingFields.includes(f.key as 'prod' | 'ano' | 'tipo')
                    return (
                      <div key={f.key} className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-mono ${hasError ? 'text-accent2' : 'text-white/30'}`}>
                          {f.label}<span className="text-accent2 ml-0.5">*</span>
                        </span>
                        <input
                          value={segments[f.key]}
                          onChange={e => setSegments({ [f.key]: e.target.value })}
                          className={`input text-xs py-0.5 w-14 text-center font-mono ${hasError ? 'border-accent2/60 bg-accent2/5' : ''}`}
                          placeholder={f.ph}
                        />
                      </div>
                    )
                  })}

                  {/* Módulo único toggle — oculto quando há múltiplos percursos */}
                  {!multiUnit && <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        const next = !singleModOn
                        setSingleModOn(next)
                        if (next) {
                          const v = segments.mod || '1'
                          setSegments({ mod: v })
                          setParsed(perguntas.map(p => ({ ...p, percursoMod: v })), avisos)
                        } else {
                          setSegments({ mod: '' })
                          setParsed(perguntas.map(p => ({ ...p, percursoMod: '' })), avisos)
                        }
                      }}
                      className={`relative w-7 h-3.5 rounded-full transition-colors shrink-0 ${singleModOn ? 'bg-accent' : 'bg-border'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-2.5 h-2.5 bg-white rounded-full transition-transform ${singleModOn ? 'translate-x-3' : ''}`} />
                    </button>
                    <span className="text-[10px] font-mono text-white/30 whitespace-nowrap">Mód. único</span>
                    {singleModOn && (
                      <input
                        value={segments.mod}
                        onChange={e => {
                          const v = e.target.value
                          setSegments({ mod: v })
                          if (v) setParsed(perguntas.map(p => ({ ...p, percursoMod: v })), avisos)
                        }}
                        className="input text-xs py-0.5 w-10 text-center font-mono"
                        placeholder="1"
                        autoFocus
                      />
                    )}
                  </div>}

                  {/* Tipo */}
                  {(() => {
                    const hasError   = missingFields.includes('tipo')
                    const types      = [...new Set(perguntas.map(p => p.questionType ?? 'multichoice'))]
                    const mixedTypes = types.length > 1
                    return (
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-mono ${hasError ? 'text-accent2' : mixedTypes ? 'text-white/20' : 'text-white/30'}`}>
                          Tipo{!mixedTypes && <span className="text-accent2 ml-0.5">*</span>}
                        </span>
                        <input
                          value={mixedTypes ? 'misto' : segments.tipo}
                          onChange={e => setSegments({ tipo: e.target.value as 'O' | 'D' })}
                          disabled={mixedTypes}
                          className={`input text-xs py-0.5 ${mixedTypes ? 'w-15' : 'w-14'} text-center font-mono
                            ${hasError && !mixedTypes ? 'border-accent2/60 bg-accent2/5' : ''}
                            ${mixedTypes ? 'opacity-30 cursor-not-allowed' : ''}`}
                          placeholder="O"
                        />
                      </div>
                    )
                  })()}

                  <span className="text-[10px] font-mono text-white/20 ml-auto">{perguntas.length} questões</span>
                </div>

                {/* Cards — grouped by percurso */}
                {(() => {
                  const perguntaGlobalIdx = new Map(perguntas.map((p, i) => [p, i]))
                  return groupByUnit(perguntas).map(({ unitKey, questions }) => (
                    <div key={unitKey} className="space-y-1">

                      {/* Group header — drop zone (only when multi-percurso) */}
                      {multiUnit && (
                        <div
                          onDragOver={e => e.preventDefault()}
                          onDrop={e => handleDndDropOnGroup(e, unitKey)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed select-none transition-all
                            ${dragSrcIdx !== null
                              ? 'border-accent4/50 bg-accent4/5 text-accent4 cursor-copy'
                              : 'border-accent4/20 text-accent4/50'}`}
                        >
                          <span className="text-[11px] font-mono font-bold">{unitLabel(unitKey)}</span>
                          <span className="text-[10px] font-mono text-white/25">{questions.length}q</span>
                          {dragSrcIdx !== null && (
                            <span className="text-[10px] font-mono text-accent4/40 ml-auto">soltar aqui →</span>
                          )}
                        </div>
                      )}

                      {questions.map((p, localIdx) => {
                        const qi = perguntaGlobalIdx.get(p)!
                        const hasCorrect   = p.alternativas.some(a => a.correta)
                        const fbMode     = feedbackMode.get(qi) ?? null
                        const expanded   = expandedCards.has(qi)
                        const isDragging = dragSrcIdx === qi
                        const isDragOver = dragOverIdx === qi && dragSrcIdx !== qi

                        return (
                          <div
                            key={qi}
                            onDragOver={e => { e.preventDefault(); setDragOverIdx(qi) }}
                            onDrop={e => handleDndDrop(e, qi, unitKey)}
                            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverIdx(null) }}
                            className={`transition-all duration-150 ${isDragOver ? 'pt-3' : ''}`}
                          >
                            {isDragOver && (
                              <div className="h-0.5 rounded-full bg-accent mx-0.5 mb-2" />
                            )}
                            <div
                              ref={el => { if (el) cardRefs.current[qi] = el }}
                              className={`card p-0 overflow-hidden
                                ${!hasCorrect && p.alternativas.length > 0 ? 'border-l-4 border-l-accent2' : ''}
                                ${isDragging ? 'opacity-30 border-dashed' : ''}`}
                            >
                            {/* Header — always visible, click to expand */}
                            <div
                              draggable
                              onDragStart={e => {
                                setDragSrcIdx(qi)
                                const card = cardRefs.current[qi]
                                if (card) e.dataTransfer.setDragImage(card, 24, 16)
                              }}
                              onDragEnd={() => { setDragSrcIdx(null); setDragOverIdx(null); setDragOverEnd(null) }}
                              className="flex items-center gap-2 flex-wrap px-4 py-3 cursor-grab select-none hover:bg-white/2 transition-colors"
                              onClick={() => toggleExpand(qi)}
                            >
                              {/* Drag handle */}
                              <span className="text-white/25 text-sm shrink-0">⠿</span>

                              <span className="text-white/20 text-[10px] shrink-0">{expanded ? '▼' : '▶'}</span>
                              <span className="font-mono text-xs font-bold text-accent shrink-0">Q{multiUnit ? localIdx + 1 : qi + 1}</span>

                              {/* Tipo: múltipla escolha / dissertativa */}
                              <button
                                onClick={e => { e.stopPropagation(); const next = p.questionType === 'essay' ? 'multichoice' : 'essay'; updateQuestion(qi, { questionType: next }); setSegments({ tipo: next === 'essay' ? 'D' : 'O' }) }}
                                className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors shrink-0
                                  ${p.questionType === 'essay'
                                    ? 'border-accent3/50 text-accent3 bg-accent3/8'
                                    : 'border-accent/30 text-accent/60 bg-accent/5 hover:border-accent/60 hover:text-accent'}`}
                              >
                                {p.questionType === 'essay' ? '✏️ Dissertativa' : ' 🎯 Objetiva'}
                              </button>

                              {/* Unidade */}
                              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                <span className="text-[10px] font-mono text-white/25">Unid.</span>
                                <input
                                  value={p.unitKey ?? ''}
                                  onChange={e => {
                                    const v = e.target.value.replace(/\D/g, '')
                                    updateQuestion(qi, { unitKey: v || null })
                                  }}
                                  className={`input text-xs py-0.5 w-14 text-center font-mono
                                    ${p.unitKey ? 'text-accent4 border-accent4/40' : 'border-white/10 placeholder-white/20'}`}
                                  placeholder="U?"
                                  onClick={e => e.stopPropagation()}
                                />
                              </div>

                              {/* Módulo */}
                              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                <span className="text-[10px] font-mono text-white/25">Mód.</span>
                                <input
                                  value={p.percursoMod}
                                  onChange={e => updateQuestion(qi, { percursoMod: e.target.value })}
                                  className={`input text-xs py-0.5 w-10 text-center font-mono
                                    ${p.percursoMod ? 'text-white/70' : 'border-white/10 placeholder-white/20'}`}
                                  placeholder="1"
                                  onClick={e => e.stopPropagation()}
                                />
                              </div>

                              {/* Question preview when collapsed */}
                              {!expanded && p.texto && (
                                <span className="text-[11px] font-mono text-white/30 truncate flex-1 min-w-0">
                                  {p.texto.slice(0, 65)}{p.texto.length > 65 ? '…' : ''}
                                </span>
                              )}

                              {!hasCorrect && p.alternativas.length > 0 && (
                                <span className="text-accent2 text-[11px] font-mono shrink-0">⚠️</span>
                              )}
                              {p.questionType !== 'essay' && (
                                <button
                                  onClick={e => { e.stopPropagation(); cycleFeedback(qi) }}
                                  className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-colors shrink-0
                                    ${fbMode === 'item'  ? 'border-accent3/80 text-accent3 bg-accent3/15'
                                    : fbMode === 'geral' ? 'border-accent3/50 text-accent3/80 bg-accent3/8'
                                    : 'border-border/40 text-white/25 hover:border-accent3/40 hover:text-accent3/60'}`}
                                >
                                  {fbMode === 'item' ? 'FB Item' : fbMode === 'geral' ? 'FB Geral' : 'FB'}
                                </button>
                              )}

                              <div className="flex-1 min-w-0" />

                              <button
                                onClick={e => { e.stopPropagation(); removeQuestion(qi) }}
                                className="text-[11px] font-mono text-white/25 hover:text-accent2 transition-colors shrink-0"
                              >
                                ✕ remover
                              </button>
                            </div>
                            {/* Body — collapsible */}
                            {expanded && (
                              <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                                <textarea
                                  value={p.texto}
                                  onChange={e => updateQuestion(qi, { texto: e.target.value })}
                                  className="input resize-y text-sm leading-relaxed min-h-15"
                                  placeholder="Enunciado da questão..."
                                />

                                {p.questionType === 'essay' && (
                                  <div className="space-y-2">
                                    <p className="text-[11px] font-mono text-accent3/60 italic pl-1">
                                      ✏️ Dissertativa — o aluno responde em campo aberto.
                                    </p>
                                    <textarea
                                      value={p.feedbackGeral}
                                      onChange={e => updateQuestion(qi, { feedbackGeral: e.target.value })}
                                      className="input resize-y text-sm leading-relaxed min-h-12 border-accent3/20 text-white/60 placeholder-white/25"
                                      placeholder="Feedback / critério de correção (graderinfo)..."
                                    />
                                  </div>
                                )}

                                {p.questionType !== 'essay' && <div className="space-y-2">
                                  {p.alternativas.length === 0 && (
                                    <p className="text-[11px] font-mono text-white/25 italic pl-1">Sem alternativas.</p>
                                  )}
                                  {p.alternativas.map((a, ai) => (
                                    <div key={ai}>
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={() => toggleCorreta(qi, ai)}
                                          title={a.correta ? 'Desmarcar como correta' : 'Marcar como correta'}
                                          className={`w-7 h-7 shrink-0 rounded-full font-mono text-xs font-bold transition-all
                                            ${a.correta
                                              ? 'bg-accent/15 text-accent border border-accent'
                                              : 'border border-border text-white/40 hover:border-accent/50 hover:text-white/70'}`}
                                        >
                                          {a.letra}
                                        </button>
                                        <input
                                          value={a.texto}
                                          onChange={e => updateAlternative(qi, ai, { texto: e.target.value })}
                                          className="input flex-1 text-sm py-1.5"
                                          placeholder={`Alternativa ${a.letra}...`}
                                        />
                                        <button
                                          onClick={() => removeAlternative(qi, ai)}
                                          className="text-white/20 hover:text-accent2 transition-colors text-sm shrink-0 w-5 text-center"
                                        >✕</button>
                                      </div>
                                      {fbMode === 'item' && (
                                        <input
                                          value={a.feedback}
                                          onChange={e => updateAlternative(qi, ai, { feedback: e.target.value })}
                                          className="input text-xs py-1 mt-1.5 ml-9 border-accent3/20 text-white/60 placeholder-white/20"
                                          style={{ width: 'calc(100% - 2.25rem)' }}
                                          placeholder={`Feedback ${a.letra}...`}
                                        />
                                      )}
                                    </div>
                                  ))}
                                  {fbMode === 'geral' && (
                                    <input
                                      value={p.feedbackGeral}
                                      onChange={e => updateQuestion(qi, { feedbackGeral: e.target.value })}
                                      className="input text-xs py-1 border-accent3/20 text-white/60 placeholder-white/20"
                                      placeholder="Feedback geral da questão..."
                                    />
                                  )}
                                  {p.alternativas.length < 5 && (
                                    <button
                                      onClick={() => addAlternative(qi)}
                                      className="text-[11px] font-mono text-white/30 hover:text-accent transition-colors pl-1"
                                    >+ adicionar alternativa</button>
                                  )}
                                </div>}
                              </div>
                            )}
                            </div>
                          </div>
                        )
                      })}

                      {/* End drop zone — allows dropping after the last card */}
                      <div
                        onDragOver={e => { e.preventDefault(); setDragOverEnd(unitKey) }}
                        onDragLeave={() => setDragOverEnd(null)}
                        onDrop={e => { handleDndDropOnGroup(e, unitKey); setDragOverEnd(null) }}
                        className={`h-3 rounded-full transition-all duration-150
                          ${dragSrcIdx !== null
                            ? dragOverEnd === unitKey
                              ? 'bg-accent'
                              : 'bg-white/5'
                            : ''}`}
                      />
                    </div>
                  ))
                })()}

                {/* Nova questão */}
                <button
                  onClick={addQuestion}
                  className="w-full py-2.5 rounded-xl border border-dashed border-border text-white/30
                    hover:border-accent/50 hover:text-accent transition-all text-xs font-mono font-bold"
                >
                  + Nova questão
                </button>
              </div>
            )
          })()
        )}
      {/* ── Config bar ── */}
      <div className="shrink-0 bg-surface rounded-xl border border-border overflow-hidden">
        {/* Controls row */}
        <div className="flex items-center gap-x-3 gap-y-2 flex-wrap px-4 py-2.5 border-b border-border">
          {/* Penalidade */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider">Penalidade</span>
            <select
              className="select text-xs py-0.5 w-18"
              value={options.penalty}
              onChange={e => setOptions({ penalty: e.target.value })}
            >
              <option value="0">0%</option>
              <option value="0.25">25%</option>
              <option value="0.33">33%</option>
              <option value="0.5">50%</option>
              <option value="1">100%</option>
            </select>
          </div>

          <div className="w-px h-3.5 bg-border shrink-0" />

          {/* Embaralhar toggle */}
          <button
            onClick={() => setOptions({ shuffle: !options.shuffle })}
            className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border transition-all text-[11px] font-mono
              ${options.shuffle
                ? 'border-accent/40 text-accent bg-accent/8'
                : 'border-border text-white/35 hover:border-border/80 hover:text-white/55'}`}
          >
            <span className={`relative w-6 h-3 rounded-full transition-colors shrink-0 ${options.shuffle ? 'bg-accent' : 'bg-border'}`}>
              <span className={`absolute top-0.5 left-0.5 w-2 h-2 bg-white rounded-full transition-transform ${options.shuffle ? 'translate-x-3' : ''}`} />
            </span>
            Embaralhar
          </button>

          {/* Feedback/alt toggle */}
          <button
            onClick={() => setOptions({ useAltFeedback: !options.useAltFeedback })}
            className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border transition-all text-[11px] font-mono
              ${options.useAltFeedback
                ? 'border-accent/40 text-accent bg-accent/8'
                : 'border-border text-white/35 hover:border-border/80 hover:text-white/55'}`}
          >
            <span className={`relative w-6 h-3 rounded-full transition-colors shrink-0 ${options.useAltFeedback ? 'bg-accent' : 'bg-border'}`}>
              <span className={`absolute top-0.5 left-0.5 w-2 h-2 bg-white rounded-full transition-transform ${options.useAltFeedback ? 'translate-x-3' : ''}`} />
            </span>
            Feedback/alt.
          </button>

          {/* XML/perc — só quando multi-percurso */}
          {multiUnit && (
            <>
              <div className="w-px h-3.5 bg-border shrink-0" />
              <button
                onClick={() => setOptions({ splitByUnit: !options.splitByUnit })}
                className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border transition-all text-[11px] font-mono
                  ${options.splitByUnit
                    ? 'border-accent4/40 text-accent4 bg-accent4/8'
                    : 'border-border text-white/35 hover:border-border/80 hover:text-white/55'}`}
              >
                <span className={`relative w-6 h-3 rounded-full transition-colors shrink-0 ${options.splitByUnit ? 'bg-accent4' : 'bg-border'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-2 h-2 bg-white rounded-full transition-transform ${options.splitByUnit ? 'translate-x-3' : ''}`} />
                </span>
                XML/percurso
              </button>
            </>
          )}

          <div className="flex-1" />

          {/* Badges de aviso */}
          {templateMissingN && (
            <span className="text-[11px] font-mono text-accent2 cursor-default" title="Template sem {n}: todas as questões terão o mesmo nome">
              ⚠️ template
            </span>
          )}
          {validationIssues.length > 0 && (
            <span className="text-[11px] font-mono text-accent3 cursor-default" title={validationIssues.join('\n')}>
              ⚠️ {validationIssues.length}
            </span>
          )}
          {convertAvisos.length > 0 && (
            <span className="text-[11px] font-mono text-accent3 whitespace-nowrap">
              ⚠️ {convertAvisos.length} avisos
            </span>
          )}

          {/* Gerar / Ver XML — botão único */}
          {(() => {
            const blocked = loading || perguntas.length === 0 || missingFields.length > 0 || hasEmptyTexto
            const title = missingFields.length > 0 ? `Preencha: ${missingFields.join(', ')}`
              : hasEmptyTexto ? 'Há questões sem enunciado' : undefined
            return done && units.length > 0 ? (
              <div className="flex items-stretch rounded-lg overflow-hidden border border-accent/40 shrink-0">
                <button
                  onClick={() => setShowOutput(true)}
                  className="px-3 py-1 text-[11px] font-mono text-accent hover:bg-accent/10 transition-all whitespace-nowrap"
                >
                  📄 Ver XML
                </button>
                <div className="w-px bg-accent/20" />
                <button onClick={convert} disabled={blocked} title={title}
                  className="px-3 py-1 text-[11px] font-mono text-accent/60 hover:text-accent hover:bg-accent/10 transition-all whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {loading ? '…' : '↺'}
                </button>
              </div>
            ) : (
              <button onClick={convert} disabled={blocked} title={title}
                className="flex items-center gap-2 px-3 py-1 rounded-lg border transition-all text-[11px] font-mono shrink-0
                  border-accent/40 text-accent bg-accent/8 hover:bg-accent/15
                  disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {loading ? 'Gerando…' : '⚡ Gerar XML'}
              </button>
            )
          })()}
        </div>
      </div>

        {/* Avisos do parser */}
        {avisos.length > 0 && (
          <div className="card border-l-4 border-l-accent3 space-y-1">
            <div className="text-[11px] font-mono uppercase tracking-widest text-accent3 mb-1">
              ⚠️ {avisos.length} aviso(s) de importação
            </div>
            {avisos.map((a, i) => (
              <div key={i} className="text-xs font-mono text-accent3/70">• {a}</div>
            ))}
          </div>
        )}

        {/* Duplicates */}
        {(() => {
          const duplicates = findDuplicates(perguntas)
          if (duplicates.length === 0) return null
          return (
            <div className="card border-l-4 border-l-accent2 space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-widest text-accent2 mb-1">
                ⚠️ {duplicates.length} duplicata(s) detectada(s)
              </div>
              <div className="space-y-3 max-h-48 overflow-y-auto">
                {duplicates.map((d, i) => (
                  <div key={i} className="space-y-1">
                    <div className="text-xs font-mono text-white/50">
                      <span className="text-accent3">
                        {d.type === 'code' ? '🔑 Código' : '📄 Texto'} igual
                      </span>
                      <span className="text-white/30 mx-1">—</span>
                      <span className="text-accent2">
                        Q{d.indexes.map(idx => idx + 1).join(' e Q')}
                      </span>
                      <span className="text-white/25 ml-2">
                        {d.value}{d.value.length >= 80 ? '…' : ''}
                      </span>
                    </div>
                    <div className="flex gap-2 pl-2">
                      {d.indexes.map(idx => (
                        <button
                          key={idx}
                          onClick={() => removeQuestion(idx)}
                          className="text-[11px] font-mono px-2 py-0.5 rounded border border-accent2/30
                                     text-accent2/70 hover:bg-accent2/15 hover:text-accent2 hover:border-accent2/60
                                     transition-all"
                        >
                          remover Q{idx + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

      </div>{/* end main editor area */}

      {/* ── Output modal ── */}
      {showOutput && done && units.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
          onClick={e => e.target === e.currentTarget && setShowOutput(false)}>
          <div className="w-full max-w-2xl bg-surface border border-border rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <span className="font-bold text-sm">📄 XML gerado</span>
              <button onClick={() => setShowOutput(false)} className="text-white/30 hover:text-white transition-colors text-lg leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Toggle + stats + Copiar */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="flex gap-1 p-0.5 bg-surface rounded-lg border border-border">
                {(['xml', 'preview'] as const).map(v => (
                  <button key={v} onClick={() => setOutputView(v)}
                    className={`px-3 py-1 rounded text-[11px] font-mono font-bold transition-all ${outputView === v ? 'bg-surface2 text-white' : 'text-white/30 hover:text-white/60'}`}>
                    {v === 'xml' ? '< XML >' : '👁 Preview'}
                  </button>
                ))}
              </div>
              <span className="text-[11px] font-mono text-white/25">
                {perguntas.length}q · {unitGroups.length > 1 ? `${unitGroups.length} percursos` : '1 percurso'}
                {convertAvisos.length > 0 && <span className="text-accent3 ml-1">· {convertAvisos.length} avisos</span>}
              </span>
            </div>
            {outputView === 'xml' && (
              <button onClick={() => navigator.clipboard.writeText(units[selectedUnit]?.xml ?? '')}
                className="text-xs font-mono text-white/40 border border-border px-3 py-1 rounded hover:border-accent hover:text-accent transition-all">
                Copiar
              </button>
            )}
          </div>

          {/* Unit tabs */}
          {outputView === 'xml' && units.length > 1 && (
            <div className="flex gap-1 flex-wrap">
              {units.map((u, i) => (
                <button key={u.unitKey} onClick={() => setSelectedUnit(i)}
                  className={`text-[11px] font-mono px-3 py-1 rounded-lg border transition-all
                    ${selectedUnit === i ? 'border-accent4 text-accent4 bg-accent4/10' : 'border-border text-white/30 hover:border-accent4/40 hover:text-white/60'}`}>
                  {unitLabel(u.unitKey)} <span className="text-white/25">({u.questions.length}q)</span>
                </button>
              ))}
            </div>
          )}

          {/* XML textarea or Preview */}
          {outputView === 'xml' ? (
            <textarea readOnly className="input min-h-40 text-[11px] leading-relaxed text-white/40"
              value={units[selectedUnit]?.xml ?? ''} />
          ) : (
            <div className="space-y-3">
              {units.map(u => {
                const uz = u.unitKey.match(/^P(\d+)$/) ? `U${u.unitKey.match(/^P(\d+)$/)![1]}` : u.unitKey
                const getQName = (q: Question, qNum: number) => {
                  if (q.codigoQ) return q.codigoQ
                  if (q.percursoMod && segments.prod && segments.ano && segments.tipo)
                    return `${segments.prod}.${segments.ano}.${uz}.${q.percursoMod}.${segments.tipo}.Q${qNum}`
                  const tmpl = options.unitTemplates?.[u.unitKey]
                  if (tmpl) return tmpl.replace(/\{n\}/g, String(qNum))
                  if (codeTemplate) return codeTemplate.replace(/\{n\}/g, String(qNum))
                  if (detectedPattern) return detectedPattern.replace(/\{n\}/g, String(qNum))
                  return `Q${qNum}`
                }
                return (
                  <div key={u.unitKey}>
                    {units.length > 1 && (
                      <div className="text-[11px] font-mono uppercase tracking-widest text-accent4 mb-2 px-1">{unitLabel(u.unitKey)}</div>
                    )}
                    {u.questions.map((q, j) => {
                      const qNum = u.startQ + j
                      const qName = getQName(q, qNum)
                      const hasCorrect = q.alternativas.some(a => a.correta)
                      return (
                        <div key={j} className="bg-surface2 border border-border rounded-xl p-3 space-y-2 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-accent/70">{qName}</span>
                            {!hasCorrect && <span className="font-mono text-[11px] text-accent2">⚠️ sem resposta</span>}
                          </div>
                          <p className="text-sm text-white/80 leading-relaxed">{q.texto || <span className="text-white/25 italic">sem enunciado</span>}</p>
                          <div className="space-y-1 pl-1">
                            {q.alternativas.map((a, k) => (
                              <div key={k} className={`flex items-start gap-2 text-xs font-mono rounded px-2 py-0.5 ${a.correta ? 'text-accent font-bold' : 'text-white/45'}`}>
                                <span className="shrink-0">{a.letra})</span>
                                <span>{a.texto}</span>
                                {a.correta && <span className="text-accent/60 ml-1">✓</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}

          {/* Download buttons */}
          {options.splitByUnit && units.length > 1 ? (
            <div className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-widest text-white/30">Downloads por percurso</div>
              {units.map((u, i) => (
                <div key={i} className="flex items-center justify-between bg-surface border border-border rounded-lg px-4 py-3 flex-wrap gap-3">
                  <div>
                    <div className="font-bold text-accent4 text-sm">{unitLabel(u.unitKey)}</div>
                    <div className="text-xs font-mono text-white/30">{u.questions.length}q · Q{u.startQ}–Q{u.startQ + u.questions.length - 1}</div>
                  </div>
                  <button onClick={() => downloadUnit(u)} className="btn-secondary text-xs">⬇️ {u.unitKey.toLowerCase()}.xml</button>
                </div>
              ))}
              <button onClick={downloadAll} className="w-full py-3 border border-accent text-accent font-bold text-sm rounded-xl hover:bg-accent/5 transition-all">⬇️ Baixar todos os XMLs</button>
            </div>
          ) : (
            <button onClick={downloadSingle} className="btn-secondary w-full py-3 text-sm font-bold">⬇️ Baixar quiz.xml</button>
          )}
          </div>
          </div>
        </div>
      )}

    </div>
  )
}
