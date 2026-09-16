/**
 * The country a printed address names — the only statement of destination the in-house
 * Commercial Invoice form makes, since it has no discharge-port box.
 *
 * Every case here is a way of getting it wrong: a county beside the country, a state
 * abbreviation that is also an ISO code, a phone number below the address, and a postal
 * line that names no country at all.
 */
import { describe, expect, it } from 'vitest'
import { countryFromAddressLines, toIsoAlpha2 } from './countries'

describe('countryFromAddressLines', () => {
  it('takes the country out of the tail of a postal line', () => {
    expect(
      countryFromAddressLines([
        'PLEXUS SERVICES RO S.R.L.',
        'STR. ANGHEL I. SALIGNY NR. 40',
        'ORADEA, 410085, BIHOR, ROMANIA',
      ]),
    ).toBe('Romania')
  })

  it('reads past a contact line printed below the address', () => {
    expect(
      countryFromAddressLines(['ORADEA, 410085, BIHOR, ROMANIA', 'Cristian Beleiu: +40 741 403 987']),
    ).toBe('Romania')
  })

  it('returns the canonical name, not the shouted one the form prints', () => {
    expect(countryFromAddressLines(['1 Harbour Way', 'SINGAPORE'])).toBe('Singapore')
    expect(countryFromAddressLines(['4225 Hacienda Drive', 'United States of America'])).toBe('United States')
    expect(countryFromAddressLines(['Some Street', 'U.S.A.'])).toBe('United States')
  })

  it('never reads a two-letter segment as a country', () => {
    // `CA` is Canada in the ISO list and California on an address, and there is no version
    // of guessing between them that is safe on a customs declaration.
    expect(countryFromAddressLines(['4225 Hacienda Drive', 'Pleasanton, CA'])).toBeNull()
    expect(countryFromAddressLines(['Bangalore, KA 562123'])).toBeNull()
    // The two-letter form is still a code where a column asks for one.
    expect(toIsoAlpha2('CA')).toMatchObject({ code: 'CA', known: true })
  })

  it('returns null rather than a county, a city or a postcode', () => {
    expect(countryFromAddressLines(['Bangalore, KARNATAKA 562123'])).toBeNull()
    expect(countryFromAddressLines(["'s-Hertogenbosch NA 5234"])).toBeNull()
    expect(countryFromAddressLines([])).toBeNull()
    expect(countryFromAddressLines(['', null, undefined])).toBeNull()
  })

  it('is not misled by a country named anywhere but the end of a line', () => {
    // Only the last comma-separated segment of a line counts, because that is where a
    // country is printed. A street named after one is not the destination.
    expect(countryFromAddressLines(['12 Ireland Street', 'Manchester', 'United Kingdom'])).toBe('United Kingdom')
    expect(countryFromAddressLines(['1 Chad Avenue, Suite 400', 'ORADEA, BIHOR, ROMANIA'])).toBe('Romania')
  })

  it('reads a US state that shares a country name as the state it is', () => {
    // `Atlanta, Georgia, 30301` ends in a postcode, so nothing on the line is offered —
    // where reading every segment would file a domestic address as the country Georgia.
    expect(countryFromAddressLines(['1 Peachtree St', 'Atlanta, Georgia, 30301'])).toBeNull()
  })

  it('establishes no country when the block points at two', () => {
    // A contact line under the address ends in a personal name that is also a country, and
    // there is no test that tells a person from a place. Box 7 goes to somebody who can
    // read the page rather than being filed as Chad for a shipment to Romania.
    expect(countryFromAddressLines(['ORADEA, 410085, BIHOR, ROMANIA', 'Attn: Miller, Chad'])).toBeNull()
    expect(countryFromAddressLines(['ORADEA, BIHOR, ROMANIA', 'Contact: Beleiu, Jordan'])).toBeNull()
    // The real form's own contact line ends in a phone number and costs nothing.
    expect(countryFromAddressLines(['ORADEA, BIHOR, ROMANIA', 'Cristian Beleiu: +40 741 403 987'])).toBe('Romania')
  })
})
