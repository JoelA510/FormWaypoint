/**
 * What the keying sheet puts in its commodity table, and how many rows it takes to do it.
 *
 * The right answer is not the same on two consecutive shipments. A shipment keyed into Ship
 * Manager wants one row per commodity *record*, which is part plus origin plus code, because
 * that is what the record stores. The same shipment checked against a filed SLI wants the
 * SLI's own rows, which are D/F plus code. And a shipment being read line by line against the
 * invoice wants no grouping at all. Rather than pick one and make the other two manual, all
 * of them are here and the operator says which.
 *
 * Columns are chosen the same way and for the same reason: the eight fields a Ship Manager
 * commodity screen asks for are not the eight a customs broker wants to see.
 */

/**
 * How invoice lines become rows.
 *
 * Every mode groups on something the row can truthfully assert jointly. None of them merges
 * two different commodity numbers, because a row states one.
 */
export type GroupingMode =
  /** Part, country of manufacture and commodity number — one row per commodity record. */
  | 'part-origin-code'
  /** Part and commodity number, origins combined. One row per part, when origin is not keyed. */
  | 'part-code'
  /** D/F and commodity number: the rows a filed SLI carries. */
  | 'df-code'
  /** No grouping. One row per invoice line, as the document prints them. */
  | 'line'

/** Where a row's commodity description comes from. Never composed by the application. */
export type DescriptionSource =
  /** The part's own description, as the document prints it. */
  | 'document'
  /** The commodity heading the document prints above the block. */
  | 'heading'
  /** The official Census wording for the commodity number. */
  | 'schedule-b'

export const GROUPING_LABELS: Record<GroupingMode, string> = {
  'part-origin-code': 'Part + country + code (one commodity record)',
  'part-code': 'Part + code (origins combined)',
  'df-code': 'D/F + code (as the SLI files it)',
  line: 'No grouping (one row per invoice line)',
}

export const DESCRIPTION_LABELS: Record<DescriptionSource, string> = {
  document: 'As printed against the part',
  heading: 'The document’s commodity heading',
  'schedule-b': 'Official Schedule B wording',
}

/** Printed on the sheet's Notes tab, so a choice made months ago still explains itself. */
export const GROUPING_NOTES: Record<GroupingMode, string> = {
  'part-origin-code':
    'Lines the document split by wording were combined; a part shipped from two countries, or carrying two commodity numbers, stays on separate rows because those are fields on the commodity record.',
  'part-code':
    'A part shipped from more than one country is one row, and every country it came from is listed in the country column. Use this only where the commodity record does not key origin.',
  'df-code':
    'The rows a filed SLI carries: everything domestic under one code on one row, everything foreign under that code on another. Parts and origins are listed rather than merged away.',
  line: 'No grouping at all — one row per invoice line, in document order, including lines the document itself repeats.',
}

export const DESCRIPTION_NOTES: Record<DescriptionSource, string> = {
  document:
    'Taken from the wordings already on the document — the one most of these goods were invoiced under, by quantity. Where a part was described more than one way the alternatives are printed in the Note column, because the document does not say which is meant.',
  heading:
    'The commodity heading the document prints above the block, falling back to the part’s own description where a block carries no heading. Alternatives are printed in the Note column.',
  'schedule-b':
    'The Census Bureau’s own wording for the commodity number being filed, from the Schedule B concordance this app carries. Whether that code describes these goods is a human judgement, so what the document called them is printed in the Note column beside it.',
}

export interface CommodityColumn {
  id: CommodityColumnId
  label: string
  /** Right-aligned figures that a spreadsheet should total. */
  numeric?: boolean
}

export type CommodityColumnId =
  | 'partNumber'
  | 'countryOfManufacture'
  | 'domesticForeign'
  | 'harmonizedCode'
  | 'quantity'
  | 'unitOfMeasure'
  | 'unitValue'
  | 'totalValue'
  | 'weightLb'
  | 'weightKg'
  | 'description'
  | 'note'

/** Every column the table can carry, in the order it prints them when all are on. */
export const COMMODITY_COLUMNS: CommodityColumn[] = [
  { id: 'partNumber', label: 'Part Number' },
  { id: 'countryOfManufacture', label: 'Country of Manufacture' },
  { id: 'domesticForeign', label: 'D/F' },
  { id: 'harmonizedCode', label: 'Harmonized Code' },
  { id: 'quantity', label: 'Qty', numeric: true },
  { id: 'unitOfMeasure', label: 'UOM' },
  { id: 'unitValue', label: 'Unit Value (USD)', numeric: true },
  { id: 'totalValue', label: 'Total Customs Value (USD)', numeric: true },
  { id: 'weightLb', label: 'Weight (lb)', numeric: true },
  { id: 'weightKg', label: 'Weight (kg)', numeric: true },
  { id: 'description', label: 'Commodity Description' },
  { id: 'note', label: 'Note' },
]

export interface KeyingOptions {
  grouping: GroupingMode
  descriptionSource: DescriptionSource
  /** Columns to print, in the order they are given. */
  columns: CommodityColumnId[]
}

/** What a Ship Manager commodity screen asks for, which is what this sheet is mostly for. */
export const DEFAULT_KEYING_OPTIONS: KeyingOptions = {
  grouping: 'part-origin-code',
  descriptionSource: 'document',
  columns: [
    'partNumber',
    'countryOfManufacture',
    'harmonizedCode',
    'quantity',
    'unitOfMeasure',
    'unitValue',
    'totalValue',
    'weightLb',
    'weightKg',
    'description',
    'note',
  ],
}

/**
 * Fills in anything a caller left out, and drops any column id it does not recognise.
 *
 * Options are held in IndexedDB between sessions, so a stored set can outlive the column it
 * names. A column that no longer exists must not put an empty heading on a sheet somebody is
 * keying from.
 */
export function withDefaults(options?: Partial<KeyingOptions>): KeyingOptions {
  const known = new Set(COMMODITY_COLUMNS.map((c) => c.id))
  const columns = options?.columns?.filter((id) => known.has(id)) ?? []
  return {
    grouping: options?.grouping ?? DEFAULT_KEYING_OPTIONS.grouping,
    descriptionSource: options?.descriptionSource ?? DEFAULT_KEYING_OPTIONS.descriptionSource,
    columns: columns.length ? columns : DEFAULT_KEYING_OPTIONS.columns,
  }
}
