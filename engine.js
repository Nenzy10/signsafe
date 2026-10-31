/* SignSafe engine — decodes wallet signing requests in plain English.
   Runs 100% in the browser. Nothing pasted here is uploaded or stored.
   analyzeSignRequest(raw) -> { score, band, label, doesWhat[], flags[], advice[], kind }
*/
(function (global) {
  'use strict';

  var MAX_UINT_HINTS = ['115792089237316195423570985008687907853269984665640564039457584007913129639935',
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'];
  var KNOWN_PROTOCOLS = {
    'uniswap': 'Uniswap', 'permit2': 'Uniswap Permit2', 'seaport': 'OpenSea Seaport',
    'opensea': 'OpenSea', 'aave': 'Aave', 'compound': 'Compound', 'maker': 'Maker/Sky',
    'lido': 'Lido', '1inch': '1inch', 'cow': 'CoW Swap', 'blur': 'Blur', 'pancakeswap': 'PancakeSwap'
  };
  var SELECTORS = {
    '095ea7b3': { fn: 'approve', name: 'Token approval (approve)' },
    'a22cb465': { fn: 'setApprovalForAll', name: 'Approve ALL items in a collection (setApprovalForAll)' },
    '39509351': { fn: 'increaseAllowance', name: 'Raise a token allowance (increaseAllowance)' },
    '23b872dd': { fn: 'transferFrom', name: 'Move tokens out of a wallet (transferFrom)' },
    'd505accf': { fn: 'permit2', name: 'Permit2 signature approval' },
    '30adf81f': { fn: 'permit2batch', name: 'Permit2 BATCH signature approval' }
  };

  function isHexAddress(s) { return /^0x[0-9a-fA-F]{40}$/.test(String(s || '').trim()); }
  function shortAddr(a) { a = String(a); return a.length > 14 ? a.slice(0, 8) + '…' + a.slice(-6) : a; }
  function isHugeNumber(v) {
    if (v == null) return false;
    var s = String(v).trim().toLowerCase();
    if (MAX_UINT_HINTS.indexOf(s) >= 0) return true;
    if (/^0xf{20,}$/.test(s)) return true;
    try { return BigInt(s) >= (BigInt(10) ** BigInt(30)); } catch (e) { return false; }
  }
  function fmtVal(v) {
    try {
      var b = BigInt(String(v));
      if (b >= (BigInt(10) ** BigInt(24))) return 'an effectively unlimited amount';
      return b.toLocaleString('en-US') + ' (in the token’s smallest unit)';
    } catch (e) { return String(v); }
  }
  function extractJSON(text) {
    try { return JSON.parse(text); } catch (e) { /* fall through */ }
    var m = text.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (e) { return null; } }
    return null;
  }
  function findField(obj, names) {
    if (!obj || typeof obj !== 'object') return undefined;
    for (var i = 0; i < names.length; i++) {
      if (obj[names[i]] !== undefined) return obj[names[i]];
    }
    return undefined;
  }

  function analyze(rawInput) {
    var text = String(rawInput || '').trim();
    var flags = [], doesWhat = [], advice = [];
    var score = 0, kind = 'unknown';
    function flag(points, title, why, sev) {
      flags.push({ points: points, title: title, why: why, sev: sev || (points >= 30 ? 'red' : 'amber') });
      score += points;
    }
    if (!text) return finish(0, 'empty', doesWhat, flags, advice);

    var lower = text.toLowerCase();
    var json = extractJSON(text);

    /* ---------- Typed data (EIP-712) ---------- */
    if (json && (json.domain || json.types) && (json.message || json.value)) {
      kind = 'typed-data';
      var domain = json.domain || {};
      var msg = json.message || json.value || {};
      var types = json.types || {};
      var primary = json.primaryType || Object.keys(types).filter(function (k) { return k !== 'EIP712Domain'; })[0] || '';
      var proto = null;
      var dname = String(domain.name || '');
      Object.keys(KNOWN_PROTOCOLS).forEach(function (k) { if (dname.toLowerCase().indexOf(k) >= 0) proto = KNOWN_PROTOCOLS[k]; });

      doesWhat.push('This is a typed signature request' + (dname ? ' from “' + dname + '”' : '') +
        (domain.chainId ? ' on chain ' + domain.chainId : '') +
        (primary ? ', of type ' + primary : '') + '.');
      if (proto) doesWhat.push('The domain name matches ' + proto + ' — a known protocol. That is a good sign only if you are actually on the real ' + proto + ' site or app right now.');

      var spender = findField(msg, ['spender', 'operator']);
      var owner = findField(msg, ['owner', 'from', 'account']);
      var token = findField(msg, ['token', 'currency', 'asset']);
      var value = findField(msg, ['value', 'amount', 'allowance']);
      var deadline = findField(msg, ['deadline', 'expiry', 'expiration']);

      if (/permit/i.test(primary) || (types.Permit || types.PermitSingle || types.PermitBatch)) {
        doesWhat.push('It is a PERMIT: instead of a normal transaction, your signature alone gives another address the right to move your tokens. No further confirmation is needed from you once you sign.');
        flag(25, 'Permit signature — moves tokens without a transaction', 'Permit signatures are the drainers’ favourite tool: the signature itself is the permission, and it can be used later, on its own, to take the tokens.', 'red');
      }
      if (spender && isHexAddress(spender)) {
        doesWhat.push('It hands control to spender ' + shortAddr(spender) + (owner ? ', taking from your wallet ' + shortAddr(owner) : '') + '.');
        flag(15, 'A specific spender gets control of your tokens', 'After you sign, ' + shortAddr(spender) + ' can move the approved tokens without asking you again. Only sign if you fully trust where this request came from.');
      }
      if (value !== undefined) {
        if (isHugeNumber(value)) {
          flag(35, 'UNLIMITED amount', 'The amount is effectively unlimited — the spender could take every token of this kind you hold now, and any you receive later, until the deadline. Legitimate apps rarely need unlimited permits; drainers always ask for them.', 'red');
          doesWhat.push('The amount is UNLIMITED — not a fixed sum.');
        } else {
          doesWhat.push('The amount is ' + fmtVal(value) + (token ? ' of token ' + shortAddr(token) : '') + '.');
        }
      }
      if (deadline !== undefined) {
        try {
          var dl = BigInt(String(deadline));
          var now = BigInt(Math.floor(Date.now() / 1000));
          if (dl > now + BigInt(30 * 24 * 3600)) {
            flag(15, 'Long-lived permission', 'This permission stays usable for more than 30 days. The longer a permit lives, the longer a leaked or tricked signature can be abused.');
            doesWhat.push('It stays valid for over 30 days from now.');
          } else if (dl <= now) {
            doesWhat.push('Its deadline has already passed, so it should no longer be usable.');
          } else {
            doesWhat.push('It expires within the next 30 days.');
          }
        } catch (e) { /* non-numeric deadline */ }
      }
      if (/order/i.test(primary) || types.OrderComponents) {
        doesWhat.push('This looks like a marketplace order (for example an NFT listing): signing it puts an item up for sale at the stated terms. Check the price carefully — signing a listing for the wrong price is a classic way people lose NFTs cheaply.');
        flag(15, 'Marketplace order — check the price', 'If the consideration/price in the order is far below what you expect, signing sells your item at that price.');
      }
      if (domain.verifyingContract && isHexAddress(domain.verifyingContract)) {
        doesWhat.push('It is tied to contract ' + shortAddr(domain.verifyingContract) + '. A signature made for one contract cannot be replayed on another — but it fully counts for this one.');
      }
      if (!proto) {
        flag(15, 'Unknown requesting protocol', 'The domain name does not match a well-known protocol. Unknown names on permit-style signatures deserve extra suspicion.');
      }
      return finish(score, kind, doesWhat, flags, advice);
    }

    /* ---------- Raw calldata ---------- */
    var hexMatch = text.match(/0x[0-9a-fA-F]{8,}/);
    if (hexMatch && !json) {
      var hex = hexMatch[0].toLowerCase();
      var sel = hex.slice(2, 10);
      if (SELECTORS[sel]) {
        kind = 'calldata';
        var info = SELECTORS[sel];
        doesWhat.push('This is transaction data for: ' + info.name + '.');
        var words = hex.slice(10);
        function word(i) { return words.slice(i * 64, i * 64 + 64); }
        function addrFromWord(w) { return '0x' + w.slice(24); }
        if (info.fn === 'approve' || info.fn === 'increaseAllowance') {
          var sp = addrFromWord(word(0) || '');
          var amtHex = word(1) || '';
          if (isHexAddress(sp)) doesWhat.push('It lets ' + shortAddr(sp) + ' spend tokens from your wallet.');
          if (amtHex) {
            if (isHugeNumber('0x' + amtHex)) {
              flag(40, 'UNLIMITED token approval', 'The approval amount is the maximum possible. That address can take all of this token you hold — now and in future — until you revoke it. This is the single most abused permission in crypto.', 'red');
              doesWhat.push('The approved amount is UNLIMITED.');
            } else {
              try { doesWhat.push('The approved amount is ' + fmtVal('0x' + amtHex) + '.'); score += 5; }
              catch (e) { /* ignore */ }
            }
          }
          if (info.fn === 'approve') flag(15, 'Standing approval', 'Approvals stay active after the transaction. If the spender is malicious or later gets hacked, your tokens can be taken without any new action from you.');
        }
        if (info.fn === 'setApprovalForAll') {
          flag(45, 'Approves EVERYTHING in a collection', 'setApprovalForAll gives the operator the right to move every single item you own in that collection — not just one. Drainers ask for exactly this.', 'red');
          doesWhat.push('One signature here hands over your whole collection, item by item, whenever the operator chooses.');
        }
        if (info.fn === 'transferFrom') {
          doesWhat.push('This moves tokens out of a wallet immediately. Only confirm it if you initiated this transfer yourself, to an address you have checked.');
          flag(20, 'Direct token movement', 'transferFrom executes at once — there is no cooling-off period.');
        }
        if (info.fn.indexOf('permit2') === 0) {
          flag(30, 'Permit2 signature approval', 'Permit2 permits let the spender move tokens using only your signature. Treat it like handing over a signed blank permission slip.', 'red');
        }
        return finish(score, kind, doesWhat, flags, advice);
      }
    }

    /* ---------- Plain text / message signing ---------- */
    var isLogin = /(sign in|log in|login|authenticate)/i.test(text) && /(nonce|timestamp|issued at|expiration)/i.test(text);
    var hasHexBlob = /0x[0-9a-fA-F]{100,}/.test(text);
    var verifyBait = /(verify|validate|confirm|secure|protect|restore|recover).{0,30}(wallet|account|funds|assets)/i.test(text) ||
      /(wallet|account).{0,30}(verify|validation|suspension|compromised)/i.test(text);
    var hackBait = /(compensation|reimbursement|claim your|migration|migrate your|after the (hack|breach|incident)|funds are safe)/i.test(text);
    var claimBait = /(claim|airdrop|free|bonus|reward)/i.test(text) && /(sign|connect|verify)/i.test(text);

    if (isLogin && !hasHexBlob) {
      kind = 'login-message';
      doesWhat.push('This reads as a sign-in message: it carries a nonce/timestamp, which is how sites prove it is you without a password. Signing it does not move tokens.');
      doesWhat.push('Still check: the site name in the message must match the site you are actually on, letter for letter.');
      return finish(5, kind, doesWhat, flags, advice);
    }
    if (hasHexBlob || /eth_sign/i.test(text)) {
      kind = 'blind-signature';
      flag(45, 'Blind signature — you cannot see what it does', 'Your wallet is asking you to sign raw data you cannot read. This is the oldest drainer trick there is: the hidden content is often a token permit or a transfer. A legitimate service almost never needs eth_sign / blind signing from a normal user.', 'red');
      doesWhat.push('The content you are being asked to sign is unreadable raw data. Nobody can tell you what it does from the wallet screen alone — that is precisely the problem.');
    }
    if (verifyBait) {
      flag(35, '“Verify your wallet” pressure', 'No exchange, wallet company or blockchain ever needs you to sign a message to “verify”, “validate” or “protect” a wallet. After the Binance hack, fake verification and compensation pages are the main way victims get drained a second time.', 'red');
      doesWhat.push('The wording tries to make signing feel like a safety step. Signing is never a safety step — it is a permission.');
    }
    if (hackBait) {
      flag(25, 'Hack/compensation bait', 'Messages riding on a hack — compensation, reimbursement, fund migration — are the standard second-wave scam. Real recovery happens inside the official app, never through a signature link in a message.');
    }
    if (claimBait && kind === 'unknown') {
      flag(25, 'Claim/airdrop signing bait', 'Being asked to sign or “verify” to receive a claim or airdrop is a classic drainer setup. Real airdrops do not need a permit signature from you.');
    }
    if (/setapprovalforall/i.test(lower) || /approve all/i.test(lower)) {
      flag(40, 'Approve-all request in plain words', 'The text asks for approval over everything in a collection or account. That is total access, not a one-off action.', 'red');
    }
    if (kind === 'unknown' && flags.length === 0) {
      doesWhat.push('Nothing in this text matches the known drainer patterns — no permit, no approval, no blind blob, no verification bait.');
      doesWhat.push('That is reassuring, not conclusive: read what the message actually says, and make sure the site asking is the site you meant to use.');
      return finish(8, 'plain-message', doesWhat, flags, advice);
    }
    return finish(score, kind, doesWhat, flags, advice);
  }

  function finish(score, kind, doesWhat, flags, advice) {
    score = Math.max(0, Math.min(100, score));
    var band, label;
    if (score >= 55) { band = 'danger'; label = 'DO NOT SIGN'; }
    else if (score >= 30) { band = 'high'; label = 'High risk — stop and check'; }
    else if (score >= 15) { band = 'caution'; label = 'Caution — read it twice'; }
    else { band = 'ok'; label = 'No drainer patterns found'; }
    if (band === 'danger' || band === 'high') {
      advice = [
        'Do not sign it from the page or chat that sent you here. Close that tab.',
        'Open the service yourself — official app or a bookmark you trust — and check whether it is really asking for this.',
        'If you already signed something like this: move remaining funds to a fresh wallet, then revoke old approvals (for example with revoke.cash) from the fresh setup.',
        'Never sign a “verification”, “compensation” or “migration” request. Real platforms do not work that way.'
      ];
    } else if (band === 'caution') {
      advice = [
        'Only continue if you started this action yourself, on the official site, in the last few minutes.',
        'Check the spender/operator address and the amount line above — those two lines are where the risk lives.',
        'When a dApp offers a limited approval instead of unlimited, take the limited one.'
      ];
    } else {
      advice = [
        'Keep the habit anyway: paste first, sign second. It costs ten seconds.',
        'Signing a plain login message is normal. Signing anything that mentions permits, approvals or verification is not.'
      ];
    }
    return { score: score, band: band, label: label, doesWhat: doesWhat, flags: flags, advice: advice, kind: kind };
  }

  global.SIGNSAFE_ANALYZE = analyze;
})(typeof window !== 'undefined' ? window : globalThis);
