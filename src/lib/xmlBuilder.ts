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
  unitTemplate?: string
): string {
  if (unitTemplate) return escapeXml(unitTemplate.replace(/\{n\}/g, String(qNum)))
  if (codeTemplate) return escapeXml(codeTemplate.replace(/\{n\}/g, String(qNum)))
  if (p.codigoQ)    return escapeXml(p.codigoQ)
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
  const { questionType, prefix, codeTemplate, penalty, shuffle, fbCorrect, fbIncorrect, useAltFeedback, unitTemplates } = opts
  const unitTemplate = unitKey && unitTemplates?.[unitKey] ? unitTemplates[unitKey] : undefined

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<quiz>\n\n'

  perguntas.forEach((p, i) => {
    const corretas   = p.alternativas.filter(a => a.correta).length
    const fbGeral    = p.feedbackGeral || fbCorrect || fbIncorrect || ''
    const qNum       = startQ + i
    const nomePergunta = resolveQuestionName(p, qNum, prefix, codeTemplate, detectedPattern, unitTemplate)

    xml += `  <question type="${questionType}">\n`
    xml += `    <name>\n      <text>${nomePergunta}</text>\n    </name>\n`
    xml += `    <questiontext format="html">\n      <text><![CDATA[${pWrap(p.texto)}]]></text>\n    </questiontext>\n`
    xml += `    <generalfeedback format="html">\n      <text><![CDATA[${pWrap(fbGeral)}]]></text>\n    </generalfeedback>\n`
    xml += `    <defaultgrade>1.0000000</defaultgrade>\n`
    xml += `    <penalty>${parseFloat(penalty).toFixed(7)}</penalty>\n`
    xml += `    <hidden>0</hidden>\n`
    xml += `    <idnumber></idnumber>\n`
    xml += `    <single>${questionType === 'multichoice' ? 'true' : 'false'}</single>\n`
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
    if (!opts.splitByUnit || groups.length === 1) {
      startQ = continueCursor
      continueCursor += questions.length
    } else if (opts.qmode === 'reset') {
      startQ = 1
    } else if (opts.qmode === 'continue') {
      startQ = continueCursor
      continueCursor += questions.length
    } else {
      startQ = opts.unitOffsets[unitKey] ?? 1
    }

    const xml = buildXml(questions, opts, startQ, detectedPattern, unitKey)
    return { unitKey, questions, startQ, xml }
  })
}
