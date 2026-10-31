# SignSafe

**Before you sign, know what you're signing.**

**Live app: https://signsafe-app.netlify.app**

Your wallet shows you a signature request. It does not show you what it *means*. Paste the request — a permit, an approval, a typed-data message, raw calldata — into SignSafe and get it back in plain English: who gets control, of what, for how long, and whether it matches the patterns wallet drainers run on. Decoded entirely in your browser. SignSafe never asks you to connect a wallet.

---

## What it does

- **Plain-English decode first, score second:** the top of every result is a list of sentences — "this signature actually does X" — naming the spender, the token or collection, the amount and the deadline. The 0–100 risk score and verdict sit alongside, not instead.
- **Flags the drainer playbook:** unlimited token amounts (the max-uint giveaway), `setApprovalForAll`, far-future or missing deadlines, post-hack "verify your wallet to protect your funds" bait, urgent compensation lures, and sign-in messages that carry permissions a login never needs.
- **Four example requests built in:** an unlimited permit, a post-hack "verify wallet" bait message, an approve-all calldata request, and a normal sign-in — so you can see the spread from dangerous to ordinary before pasting anything of your own.
- **Actionable endings:** every result closes with what to do — sign, don't sign, verify through the official app first, or, if you already signed something bad, the recovery order of operations (move funds to a fresh wallet, revoke approvals from a clean setup, ignore "recovery" offers).
- **Copyable summary:** one click copies the decode, handy for asking a community or a developer "would you sign this?" with the evidence attached.

## How it works

SignSafe parses what you paste and translates structure into sentences:

1. **Permits (EIP-2612 / typed data)** — extracts owner, spender, value, nonce and deadline from the JSON. An unlimited value or a deadline years out is called out by name, in numbers a human can judge.
2. **Approvals and calldata** — recognises approval-style calls, including approve-all selectors, and identifies who ends up approved for what.
3. **Messages** — reads plain-text signing prompts for bait structure: authority impersonation ("security team"), incident framing ("after the hack"), urgency windows, and verification language attached to a signature that moves assets.
4. **Scoring** — each flag carries a risk weight; the total maps to a band (danger / high / caution / ok) with advice written for that band. A clean result is worded carefully: *no known drainer patterns in what you pasted* — never "safe."

**No connection, no keys, no upload.** The decoder is a static page: paste, decode, done. There is no connect button because connecting is precisely the risky step this tool exists to precede. Anything that asks for your seed phrase or private key "to check a signature" is the thing you should be checking.

## Pricing

| Tier | Price | What you get |
|---|---|---|
| Free | $0 | 3 checks every day · full plain-English decode · permits, approvals, messages, calldata · no wallet connection, no account |
| Pro | $9/month | Unlimited checks · priority pattern updates as drainer tactics change · for traders, collectors and anyone who signs daily |
| Teams & Communities | $29/month | Everything in Pro · access codes for up to 10 members · for trading groups, NFT communities and DAO teams whose members sign every day |

Pro and Teams are paid in **USDC on Base**. Send payment, then send your transaction hash to the Telegram assistant **@NenzyBrownAssistantBot** (`/order`) or by email, and your access code (format `SS-PRO-XXXX`) arrives within 24 hours. The code unlocks Pro on your device; no account, no wallet link.

## Tech

- Static, in-browser app: one `index.html` (UI, free-tier counter, Pro unlock) plus a dependency-free `engine.js` exposing the analyser — no backend, no database, no build step, hostable anywhere static (the live app runs on Netlify).
- Decoding is structural parsing (JSON typed data, hex calldata, message heuristics), not an LLM call — results are deterministic, offline-capable and auditable in the source.
- The free-tier counter lives in your browser's local storage. Nothing you paste is transmitted or stored.

```
index.html   the app
engine.js    the decoding / analysis engine
logo-480.png brand asset
```

## Honest limits

SignSafe is an educational decoding tool, not a security authority and not a guarantee. It explains the known structures drainers use. A request can be malicious in ways a paste can't show — a spoofed site behind an innocent-looking signature, for instance — so a low score means *no drainer patterns detected in what you pasted*, not that signing is certainly safe. If a signature involves real money and anything feels off, don't sign, and verify through the official app that you opened yourself.

If you already signed something bad: move remaining funds to a brand-new wallet first, revoke the old approvals from a clean setup (revoke.cash lists them by address), and never sign anything sent to you about "recovering" the loss — recovery scams are the second wave.

## Status

Live and early. SignSafe is **pre-revenue with $0 in sales so far**. It was built in Dubai by [NenzyBrown](https://nenzybrown.netlify.app), founder of [ProofReceipt](https://proofreceipt.netlify.app) and [ScamOrNot](https://scamornot-app.netlify.app), in the week of a major exchange hack — because after every big hack, the second wave targets users, and it arrives holding a signature request.

Sister tools: [ScamOrNot](https://scamornot-app.netlify.app) checks the message, link or address. SignSafe checks the signature. Different layers, same thirty seconds of doubt.

---

*MIT-style footer placeholder — replace with the final licence text before publishing this README to a public repo. Suggested interim line: "Released under the MIT License — © 2026 Nenzy Brown. The live service at signsafe-app.netlify.app is operated by the author; this licence covers the code in this repository only."*
