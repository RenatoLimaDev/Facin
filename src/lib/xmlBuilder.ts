import type { Question, ConvertOptions, UnitGroup } from '@/types'
import { groupByUnit } from './parser'

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function pWrap(txt: string): string {
  return txt ? `<p dir="ltr" style="text-align: left;">${txt}</p>` : ''
}

function resolveQuestionName(
  p: Question,
  qNum: number,
  prefix: string,
  codeTemplate: string,
  detectedPattern: string,
  unitTemplate?: string,
  opts?: import('@/types').ConvertOptions,
  uz?: string
): string {
  if (p.codigoQ) return escapeXml(p.codigoQ)

  // Per-question module: if this question has its own module (percursoMod),
  // build the code using that instead of the group-level template
  if (p.percursoMod && opts?.segments && uz) {
    const { prod, ano, tipo } = opts.segments
    if (prod && ano && tipo) {
      return escapeXml(`${prod}.${ano}.${uz}.${p.percursoMod}.${tipo}.Q${qNum}`)
    }
  }

  if (unitTemplate) return escapeXml(unitTemplate.replace(/\{n\}/g, String(qNum)))
  if (codeTemplate) return escapeXml(codeTemplate.replace(/\{n\}/g, String(qNum)))
  if (detectedPattern) return escapeXml(detectedPattern.replace(/\{n\}/g, String(qNum)))
  if (p.tituloHint) return `${escapeXml(prefix)} ${qNum} — ${escapeXml(p.tituloHint)}`
  return `${escapeXml(prefix)} ${qNum}`
}

export function buildXml(
  perguntas: Question[],
  opts: ConvertOptions,
  startQ: number,
  detectedPattern: string,
  unitKey?: string
): string {
  const { prefix, codeTemplate, penalty, shuffle, fbCorrect, fbIncorrect, useAltFeedback, unitTemplates } = opts
  const unitTemplate = unitKey && unitTemplates?.[unitKey] ? unitTemplates[unitKey] : undefined

  // Derive uz from unitKey for per-question module resolution
  // unitKey can be "P1", "U1", "U2", etc.
  const uz = unitKey
    ? unitKey.match(/^P(\d+)$/) ? `U${unitKey.match(/^P(\d+)$/)![1]}`
    : unitKey.match(/^(\d+)$/)  ? `U${unitKey}`
    : unitKey
    : undefined

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<quiz>\n\n'

  perguntas.forEach((p, i) => {
    const isEssay    = p.questionType === 'essay'
    const corretas   = p.alternativas.filter(a => a.correta).length
    const qType      = isEssay ? 'essay' : 'multichoice'
    const fbGeral    = p.feedbackGeral || fbCorrect || fbIncorrect || ''
    const qNum       = startQ + i
    const nomePergunta = resolveQuestionName(p, qNum, prefix, codeTemplate, detectedPattern, unitTemplate, opts, uz)

    xml += `  <question type="${qType}">\n`
    xml += `    <name>\n      <text>${nomePergunta}</text>\n    </name>\n`
    xml += `    <questiontext format="html">\n      <text><![CDATA[${pWrap(p.texto)}]]></text>\n    </questiontext>\n`
    xml += `    <generalfeedback format="html">\n      <text><![CDATA[${pWrap(fbGeral)}]]></text>\n    </generalfeedback>\n`
    xml += `    <defaultgrade>1.0000000</defaultgrade>\n`
    xml += `    <penalty>${parseFloat(penalty).toFixed(7)}</penalty>\n`
    xml += `    <hidden>0</hidden>\n`
    xml += `    <idnumber></idnumber>\n`

    if (isEssay) {
      xml += `    <responseformat>editor</responseformat>\n`
      xml += `    <responserequired>1</responserequired>\n`
      xml += `    <responsefieldlines>15</responsefieldlines>\n`
      xml += `    <minwordlimit></minwordlimit>\n`
      xml += `    <maxwordlimit></maxwordlimit>\n`
      xml += `    <attachments>0</attachments>\n`
      xml += `    <attachmentsrequired>0</attachmentsrequired>\n`
      xml += `    <graderinfo format="html">\n      <text><![CDATA[${pWrap(fbGeral)}]]></text>\n    </graderinfo>\n`
      xml += `    <responsetemplate format="html">\n      <text></text>\n    </responsetemplate>\n`
    } else {
      xml += `    <single>${corretas <= 1 ? 'true' : 'false'}</single>\n`
      xml += `    <shuffleanswers>${shuffle ? 'true' : 'false'}</shuffleanswers>\n`
      xml += `    <answernumbering>abc</answernumbering>\n`
      xml += `    <showstandardinstruction>0</showstandardinstruction>\n`
      xml += `    <correctfeedback format="html">\n      <text>Sua resposta está correta.</text>\n    </correctfeedback>\n`
      xml += `    <partiallycorrectfeedback format="html">\n      <text>Sua resposta está parcialmente correta.</text>\n    </partiallycorrectfeedback>\n`
      xml += `    <incorrectfeedback format="html">\n      <text>Sua resposta está incorreta.</text>\n    </incorrectfeedback>\n`
      xml += `    <shownumcorrect/>\n`

      p.alternativas.forEach(a => {
        let frac = '0'
        if (a.correta) {
          frac = corretas > 1 ? (100 / corretas).toFixed(5) : '100'
        } else if (parseFloat(penalty) > 0) {
          const erradas = p.alternativas.length - corretas
          if (erradas > 0) frac = (-parseFloat(penalty) * 100 / erradas).toFixed(5)
        }
        const altFb = useAltFeedback && a.feedback ? a.feedback : ''
        xml += `    <answer fraction="${frac}" format="html">\n`
        xml += `      <text><![CDATA[${pWrap(a.texto)}]]></text>\n`
        xml += `      <feedback format="html">\n        <text><![CDATA[${pWrap(altFb)}]]></text>\n      </feedback>\n`
        xml += `    </answer>\n`
      })
    }

    xml += `  </question>\n\n`
  })

  xml += '</quiz>'
  return xml
}

export function buildAllUnits(
  perguntas: Question[],
  opts: ConvertOptions,
  detectedPattern: string
): UnitGroup[] {
  const groups = groupByUnit(perguntas)

  let continueCursor = 1

  return groups.map(({ unitKey, questions }) => {
    let startQ: number
    if (opts.qmode === 'continue') {
      startQ = continueCursor
      continueCursor += questions.length
    } else if (opts.qmode === 'offset') {
      startQ = opts.unitOffsets[unitKey] ?? 1
    } else {
      // 'reset' (default) — each unit always starts at Q1
      startQ = 1
    }

    const xml = buildXml(questions, opts, startQ, detectedPattern, unitKey)
    return { unitKey, questions, startQ, xml }
  })
}
