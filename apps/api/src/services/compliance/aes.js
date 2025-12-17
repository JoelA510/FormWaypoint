/**
 * AES Compliance Service
 * Handles formatting and validation for EEI (Electronic Export Information) filing
 */
class AESService {
    /**
     * Validate EEI data before filing
     * @param {object} data 
     */
    static validateEEI(data) {
        const errors = [];
        if (!data.usppi) errors.push('USPPI information is required');
        if (!data.consignee) errors.push('Consignee information is required');
        if (!data.commodity || data.commodity.length === 0) errors.push('At least one commodity line is required');

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Format data for CBP AES Direct (Proprietary XML format simulation)
     * @param {object} data 
     */
    static formatForAESDirect(data) {
        // This is a simplified XML representation for demonstration
        // In production, this would follow the exact CBP AESTIR format
        return `
<EEI>
    <ShipmentHeader>
        <SenderID>${data.usppi?.ein || ''}</SenderID>
        <ExportDate>${new Date().toISOString().split('T')[0]}</ExportDate>
        <PortOfExport>${data.portOfExport || ''}</PortOfExport>
    </ShipmentHeader>
    <Parties>
        <USPPI>
            <Name>${data.usppi?.name || ''}</Name>
            <Address>${data.usppi?.address || ''}</Address>
        </USPPI>
        <Consignee>
            <Name>${data.consignee?.name || ''}</Name>
            <Country>${data.consignee?.country || ''}</Country>
        </Consignee>
    </Parties>
    <Commodities>
        ${(data.commodity || []).map(c => `
        <LineItem>
            <Description>${c.description}</Description>
            <ScheduleB>${c.scheduleB}</ScheduleB>
            <Value>${c.value}</Value>
        </LineItem>
        `).join('')}
    </Commodities>
</EEI>
        `.trim();
    }
}

module.exports = AESService;
