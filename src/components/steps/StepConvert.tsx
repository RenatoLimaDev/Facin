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

  const [profiles, setProfiles]     = useState<Profile[]>([])
  const [loading, setLoading]       = useState(false)
  const [avisos, setAvisos]         = useState<string[]>([])
  const [done, setDone]             = useState(false)
  const [offsets, setOffsets]       = useState<Record<string, number>>({})

  // Detect code on mount
  useEffect(() => {
    setProfiles(readProfiles())
    const matches = detectCodeInText(rawText)
    if (matches.length > 0) {
      const pattern = inferTemplate(matches[0])
      setDetectedPattern(pattern)
      // Pre-fill segments from detected code
      const m = matches[0].match(/(\d{2,6})\.(\d{2,5}(?:\.\d)?)\.([Uu]\d+)\.(\d+(?:\.\d+)*)\.([OoDd])/)
      if (m) {
        setSegments({ prod: m[1], ano: m[2], unit: m[3].toUpperCase(), mod: m[4], tipo: m[5].toUpperCase() as 'O'|'D' })
      }
    }
  }, [])

  // Rebuild code template from segments
  useEffect(() => {
    const { prod, ano, unit, mod, tipo } = segments
    if (prod && ano && unit && mod && tipo) {
      setCodeTemplate(`${prod}.${ano}.${unit}.${mod}.${tipo}.Q{n}`)
    }
  }, [segments])

  const unitGroups = groupByUnit(perguntas)
  const multiUnit  = unitGroups.length > 1

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
    const opts = { ...options, codeTemplate, unitOffsets: offsets }
    const result = buildAllUnits(perguntas, opts, detectedPattern)
    setUnits(result)
    setLoading(false)
    setDone(true)
  }

  const downloadUnit = (u: UnitGroup) => {
    triggerDownload(u.xml, `${u.unitKey.toLowerCase()}.xml`)
  }

  const downloadAll = () => {
    units.forEach((u, i) => setTimeout(() => downloadUnit(u), i * 300))
  }

  const downloadSingle = () => {
    if (units[0]) triggerDownload(units[0].xml, 'quiz.xml')
  }

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

  return (
    <div className="space-y-5">
      {/* Back button */}
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
                           hover:bg-accent2/20 hover:text-accent2 transition-all text-[11px]">
                ✕
              </button>
            </div>
          ))}
        </div>
        <button onClick={handleSaveProfile} className="text-accent3 border border-accent3/40 text-xs
          font-bold px-3 py-1.5 rounded-lg hover:bg-accent3/10 transition-all whitespace-nowrap">
          + Salvar atual
        </button>
      </div>

      {/* Code builder */}
      <div className="card border-l-4 border-l-accent4 space-y-3">
        <h3 className="font-bold text-accent4 text-sm">🏷️ Código da questão</h3>
        {detectedPattern && (
          <p className="text-xs font-mono text-white/50">
            ✅ Padrão detectado: <span className="text-accent">{detectedPattern}</span>
          </p>
        )}
        <div className="bg-surface2 border border-border rounded-xl p-4">
          <div className="flex items-end gap-1 flex-wrap">
            {[
              { key: 'prod', label: 'Prod.',    ph: '001', w: '72px' },
              { key: 'ano',  label: 'Ano/Sem',  ph: '261', w: '72px' },
              { key: 'unit', label: 'Unidade',  ph: 'U1',  w: '64px' },
              { key: 'mod',  label: 'Módulo',   ph: '3',   w: '60px' },
            ].map(({ key, label, ph, w }) => (
              <div key={key} className="flex flex-col gap-1 items-center">
                <span className="text-[10px] font-mono text-white/30 uppercase tracking-wide">{label}</span>
                <input
                  className="bg-surface border border-border rounded-lg text-center font-mono font-bold text-sm
                             text-white px-2 py-1.5 outline-none focus:border-accent4 transition-colors"
                  style={{ width: w }}
                  placeholder={ph}
                  value={segments[key]}
                  onChange={e => setSegments({ [key]: e.target.value })}
                  maxLength={6}
                />
              </div>
            ))}
            <span className="text-border text-xl pb-2 px-0.5">.</span>
            <div className="flex flex-col gap-1 items-center">
              <span className="text-[10px] font-mono text-white/30 uppercase tracking-wide">Tipo</span>
              <select
                className="bg-surface border border-border rounded-lg font-mono font-bold text-sm
                           text-white px-2 py-1.5 outline-none focus:border-accent4 transition-colors"
                style={{ width: '110px' }}
                value={segments.tipo}
                onChange={e => setSegments({ tipo: e.target.value as 'O'|'D' })}
              >
                <option value="O">O — Objetiva</option>
                <option value="D">D — Dissertativa</option>
              </select>
            </div>
            <span className="text-border text-xl pb-2 px-0.5">.</span>
            <div className="flex flex-col gap-1 items-center">
              <span className="text-[10px] font-mono text-white/30 uppercase tracking-wide">Questão</span>
              <div className="bg-accent/10 border border-accent/30 rounded-lg px-3 py-1.5 font-mono
                              font-bold text-sm text-accent" style={{ width: '56px', textAlign: 'center' }}>
                Q{'{n}'}
              </div>
            </div>
          </div>
          {codeTemplate && (
            <div className="mt-3 text-xs font-mono text-white/40">
              Resultado: <span className="text-accent font-bold">{codeTemplate.replace('{n}','1')}</span>
              <span className="text-white/20">, Q2, Q3…</span>
            </div>
          )}
        </div>
      </div>

      {/* Options grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
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
          {[
            { id: 'shuffle', label: 'Embaralhar alternativas', key: 'shuffle' },
            { id: 'altFb',   label: 'Feedback por alternativa', key: 'useAltFeedback' },
          ].map(({ id, label, key }) => (
            <div key={id} className="flex items-center justify-between">
              <span className="text-sm">{label}</span>
              <button
                onClick={() => setOptions({ [key]: !options[key as keyof typeof options] })}
                className={`relative w-10 h-5 rounded-full transition-colors duration-200
                  ${options[key as keyof typeof options] ? 'bg-accent' : 'bg-border'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-200
                  ${options[key as keyof typeof options] ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Feedback */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card">
          <label className="label">Feedback — acerto ✅</label>
          <textarea className="input min-h-15 resize-y text-xs" value={options.fbCorrect}
            onChange={e => setOptions({ fbCorrect: e.target.value })} placeholder="Parabéns! (opcional)" />
        </div>
        <div className="card">
          <label className="label">Feedback — erro ❌</label>
          <textarea className="input min-h-15 resize-y text-xs" value={options.fbIncorrect}
            onChange={e => setOptions({ fbIncorrect: e.target.value })} placeholder="Incorreto. (opcional)" />
        </div>
      </div>

      {/* Split by unit */}
      <div className="card border-l-4 border-l-accent3 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h4 className="font-bold text-sm">Percursos / Unidades</h4>
            {multiUnit && (
              <div className="flex gap-1.5 mt-1 flex-wrap">
                {unitGroups.map(u => (
                  <span key={u.unitKey} className="text-[11px] font-mono px-2 py-0.5 rounded bg-accent4/10
                    border border-accent4/30 text-accent4">
                    {u.unitKey} <span className="text-white/30">{u.questions.length}q</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-white/40">XML por unidade</span>
            <button
              onClick={() => setOptions({ splitByUnit: !options.splitByUnit })}
              className={`relative w-10 h-5 rounded-full transition-colors duration-200
                ${options.splitByUnit ? 'bg-accent' : 'bg-border'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-200
                ${options.splitByUnit ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        </div>

        {/* Q numbering mode */}
        <div className="bg-surface2 border border-border rounded-lg p-3 space-y-2">
          <div className="text-[11px] font-mono uppercase tracking-widest text-white/30">Numeração Q{'{n}'}</div>
          <div className="flex gap-2 flex-wrap">
            {[
              { v: 'reset',    label: 'Reiniciar em Q1' },
              { v: 'continue', label: 'Sequencial' },
              { v: 'offset',   label: 'Offset manual' },
            ].map(({ v, label }) => (
              <button key={v}
                onClick={() => setOptions({ qmode: v as 'reset'|'continue'|'offset' })}
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
              <input
                type="number" min={1}
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

      {/* Convert button */}
      <button onClick={convert} disabled={loading || perguntas.length === 0} className="btn-primary w-full text-base">
        {loading ? 'Gerando…' : '⚡ Gerar Moodle XML'}
      </button>

      {/* Warnings */}
      {avisos.length > 0 && (
        <div className="bg-accent3/10 border border-accent3/30 rounded-lg px-4 py-3
                        font-mono text-xs text-accent3 space-y-1">
          {avisos.map((a, i) => <div key={i}>⚠️ {a}</div>)}
        </div>
      )}

      {/* Output & downloads */}
      {done && units.length > 0 && (
        <div className="space-y-3">
          {/* Stats */}
          <div className="flex gap-3 flex-wrap">
            {[
              { n: perguntas.length, l: 'questões' },
              { n: units.filter(u => u.questions.some(q => q.codigoQ)).length, l: 'com código' },
              { n: units.length, l: 'unidades' },
            ].map(({ n, l }) => (
              <div key={l} className="bg-surface border border-border rounded-lg px-3 py-2
                                      font-mono text-sm flex items-center gap-2">
                <span className="text-accent font-bold">{n}</span>
                <span className="text-white/40">{l}</span>
              </div>
            ))}
          </div>

          {/* XML preview */}
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
              className="input min-h-40 text-[11px] leading-relaxed text-white/40"
              value={units[0]?.xml ?? ''}
            />
          </div>

          {/* Downloads */}
          {options.splitByUnit && units.length > 1 ? (
            <div className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-widest text-white/30">Downloads por unidade</div>
              {units.map((u, i) => (
                <div key={i} className="flex items-center justify-between bg-surface border border-border
                                        rounded-lg px-4 py-3 flex-wrap gap-3">
                  <div>
                    <div className="font-bold text-accent4 text-sm">Unidade {u.unitKey}</div>
                    <div className="text-xs font-mono text-white/30">
                      {u.questions.length}q · Q{u.startQ}–Q{u.startQ + u.questions.length - 1}
                    </div>
                  </div>
                  <button onClick={() => downloadUnit(u)} className="btn-secondary text-xs">
                    ⬇️ {u.unitKey}.xml
                  </button>
                </div>
              ))}
              <button onClick={downloadAll} className="w-full py-3 border border-accent text-accent
                font-bold text-sm rounded-xl hover:bg-accent/5 transition-all">
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
