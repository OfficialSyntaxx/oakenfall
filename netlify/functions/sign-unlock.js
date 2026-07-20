// Netlify Function: signs an Oakenfall unlock code for a completed purchase.
//
// The player redeems the returned code in-game; the game verifies it OFFLINE
// against an embedded PUBLIC key, so the game never makes a network request and
// codes cannot be forged. The PRIVATE signing key lives only here.
//
// SECURITY — this endpoint must NOT be callable by just anyone, or people mint
// their own unlocks for free. Gate it behind a real purchase signal:
//   • Stripe: verify the webhook signature (STRIPE_WEBHOOK_SECRET) and call
//     this only from the `checkout.session.completed` handler; or
//   • Gumroad/itch: verify the sale ping (seller secret / license key) first.
// The included check below is a minimal shared-secret gate (SIGN_SHARED_SECRET)
// as a placeholder — replace it with your storefront's verification.
//
// Env vars (Netlify → Site settings → Environment variables):
//   OAKENFALL_SIGNING_KEY  = base64 PKCS8 of the P-256 private key (keep secret)
//   SIGN_SHARED_SECRET     = a random string your checkout flow also holds
//
// The matching PUBLIC key (SPKI base64) is embedded in the game as
// REDEEM_PUBKEY_SPKI. Rotate both together if the private key is ever exposed.

const crypto = require('crypto');

const VALID_SKUS = new Set(['supporter', 'frost', 'ember']);

function b64u(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  // ── Purchase gate (replace with your storefront's real verification) ──
  const secret = process.env.SIGN_SHARED_SECRET;
  if (!secret || payload.secret !== secret) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not authorized' }) };
  }

  const sku = String(payload.sku || '');
  if (!VALID_SKUS.has(sku)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown SKU' }) };
  }
  const name = payload.name ? String(payload.name).slice(0, 24) : undefined;

  const pkcs8B64 = process.env.OAKENFALL_SIGNING_KEY;
  if (!pkcs8B64) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Signing key not configured' }) };
  }

  try {
    const subtle = crypto.webcrypto.subtle;
    const privKey = await subtle.importKey(
      'pkcs8', Buffer.from(pkcs8B64, 'base64'),
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
    );
    const claim = { s: sku, t: Date.now() };
    if (name) claim.n = name;
    const payloadBytes = Buffer.from(JSON.stringify(claim), 'utf8');
    const sig = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privKey, payloadBytes));
    const code = b64u(payloadBytes) + '.' + b64u(sig);
    return { statusCode: 200, headers, body: JSON.stringify({ code, sku }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Signing failed' }) };
  }
};
