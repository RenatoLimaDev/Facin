import { useRef, useState, DragEvent } from 'react'
import { useStore } from '@/store'
import { extractText } from '@/lib/extractor'
import { parseText } from '@/lib/parser'

export function StepImport() {
  const setStep    = useStore(s => s.setStep)
  const setRawText = useStore(s => s.setRawText)
  const setParsed  = useStore(s => s.setParsed)

  const fileRef    = useRef<HTMLInputElement>(null)
  const [filename, setFilename] = useState('')
  const [paste, setPaste]       = useState('')
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleFile = async (file: File) => {
    setFilename(file.name)
    setError('')
  }

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
    <div className="space-y-5">
      {/* Drop zone */}
      <div
        className={`relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
          transition-all duration-200
          ${dragging ? 'border-accent bg-accent/5' : 'border-border bg-surface hover:border-accent/50'}`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".docx,.odt,.txt,.md,.rtf"
          className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <div className="text-4xl mb-3">📄</div>
        <div className="font-semibold text-lg mb-1">
          Arraste o arquivo ou clique para selecionar
        </div>
        <div className="text-white/40 text-sm">
          Suporta .docx · .odt · .txt · .md · .rtf
        </div>
        {filename && (
          <div className="mt-3 font-mono text-sm text-accent">✓ {filename}</div>
        )}
      </div>

      {/* Format pills */}
      <div className="flex gap-2 flex-wrap">
        {['.docx', '.odt', '.txt', '.md', '.rtf'].map(f => (
          <span key={f} className="font-mono text-[11px] px-3 py-1 rounded-full border border-border text-white/40">
            {f}
          </span>
        ))}
      </div>

      {/* Divider */}
      <div className="relative text-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <span className="relative bg-bg px-3 font-mono text-xs text-white/30 tracking-widest">OU</span>
      </div>

      {/* Paste area */}
      <textarea
        value={paste}
        onChange={e => setPaste(e.target.value)}
        className="input min-h-[120px] resize-y leading-7"
        placeholder="Cole o texto aqui diretamente..."
      />

      {error && (
        <div className="text-accent2 text-sm font-mono bg-accent2/10 border border-accent2/30 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <button onClick={proceed} disabled={loading} className="btn-primary w-full text-base">
        {loading ? 'Lendo...' : 'Extrair texto e revisar →'}
      </button>
    </div>
  )
}
