'use strict';

/**
 * XeroMapper
 * -----------------------------------------------------------------
 * Transforms raw Xero API payloads into clean, flat DTOs that
 * the rest of the application (Service, Controller, Frontend) can
 * consume without knowing anything about the external API shape.
 * -----------------------------------------------------------------
 */
class XeroMapper {

    /**
     * Map a single raw Xero Contact object -> clean ContactDTO
     * @param {object} raw - raw object from Xero Contacts array
     * @returns {{ id, name, email, phone, isCustomer, isSupplier }}
     */
    static toContactDTO(raw) {
        const email = raw.EmailAddress || '';
        const phone = raw.Phones?.find(p => p.PhoneType === 'DEFAULT')?.PhoneNumber || '';
        return {
            id:         raw.ContactID    || '',
            name:       raw.Name         || '',
            email:      email,
            phone:      phone,
            isCustomer: raw.IsCustomer   || false,
            isSupplier: raw.IsSupplier   || false
        };
    }

    /**
     * Map a single raw Xero Account object -> clean AccountDTO
     * @param {object} raw - raw object from Xero Accounts array
     * @returns {{ id, code, name, type, status, active, description, classification, fullyQualifiedName }}
     */
    static toAccountDTO(raw) {
        let classification = '';
        const type = (raw.Type || '').toUpperCase();
        if (['BANK', 'CURRENT', 'CURRLIAB', 'FIXED', 'INVENTORY', 'NONCURRENT', 'PREPAYMENT', 'TERMDIST'].some(t => type.includes(t)) || type.includes('ASSET')) {
            classification = 'Asset';
        } else if (['PAYABLE', 'LIABILITY', 'NONCURRENTLIAB'].some(t => type.includes(t)) || type.includes('LIAB')) {
            classification = 'Liability';
        } else if (['EQUITY'].some(t => type.includes(t))) {
            classification = 'Equity';
        } else if (['REVENUE', 'SALES', 'OTHERINCOME'].some(t => type.includes(t)) || type.includes('REV') || type.includes('INC')) {
            classification = 'Revenue';
        } else if (['EXPENSE', 'DIRECTCOSTS', 'OVERHEADS'].some(t => type.includes(t)) || type.includes('EXP') || type.includes('COST')) {
            classification = 'Expense';
        }

        return {
            id:                 raw.AccountID          || '',
            code:               raw.Code               || '',
            name:               raw.Name               || '',
            type:               raw.Type               || '',
            status:             raw.Status === 'ACTIVE' || raw.Status !== 'DELETED' ? 'Active' : 'Inactive',
            active:             raw.Status === 'ACTIVE' || raw.Status !== 'DELETED' ? 'Active' : 'Inactive',
            description:        raw.Description        || '',
            classification:     classification         || raw.Class || raw.Type || '',
            fullyQualifiedName: raw.Name                || ''
        };
    }

    /**
     * Map a single raw Xero Tracking Category option -> clean ClassDTO / LocationDTO
     * @param {object} raw
     * @returns {{ id, name, active }}
     */
    static toTrackingOptionDTO(raw) {
        return {
            id:     raw.TrackingOptionID || raw.OptionID || '',
            name:   raw.Name             || '',
            active: raw.Status === 'ACTIVE' || raw.Status !== 'DELETED' ? "Active" : "Inactive"
        };
    }

    /**
     * Map a single raw Xero Organisation object -> clean OrganisationDTO
     * @param {object} raw
     * @returns {{ id, name, legalName }}
     */
    static toOrganisationDTO(raw) {
        return {
            id:        raw.OrganisationID || '',
            name:      raw.Name           || raw.LegalName || '',
            legalName: raw.LegalName      || ''
        };
    }

    /**
     * Extract and map an array of contacts from a Xero API response
     * @param {object} apiResponse
     * @returns {ContactDTO[]}
     */
    static toContactList(apiResponse) {
        const raw = apiResponse?.Contacts || [];
        return raw.map(XeroMapper.toContactDTO);
    }

    /**
     * Extract and map an array of accounts from a Xero API response
     * @param {object} apiResponse
     * @returns {AccountDTO[]}
     */
    static toAccountList(apiResponse) {
        const raw = apiResponse?.Accounts || [];
        return raw.map(XeroMapper.toAccountDTO);
    }

    /**
     * Extract and map tracking categories into class or location lists
     * @param {object} apiResponse
     * @param {"class"|"location"} type
     * @returns {Array}
     */
    static toTrackingList(apiResponse, type = "class") {
        const categories = apiResponse?.TrackingCategories || [];
        return categories
            .filter(cat => {
                const catName = (cat.Name || '').toLowerCase();
                return type === 'location'
                    ? (catName.includes('location') || catName.includes('region') || catName.includes('department'))
                    : (!catName.includes('location') && !catName.includes('region'));
            })
            .flatMap(cat => (cat.Options || []).map(opt => XeroMapper.toTrackingOptionDTO(opt)));
    }

    /**
     * Extract and map organisation info from a Xero API response
     * @param {object} apiResponse
     * @returns {OrganisationDTO|null}
     */
    static toOrganisation(apiResponse) {
        const raw = apiResponse?.Organisations?.[0];
        return raw ? XeroMapper.toOrganisationDTO(raw) : null;
    }
}

module.exports = XeroMapper;
