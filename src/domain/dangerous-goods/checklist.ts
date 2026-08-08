/**
 * The bench checklist: what goes on each package, and what goes on the air waybill.
 *
 * The Shipper's Declaration is only half of what a lithium battery consignment needs, and for
 * a Section II consignment it is none of it — there is no declaration, and the battery mark
 * and the air waybill statement carry the whole of the hazard communication between them. A
 * PDF nobody can take to the packing bench does not help with that.
 *
 * So this renders the other half as markdown: one section per package listing the marks and
 * labels it must carry, the air waybill wording, the packaging the section demands, the three
 * weights that have to stay separate, and the release sequence that must not be compressed.
 * It is written to be printed and worked through, which is why it is a list of instructions
 * rather than a summary of findings.
 */
import { cell } from '../../lib/report'
import { packageCountInConsignment, type DgAssessment } from './assess'
import { formatKg } from './dgd'
import {
  CHEMISTRY_LABELS,
  FORM_LABELS,
  combinedSectionIIStatement,
  fullyRegulatedStatementVariants,
} from './lithium'
import { ARTICLE_LEVEL_PHRASES, PROHIBITED_CO_PACKED_CLASSES, type DgConsignment } from './types'

export function buildChecklist(
  consignment: DgConsignment,
  assessment: DgAssessment,
  preparedOn: string,
): string {
  const out: string[] = []
  const carrier = consignment.operatingCarrier.trim()

  out.push('# Lithium battery air consignment — package and air waybill checklist')
  out.push('')
  out.push(`Prepared ${preparedOn}${carrier ? ` for carriage on ${cell(carrier)}` : ''}.`)
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
  row(out, 'Forwarder', consignment.forwarder)
  row(
    out,
    'Operating carrier',
    carrier
      ? `${carrier}${consignment.operatingCarrierSource.trim() ? ` (from ${consignment.operatingCarrierSource.trim()})` : ''}`
      : '— UNRESOLVED; the forwarder is not the airline',
  )
  row(
    out,
    'Aircraft',
    consignment.aircraft === 'cargo-aircraft-only' ? 'Cargo aircraft only' : 'Passenger and cargo aircraft',
  )
  row(out, 'Packages', String(assessment.totals.packages))
  row(out, 'Net battery weight (declared quantity)', `${formatKg(assessment.totals.netWeightKg)} kg`)
  row(
    out,
    'Gross weight (not the declared quantity)',
    assessment.totals.grossWeightKg == null ? '— not recorded' : `${formatKg(assessment.totals.grossWeightKg)} kg`,
  )
  row(
    out,
    'Shipper’s Declaration',
    assessment.declarationRequired ? 'Required' : 'Not required — every package is Section II',
  )
  out.push('')
  out.push(
    'The dangerous goods net quantity, the package gross weight and the weight the forwarder puts on the air ' +
      'waybill are three separate numbers. They will not match, and none of them may be derived from another to ' +
      'make them agree.',
  )
  out.push('')

  // --- The air waybill ---------------------------------------------------
  out.push('## Air waybill')
  out.push('')
  if (assessment.airWaybillStatements.length) {
    out.push('The handling information box must carry:')
    out.push('')
    for (const statement of assessment.airWaybillStatements) out.push(`- “${cell(statement)}”`)
    if (assessment.declarationRequired) {
      // Only the wordings not already listed above, so the reader is looking at alternatives
      // rather than at the same sentence twice.
      const alternatives = fullyRegulatedStatementVariants(consignment.aircraft).filter(
        (variant) => !assessment.airWaybillStatements.includes(variant),
      )
      if (alternatives.length) {
        out.push('')
        out.push('Equally accepted in place of the fully regulated wording above:')
        out.push('')
        for (const variant of alternatives) out.push(`- “${cell(variant)}”`)
      }
      out.push('')
      out.push(
        'Where the operating carrier requires its own form of words, or its own declaration form, that governs ' +
          'over any of these.',
      )
    }
    const combined = combinedSectionIIStatement(assessment.classifications)
    if (combined && combined !== assessment.airWaybillStatements.find((s) => s === combined)) {
      out.push('')
      out.push(
        'The Section II statements may be combined into one, provided the combined wording still identifies the ' +
          'battery types and packing instructions involved:',
      )
      out.push('')
      out.push(`- “${cell(combined)}”`)
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
      out.push(
        `  - UN 38.3: ${entry.testSummaryScope ? `covers ${ARTICLE_LEVEL_PHRASES[entry.testSummaryScope]}` : 'none recorded'}` +
          `${entry.testSummaryReference.trim() ? ` (${cell(entry.testSummaryReference)})` : ''}; ` +
          `${ARTICLE_LEVEL_PHRASES[entry.articleLevel]} in the box.`,
      )
      if (classification.stateOfCharge) {
        out.push(
          `  - State of charge: ${entry.stateOfChargePercent ?? '—'}%` +
            `${entry.stateOfChargeBasis ? ` of ${entry.stateOfChargeBasis.replace(/-/g, ' ')}` : ' (basis not recorded)'}` +
            `${entry.stateOfChargeMeasuredAt.trim() ? `, measured ${cell(entry.stateOfChargeMeasuredAt)}` : ''}` +
            `${entry.stateOfChargeMeasuredBy.trim() ? ` by ${cell(entry.stateOfChargeMeasuredBy)}` : ''}` +
            `${entry.stateOfChargeMethod.trim() ? ` using ${cell(entry.stateOfChargeMethod)}` : ''}.`,
        )
      }
    }
    out.push('')

    out.push('**Weights — three numbers, none derived from another**')
    out.push('')
    out.push(`- [ ] Package gross: ${pkg.grossWeightKg == null ? 'NOT RECORDED' : `${formatKg(pkg.grossWeightKg)} kg`}`)
    out.push(
      `- [ ] Equipment net: ${pkg.equipmentNetWeightKg == null ? 'not recorded' : `${formatKg(pkg.equipmentNetWeightKg)} kg`}`,
    )
    out.push(`- [ ] Battery net (the declared quantity): ${formatKg(assessed.netWeightKg)} kg`)
    out.push('')

    out.push('**Marks and labels**')
    out.push('')
    for (const mark of assessed.hazardCommunication) out.push(`- [ ] ${cell(mark)}`)
    if (assessed.batteryMarkExemption) {
      out.push(`- *Battery mark not required:* ${cell(assessed.batteryMarkExemption)}`)
    }
    out.push('- [ ] Photograph every outer marking before release.')
    out.push('')

    out.push('**Packaging**')
    out.push('')
    if (pkg.unSpecificationMark.trim()) {
      out.push(
        `- [ ] UN specification packaging \`${cell(pkg.unSpecificationMark)}\`, meeting Packing Group II ` +
          'performance; follow the manufacturer’s closure instructions exactly and use every component ' +
          'supplied. Keep the instruction sheet with the packing record.',
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
    out.push('- [ ] Terminals protected; no contact with conductive material inside the package.')
    out.push(
      `- [ ] Nothing in the package from the prohibited list: ${PROHIBITED_CO_PACKED_CLASSES.join('; ')}. ` +
        'Division 1.4S is permitted.',
    )
    if (assessed.effectiveLimitKg != null) {
      out.push(`- [ ] Net battery weight per package at or below ${formatKg(assessed.effectiveLimitKg)} kg.`)
    }
    if (overpack) {
      out.push(
        `- [ ] Overpack${overpack.count > 1 ? ` (${overpack.count} identical)` : ''}` +
          `${overpack.marks.trim() ? `, marked ${cell(overpack.marks)}` : ', IDENTIFIER NOT ASSIGNED'} — the word ` +
          'OVERPACK at least 12 mm high on the outside, the identifier matching the declaration entry exactly, ' +
          (overpack.innerMarksVisible
            ? 'and the marks and labels inside visible through it.'
            : 'and every mark and label above reproduced on the exterior.'),
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
    `- [ ] Operator variations (IATA 2.8.3) read for ${cell(carrier || 'the OPERATING AIRLINE, which is not the forwarder')}` +
      `${consignment.operatorVariationsChecked ? ' — confirmed' : ''}.`,
  )
  out.push(
    '- [ ] Carrier acceptance confirmed before booking. Many carriers refuse UN3480 Section IA outright, or ' +
      'accept it only at designated dangerous goods stations.',
  )
  if (assessment.declarationRequired) {
    out.push('- [ ] Electronic draft sent to the forwarder for dangerous goods review before printing and signing.')
    out.push('- [ ] Forwarder dangerous goods approval received. Pickup is not scheduled before this.')
    out.push('- [ ] House air waybill weight checked against the packing record. Do not assume it is right.')
    out.push(
      '- [ ] Operating carrier re-checked against the booking confirmation or master air waybill, and its ' +
        'variations re-read if it differs from the one assumed.',
    )
    out.push('- [ ] Two signed copies of the Shipper’s Declaration handed to the operator; four or five is better.')
    out.push('- [ ] Printed in colour, so the margin hatching is red.')
    out.push('- [ ] One copy of the emergency response information attached to each declaration.')
    out.push(
      '- [ ] A copy retained for two years after acceptance by the initial carrier, accessible at or through ' +
        'the principal place of business, showing the date of acceptance — the airbill date may be used ' +
        '(49 CFR 172.201(e)).',
    )
    out.push(
      '- [ ] Signer holds current dangerous goods training covering **air** and the functions performed, not ' +
        'merely a certificate on file.',
    )
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
