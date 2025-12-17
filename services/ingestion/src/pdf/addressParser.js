
/**
 * Parses a raw address string into structured components.
 * @param {string} rawAddress - The raw address string (multi-line or single line).
 * @returns {object} Structured address object.
 */
function parseAddress(rawString) {
    if (!rawString) return null;

    // 1. Split by comma or newline
    let parts = rawString.split(/,|\n/).map(p => p.trim()).filter(p => p.length > 0);

    // 2. Cleanup Name (Remove "FC " prefix if present)
    if (parts.length > 0) {
        parts[0] = parts[0].replace(/^FC\s+/i, '');
    }

    // 3. Handle "Inc." / "LLC" on separate line
    // If the second part is just a suffix, append it to the name
    if (parts.length > 1 && /^(Inc\.?|LLC|Ltd\.?|Pty Ltd\.?)$/i.test(parts[1])) {
        parts[0] = parts[0] + ", " + parts[1];
        parts.splice(1, 1); // Remove the suffix part
    }

    const result = {
        name: parts[0] || '',
        address: '',
        address2: '',
        city: '',
        state: '',
        zip: '',
        country: ''
    };

    // Remove name from parts to process the rest
    parts.shift();

    // 4. Identify Country (usually last)
    // If the last part is a known country, extract it
    const knownCountries = ['USA', 'United States', 'Australia', 'United Kingdom', 'GB', 'UK', 'Canada', 'Japan', 'China'];
    if (parts.length > 0) {
        const last = parts[parts.length - 1];
        if (knownCountries.some(c => last.toLowerCase().includes(c.toLowerCase()))) {
            result.country = parts.pop();
        }
    }

    // 5. Parse remaining parts
    // We expect: Address 1, [Address 2], City/State/Zip

    // Helper to parse City State Zip
    const parseCityStateZip = (str) => {
        // US Format: "Pleasanton CA 94588" or "Pleasanton, CA 94588"
        // AU Format: "Bankstown Aerodrome NSW 2198"

        // Regex for US/AU: Capture (City) (State) (Zip)
        // State is usually 2-3 uppercase letters. Zip is 4-5 digits.
        // Look for State + Zip at the end
        const match = str.match(/^(.*?)\s+([A-Z]{2,3})\s+(\d{4,5})$/);
        if (match) {
            return {
                city: match[1].trim(),
                state: match[2],
                zip: match[3]
            };
        }
        return null;
    };

    // Iterate backwards to find City/State/Zip
    let foundCSZ = false;
    for (let i = parts.length - 1; i >= 0; i--) {
        const csz = parseCityStateZip(parts[i]);
        if (csz) {
            result.city = csz.city;
            result.state = csz.state;
            result.zip = csz.zip;
            parts.splice(i, 1); // Remove this part
            foundCSZ = true;
            break;
        }
    }

    // Remaining parts are Address lines
    if (parts.length > 0) {
        result.address = parts[0];
        if (parts.length > 1) {
            result.address2 = parts.slice(1).join(', ');
        }
    }

    // 6. Infer Country if missing
    if (!result.country && result.state) {
        const usStates = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];
        const auStates = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

        if (usStates.includes(result.state.toUpperCase())) {
            result.country = 'United States';
        } else if (auStates.includes(result.state.toUpperCase())) {
            result.country = 'Australia';
        }
    }

    return result;
}

module.exports = { parseAddress };
