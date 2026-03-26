import { useRef, useState, DragEvent } from 'react'
import { useStore } from '@/store'
import { extractText, extractXmlQuestions } from '@/lib/extractor'
import { parseText, findDuplicates, findCrossDuplicates } from '@/lib/parser'
import type { Question } from '@/types'

// ── Suggestion Modal ───────────────────────────────────────────────────────
const LIMIT = 45 // stay under Formspree's 50/month

function getSentCount(): number {
  const key = `sq_${new Date().getFullYear()}_${new Date().getMonth()}`
  return parseInt(localStorage.getItem(key) || '0', 10)
}

function incrementSentCount() {
  const key = `sq_${new Date().getFullYear()}_${new Date().getMonth()}`
  localStorage.setItem(key, String(getSentCount() + 1))
}

function SuggestionModal({ onClose }: { onClose: () => void }) {
  const [msg,     setMsg]     = useState('')
  const [email,   setEmail]   = useState('')
  const [status,  setStatus]  = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')
  const sentCount = getSentCount()
  const limitReached = sentCount >= LIMIT

  const [errorMsg, setErrorMsg] = useState('')

  const send = async () => {
    if (!msg.trim()) return
    setStatus('sending')
    setErrorMsg('')
    try {
      const res = await fetch('https://formspree.io/f/mbdzeqke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ message: msg, _replyto: email || undefined }),
      })
      if (res.ok) {
        incrementSentCount()
        setStatus('ok')
      } else {
        const data = await res.json().catch(() => ({}))
        setErrorMsg(data?.error || `Erro ${res.status}`)
        setStatus('error')
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Sem conexão.')
      setStatus('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
         style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-6 space-y-4 shadow-2xl">

        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-base">💡 Sugerir funcionalidade</h2>
            <p className="text-xs text-white/30 font-mono mt-0.5">Sua ideia pode virar uma feature</p>
          </div>
          <button onClick={onClose}
            className="text-white/30 hover:text-white transition-colors text-lg leading-none">✕</button>
        </div>

        {status === 'ok' ? (
          <div className="text-center py-6 space-y-2">
            <div className="text-3xl">✅</div>
            <p className="text-accent font-bold">Sugestão enviada!</p>
            <p className="text-xs text-white/30 font-mono">Obrigado pelo feedback.</p>
            <button onClick={onClose} className="btn-secondary mt-4 text-xs px-6">Fechar</button>
          </div>
        ) : limitReached ? (
          <div className="text-center py-6 space-y-2">
            <div className="text-3xl">🚫</div>
            <p className="text-accent3 font-bold text-sm">Limite mensal atingido</p>
            <p className="text-xs text-white/30 font-mono">As sugestões reabrem no próximo mês.</p>
            <button onClick={onClose} className="btn-secondary mt-4 text-xs px-6">Fechar</button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <label className="label">Sua sugestão</label>
                <textarea
                  value={msg}
                  onChange={e => setMsg(e.target.value)}
                  className="input min-h-25 resize-none"
                  placeholder="Descreva a funcionalidade que gostaria de ver..."
                  disabled={status === 'sending'}
                />
              </div>
              <div>
                <label className="label">Email para contato <span className="text-white/20 normal-case tracking-normal">(opcional)</span></label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input"
                  placeholder="seu@email.com"
                  disabled={status === 'sending'}
                />
              </div>
            </div>

            {status === 'error' && (
              <p className="text-accent2 text-xs font-mono">Erro ao enviar: {errorMsg || 'tente novamente.'}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="btn-secondary flex-1 text-sm">Cancelar</button>
              <button onClick={send} disabled={!msg.trim() || status === 'sending'}
                className="btn-primary flex-1 text-sm">
                {status === 'sending' ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Duplicate Checker ──────────────────────────────────────────────────────
function CheckDuplicates() {
  const setStep    = useStore(s => s.setStep)
  const setParsed  = useStore(s => s.setParsed)
  const setRawText = useStore(s => s.setRawText)

  const qFileRef = useRef<HTMLInputElement>(null)
  const xmlRef   = useRef<HTMLInputElement>(null)

  const [qFilename,   setQFilename]   = useState('')
  const [xmlFilename, setXmlFilename] = useState('')
  const [perguntas,   setPerguntas]   = useState<Question[]>([])
  const [refQs,       setRefQs]       = useState<Array<{ name: string; texto: string }>>([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [draggingQ,   setDraggingQ]   = useState(false)
  const [draggingX,   setDraggingX]   = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const loadQuestions = async (file: File) => {
    setError('')
    setLoading(true)
    try {
      const texto = await extractText(file)
      const { perguntas: qs } = parseText(texto)
      setPerguntas(qs)
      setQFilename(file.name)
      setShowPreview(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao ler arquivo.')
    } finally {
      setLoading(false)
    }
  }

  const loadXml = async (file: File) => {
    setError('')
    try {
      const text = await file.text()
      const qs = extractXmlQuestions(text)
      if (qs.length === 0) { setError('Nenhuma questão encontrada no XML.'); return }
      setRefQs(qs)
      setXmlFilename(file.name)
    } catch {
      setError('Erro ao ler o arquivo XML.')
    }
  }

  const internal    = findDuplicates(perguntas)
  const cross       = findCrossDuplicates(perguntas, refQs)
  const totalIssues = internal.length + cross.length
  const removeQ     = (idx: number) => setPerguntas(prev => prev.filter((_, i) => i !== idx))

  const duplicateIdxs = new Set([
    ...internal.flatMap(d => d.indexes),
    ...cross.map(d => d.newIdx),
  ])

  const proceedToConvert = () => {
    setRawText('')
    setParsed(perguntas, [])
    setStep(2)
  }

  return (
    <div className="space-y-5">

      {/* Dropzone principal — questões */}
      <div
        className={`relative border-2 border-dashed rounded-xl text-center cursor-pointer overflow-hidden
          transition-all duration-200
          ${qFilename ? 'py-3 px-4' : 'p-12'}
          ${draggingQ ? 'border-accent' : 'border-border bg-surface hover:border-accent/50 hover:bg-accent/10'}`}
        style={draggingQ ? { backgroundColor: 'rgba(79,255,176,0.15)' } : {}}
        onClick={() => qFileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDraggingQ(true) }}
        onDragLeave={() => setDraggingQ(false)}
        onDrop={e => { e.preventDefault(); setDraggingQ(false); const f = e.dataTransfer.files[0]; if (f) loadQuestions(f) }}
      >
        <input ref={qFileRef} type="file" accept=".docx,.odt,.txt,.md,.rtf,.xml" className="hidden"
          onChange={e => e.target.files?.[0] && loadQuestions(e.target.files[0])} />
        {loading ? (
          <div className="text-white/40 text-sm font-mono">Lendo…</div>
        ) : qFilename ? (
          <div className="flex items-center justify-between">
            <div className="font-mono text-sm text-accent">
              ✓ {qFilename}
              {perguntas.length > 0 && <span className="text-white/30 ml-2">— {perguntas.length} questões</span>}
            </div>
            <span className="text-[11px] font-mono text-white/25">trocar arquivo</span>
          </div>
        ) : (
          <>
            <div className="text-4xl mb-3">📄</div>
            <div className="font-semibold text-lg mb-1">Arraste o arquivo ou clique para selecionar</div>
            <div className="text-white/40 text-sm">Suporta .docx · .odt · .txt · .md · .rtf · .xml</div>
          </>
        )}
      </div>

      {/* Format pills — só quando sem arquivo */}
      {!qFilename && (
        <div className="flex gap-2 flex-wrap">
          {['.docx', '.odt', '.txt', '.md', '.rtf', '.xml'].map(f => (
            <span key={f} className="font-mono text-[11px] px-3 py-1 rounded-full border border-border text-white/40">{f}</span>
          ))}
        </div>
      )}

      {/* Banco XML — mesmo estilo do painel "Colar texto" */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div
          className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors
            ${draggingX ? 'bg-accent4/10' : 'hover:bg-white/5'}`}
          onClick={() => xmlRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDraggingX(true) }}
          onDragLeave={() => setDraggingX(false)}
          onDrop={e => { e.preventDefault(); setDraggingX(false); const f = e.dataTransfer.files[0]; if (f) loadXml(f) }}
        >
          <input ref={xmlRef} type="file" accept=".xml" className="hidden"
            onChange={e => e.target.files?.[0] && loadXml(e.target.files[0])} />
          <div className="flex items-center gap-2 text-xs font-mono text-white/40">
            <span>🗄️</span>
            {xmlFilename
              ? <span className="text-accent4">✓ {xmlFilename} <span className="text-white/30">— {refQs.length} questões no banco</span></span>
              : <span>Banco XML <span className="text-white/20">(opcional)</span></span>
            }
          </div>
          <span className="text-white/25 text-xs font-mono">arrastar ou clicar</span>
        </div>
      </div>

      {error && (
        <div className="text-accent2 text-sm font-mono bg-accent2/10 border border-accent2/30 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Resultados + preview + botão converter */}
      {perguntas.length > 0 && (
        <div className="space-y-3">

          {/* Status bar */}
          <div className="flex items-center gap-3 font-mono text-xs flex-wrap px-1">
            <span className="text-accent">{perguntas.length} questões</span>
            {refQs.length > 0 && <span className="text-accent4">{refQs.length} no banco</span>}
            <span className={totalIssues > 0 ? 'text-accent2' : 'text-accent'}>
              {totalIssues > 0 ? `⚠️ ${totalIssues} problema(s)` : '✅ Sem duplicatas'}
            </span>
          </div>

          {/* Duplicatas internas */}
          {!showPreview && internal.length > 0 && (
            <div className="card border-l-4 border-l-accent2 space-y-3">
              <div className="text-[11px] font-mono uppercase tracking-widest text-accent2">
                ⚠️ {internal.length} duplicata(s) no arquivo
              </div>
              {internal.map((d, i) => (
                <div key={i} className="space-y-1">
                  <div className="text-xs font-mono text-white/50">
                    <span className="text-accent3">{d.type === 'code' ? '🔑 Código' : '📄 Texto'} igual</span>
                    <span className="text-white/30 mx-1">—</span>
                    <span className="text-accent2">Q{d.indexes.map(j => j + 1).join(' e Q')}</span>
                    <span className="text-white/20 block pl-4 truncate">{d.value}{d.value.length >= 80 ? '…' : ''}</span>
                  </div>
                  <div className="flex gap-2 pl-2">
                    {d.indexes.map(idx => (
                      <button key={idx} onClick={() => removeQ(idx)}
                        className="text-[11px] font-mono px-2 py-0.5 rounded border border-accent2/30
                                   text-accent2/70 hover:bg-accent2/15 hover:text-accent2 transition-all">
                        remover Q{idx + 1}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Duplicatas com banco */}
          {!showPreview && refQs.length > 0 && (
            <div className="card border-l-4 border-l-accent4 space-y-3">
              <div className="text-[11px] font-mono uppercase tracking-widest text-accent4">
                {cross.length === 0
                  ? '✅ Sem duplicatas com o banco'
                  : `⚠️ ${cross.length} já existe${cross.length === 1 ? '' : 'm'} no banco`}
              </div>
              {cross.map((d, i) => (
                <div key={i} className="space-y-1">
                  <div className="text-xs font-mono text-white/50">
                    <span className="text-accent3">{d.type === 'code' ? '🔑 Código' : '📄 Texto'} igual</span>
                    <span className="text-white/30 mx-1">—</span>
                    <span className="text-accent2">Q{d.newIdx + 1}</span>
                    {d.refName && <span className="text-white/25 ml-1">↔ {d.refName}</span>}
                    <span className="text-white/20 block pl-4 truncate">
                      {d.refTexto.slice(0, 80)}{d.refTexto.length > 80 ? '…' : ''}
                    </span>
                  </div>
                  <button onClick={() => removeQ(d.newIdx)}
                    className="text-[11px] font-mono px-2 py-0.5 rounded border border-accent2/30
                               text-accent2/70 hover:bg-accent2/15 hover:text-accent2 transition-all">
                    remover Q{d.newIdx + 1}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Preview das questões — mesmo estilo do painel "Colar texto" */}
          <div className="rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => setShowPreview(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left"
            >
              <div className="flex items-center gap-2 text-xs font-mono text-white/40">
                <span>{showPreview ? '▼' : '▶'}</span>
                <span>Preview das questões</span>
              </div>
              <span className={`text-[11px] font-mono ${duplicateIdxs.size > 0 ? 'text-accent2' : 'text-white/25'}`}>
                {duplicateIdxs.size > 0 ? `${duplicateIdxs.size} marcadas` : `${perguntas.length} questões`}
              </span>
            </button>
            {showPreview && (
              <div className="border-t border-border divide-y divide-border/50 max-h-64 overflow-y-auto">
                {perguntas.map((p, i) => (
                  <div key={i} className={`flex items-center gap-3 px-4 py-2.5 ${duplicateIdxs.has(i) ? 'bg-accent2/5' : ''}`}>
                    <span className={`text-[10px] font-mono font-bold shrink-0 w-8 ${duplicateIdxs.has(i) ? 'text-accent2' : 'text-accent/40'}`}>
                      Q{i + 1}
                    </span>
                    <span className="text-xs font-mono text-white/45 flex-1 min-w-0 truncate">
                      {p.texto || <span className="text-white/20 italic">sem enunciado</span>}
                    </span>
                    {duplicateIdxs.has(i) && (
                      <span className="text-[10px] font-mono text-accent2 shrink-0">⚠️</span>
                    )}
                    <button onClick={() => removeQ(i)} className="text-white/20 hover:text-accent2 transition-colors text-xs shrink-0">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Botão converter */}
          <button onClick={proceedToConvert} className="btn-primary w-full text-base">
            {totalIssues > 0 ? `⚡ Converter ${perguntas.length} questões limpas →` : `⚡ Converter ${perguntas.length} questões →`}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main StepImport ────────────────────────────────────────────────────────
export function StepImport() {
  const setStep    = useStore(s => s.setStep)
  const setRawText = useStore(s => s.setRawText)
  const setParsed  = useStore(s => s.setParsed)

  const fileRef = useRef<HTMLInputElement>(null)
  const [filename,  setFilename]  = useState('')
  const [paste,     setPaste]     = useState('')
  const [dragging,  setDragging]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [showPaste,   setShowPaste]   = useState(false)
  const [mode,        setMode]        = useState<'convert' | 'check'>('convert')
  const [showSuggest, setShowSuggest] = useState(false)

  const handleFile = (file: File) => { setFilename(file.name); setError('') }

  const proceed = async () => {
    setLoading(true)
    setError('')
    try {
      let texto = paste.trim()
      if (!texto && fileRef.current?.files?.[0]) {
        texto = await extractText(fileRef.current.files[0])
      }
      if (!texto) { setError('Selecione um arquivo ou cole algum texto.'); return }
      setRawText(texto)
      const { perguntas, avisos } = parseText(texto)
      setParsed(perguntas, avisos)
      setStep(2)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao ler o arquivo.')
    } finally {
      setLoading(false)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (fileRef.current) {
      const dt = new DataTransfer()
      dt.items.add(file)
      fileRef.current.files = dt.files
    }
    handleFile(file)
  }

  return (
    <div className="h-full overflow-y-auto pr-0.5">
    <div className="space-y-5">
      {/* Mode tabs */}
      <div className="flex gap-1 p-1 bg-surface rounded-xl border border-border">
        {([
          { v: 'convert', label: '⚡ Converter'            },
          { v: 'check',   label: '🔍 Verificar Duplicadas' },
        ] as const).map(({ v, label }) => (
          <button key={v} onClick={() => setMode(v)}
            className={`flex-1 py-2 px-3 rounded-lg text-[16px] font-mono font-bold transition-all
              ${mode === v
                ? 'bg-surface2 text-white border border-border'
                : 'text-white/30 hover:text-white/60'}`}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'check' ? <CheckDuplicates /> : (
        <>
          {/* Drop zone */}
          <div
            className={`relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer overflow-hidden
              transition-all duration-200
              ${dragging ? 'border-accent' : 'border-border bg-surface hover:border-accent/50 hover:bg-accent/10'}`}
            style={dragging ? { backgroundColor: 'rgba(79,255,176,0.15)' } : {}}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".docx,.odt,.txt,.md,.rtf" className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <div className="text-4xl mb-3">📄</div>
            <div className="font-semibold text-lg mb-1">Arraste o arquivo ou clique para selecionar</div>
            <div className="text-white/40 text-sm">Suporta .docx · .odt · .txt · .md · .rtf</div>
            {filename && <div className="mt-3 font-mono text-sm text-accent">✓ {filename}</div>}
          </div>

          {/* Format pills + suggest button */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              {['.docx', '.odt', '.txt', '.md', '.rtf'].map(f => (
                <span key={f} className="font-mono text-[11px] px-3 py-1 rounded-full border border-border text-white/40">
                  {f}
                </span>
              ))}
            </div>
            <button
              onClick={() => setShowSuggest(true)}
              className="flex items-center gap-1.5 font-mono text-[11px] px-3 py-1 rounded-full
                         border border-border text-white/25
                         hover:border-accent/50 hover:text-accent transition-colors duration-200"
            >
              💡 Sugerir funcionalidade
            </button>
          </div>

          {/* Paste panel */}
          <div className="rounded-xl border border-border overflow-hidden">
            <button onClick={() => setShowPaste(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-transparent
                         hover:bg-white/5 transition-colors text-left">
              <div className="flex items-center gap-2 text-xs font-mono text-white/40">
                <span>✏️</span>
                <span>Colar texto diretamente</span>
              </div>
              <span className="text-white/30 text-xs font-mono"
                    style={{ display: 'inline-block', transform: showPaste ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                ▾
              </span>
            </button>
            {showPaste && (
              <div className="border-t border-border">
                <textarea value={paste} onChange={e => setPaste(e.target.value)}
                  className="input min-h-40 resize-y leading-7 rounded-none border-0 focus:ring-0"
                  style={{ borderRadius: 0, border: 'none', outline: 'none', background: 'transparent' }}
                  placeholder="Cole o texto das questões aqui..." autoFocus />
                {paste && (
                  <div className="flex items-center justify-between px-4 py-2 bg-transparent border-t border-border">
                    <span className="font-mono text-[11px] text-white/25">{paste.length} caracteres</span>
                    <button onClick={() => setPaste('')}
                      className="font-mono text-[11px] text-white/30 hover:text-accent2 transition-colors">
                      limpar ✕
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="text-accent2 text-sm font-mono bg-accent2/10 border border-accent2/30 rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <button onClick={proceed} disabled={loading} className="btn-primary w-full text-base">
            {loading ? 'Lendo...' : 'Extrair texto e revisar →'}
          </button>

          <div className="text-center">
            <button
              onClick={() => { setRawText(''); setParsed([], []); setStep(2) }}
              className="font-mono text-[11px] text-white/20 hover:text-white/50 transition-colors duration-200"
            >
              ou criar questões manualmente →
            </button>
          </div>
        </>
      )}

      {showSuggest && <SuggestionModal onClose={() => setShowSuggest(false)} />}
    </div>
    </div>
  )
}
