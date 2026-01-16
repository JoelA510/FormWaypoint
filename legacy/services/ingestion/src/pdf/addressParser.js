
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
    // Expanded country list
    const knownCountries = [
        'USA', 'United States', 'US',
        'Australia', 'AU',
        'United Kingdom', 'Great Britain', 'GB', 'UK',
        'Canada', 'CA',
        'Japan', 'JP',
        'China', 'CN',
        'Germany', 'DE',
        'France', 'FR',
        'Mexico', 'MX',
        'Brazil', 'BR',
        'India', 'IN'
    ];

    if (parts.length > 0) {
        const last = parts[parts.length - 1].trim();
        // Check case insensitive
        const matchedCountry = knownCountries.find(c => last.toLowerCase() === c.toLowerCase() || last.toLowerCase().endsWith(" " + c.toLowerCase()));
        if (matchedCountry) {
            result.country = parts.pop();
        }
    }

    // 5. Parse remaining parts
    // We expect: Address 1, [Address 2], City/State/Zip

    // Helper to parse City State Zip
    const parseCityStateZip = (str) => {
        // US Format: "City ST 12345"
        // International: "City Region POSTCODE"

        // Regex try 1: US/AU style (State Zip)
        // Group 1: City (greedy)
        // Group 2: State (2-3 letters)
        // Group 3: Zip (5 digits or 4 digits)
        let match = str.match(/^(.*?)\s+([A-Za-z]{2,3})\s+(\d{4,9}(-\d{4})?)$/);

        if (!match) {
            // Regex try 2: Global/Alphanumeric zip (e.g. Canada K1A 0B1, UK SW1A 1AA)
            // State might be missing or longer. 
            // Look for alphanumeric zip at end with length 3-8
            match = str.match(/^(.*?)\s+([A-Za-z0-9\s]{3,10})$/);
            // This is loose, it effectively grabs last token as Zip, rest as City/State
            if (match) {
                // Heuristic: Is the first part city? 
                // We'll return City as match[1], Zip as match[2], State as '' (or infer later)
                return {
                    city: match[1].trim(),
                    state: '',
                    zip: match[2].trim()
                };
            }
        } else {
            return {
                city: match[1].trim(),
                state: match[2].toUpperCase(),
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
            if (csz.state) result.state = csz.state;
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
        const caStates = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];

        const stateUpper = result.state.toUpperCase();
        if (usStates.includes(stateUpper)) {
            result.country = 'United States';
        } else if (auStates.includes(stateUpper)) {
            result.country = 'Australia';
        } else if (caStates.includes(stateUpper)) {
            result.country = 'Canada';
        }
    }

    return result;
}

module.exports = { parseAddress };
