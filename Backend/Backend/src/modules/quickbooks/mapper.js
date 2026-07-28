'use strict';

/**
 * QuickBooksMapper
 * -----------------------------------------------------------------
 * Transforms raw QuickBooks API payloads into clean, flat DTOs that
 * the rest of the application (Service, Controller, Frontend) can
 * consume without knowing anything about the external API shape.
 * -----------------------------------------------------------------
 */
class QuickBooksMapper {

    /**
     * Map a single raw QB Customer object -> clean CustomerDTO
     * @param {object} raw
     * @returns {{ id, name, companyName, email, balance, active }}
     */
    static toCustomerDTO(raw) {
        return {
            id:          raw.Id          || '',
            name:        raw.DisplayName || raw.CompanyName || (raw.GivenName ? (raw.GivenName + ' ' + (raw.FamilyName || '')) : ''),
            companyName: raw.CompanyName || raw.DisplayName || '',
            email:       raw.PrimaryEmailAddr?.Address || '',
            balance:     raw.Balance     || 0,
            active:      raw.Active !== undefined ? (raw.Active ? "Active" : "Inactive") : "Active"
        };
    }

    /**
     * Map a single raw QB Vendor object -> clean VendorDTO
     * @param {object} raw
     * @returns {{ id, name, companyName, email, balance, active }}
     */
    static toVendorDTO(raw) {
        return {
            id:          raw.Id          || '',
            name:        raw.DisplayName || raw.CompanyName || (raw.GivenName ? (raw.GivenName + ' ' + (raw.FamilyName || '')) : ''),
            companyName: raw.CompanyName || raw.DisplayName || '',
            email:       raw.PrimaryEmailAddr?.Address || '',
            balance:     raw.Balance     || 0,
            active:      raw.Active !== undefined ? (raw.Active ? "Active" : "Inactive") : "Active"
        };
    }

    /**
     * Map a single raw QB Account object -> clean AccountDTO
     * @param {object} raw
     * @returns {{ id, acctNum, name, accountType, accountSubType, classification, fullyQualifiedName, active, currentBalance }}
     */
    static toAccountDTO(raw) {
        let classification = raw.Classification || '';
        if (!classification) {
            const type = (raw.AccountType || '').toUpperCase();
            if (['BANK', 'OTHER CURRENT ASSET', 'FIXED ASSET', 'OTHER ASSET', 'ACCOUNTS RECEIVABLE', 'ASSET'].some(t => type.includes(t))) {
                classification = 'Asset';
            } else if (['ACCOUNTS PAYABLE', 'CREDIT CARD', 'OTHER CURRENT LIABILITY', 'LONG TERM LIABILITY', 'LIABILITY'].some(t => type.includes(t))) {
                classification = 'Liability';
            } else if (['EQUITY'].some(t => type.includes(t))) {
                classification = 'Equity';
            } else if (['INCOME', 'OTHER INCOME', 'REVENUE'].some(t => type.includes(t))) {
                classification = 'Revenue';
            } else if (['EXPENSE', 'OTHER EXPENSE', 'COST OF GOODS SOLD'].some(t => type.includes(t))) {
                classification = 'Expense';
            } else {
                classification = raw.AccountType || '';
            }
        }

        return {
            id:                 raw.Id                 || '',
            acctNum:            raw.AcctNum            || '',
            name:               raw.Name               || '',
            accountType:        raw.AccountType        || '',
            accountSubType:     raw.AccountSubType     || '',
            classification:     classification,
            fullyQualifiedName: raw.FullyQualifiedName || raw.Name        || '',
            active:             raw.Active !== undefined ? (raw.Active ? "Active" : "Inactive") : "Active",
            currentBalance:     raw.CurrentBalance     || 0
        };
    }

    /**
     * Map a single raw QB Class object -> clean ClassDTO
     * @param {object} raw
     * @returns {{ id, name, active }}
     */
    static toClassDTO(raw) {
        return {
            id:     raw.Id     || '',
            name:   raw.FullyQualifiedName || raw.Name || '',
            active: raw.Active !== undefined ? (raw.Active ? "Active" : "Inactive") : "Active"
        };
    }

    /**
     * Map a single raw QB Department (Location) object -> clean LocationDTO
     * @param {object} raw
     * @returns {{ id, name, active }}
     */
    static toLocationDTO(raw) {
        return {
            id:     raw.Id     || '',
            name:   raw.FullyQualifiedName || raw.Name || '',
            active: raw.Active !== undefined ? (raw.Active ? "Active" : "Inactive") : "Active"
        };
    }

    /**
     * Map a single raw QB CompanyInfo object -> clean CompanyDTO
     * @param {object} raw
     * @returns {{ id, name, legalName }}
     */
    static toCompanyDTO(raw) {
        return {
            id:        raw.Id          || '',
            name:      raw.CompanyName || raw.LegalName || '',
            legalName: raw.LegalName   || raw.CompanyName || ''
        };
    }

    /**
     * Extract and map an array of customers from a QB QueryResponse
     * @param {object} apiResponse
     * @returns {CustomerDTO[]}
     */
    static toCustomerList(apiResponse) {
        const raw = apiResponse?.QueryResponse?.Customer || [];
        return raw.map(QuickBooksMapper.toCustomerDTO);
    }

    /**
     * Extract and map an array of vendors from a QB QueryResponse
     * @param {object} apiResponse
     * @returns {VendorDTO[]}
     */
    static toVendorList(apiResponse) {
        const raw = apiResponse?.QueryResponse?.Vendor || [];
        return raw.map(QuickBooksMapper.toVendorDTO);
    }

    /**
     * Extract and map an array of accounts from a QB QueryResponse
     * @param {object} apiResponse
     * @returns {AccountDTO[]}
     */
    static toAccountList(apiResponse) {
        const raw = apiResponse?.QueryResponse?.Account || [];
        return raw.map(QuickBooksMapper.toAccountDTO);
    }

    /**
     * Extract and map an array of classes from a QB QueryResponse
     * @param {object} apiResponse
     * @returns {ClassDTO[]}
     */
    static toClassList(apiResponse) {
        const raw = apiResponse?.QueryResponse?.Class || apiResponse?.Class || [];
        const arr = Array.isArray(raw) ? raw : [raw];
        return arr.map(QuickBooksMapper.toClassDTO);
    }

    /**
     * Extract and map an array of locations (departments) from a QB QueryResponse
     * @param {object} apiResponse
     * @returns {LocationDTO[]}
     */
    static toLocationList(apiResponse) {
        const raw = apiResponse?.QueryResponse?.Department || apiResponse?.QueryResponse?.Location || apiResponse?.Department || apiResponse?.Location || [];
        const arr = Array.isArray(raw) ? raw : [raw];
        return arr.map(QuickBooksMapper.toLocationDTO);
    }

    /**
     * Extract and map company info from a QB QueryResponse
     * @param {object} apiResponse
     * @returns {CompanyDTO|null}
     */
    static toCompanyInfo(apiResponse) {
        const raw = apiResponse?.QueryResponse?.CompanyInfo?.[0];
        return raw ? QuickBooksMapper.toCompanyDTO(raw) : null;
    }
}

module.exports = QuickBooksMapper;
