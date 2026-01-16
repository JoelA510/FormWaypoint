const TEMPLATE_MAP = {
    'sli': 'sli',
    'nippon': 'nippon-sli',
    'nippon-sli': 'nippon-sli',
    'ceva': 'ceva-sli',
    'ceva-sli': 'ceva-sli',
    'dhl': 'dhl-invoice',
    'dhl-invoice': 'dhl-invoice',
    'bol': 'generic-bol',
    'generic-bol': 'generic-bol',
    'fedex': 'fedex-bol',
    'fedex-bol': 'fedex-bol',
    'ups': 'ups-bol',
    'ups-bol': 'ups-bol',
    'usps': 'usps-label',
    'usps-label': 'usps-label',
    'proforma_invoice': 'proforma_invoice',
    'shipper_letter_of_instruction': 'shipper_letter_of_instruction',
    'certificate_of_origin': 'certificate_of_origin',
    'dangerous_goods_declaration': 'dangerous_goods_declaration'
};

const TEMPLATE_DEFAULTS = {
    'sli': { format: 'A4' },
    'fedex-bol': { format: 'Letter' },
    'ups-bol': { format: 'Letter' },
    'usps-label': { format: 'A6', width: '4in', height: '6in' },
    'proforma_invoice': { format: 'A4' },
    'shipper_letter_of_instruction': { format: 'A4' },
    'certificate_of_origin': { format: 'A4' },
    'dangerous_goods_declaration': { format: 'A4' }
};

module.exports = {
    TEMPLATE_MAP,
    TEMPLATE_DEFAULTS
};
