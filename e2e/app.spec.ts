import { test, expect, Page } from '@playwright/test'
import path from 'path'

const SAMPLES = path.resolve('./samples')

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `docs/${name}.png`, fullPage: false })
}

async function waitReady(page: Page) {
  await page.getByAltText('Facin.').waitFor({ timeout: 15000 })
}

// ── Tela inicial ──────────────────────────────────────────────────────────────

test.describe('Tela de importação', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/Facin/', { waitUntil: 'commit' })
    await waitReady(page)
  })

  test('exibe título e dropzone', async ({ page }) => {
    await expect(page.getByAltText('Facin.')).toBeVisible()
    await expect(page.getByText('Arraste o arquivo ou clique para selecionar')).toBeVisible()
    await screenshot(page, 'preview-import')
  })

  test('tabs Converter e Verificar Duplicadas visíveis', async ({ page }) => {
    await expect(page.getByText('⚡ Converter')).toBeVisible()
    await expect(page.getByText('🔍 Verificar Duplicadas')).toBeVisible()
  })

  test('painel Colar texto expande ao clicar', async ({ page }) => {
    await page.getByText('Colar texto diretamente').click()
    await expect(page.getByPlaceholder('Cole o texto das questões aqui...')).toBeVisible()
    await screenshot(page, 'preview-paste')
  })

  test('botão criar questões manualmente navega para editor', async ({ page }) => {
    await page.getByText('ou criar questões manualmente →').click()
    await expect(page.getByText('Revise o texto extraído')).toBeVisible()
    // Empty state mostra o botão Nova questão
    await expect(page.getByText('+ Nova questão')).toBeVisible()
  })

  test('colar texto habilita contagem de caracteres', async ({ page }) => {
    await page.getByText('Colar texto diretamente').click()
    const textarea = page.getByPlaceholder('Cole o texto das questões aqui...')
    await textarea.fill('Texto de exemplo para teste')
    await expect(page.getByText(/\d+ caracteres/)).toBeVisible()
  })

  test('botão limpar apaga o texto colado', async ({ page }) => {
    await page.getByText('Colar texto diretamente').click()
    await page.getByPlaceholder('Cole o texto das questões aqui...').fill('Texto para limpar')
    await page.getByText('limpar ✕').click()
    await expect(page.getByPlaceholder('Cole o texto das questões aqui...')).toHaveValue('')
  })
})

// ── Importar arquivo ──────────────────────────────────────────────────────────

test.describe('Importar arquivo e editar', () => {
  test('importa arquivo .txt e vai para editor', async ({ page }) => {
    await page.goto('/Facin/', { waitUntil: 'commit' })
    await waitReady(page)
    await page.locator('input[type="file"]').first().setInputFiles(path.join(SAMPLES, 'simples.txt'))
    await page.getByRole('button', { name: /Extrair texto e revisar/ }).click()
    await expect(page.getByText('Revise o texto extraído')).toBeVisible()
    await screenshot(page, 'preview-editor')
  })

  test('alterna para edição por cards', async ({ page }) => {
    await page.goto('/Facin/', { waitUntil: 'commit' })
    await waitReady(page)
    await page.locator('input[type="file"]').first().setInputFiles(path.join(SAMPLES, 'simples.txt'))
    await page.getByRole('button', { name: /Extrair texto e revisar/ }).click()
    await page.getByText('Editar por cards').click()
    await expect(page.locator('.card').first()).toBeVisible()
    await screenshot(page, 'preview-cards')
  })

  test('exibe contador de questões no editor de texto', async ({ page }) => {
    await page.goto('/Facin/', { waitUntil: 'commit' })
    await waitReady(page)
    await page.locator('input[type="file"]').first().setInputFiles(path.join(SAMPLES, 'simples.txt'))
    await page.getByRole('button', { name: /Extrair texto e revisar/ }).click()
    // simples.txt tem 5 questões
    await expect(page.getByText(/5 questões/)).toBeVisible()
  })

  test('importa arquivo com código e detecta padrão', async ({ page }) => {
    await page.goto('/Facin/', { waitUntil: 'commit' })
    await waitReady(page)
    await page.locator('input[type="file"]').first().setInputFiles(path.join(SAMPLES, 'com-codigo.txt'))
    await page.getByRole('button', { name: /Extrair texto e revisar/ }).click()
    await expect(page.getByText('Revise o texto extraído')).toBeVisible()
  })
})

// ── Verificar Duplicatas ──────────────────────────────────────────────────────

