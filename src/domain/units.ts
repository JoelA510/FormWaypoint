/**
 * Unit conversions used on the output side.
 *
 * One definition, because two of them is how a shipment ends up weighing two different
 * things: the keying sheet and the CEVA package summary describe the same cartons, and a
 * reviewer comparing them should not find the pounds disagreeing in the third digit.
 */

/** The international avoirdupois pound, exactly 0.45359237 kg. */
export const KG_PER_LB = 0.45359237

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB
}
