import { Shipment, LineItem } from "./index";

export type ValidationIssue = {
    code: string;
    severity: "error" | "warning" | "info";
    message: string;
    path: string;
};

export const validateParties = (shipment: Partial<Shipment>): ValidationIssue[] => {
    const issues: ValidationIssue[] = [];

    // In the new schema, we expect 'shipper' object to be present/nested
    // but for partial updates or drafts, it might be missing or incomplete.

    if (!shipment.shipper || !shipment.shipper.name) {
        issues.push({
            code: 'MISSING_SHIPPER',
            severity: 'error',
            message: 'Shipper name is required',
            path: 'shipper.name'
        });
    }

    if (!shipment.consignee || !shipment.consignee.name) {
        issues.push({
            code: 'MISSING_CONSIGNEE',
            severity: 'error',
            message: 'Consignee name is required',
            path: 'consignee.name'
        });
    }

    return issues;
};

export const validateHtsCodes = (lineItems: LineItem[]): ValidationIssue[] => {
    const issues: ValidationIssue[] = [];

    lineItems.forEach((line, index) => {
        if (!line.htsCode) {
            issues.push({
                code: 'MISSING_HTS',
                severity: 'error',
                message: 'HTS Code is required',
                path: `lineItems[${index}].htsCode`
            });
        } else {
            const cleanHts = line.htsCode.replace(/[^0-9]/g, '');
            if (cleanHts.length < 6) {
                issues.push({
                    code: 'INVALID_HTS',
                    severity: 'warning',
                    message: `HTS Code "${line.htsCode}" appears too short (expected 6+ digits)`,
                    path: `lineItems[${index}].htsCode`
                });
            }
        }
    });

    return issues;
};
