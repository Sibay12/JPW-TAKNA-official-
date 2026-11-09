#!/usr/bin/env node
// Seller-side tool. Run this on YOUR machine, never give it to customers.
//
// Usage:
//   node scripts/generate-license.js "Customer Name" "customerdomain.com" 365
//   node scripts/generate-license.js "Customer Name" "*" 0
//
// domain : the domain the customer will host this on, or "*" for no domain lock.
// days   : how many days the key stays valid, or 0 for lifetime.
//
// Make sure LICENSE_SECRET (in utils/license.js or your .env) is already set
// to your own private value before generating keys you intend to sell.

const { generateLicenseKey } = require('../utils/license');

const [, , customer, domain, days] = process.argv;

if (!customer) {
    console.log('Usage: node scripts/generate-license.js "Customer Name" "domain.com|*" [days=0 for lifetime]');
    process.exit(1);
}

const key = generateLicenseKey({
    customer,
    domain: domain || '*',
    days: days ? parseInt(days, 10) : 0,
});

console.log('\n=== JPW LICENSE KEY ===');
console.log('Customer :', customer);
console.log('Domain   :', domain && domain !== '*' ? domain : '* (not locked)');
console.log('Validity :', days && parseInt(days, 10) > 0 ? `${days} days` : 'Lifetime');
console.log('\nLICENSE_KEY=' + key);
console.log('\nGive the customer only the line above, to paste into their own .env (or hosting panel env vars) as LICENSE_KEY.\n');
