import { useState, useEffect } from 'react'
import { useStore } from '@/store'
import { buildAllUnits } from '@/lib/xmlBuilder'
import { detectCodeInText, inferTemplate, groupByUnit } from '@/lib/parser'
import { readProfiles, saveProfile, deleteProfile } from '@/lib/profiles'
import { triggerDownload } from '@/lib/extractor'
import type { Profile, UnitGroup } from '@/types'

export function StepConvert() {
  const { setStep, rawText, perguntas, options, setOptions,
          segments, setSegments, codeTemplate, setCodeTemplate,
          detectedPattern, setDetectedPattern, units, setUnits } = useStore(s => ({
    setStep:            s.setStep,
    rawText:            s.rawText,
    perguntas:          s.perguntas,
    options:            s.options,
    setOptions:         s.setOptions,
    segments:           s.segments,
    setSegments:        s.setSegments,
    codeTemplate:       s.codeTemplate,
    setCodeTemplate:    s.setCodeTemplate,
    detectedPattern:    s.detectedPattern,
    setDetectedPattern: s.setDetectedPattern,
    units:              s.units,
    setUnits:           s.setUnits,
  }))

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading]   = useState(false)
  const [avisos, setAvisos]     = useState<string[]>([])
  const [done, setDone]         = useState(false)
  const [offsets, setOffsets]   = useState<Record<string, number>>({})

  const unitGroups = groupByUnit(perguntas)
  const multiUnit  = unitGroups.length > 1

  // Parse unitKey into uz and mod
  // "P1"   → { uz: 'U1', mod: segments.mod }
  // "P1.2" → { uz: 'U1', mod: '2' }
  const parseUnitKey = (key: string): { uz: string; mod: string } => {
    const fullMatch = key.match(/^P(\d+)\.(\d+)$/)
    if (fullMatch) return { uz: `U${fullMatch[1]}`, mod: fullMatch[2] }
    const simpleMatch = key.match(/^P(\d+)$/)
    if (simpleMatch) return { uz: `U${simpleMatch[1]}`, mod: segments.mod }
    return { uz: key, mod: segments.mod }
  }

  // Build code template for a given unit
  const buildUnitTemplate = (unitKey: string): string => {
    const { prod, ano, tipo } = segments
    if (!prod || !ano || !tipo) return ''
    const { uz, mod } = parseUnitKey(unitKey)
    if (!uz || !mod) return ''
    return `${prod}.${ano}.${uz}.${mod}.${tipo}.Q{n}`
  }

  // Detect code on mount
  useEffect(() => {
    setProfiles(readProfiles())
    const matches = detectCodeInText(rawText)
    if (matches.length > 0) {
      setDetectedPattern(inferTemplate(matches[0]))
      const m = matches[0].match(/(\d{2,6})\.(\d{2,5}(?:\.\d)?)\.([Uu]\d+)\.(\d+(?:\.\d+)*)\.([OoDd])/)
      if (m) {
        setSegments({ prod: m[1], ano: m[2], mod: m[4], tipo: m[5].toUpperCase() as 'O'|'D' })
      }
    }
  }, [])

  // Rebuild single template (used when single unit)
  useEffect(() => {
    if (unitGroups.length === 1) {
      const t = buildUnitTemplate(unitGroups[0].unitKey)
      if (t) setCodeTemplate(t)
    }
  }, [segments, unitGroups.length])

  const handleSaveProfile = () => {
    const name = prompt('Nome do perfil (ex: Programação 2025.1):')
    if (!name?.trim()) return
    saveProfile(name.trim(), segments, options)
    setProfiles(readProfiles())
  }

  const handleLoadProfile = (p: Profile) => {
    if (p.segments) setSegments(p.segments)
    if (p.options)  setOptions(p.options)
  }

  const handleDeleteProfile = (id: string) => {
    deleteProfile(id)
    setProfiles(readProfiles())
  }

  const convert = () => {
    setLoading(true)
    setDone(false)
    const warns: string[] = []

    perguntas.forEach((p, i) => {
      const corretas = p.alternativas.filter(a => a.correta).length
      if (corretas === 0) warns.push(`Questão ${i+1}: sem alternativa correta`)
      if (p.alternativas.length < 2) warns.push(`Questão ${i+1}: menos de 2 alternativas`)
    })
    setAvisos(warns)

    // Build per-unit templates automatically
    const unitTemplates: Record<string, string> = {}
    unitGroups.forEach(g => {
      const t = buildUnitTemplate(g.unitKey)
      if (t) unitTemplates[g.unitKey] = t
    })

    const opts = { ...options, codeTemplate, unitOffsets: offsets, unitTemplates }
    const result = buildAllUnits(perguntas, opts, detectedPattern)
    setUnits(result)
    setLoading(false)
    setDone(true)
  }

  const downloadUnit = (u: UnitGroup) => triggerDownload(u.xml, `${u.unitKey.toLowerCase()}.xml`)
  const downloadAll  = () => units.forEach((u, i) => setTimeout(() => downloadUnit(u), i * 300))
  const downloadSingle = () => { if (units[0]) triggerDownload(units[0].xml, 'quiz.xml') }

  // Preview of generated codes per unit
  const codePreview = unitGroups.map(g => {
    const { uz, mod } = parseUnitKey(g.unitKey)
    return {
      key:   g.unitKey,
      uz,
      mod,
      tmpl:  buildUnitTemplate(g.unitKey),
      count: g.questions.length,
    }
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-base">⚙️ Configurações de conversão</h2>
        <button onClick={() => setStep(2)} className="btn-secondary">← Editar texto</button>
      </div>

      {/* Profiles */}
      <div className="card flex items-center gap-3 flex-wrap">
        <span className="font-mono text-[11px] uppercase tracking-widest text-white/30">Perfis</span>
        <div className="flex gap-2 flex-wrap flex-1">
          {profiles.length === 0 ? (
            <span className="text-white/30 text-xs font-mono">Nenhum perfil salvo.</span>
          ) : profiles.map(p => (
            <div key={p.id} className="flex items-center border border-border rounded-lg overflow-hidden
                                        bg-surface2 hover:border-accent3/50 transition-colors">
              <button onClick={() => handleLoadProfile(p)}
                className="px-3 py-1.5 font-mono text-xs text-white hover:text-accent3 transition-colors">
                {p.name}
              </button>
              <button onClick={() => handleDeleteProfile(p.id)}
                className="px-2 py-1.5 border-l border-border text-white/30
                           hover:bg-red-500/20 hover:text-red-400 transition-all text-[11px]">
                ✕
              </button>
            </div>
          ))}
        </div>
        <button onClick={handleSaveProfile}
          className="text-accent3 border border-accent3/40 text-xs font-bold px-3 py-1.5
                     rounded-lg hover:bg-accent3/10 transition-all whitespace-nowrap">
          + Salvar atual
        </button>
      </div>

      {/* Code builder */}
      <div className="card border-l-4 border-l-accent4 space-y-4">
        <h3 className="font-bold text-accent4 text-sm">🏷️ Código da questão</h3>

        {/* Global fields */}
        <div className="bg-surface2 border border-border rounded-xl p-4">
          <div className="text-[10px] font-mono text-white/30 uppercase tracking-widest mb-3">
            Campos globais — Módulo é usado quando não vem do Percurso X.Y
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            {[
              { key: 'prod', label: 'Produção',       ph: '001', w: '68px' },
              { key: 'ano',  label: 'Ano/Sem',        ph: '261', w: '68px' },
              { key: 'mod',  label: 'Módulo (padrão)', ph: '3',   w: '80px' },
            ].map(({ key, label, ph, w }, idx) => (
              <div key={key} className="flex items-end gap-2">
                {idx > 0 && <span className="text-border text-lg pb-2">.</span>}
                <div className="flex flex-col gap-1 items-center">
                  <span className="text-[10px] font-mono text-white/30 uppercase tracking-wide">{label}</span>
                  <input
                    className="bg-surface border border-border rounded-lg text-center font-mono font-bold
                               text-sm text-white px-2 py-1.5 outline-none focus:border-accent4 transition-colors"
                    style={{ width: w }}
                    placeholder={ph}
                    value={segments[key]}
                    onChange={e => setSegments({ [key]: e.target.value })}
                    maxLength={6}
                  />
                </div>
              </div>
            ))}
            <span className="text-border text-lg pb-2">.</span>
            <div className="flex flex-col gap-1 items-center">
              <span className="text-[10px] font-mono text-white/30 uppercase tracking-wide">Tipo</span>
              <select
                className="bg-surface border border-border rounded-lg font-mono font-bold text-sm
                           text-white px-2 py-1.5 outline-none focus:border-accent4 transition-colors"
                style={{ width: '100px' }}
                value={segments.tipo}
                onChange={e => setSegments({ tipo: e.target.value as 'O'|'D' })}
              >
                <option value="O">O — Objetiva</option>
                <option value="D">D — Dissertativa</option>
              </select>
            </div>
          </div>
        </div>

        {/* Auto-generated codes per unit */}
        {codePreview.some(c => c.tmpl) && (
          <div className="space-y-2">
            <div className="text-[10px] font-mono text-white/30 uppercase tracking-widest">
              Códigos gerados automaticamente por percurso
            </div>
            {codePreview.map(c => (
              <div key={c.key} className="flex items-center gap-3 font-mono text-xs flex-wrap">
                <span className="text-accent4 w-10 flex-shrink-0">{c.key}</span>
                <span className="text-white/30">
                  UZ: <span className="text-white/60">{c.uz}</span>
                  {' '}Mód: <span className="text-white/60">{c.mod || '—'}</span>
                </span>
                <span className="text-white/20">→</span>
                <span className="text-accent">{c.tmpl ? c.tmpl.replace('{n}', '1') : <span className="text-accent2">preencha Prod, Ano e Tipo</span>}</span>
                <span className="text-white/20">, Q2… <span className="text-white/30">({c.count}q)</span></span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Options */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card">
          <label className="label">Tipo de questão</label>
          <select className="select" value={options.questionType}
            onChange={e => setOptions({ questionType: e.target.value as 'multichoice'|'multichoice_multi' })}>
            <option value="multichoice">Múltipla escolha (uma correta)</option>
            <option value="multichoice_multi">Múltipla escolha (várias corretas)</option>
          </select>
        </div>
        <div className="card">
          <label className="label">Prefixo (fallback)</label>
          <input className="input" value={options.prefix}
            onChange={e => setOptions({ prefix: e.target.value })} placeholder="Questão" />
        </div>
        <div className="card">
          <label className="label">Penalidade por erro</label>
          <select className="select" value={options.penalty}
            onChange={e => setOptions({ penalty: e.target.value })}>
            <option value="0">0% — sem penalidade</option>
            <option value="0.25">25%</option>
            <option value="0.33">33%</option>
            <option value="0.5">50%</option>
            <option value="1">100%</option>
          </select>
        </div>
        <div className="card space-y-3">
          {([
            { label: 'Embaralhar alternativas', key: 'shuffle' },
            { label: 'Feedback por alternativa', key: 'useAltFeedback' },
          ] as const).map(({ label, key }) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm">{label}</span>
              <button
                onClick={() => setOptions({ [key]: !options[key] })}
                className={`relative w-10 h-5 rounded-full transition-colors duration-200
                  ${options[key] ? 'bg-accent' : 'bg-border'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-200
                  ${options[key] ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Feedback */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card">
          <label className="label">Feedback — acerto ✅</label>
          <textarea className="input min-h-[60px] resize-y text-xs" value={options.fbCorrect}
            onChange={e => setOptions({ fbCorrect: e.target.value })} placeholder="Parabéns! (opcional)" />
        </div>
        <div className="card">
          <label className="label">Feedback — erro ❌</label>
          <textarea className="input min-h-[60px] resize-y text-xs" value={options.fbIncorrect}
            onChange={e => setOptions({ fbIncorrect: e.target.value })} placeholder="Incorreto. (opcional)" />
        </div>
      </div>

      {/* Split by unit */}
      <div className="card border-l-4 border-l-accent3 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h4 className="font-bold text-sm">Percursos detectados</h4>
            <div className="flex gap-1.5 mt-1 flex-wrap">
              {unitGroups.map(u => (
                <span key={u.unitKey}
                  className="text-[11px] font-mono px-2 py-0.5 rounded bg-accent4/10
                             border border-accent4/30 text-accent4">
                  {u.unitKey} <span className="text-white/30">{u.questions.length}q</span>
                </span>
              ))}
            </div>
          </div>
          {multiUnit && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/40">XML por percurso</span>
              <button
                onClick={() => setOptions({ splitByUnit: !options.splitByUnit })}
                className={`relative w-10 h-5 rounded-full transition-colors duration-200
                  ${options.splitByUnit ? 'bg-accent' : 'bg-border'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full
                  transition-transform duration-200 ${options.splitByUnit ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          )}
        </div>

        {/* Q numbering mode */}
        <div className="bg-surface2 border border-border rounded-lg p-3 space-y-2">
          <div className="text-[11px] font-mono uppercase tracking-widest text-white/30">Numeração Q{'{n}'}</div>
          <div className="flex gap-2 flex-wrap">
            {([
              { v: 'reset',    label: 'Reiniciar em Q1' },
              { v: 'continue', label: 'Sequencial' },
              { v: 'offset',   label: 'Offset manual' },
            ] as const).map(({ v, label }) => (
              <button key={v}
                onClick={() => setOptions({ qmode: v })}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-all
                  ${options.qmode === v
                    ? 'border-accent3 text-white bg-accent3/10'
                    : 'border-border text-white/40 hover:border-accent3/40'}`}>
                {label}
              </button>
            ))}
          </div>
          {options.qmode === 'offset' && unitGroups.map(u => (
            <div key={u.unitKey} className="flex items-center gap-3">
              <span className="font-mono text-xs text-accent4 w-8">{u.unitKey}</span>
              <span className="text-xs text-white/30">começa em Q</span>
              <input type="number" min={1}
                className="input w-16 text-center text-xs py-1"
                value={offsets[u.unitKey] ?? 1}
                onChange={e => setOffsets(prev => ({ ...prev, [u.unitKey]: parseInt(e.target.value) || 1 }))}
              />
              <span className="text-xs text-accent font-mono">
                → Q{offsets[u.unitKey] ?? 1}…Q{(offsets[u.unitKey] ?? 1) + u.questions.length - 1}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Convert */}
      <button onClick={convert} disabled={loading || perguntas.length === 0} className="btn-primary">
        {loading ? 'Gerando…' : '⚡ Gerar Moodle XML'}
      </button>

      {/* Warnings */}
      {avisos.length > 0 && (
        <div className="bg-accent3/10 border border-accent3/30 rounded-lg px-4 py-3
                        font-mono text-xs text-accent3 space-y-1">
          {avisos.map((a, i) => <div key={i}>⚠️ {a}</div>)}
        </div>
      )}

      {/* Output */}
      {done && units.length > 0 && (
        <div className="space-y-3">
          <div className="flex gap-3 flex-wrap">
            {[
              { n: perguntas.length, l: 'questões' },
              { n: unitGroups.length, l: 'percursos' },
              { n: avisos.length, l: 'avisos' },
            ].map(({ n, l }) => (
              <div key={l} className="bg-surface border border-border rounded-lg px-3 py-2
                                      font-mono text-sm flex items-center gap-2">
                <span className="text-accent font-bold">{n}</span>
                <span className="text-white/40">{l}</span>
              </div>
            ))}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono uppercase tracking-widest text-white/30">XML Gerado</span>
              <button onClick={() => navigator.clipboard.writeText(units[0]?.xml ?? '')}
                className="text-xs font-mono text-white/40 border border-border px-3 py-1 rounded
                           hover:border-accent hover:text-accent transition-all">
                Copiar
              </button>
            </div>
            <textarea readOnly
              className="input min-h-[160px] text-[11px] leading-relaxed text-white/40"
              value={units[0]?.xml ?? ''}
            />
          </div>

          {options.splitByUnit && units.length > 1 ? (
            <div className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-widest text-white/30">Downloads por percurso</div>
              {units.map((u, i) => (
                <div key={i} className="flex items-center justify-between bg-surface border border-border
                                        rounded-lg px-4 py-3 flex-wrap gap-3">
                  <div>
                    <div className="font-bold text-accent4 text-sm">{u.unitKey}</div>
                    <div className="text-xs font-mono text-white/30">
                      {u.questions.length}q · Q{u.startQ}–Q{u.startQ + u.questions.length - 1}
                      {buildUnitTemplate(u.unitKey) && (
                        <span className="text-accent ml-2">{buildUnitTemplate(u.unitKey).replace('{n}', '1')}</span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => downloadUnit(u)} className="btn-secondary text-xs">
                    ⬇️ {u.unitKey.toLowerCase()}.xml
                  </button>
                </div>
              ))}
              <button onClick={downloadAll}
                className="w-full py-3 border border-accent text-accent font-bold text-sm
                           rounded-xl hover:bg-accent/5 transition-all">
                ⬇️ Baixar todos os XMLs
              </button>
            </div>
          ) : (
            <button onClick={downloadSingle} className="btn-secondary w-full py-3 text-sm font-bold">
              ⬇️ Baixar quiz.xml
            </button>
          )}
        </div>
      )}
    </div>
  )
}
