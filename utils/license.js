// utils/license.js
// Self-contained license / activation-key system for reselling this script.
//
// HOW IT WORKS
// - Every key is signed with LICENSE_SECRET using HMAC-SHA256.
// - A key can optionally be locked to one domain and/or have an expiry.
// - No internet / central server is needed: verification happens locally,
//   on this server, using the same secret that generated the key.
//
// BEFORE YOU SELL THIS SCRIPT
// 1) Change LICENSE_SECRET below (or set LICENSE_SECRET in your own .env)
//    to something private that you never share. Anyone who has this
//    secret can mint their own working keys, so keep it out of the copies
//    you hand to customers (it only needs to live on YOUR machine when you
//    run scripts/generate-license.js).
// 2) Generate one key per customer with: node scripts/generate-license.js
// 3) Give the customer only the LICENSE_KEY value, for their .env.

const crypto = require('crypto');

const LICENSE_SECRET = process.env.LICENSE_SECRET || 'CHANGE-THIS-SECRET-BEFORE-SELLING-JPW-2026';

function sign(payloadB64) {
    return crypto.createHmac('sha256', LICENSE_SECRET).update(payloadB64).digest('hex');
}

function encodePayload(data) {
    return Buffer.from(JSON.stringify(data)).toString('base64url');
}

function decodePayload(b64) {
    return JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
}

// domain: '*' = not locked to a domain. days: 0 = lifetime (no expiry).
function generateLicenseKey({ customer, domain = '*', days = 0 }) {
    const payload = {
        c: String(customer || '').trim(),
        d: String(domain || '*').trim().toLowerCase().replace(/^www\./, ''),
        iat: Math.floor(Date.now() / 1000),
        exp: days && Number(days) > 0 ? Math.floor(Date.now() / 1000) + Math.floor(Number(days) * 86400) : 0,
    };
    const payloadB64 = encodePayload(payload);
    const sig = sign(payloadB64);
    return `JPW-${payloadB64}.${sig}`;
}

// currentHost: pass req.hostname to also enforce the domain lock. Pass null
// to check only the signature + expiry (used once at server startup).
function verifyLicenseKey(key, currentHost) {
    try {
        if (!key || typeof key !== 'string' || !key.startsWith('JPW-')) {
            return { valid: false, reason: 'License key is missing. Set LICENSE_KEY in your .env.' };
        }
        const body = key.slice(4);
        const dot = body.lastIndexOf('.');
        if (dot < 1) return { valid: false, reason: 'License key is malformed.' };
        const payloadB64 = body.slice(0, dot);
        const sig = body.slice(dot + 1);
        if (!/^[0-9a-f]{64}$/i.test(sig)) {
            return { valid: false, reason: 'License key signature is invalid.' };
        }

        const expectedSig = sign(payloadB64);
        const sigBuf = Buffer.from(sig, 'hex');
        const expBuf = Buffer.from(expectedSig, 'hex');
        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
            return { valid: false, reason: 'License key signature is invalid.' };
        }

        const payload = decodePayload(payloadB64);

        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            return { valid: false, reason: 'License key has expired.', payload };
        }

        if (currentHost && payload.d && payload.d !== '*') {
            const host = String(currentHost).toLowerCase().replace(/^www\./, '').split(':')[0];
            if (host !== payload.d) {
                return { valid: false, reason: `License key is locked to domain "${payload.d}".`, payload };
            }
        }

        return { valid: true, payload };
    } catch (e) {
        return { valid: false, reason: 'License key could not be parsed.' };
    }
}

module.exports = { generateLicenseKey, verifyLicenseKey };
