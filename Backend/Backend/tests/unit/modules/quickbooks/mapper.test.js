const QuickBooksMapper = require('../../../../src/modules/quickbooks/mapper');

describe('QuickBooksMapper', () => {
    describe('toCustomerDTO', () => {
        it('should correctly map raw customer data', () => {
            const rawCustomer = {
                Id: '123',
                DisplayName: 'Your Name',
                CompanyName: 'Doe Corp',
                PrimaryEmailAddr: { Address: 'Your Name@example.com' },
                Balance: 150.50
            };

            const dto = QuickBooksMapper.toCustomerDTO(rawCustomer);

            expect(dto).toEqual({
                id: '123',
                name: 'Your Name',
                companyName: 'Doe Corp',
                email: 'Your Name@example.com',
                balance: 150.50,
                active: 'Active'
            });
        });

        it('should handle missing fields gracefully', () => {
            const rawCustomer = { Id: '124' };
            const dto = QuickBooksMapper.toCustomerDTO(rawCustomer);

            expect(dto).toEqual({
                id: '124',
                name: '',
                companyName: '',
                email: '',
                balance: 0,
                active: 'Active'
            });
        });
    });

    describe('toVendorDTO', () => {
        it('should correctly map raw vendor data', () => {
            const rawVendor = {
                Id: 'V1',
                DisplayName: 'Acme Supply',
                CompanyName: 'Acme Corp',
                PrimaryEmailAddr: { Address: 'billing@acme.com' },
                Balance: 500
            };

            const dto = QuickBooksMapper.toVendorDTO(rawVendor);

            expect(dto).toEqual({
                id: 'V1',
                name: 'Acme Supply',
                companyName: 'Acme Corp',
                email: 'billing@acme.com',
                balance: 500,
                active: 'Active'
            });
        });
    });

    describe('toAccountDTO', () => {
        it('should correctly map raw account data', () => {
            const rawAccount = {
                Id: 'A1',
                AcctNum: '1000',
                Name: 'Checking',
                AccountType: 'Bank',
                AccountSubType: 'Checking',
                CurrentBalance: 10000
            };

            const dto = QuickBooksMapper.toAccountDTO(rawAccount);

            expect(dto).toEqual({
                id: 'A1',
                acctNum: '1000',
                name: 'Checking',
                accountType: 'Bank',
                accountSubType: 'Checking',
                classification: 'Asset',
                fullyQualifiedName: 'Checking',
                active: 'Active',
                currentBalance: 10000
            });
        });
    });
});
