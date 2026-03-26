import { useStore } from '@/store'
import { StepIndicator } from '@/components/ui/StepIndicator'
import { StepImport } from '@/components/steps/StepImport'
import { StepEdit } from '@/components/steps/StepEdit'

export default function App() {
  const step = useStore(s => s.step)

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="max-w-200 mt-4 w-full mx-auto px-4 flex flex-col h-full">

        {/* Compact top bar */}
        <header className="flex items-center gap-4 py-3 border-b border-border shrink-0 flex-wrap">
          <div className="flex items-center gap-18">
            <img src={`${import.meta.env.BASE_URL}facin-logo.svg`} alt="Facin." style={{ height: '36px' }} />
            <h1 className="mt-2 text-xl font-extrabold tracking-tight">
              Texto → <span style={{ color: 'var(--color-accent)' }}>XML</span>
            </h1>
          </div>
          <div className="flex-1" />
          <StepIndicator />
        </header>

        {/* Step content — fills remaining height */}
        <div className="flex-1 min-h-0 overflow-hidden py-4">
          {step === 1 && <StepImport />}
          {step === 2 && <StepEdit />}
        </div>

        {/* Footer */}
        <footer className="shrink-0 py-2 flex justify-center">
          <img src={`${import.meta.env.BASE_URL}sedlab.svg`} alt="SEDLABS" style={{ height: '28px', opacity: 0.35 }} />
        </footer>

      </div>
    </div>
  )
}
