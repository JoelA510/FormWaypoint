/**
 * The bench checklist: what goes on each package, and what goes on the air waybill.
 *
 * The Shipper's Declaration is only half of what a lithium battery consignment needs, and for
 * a Section II consignment it is none of it — there is no declaration, and the battery mark
 * and the air waybill statement carry the whole of the hazard communication between them. A
 * PDF nobody can take to the packing bench does not help with that.
 *
 * So this renders the other half as markdown: one section per package listing the marks and
 * labels it must carry, the air waybill wording, the packaging the section demands, and the
 * things that are true of the consignment as a whole. It is written to be printed and worked
 * through, which is why it is a list of instructions rather than a summary of findings.
 */
import { cell } from '../../lib/report'
import { packageCountInConsignment, type DgAssessment } from './assess'
import { formatKg } from './dgd'
import { CHEMISTRY_LABELS, FORM_LABELS } from './lithium'
import type { DgConsignment } from './types'

export function buildChecklist(
  consignment: DgConsignment,
  assessment: DgAssessment,
  preparedOn: string,
): string {
  const out: string[] = []

  out.push('# Lithium battery air consignment — package and air waybill checklist')
  out.push('')
  out.push(`Prepared ${preparedOn}${consignment.operator ? ` for ${cell(consignment.operator)}` : ''}.`)
  out.push('')

  // --- What this consignment is -----------------------------------------
  out.push('## Consignment')
  out.push('')
  out.push('| | |')
  out.push('| --- | --- |')
  row(out, 'Shipper', consignment.shipper.name)
  row(out, 'Consignee', consignment.consignee.name)
  row(out, 'From', consignment.airportOfDeparture)
  row(out, 'To', consignment.airportOfDestination)
  row(out, 'Air waybill', consignment.airWaybillNumber || '— left for the forwarder')
  row(
    out,
    'Aircraft',
    consignment.aircraft === 'cargo-aircraft-only' ? 'Cargo aircraft only' : 'Passenger and cargo aircraft',
  )
  row(out, 'Packages', String(assessment.totals.packages))
  row(out, 'Net battery weight', `${formatKg(assessment.totals.netWeightKg)} kg`)
  row(
    out,
    'Shipper’s Declaration',
    assessment.declarationRequired ? 'Required' : 'Not required — every package is Section II',
  )
  out.push('')

  // --- The air waybill ---------------------------------------------------
  out.push('## Air waybill')
  out.push('')
  if (assessment.airWaybillStatements.length) {
    out.push('The handling information box must carry:')
    out.push('')
    for (const statement of assessment.airWaybillStatements) out.push(`- “${cell(statement)}”`)
    if (assessment.airWaybillStatements.length > 1) {
      out.push('')
      out.push(
        'Section II statements may be combined into one, provided the combined wording still identifies the ' +
          'battery types and packing instructions involved, and says CAO where that applies.',
      )
    }
  } else {
    out.push('Nothing to declare on the air waybill — this consignment holds no battery entries yet.')
  }
  out.push('')

  // --- Package by package ------------------------------------------------
  out.push('## Packages')
  out.push('')
  for (const [index, assessed] of assessment.packages.entries()) {
    const { pkg } = assessed
    const count = packageCountInConsignment(pkg, consignment)
    const overpack = pkg.overpackId ? consignment.overpacks.find((o) => o.id === pkg.overpackId) : null

    out.push(`### ${index + 1}. ${count} × ${cell(pkg.packagingType || 'package')}`)
    out.push('')

    for (const { entry, classification } of assessed.entries) {
      const energy =
        entry.spec.chemistry === 'lithium-metal'
          ? `${entry.spec.lithiumContentG ?? '—'} g lithium content`
          : `${entry.spec.wattHours ?? '—'} Wh`
      out.push(
        `- **${classification.unNumber}, ${cell(classification.properShippingName)}** — ` +
          `${CHEMISTRY_LABELS[entry.spec.chemistry]} ${FORM_LABELS[entry.spec.form].toLowerCase()}, ${energy}, ` +
          `${formatKg(entry.netWeightKgPerPackage ?? 0)} kg per package. ` +
          `Class ${classification.hazardClass}, PI ${classification.packingInstructionLabel}.`,
      )
    }
    out.push('')

    out.push('**Marks and labels**')
    out.push('')
    for (const mark of assessed.hazardCommunication) out.push(`- [ ] ${cell(mark)}`)
    if (assessed.batteryMarkExemption) {
      out.push(`- *Battery mark not required:* ${cell(assessed.batteryMarkExemption)}`)
    }
    out.push('')

    out.push('**Packaging**')
    out.push('')
    if (pkg.unSpecificationMark.trim()) {
      out.push(
        `- [ ] UN specification packaging \`${cell(pkg.unSpecificationMark)}\`, meeting Packing Group II ` +
          'performance; follow the manufacturer’s closure instructions and use every component supplied.',
      )
    } else {
      out.push('- [ ] Strong rigid outer packaging.')
    }
    if (assessed.entries.some((e) => e.classification.innerPackagingRequired)) {
      out.push('- [ ] Inner packaging that completely encloses each cell or battery and prevents short circuits.')
    } else {
      out.push('- [ ] Equipment secured against movement and protected against accidental activation.')
    }
    if (assessed.entries.some((e) => e.classification.dropTestRequired)) {
      out.push('- [ ] The design is capable of a 1.2 m drop test with no damage, shifting or release of contents.')
    }
    if (assessed.entries.some((e) => e.classification.stackTestRequired)) {
      out.push('- [ ] The design is capable of a 3 m stack test held for 24 hours.')
    }
    if (overpack) {
      out.push(
        `- [ ] Overpack${overpack.count > 1 ? ` (${overpack.count} identical)` : ''}` +
          `${overpack.marks.trim() ? `, marked ${cell(overpack.marks)}` : ''} — every mark and label required on ` +
          'the packages inside is reproduced on the outside unless it stays visible through it.',
      )
    }
    out.push('')
  }

  // --- What is true of the whole consignment -----------------------------
  out.push('## Before it goes')
  out.push('')
  out.push(
    '- [ ] State variations (IATA 2.8.1) read for the countries of origin, transit and destination' +
      `${consignment.stateVariationsChecked ? ' — confirmed' : ''}.`,
  )
  out.push(
    `- [ ] Operator variations (IATA 2.8.3) read for ${cell(consignment.operator || 'the operating airline')}` +
      `${consignment.operatorVariationsChecked ? ' — confirmed' : ''}.`,
  )
  if (assessment.declarationRequired) {
    out.push('- [ ] Two signed copies of the Shipper’s Declaration handed to the operator; four or five is better.')
    out.push('- [ ] Printed in colour, so the margin hatching is red.')
    out.push('- [ ] One copy of the emergency response information attached to each declaration.')
    out.push('- [ ] A copy retained for at least two years, accessible at the shipment location on request.')
  } else {
    out.push(
      '- [ ] Written work instructions and a training record for the people preparing these packages — Section II ' +
        'needs adequate instruction, refreshed every two years or whenever the instructions or regulations change.',
    )
  }
  out.push('')

  // --- What was checked --------------------------------------------------
  const notPassed = assessment.checks.filter((c) => !c.passed)
  if (notPassed.length) {
    out.push('## Outstanding')
    out.push('')
    for (const check of notPassed) {
      out.push(`- **${check.severity}** — ${cell(check.title)}: ${cell(check.detail)}`)
    }
    out.push('')
  }

  return out.join('\n')
}

function row(out: string[], label: string, value: string): void {
  out.push(`| ${label} | ${cell(value || '—')} |`)
}
