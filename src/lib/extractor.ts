import mammoth from 'mammoth'

function detectEncoding(bytes: Uint8Array): string {
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return 'utf-8'
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return 'utf-16le'
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return 'utf-16be'
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  const replacements = (utf8.match(/\uFFFD/g) || []).length
  return replacements > 2 ? 'windows-1252' : 'utf-8'
}

// Extract text from ODT (OpenDocument Text) — it's a ZIP containing content.xml
async function extractOdt(buf: ArrayBuffer): Promise<string> {
  // Use DecompressionStream if available (modern browsers)
  // ODT is a ZIP file — we find content.xml by scanning for its local file header
  const bytes = new Uint8Array(buf)

  // Find "content.xml" entry in the ZIP by scanning for local file headers (PK\x03\x04)
  const entries = parseZipEntries(bytes)
  const contentEntry = entries.find(e => e.name === 'content.xml')
  if (!contentEntry) throw new Error('content.xml não encontrado no arquivo ODT.')

  const xmlText = new TextDecoder('utf-8').decode(contentEntry.data)

  // Strip XML tags, keeping text content
  const stripped = xmlText
    .replace(/<text:line-break[^>]*\/>/gi, '\n')
    .replace(/<text:p[^>]*>/gi, '\n')
    .replace(/<text:h[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return stripped
}

interface ZipEntry { name: string; data: Uint8Array }

function parseZipEntries(bytes: Uint8Array): ZipEntry[] {
  const entries: ZipEntry[] = []
  let i = 0

  while (i < bytes.length - 4) {
    // Local file header signature: PK\x03\x04
    if (bytes[i] !== 0x50 || bytes[i+1] !== 0x4B || bytes[i+2] !== 0x03 || bytes[i+3] !== 0x04) {
      i++
      continue
    }

    const compression  = bytes[i+8]  | (bytes[i+9]  << 8)
    const compSize     = bytes[i+18] | (bytes[i+19] << 8) | (bytes[i+20] << 16) | (bytes[i+21] << 24)
    const uncompSize   = bytes[i+22] | (bytes[i+23] << 8) | (bytes[i+24] << 16) | (bytes[i+25] << 24)
    const nameLen      = bytes[i+26] | (bytes[i+27] << 8)
    const extraLen     = bytes[i+28] | (bytes[i+29] << 8)
    const nameBytes    = bytes.slice(i+30, i+30+nameLen)
    const name         = new TextDecoder('utf-8').decode(nameBytes)
    const dataStart    = i + 30 + nameLen + extraLen
    const compData     = bytes.slice(dataStart, dataStart + compSize)

    if (compression === 0) {
      // Stored (no compression)
      entries.push({ name, data: compData })
    } else if (compression === 8) {
      // Deflate — use DecompressionStream
      try {
        const ds = new DecompressionStream('deflate-raw')
        const writer = ds.writable.getWriter()
        const reader = ds.readable.getReader()
        writer.write(compData)
        writer.close()
        const chunks: Uint8Array[] = []
        let result = await reader.read()
        while (!result.done) { chunks.push(result.value); result = await reader.read() }
        const out = new Uint8Array(uncompSize)
        let offset = 0
        for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length }
        entries.push({ name, data: out })
      } catch {
        // Skip entries that fail to decompress
      }
    }

    i = dataStart + compSize
  }

  return entries
}

// Extract text from RTF — strip RTF control words, keep plain text
function extractRtf(bytes: Uint8Array): string {
  const enc = detectEncoding(bytes)
  const raw = new TextDecoder(enc).decode(bytes)
  return raw
    .replace(/\{\\[^{}]+\}/g, '')          // remove groups like {\fonttbl ...}
    .replace(/\\[a-z]+\d*\s?/gi, ' ')      // remove control words like \par \b \f0
    .replace(/\\\n/g, '\n')                 // line breaks
    .replace(/[{}\\]/g, '')                 // leftover braces and backslashes
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase()

  // DOCX — mammoth handles it natively
  if (name.endsWith('.docx')) {
    const buf = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer: buf })
    return result.value
  }

  // ODT — parse ZIP and extract content.xml
  if (name.endsWith('.odt')) {
    const buf = await file.arrayBuffer()
    return await extractOdt(buf)
  }

  // RTF — strip control words
  if (name.endsWith('.rtf')) {
    const buf = await file.arrayBuffer()
    return extractRtf(new Uint8Array(buf))
  }

  // TXT / MD / any plain text — detect encoding
  const buf   = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  const enc   = detectEncoding(bytes)
  return new TextDecoder(enc).decode(bytes)
}

export function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/xml;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href     = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
