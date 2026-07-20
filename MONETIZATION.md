# Oakenfall — Monetization & Unlock Codes

Oakenfall is free and makes **zero network requests at runtime** (a hard
constraint). Monetization is designed around that: you sell cosmetic packs on
the website, and the buyer redeems a **signed code** in-game that the game
verifies **offline** against an embedded public key. No accounts, no runtime
network, no app-store cut.

## How the redeem loop works

1. Player buys a pack on your storefront (Stripe / Gumroad / itch / Ko-fi).
2. Your checkout success path calls the Netlify function
   `netlify/functions/sign-unlock.js`, which signs a short code with the
   **private** signing key (env var, server-only).
3. The player pastes the code into the game's ⚙ → 🎁 **Redeem** panel.
4. The game verifies the signature **offline** with the **public** key baked
   into `index.html` (`REDEEM_PUBKEY_SPKI`) and stores the unlock in the save.

Because the game only ever holds the *public* key, codes cannot be forged even
though the whole game is open-source.

## Keys

The signing keypair is **ECDSA P-256** (Web Crypto, supported everywhere).

- **Public key** (SPKI, base64) is embedded in `index.html` as
  `REDEEM_PUBKEY_SPKI`. Safe to be public.
- **Private key** (PKCS8, base64) must live ONLY in the Netlify environment as
  `OAKENFALL_SIGNING_KEY`. Never commit it.

Generate a fresh pair any time with Node 18+:

```js
// genkeys.mjs — run: node genkeys.mjs
const s = globalThis.crypto.subtle;
const kp = await s.generateKey({name:'ECDSA',namedCurve:'P-256'}, true, ['sign','verify']);
const pub  = Buffer.from(await s.exportKey('spki',  kp.publicKey )).toString('base64');
const priv = Buffer.from(await s.exportKey('pkcs8', kp.privateKey)).toString('base64');
console.log('REDEEM_PUBKEY_SPKI  (embed in index.html):\n' + pub);
console.log('\nOAKENFALL_SIGNING_KEY (Netlify env, secret):\n' + priv);
```

Then: paste the public value into `REDEEM_PUBKEY_SPKI` in `index.html`, and set
`OAKENFALL_SIGNING_KEY` in Netlify → Site settings → Environment variables.
Rotate BOTH together if the private key is ever exposed (old codes stop working).

## The signing function

`netlify/functions/sign-unlock.js` accepts `{ sku, name?, secret }`, verifies
the purchase, and returns `{ code }`. **The purchase gate is a placeholder**
(`SIGN_SHARED_SECRET`) — replace it with your storefront's real verification:

- **Stripe:** verify the webhook signature (`STRIPE_WEBHOOK_SECRET`) and call
  the signer only from `checkout.session.completed`.
- **Gumroad / itch:** verify the sale ping / license key first.

Set `SIGN_SHARED_SECRET` in Netlify env for the placeholder to work at all.

## SKUs (cosmetic only — never pay-to-win)

| sku         | in-game effect                                             |
|-------------|------------------------------------------------------------|
| `supporter` | Patron plaque + premium banner dyes (purple, antique gold) |
| `frost`     | Frostmark banner dyes                                      |
| `ember`     | Emberlands banner dyes                                     |

Add new SKUs in three places, kept in sync:
`UNLOCK_SKUS` (+ any effect wiring) in `index.html`, `VALID_SKUS` in
`sign-unlock.js`, and this table.

## Recommended storefront rollout

1. **Now:** a "pay-what-you-want / tip jar" link (itch or Ko-fi) — zero code.
2. Wire `sign-unlock.js` to that storefront's purchase verification.
3. Add a **Support** page on the site with the packs and a Redeem explainer.
4. Expand cosmetics (building skins, memorial styles, name packs) behind SKUs.

Keep everything **cosmetic**. Coin/resource/XP boosts would undercut the
survival tension that makes the game good and invite pay-to-win reviews.
