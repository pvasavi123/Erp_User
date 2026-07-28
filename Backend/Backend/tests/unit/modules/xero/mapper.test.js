const XeroMapper = require('../../../../src/modules/xero/mapper');

describe('XeroMapper', () => {
    describe('toContactDTO', () => {
        it('should correctly map raw Xero contact data', () => {
            const rawContact = {
                ContactID: 'X123',
                Name: 'Jane Doe',
                EmailAddress: 'jane@example.com',
                Phones: [{ PhoneType: 'DEFAULT', PhoneNumber: '123-456-7890' }],
                IsCustomer: true,
                IsSupplier: false
            };

            const dto = XeroMapper.toContactDTO(rawContact);

            expect(dto).toEqual({
                id: 'X123',
                name: 'Jane Doe',
                email: 'jane@example.com',
                phone: '123-456-7890',
                isCustomer: true,
                isSupplier: false
            });
        });

        it('should handle missing fields gracefully', () => {
            const rawContact = { ContactID: 'X124' };
            const dto = XeroMapper.toContactDTO(rawContact);

            expect(dto).toEqual({
                id: 'X124',
                name: '',
                email: '',
                phone: '',
                isCustomer: false,
                isSupplier: false
            });
        });
    });

    describe('toAccountDTO', () => {
        it('should correctly map raw Xero account data', () => {
            const rawAccount = {
                AccountID: 'A2',
                Code: '200',
                Name: 'Sales',
                Type: 'REVENUE',
                Status: 'ACTIVE',
                Description: 'Product Sales'
            };

            const dto = XeroMapper.toAccountDTO(rawAccount);

            expect(dto).toEqual({
                id: 'A2',
                code: '200',
                name: 'Sales',
                type: 'REVENUE',
                status: 'Active',
                active: 'Active',
                description: 'Product Sales',
                classification: 'Revenue',
                fullyQualifiedName: 'Sales'
            });
        });
    });
});