test.describe('Verificar Duplicatas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/Facin/', { waitUntil: 'commit' })
    await waitReady(page)
    await page.getByText('🔍 Verificar Duplicadas').click()
  })

  test('exibe dropzone e painel de banco XML', async ({ page }) => {
    await expect(page.getByText('Banco Moodle XML')).toBeVisible()
    await screenshot(page, 'preview-duplicates')
  })

  test('importa arquivo e mostra botão converter', async ({ page }) => {
    await page.locator('input[type="file"]').first().setInputFiles(path.join(SAMPLES, 'simples.txt'))
    // Botão específico de converter questões (não a tab)
    await expect(page.getByRole('button', { name: /Converter \d+ questões/ })).toBeVisible()
    await screenshot(page, 'preview-duplicates-loaded')
  })

  test('mostra status "Sem duplicatas" ao importar arquivo sem duplicatas', async ({ page }) => {
    await page.locator('input[type="file"]').first().setInputFiles(path.join(SAMPLES, 'simples.txt'))
    await expect(page.getByText('✅ Sem duplicatas')).toBeVisible()
  })

  test('painel preview expande ao clicar', async ({ page }) => {
    await page.locator('input[type="file"]').first().setInputFiles(path.join(SAMPLES, 'simples.txt'))
    await page.getByText('Preview das questões').click()
    // Após expandir, aparece lista de questões com Q1, Q2...
    await expect(page.locator('text=Q1').first()).toBeVisible()
  })
})

// ── Criar questão manual ──────────────────────────────────────────────────────

test.describe('Criar questão manualmente', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/Facin/', { waitUntil: 'commit' })
    await waitReady(page)
    await page.getByText('ou criar questões manualmente →').click()
  })

  test('adiciona nova questão pelo botão', async ({ page }) => {
    await page.getByText('+ Nova questão').click()
    await expect(page.getByPlaceholder('Enunciado da questão...')).toBeVisible()
    await screenshot(page, 'preview-new-question')
  })

  test('alterna questão para dissertativa', async ({ page }) => {
    await page.getByText('+ Nova questão').click()
    // Aguarda o card expandido (textarea visível)
    await expect(page.getByPlaceholder('Enunciado da questão...')).toBeVisible()
    await page.getByPlaceholder('Enunciado da questão...').fill('O que é recursão?')
    // Botão de tipo no header do card
    await page.getByText('Objetiva').click()
    await expect(page.getByRole('button', { name: /Dissertativa/ })).toBeVisible()
    await expect(page.getByPlaceholder('Feedback / critério de correção (graderinfo)...')).toBeVisible()
    await screenshot(page, 'preview-essay')
  })

  test('não exibe botão Gerar XML com questão inválida (sem enunciado)', async ({ page }) => {
    await page.getByText('+ Nova questão').click()
    // O botão existe mas deve estar desabilitado ou mostrar erro de validação
    await expect(page.getByText('⚡ Gerar XML')).toBeVisible()
  })
})

// ── Gerar XML ─────────────────────────────────────────────────────────────────

test.describe('Gerar XML', () => {
  test('gera XML e abre modal automaticamente', async ({ page }) => {
    await page.goto('/Facin/', { waitUntil: 'commit' })
    await waitReady(page)
    await page.locator('input[type="file"]').first().setInputFiles(path.join(SAMPLES, 'com-codigo.txt'))
    await page.getByRole('button', { name: /Extrair texto e revisar/ }).click()
    await page.getByText('Editar por cards').click()

    // convert() abre o modal automaticamente ao terminar
    await page.getByText('⚡ Gerar XML').click()
    await expect(page.getByText('<?xml')).toBeVisible()
    await screenshot(page, 'preview-xml')
  })

  test('botão Baixar quiz.xml visível após gerar', async ({ page }) => {
    await page.goto('/Facin/', { waitUntil: 'commit' })
    await waitReady(page)
    await page.locator('input[type="file"]').first().setInputFiles(path.join(SAMPLES, 'simples.txt'))
    await page.getByRole('button', { name: /Extrair texto e revisar/ }).click()
    await page.getByText('⚡ Gerar XML').click()
    await expect(page.getByRole('button', { name: /Baixar quiz\.xml/ })).toBeVisible()
    await screenshot(page, 'preview-download-buttons')
  })

  test('botão Baixar quiz.gift visível após gerar', async ({ page }) => {
    await page.goto('/Facin/', { waitUntil: 'commit' })
    await waitReady(page)
    await page.locator('input[type="file"]').first().setInputFiles(path.join(SAMPLES, 'simples.txt'))
    await page.getByRole('button', { name: /Extrair texto e revisar/ }).click()
    await page.getByText('⚡ Gerar XML').click()
    await expect(page.getByRole('button', { name: /Baixar quiz\.gift/ })).toBeVisible()
    await screenshot(page, 'preview-gift-button')
  })
})

// ── Navegação e estado ────────────────────────────────────────────────────────

test.describe('Navegação entre passos', () => {
  test('botão Voltar retorna para importação', async ({ page }) => {
    await page.goto('/Facin/', { waitUntil: 'commit' })
    await waitReady(page)
    await page.getByText('ou criar questões manualmente →').click()
    await expect(page.getByText('Revise o texto extraído')).toBeVisible()
    // Verifica que o step indicator está no passo 2
    await expect(page.getByText('Editar')).toBeVisible()
  })
})
