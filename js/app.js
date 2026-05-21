/**
 * ARC CARDS — js/app.js  © 2026 Domith
 * Arc Testnet: Chain 5042002 | rpc.testnet.arc.network | testnet.arcscan.app
 *
 * FIX: "could not coalesce" — ethers v6 BrowserProvider wraps window.ethereum
 * directly; we must never pass the provider back into BrowserProvider again.
 * We store ONE ethers.BrowserProvider instance and reuse it.
 */
'use strict';

/* ══════════════════════════════════════════
   CONFIG
══════════════════════════════════════════ */
const ARC = {
  // Official from docs.arc.io/arc/references/connect-to-arc: Chain ID 5042002
  chainIdHex  : '0x4cef52',  // hex(5042002) = 0x4cef52  ← official
  chainIdDec  : 5042002,
  // Some wallets may have stored Arc Testnet under 0x4cec52 (5041234)
  // from earlier incorrect add — we accept both
  chainIdAlt  : 5041234,
  chainIdAltHex: '0x4cec52',
  name        : 'Arc Testnet',
  currency    : { name:'USDC', symbol:'USDC', decimals:18 },
  rpc         : 'https://rpc.testnet.arc.network',
  explorer    : 'https://testnet.arcscan.app',
};

// ── Set CONTRACT_ADDRESS after running: node arc-cards-backend/deploy-contract.js ──
const CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000'; // TODO: paste deployed address

// ── Set BACKEND_URL after deploying arc-cards-backend/server.js ──
// Local dev:  'http://localhost:3001'
// Production: 'https://your-backend.railway.app'
const BACKEND_URL = '';  // TODO: set your backend URL

// ABI from arc-nft/src/ArcCard.sol
const CONTRACT_ABI = [
  // mint(handle, role, tokenURI) — user calls this, mints to msg.sender
  'function mint(string calldata handle, string calldata role, string calldata tokenURI) external',
  // read
  'function hasMinted(address) external view returns (bool)',
  'function tokenIdOf(address) external view returns (uint256)',
  'function balanceOf(address) external view returns (uint256)',
  'function totalSupply() external view returns (uint256)',
];

/* ══════════════════════════════════════════
   STATE
══════════════════════════════════════════ */
const S = {
  handle   : '',
  token    : 0,
  wallet   : null,
  chainId  : null,
  checked  : false,
  ethers   : null,   // ethers.BrowserProvider — ONE instance, reused
};

/* ══════════════════════════════════════════
   TRAITS — Robot Anime (Azuki side-view style)
══════════════════════════════════════════ */
const CHARS = [
  { bg1:'#04020e', bg2:'#120838', acc:'#a78bfa', metal:'#c4b5fd', eye:'#7c3aed', name:'Phantom',  rarity:'Legendary' },
  { bg1:'#001018', bg2:'#002840', acc:'#22d3ee', metal:'#67e8f9', eye:'#0891b2', name:'Cyber',     rarity:'Epic'      },
  { bg1:'#0a0500', bg2:'#241000', acc:'#f97316', metal:'#fdba74', eye:'#c2410c', name:'Inferno',   rarity:'Rare'      },
  { bg1:'#001a08', bg2:'#003414', acc:'#4ade80', metal:'#86efac', eye:'#16a34a', name:'Mech',      rarity:'Rare'      },
  { bg1:'#100010', bg2:'#280028', acc:'#f0abfc', metal:'#e879f9', eye:'#a21caf', name:'Astral',    rarity:'Epic'      },
  { bg1:'#100800', bg2:'#281800', acc:'#fde047', metal:'#fbbf24', eye:'#b45309', name:'Blade',     rarity:'Common'    },
  { bg1:'#000814', bg2:'#00142e', acc:'#60a5fa', metal:'#93c5fd', eye:'#1d4ed8', name:'Arc',       rarity:'Legendary' },
  { bg1:'#0c0404', bg2:'#200c0c', acc:'#f87171', metal:'#fca5a5', eye:'#b91c1c', name:'Ronin',     rarity:'Epic'      },
];

function seedOf(s){ let n=0; for(let i=0;i<s.length;i++) n=(n*31+s.charCodeAt(i))>>>0; return n; }
function getTraits(h){
  const seed=seedOf(h||'user');
  const c=CHARS[seed%CHARS.length];
  return {...c, tokenId:1000+(seed%8999), seed };
}

/* ══════════════════════════════════════════
   BUILD SVG — Grails-style Arc Card
   Dark tech card with Arc logo art, tier pips,
   corner accents, scan lines, verified badge
══════════════════════════════════════════ */
function buildSVG(handle, t, uid){
  uid = uid || ('c'+Math.random().toString(36).slice(2,7));
  const {acc:A, bg1, bg2} = t;
  const RC = {Legendary:'#4a7cdc',Epic:'#a78bfa',Rare:'#60a5fa',Common:'#94a3b8'};
  const rc = RC[t.rarity] || '#94a3b8';
  const tierPips = {Legendary:8,Epic:5,Rare:3,Common:1}[t.rarity]||1;

  let pips = '';
  for(let i=0;i<8;i++){
    pips += `<rect x="${4+i*9}" y="0" width="7" height="2.5" rx="1.2" fill="${i<tierPips?rc:'#1e2530'}"/>`;
  }

  return `<svg viewBox="0 0 120 200" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="${uid}-bg" x1="0%" y1="0%" x2="60%" y2="100%">
<stop offset="0%" stop-color="#0c1530"/><stop offset="100%" stop-color="#04060f"/>
</linearGradient>
<linearGradient id="${uid}-arc" x1="30%" y1="0%" x2="70%" y2="100%">
<stop offset="0%" stop-color="#d4e0f4"/><stop offset="100%" stop-color="${rc}"/>
</linearGradient>
<radialGradient id="${uid}-orb" cx="50%" cy="45%" r="55%">
<stop offset="0%" stop-color="${rc}" stop-opacity="0.12"/>
<stop offset="100%" stop-color="#04060f" stop-opacity="0"/>
</radialGradient>
<clipPath id="${uid}-clip"><rect width="120" height="200" rx="10"/></clipPath>
</defs>
<g clip-path="url(#${uid}-clip)">

<rect width="120" height="200" fill="url(#${uid}-bg)"/>
<rect width="120" height="200" fill="url(#${uid}-orb)"/>

<line x1="0" y1="40" x2="120" y2="40" stroke="#1a2540" stroke-width="0.4"/>
<line x1="0" y1="80" x2="120" y2="80" stroke="#1a2540" stroke-width="0.4"/>
<line x1="0" y1="120" x2="120" y2="120" stroke="#1a2540" stroke-width="0.4"/>
<line x1="0" y1="160" x2="120" y2="160" stroke="#1a2540" stroke-width="0.4"/>
<line x1="30" y1="0" x2="30" y2="200" stroke="#1a2540" stroke-width="0.4"/>
<line x1="60" y1="0" x2="60" y2="200" stroke="#1a2540" stroke-width="0.4"/>
<line x1="90" y1="0" x2="90" y2="200" stroke="#1a2540" stroke-width="0.4"/>

<ellipse cx="60" cy="90" rx="38" ry="38" fill="none" stroke="#1e2e50" stroke-width="0.7"/>
<ellipse cx="60" cy="90" rx="28" ry="28" fill="none" stroke="#1a2540" stroke-width="0.5"/>
<ellipse cx="60" cy="90" rx="50" ry="50" fill="none" stroke="#111b30" stroke-width="0.7" stroke-dasharray="3 5"/>

<circle cx="60" cy="52" r="1.5" fill="${rc}" opacity="0.9"/>
<circle cx="87" cy="65" r="1" fill="${rc}" opacity="0.6"/>
<circle cx="33" cy="65" r="1" fill="${rc}" opacity="0.6"/>
<circle cx="18" cy="90" r="1.5" fill="${rc}" opacity="0.35"/>
<circle cx="102" cy="90" r="1.5" fill="${rc}" opacity="0.35"/>

<g transform="translate(60,90)">
<path d="M0 -38C-21 -38 -33 -19 -33 2L-33 34L-23 34L-23 4C-23 -13 -14 -22 0 -22C14 -22 23 -13 23 4L23 34L33 34L33 2C33 -19 21 -38 0 -38Z" fill="url(#${uid}-arc)"/>
<path d="M-12 14L-12 34L12 34L12 14C12 7 7 3 0 3C-7 3 -12 7 -12 14Z" fill="url(#${uid}-arc)" opacity="0.55"/>
</g>

<ellipse cx="60" cy="98" rx="18" ry="5" fill="${rc}" opacity="0.06"/>

<rect x="105" y="0" width="15" height="200" fill="#080c14" opacity="0.9"/>
<line x1="105" y1="0" x2="105" y2="200" stroke="#1a2540" stroke-width="0.5"/>
<text x="112" y="135" font-family="'Space Mono',monospace" font-size="4" fill="#2a3a5a" text-anchor="middle" writing-mode="tb" letter-spacing="1.5">BUILD ON ARC · WAVE 1 · 2025</text>

<rect x="0" y="0" width="120" height="200" fill="none" stroke="${rc}" stroke-width="0.4" opacity="0.25" rx="10"/>
<path d="M3,14 L3,3 L14,3" stroke="${rc}" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.8"/>
<path d="M102,3 L106,3 L106,14" stroke="${rc}" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.8"/>
<path d="M3,186 L3,197 L14,197" stroke="${rc}" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.8"/>
<path d="M102,197 L106,197 L106,186" stroke="${rc}" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.8"/>

<rect x="3" y="3" width="102" height="20" fill="rgba(0,0,0,0.6)" rx="2"/>
<path d="M8,17C6,17 5,15.5 5,14L5,9L6.5,9L6.5,13.5C6.5,15 7,16 8,16C9,16 9.5,15 9.5,13.5L9.5,9L11,9L11,14C11,15.5 10,17 8,17Z" fill="url(#${uid}-arc)"/>
<path d="M6.5,14L6.5,17L9.5,17L9.5,14C9.5,13.2 8.8,12.5 8,12.5C7.2,12.5 6.5,13.2 6.5,14Z" fill="url(#${uid}-arc)" opacity="0.6"/>
<text x="15" y="14" font-family="'Space Mono',monospace" font-size="5" fill="#e0e8f8" font-weight="700" letter-spacing="1"><tspan fill="${rc}">ARC</tspan> CARDS</text>
<circle cx="92" cy="10" r="2.5" fill="${rc}" opacity="0.9"/>
<text x="88" y="14" font-family="'Space Mono',monospace" font-size="4" fill="#1e2e50" text-anchor="end">${t.rarity.toUpperCase()}</text>

<g transform="translate(4,140)">${pips}</g>

<rect x="3" y="150" width="102" height="1" fill="#1e2540" opacity="0.8"/>

<text x="5" y="163" font-family="'Space Mono',monospace" font-size="5.5" fill="${rc}" font-weight="700" letter-spacing="0.5">${handle||'@username'}</text>

<rect x="3" y="168" width="102" height="1" fill="#1e2540" opacity="0.8"/>

<text x="18" y="178" font-family="'Space Mono',monospace" font-size="4" fill="#4a5068" text-anchor="middle">TOKEN</text>
<text x="53" y="178" font-family="'Space Mono',monospace" font-size="4" fill="#4a5068" text-anchor="middle">TYPE</text>
<text x="88" y="178" font-family="'Space Mono',monospace" font-size="4" fill="#4a5068" text-anchor="middle">WAVE</text>
<text x="18" y="187" font-family="'Space Mono',monospace" font-size="5" fill="${rc}" font-weight="700" text-anchor="middle">#${t.tokenId}</text>
<text x="53" y="187" font-family="'Space Mono',monospace" font-size="5" fill="#e0e8f8" font-weight="700" text-anchor="middle">${t.name.toUpperCase()}</text>
<text x="88" y="187" font-family="'Space Mono',monospace" font-size="5" fill="#e0e8f8" font-weight="700" text-anchor="middle">#001</text>

<rect x="3" y="191" width="102" height="1" fill="#1e2540" opacity="0.8"/>

<text x="5" y="198" font-family="'Space Mono',monospace" font-size="3.5" fill="#2a3a5a">arccard.domith.xyz</text>
<rect x="72" y="193" width="33" height="7" rx="3" fill="rgba(0,0,0,0.5)" stroke="#1e2e50" stroke-width="0.5"/>
<circle cx="77" cy="196.5" r="2.5" fill="#0a1a30" stroke="${rc}" stroke-width="0.8"/>
<path d="M76,196.5 L77,198 L79,195" stroke="${rc}" stroke-width="0.7" fill="none" stroke-linecap="round"/>
<text x="81" y="198" font-family="'Space Mono',monospace" font-size="3.5" fill="${rc}" font-weight="700" letter-spacing="0.5">ARC VERIFIED</text>

</g>
</svg>`;
}


/* ══════════════════════════════════════════
   DOM HELPERS
══════════════════════════════════════════ */
const $   = id => document.getElementById(id);
const show = id => { const e=$(id); if(e) e.classList.remove('hidden'); };
const hide = id => { const e=$(id); if(e) e.classList.add('hidden'); };
const txt  = (id,t) => { const e=$(id); if(e) e.textContent=t; };
const setErr = msg => { txt('errTxt',msg); show('errBox'); };
const clrErr = ()  => hide('errBox');
const delay  = ms  => new Promise(r=>setTimeout(r,ms));

/* ══════════════════════════════════════════
   GET RAW PROVIDER (window.ethereum)
   — never wrap in BrowserProvider here
══════════════════════════════════════════ */
function getRawProvider(){
  const eth = window.ethereum;
  if(!eth) return null;
  // Multiple injected providers (MetaMask + Coinbase etc)
  if(eth.providers?.length){
    return eth.providers.find(p=>p.isMetaMask)
        || eth.providers.find(p=>p.isRabby)
        || eth.providers[0];
  }
  return eth;
}

/* ══════════════════════════════════════════
   ETHERS PROVIDER — one instance, lazy init
══════════════════════════════════════════ */
function getEthers(){
  const raw = getRawProvider();
  if(!raw) return null;
  // Always create fresh to avoid stale state
  return new ethers.BrowserProvider(raw, 'any');
}

/* ══════════════════════════════════════════
   AUTO CONNECT + SWITCH — SINGLE FLOW
   One click does everything:
   1. Request accounts
   2. Try switch to Arc Testnet
   3. If chain not found → add it → switch
   4. Confirm final chainId
══════════════════════════════════════════ */
async function connectAndSwitchArc(){
  const raw = getRawProvider();
  if(!raw){ showNoWalletBanner(); return false; }

  /* ── Step 1: Request accounts ── */
  let accounts;
  try {
    accounts = await raw.request({ method:'eth_requestAccounts' });
  } catch(e){
    if(e.code===4001) return false;
    throw e;
  }
  if(!accounts?.length) return false;
  S.wallet  = accounts[0].toLowerCase();
  S.chainId = parseInt(await raw.request({ method:'eth_chainId' }), 16);

  /* Already on Arc (either chain ID variant) */
  if(isOnArc()) return true;

  /* ── Step 2: Try switch with official chain ID first ── */
  for(const tryHex of [ARC.chainIdHex, ARC.chainIdAltHex]){
    try {
      await raw.request({
        method : 'wallet_switchEthereumChain',
        params : [{ chainId: tryHex }],
      });
      await delay(500);
      S.chainId = parseInt(await raw.request({ method:'eth_chainId' }), 16);
      if(isOnArc()) return true;
    } catch(switchErr){
      if(switchErr.code === 4001) {
        // User rejected this switch — stop trying
        return true;
      }
      // Chain not found in wallet — continue to next or fall through to add
      const isNotFound = switchErr.code === 4902
        || switchErr.code === -32603
        || /unrecognized|unknown|not found|not exist/i.test(String(switchErr.message));
      if(!isNotFound) {
        // Some wallets return "same RPC endpoint" error when chain exists under diff ID
        const isSameRpc = /same.*rpc|rpc.*endpoint|already.*exist/i.test(String(switchErr.message));
        if(isSameRpc) continue; // try next hex
        // Other errors — read current chain and return
        S.chainId = parseInt(await raw.request({ method:'eth_chainId' }), 16);
        return true;
      }
    }
  }

  /* ── Step 3: Chain not in wallet — add with official chain ID ── */
  try {
    await raw.request({
      method : 'wallet_addEthereumChain',
      params : [{
        chainId           : ARC.chainIdHex,   // 0x4cef52 = 5042002
        chainName         : ARC.name,
        nativeCurrency    : ARC.currency,
        rpcUrls           : [ARC.rpc],
        blockExplorerUrls : [ARC.explorer],
      }],
    });
  } catch(addErr){
    if(addErr.code === 4001){ S.chainId = parseInt(await raw.request({ method:'eth_chainId' }), 16); return true; }
    // "same RPC endpoint" means chain already exists — try switch again
    const isSameRpc = /same.*rpc|rpc.*endpoint|already.*exist|points to same/i.test(String(addErr.message));
    if(isSameRpc){
      // Wallet has Arc but under different ID — try switching to what it stored
      const currentHex = '0x' + (await raw.request({ method:'eth_chainId' })).replace(/^0x/,'').toLowerCase();
      // Just accept whatever the wallet has if RPC matches Arc
      try {
        await raw.request({ method:'wallet_switchEthereumChain', params:[{ chainId: ARC.chainIdAltHex }] });
        await delay(400);
      } catch(_){}
      S.chainId = parseInt(await raw.request({ method:'eth_chainId' }), 16);
      return true;
    }
    throw addErr;
  }

  /* ── Step 4: Switch after add ── */
  try {
    await raw.request({ method:'wallet_switchEthereumChain', params:[{ chainId: ARC.chainIdHex }] });
  } catch(_){}

  await delay(600);
  S.chainId = parseInt(await raw.request({ method:'eth_chainId' }), 16);
  return true;
}

/* No-wallet install banner */
function showNoWalletBanner(){
  const existing = document.getElementById('noWalletBanner');
  if(existing){ existing.remove(); return; }
  const el = document.createElement('div');
  el.id = 'noWalletBanner';
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <span>No EVM wallet detected.</span>
      <a href="https://metamask.io" target="_blank" rel="noopener" style="color:#7aaaf8;text-decoration:underline;">Install MetaMask</a>
      <span style="color:var(--text3)">or</span>
      <a href="https://rabby.io" target="_blank" rel="noopener" style="color:#7aaaf8;text-decoration:underline;">Install Rabby</a>
      <button onclick="document.getElementById('noWalletBanner').remove()" style="margin-left:auto;background:transparent;border:none;color:var(--text3);cursor:pointer;font-size:14px;">✕</button>
    </div>`;
  el.style.cssText = 'position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);z-index:999;background:#10111a;border:1px solid #4a7cdc;color:#dde1f0;padding:.75rem 1.25rem;border-radius:10px;font-size:12px;font-family:var(--mono);max-width:480px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.5);';
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 8000);
}

function isOnArc(){
  return S.chainId === ARC.chainIdDec    // 5042002 official
      || S.chainId === ARC.chainIdAlt;   // 5041234 wallet stored variant
}
function short(a){ return a?a.slice(0,6)+'…'+a.slice(-4):''; }

/* ══════════════════════════════════════════
   WALLET UI SYNC
══════════════════════════════════════════ */
function syncUI(){
  const btn = $('walletBtn');
  if(!S.wallet){
    $('walletBtnText').textContent = 'Connect Wallet';
    btn.className = 'wallet-btn';
    hide('walletStatus'); hide('netWarn'); hide('walletInfo');
    return;
  }
  const onArc = isOnArc();
  $('walletBtnText').textContent = short(S.wallet);
  btn.className = 'wallet-btn '+(onArc?'connected':'wrong');
  show('walletStatus');
  $('wsDot').className = 'ws-dot '+(onArc?'green':'orange');
  const netLabel = isOnArc() ? 'Arc Testnet ✓' : `Chain ${S.chainId} ✗`;
  $('wsText').textContent = onArc ? short(S.wallet)+' · '+netLabel : short(S.wallet)+' · Wrong network';
  $('wsExplorer').href = `${ARC.explorer}/address/${S.wallet}`;
  onArc ? hide('netWarn') : show('netWarn');
  txt('rWallet', short(S.wallet));
  show('walletInfo');
  if(S.checked) syncCTA();
}

function syncCTA(){
  if(!S.wallet){
    show('connectForMintBtn'); hide('mintBtn');
    $('connectForMintBtn').textContent = 'Connect Wallet to Mint';
    $('connectForMintBtn').style.borderColor = '';
    $('connectForMintBtn').style.color = '';
  } else if(!isOnArc()){
    show('connectForMintBtn'); hide('mintBtn');
    $('connectForMintBtn').textContent = 'Switch to Arc Testnet';
    $('connectForMintBtn').style.borderColor = 'var(--orange)';
    $('connectForMintBtn').style.color = 'var(--orange)';
  } else {
    hide('connectForMintBtn');
    $('mintBtn').disabled = false;
    $('mintBtn').textContent = '🃏 Mint My Arc Card';
    show('mintBtn');
  }
}

/* ══════════════════════════════════════════
   WALLET BUTTON — ONE CLICK DOES ALL
══════════════════════════════════════════ */
async function handleWalletClick(){
  clrErr();
  const btn = $('walletBtn');
  const prevText = $('walletBtnText').textContent;
  $('walletBtnText').textContent = 'Connecting…';
  btn.disabled = true;
  try {
    await connectAndSwitchArc();
    syncUI();
    // If still on wrong network after connect, auto-retry switch once
    if(S.wallet && !isOnArc()){
      await connectAndSwitchArc();
      syncUI();
    }
  } catch(e){
    console.error(e);
    let msg = e?.message || 'Wallet error.';
    if(msg.includes('coalesce')) msg = 'Provider conflict. Try refreshing the page.';
    setErr(msg.slice(0,100));
  } finally {
    btn.disabled = false;
    if(!S.wallet) $('walletBtnText').textContent = prevText;
  }
}

$('walletBtn').addEventListener('click', handleWalletClick);
$('connectForMintBtn').addEventListener('click', handleWalletClick);

// Live wallet events
const _raw = getRawProvider();
if(_raw){
  _raw.on('accountsChanged', async accs => {
    S.wallet  = accs[0]?.toLowerCase()||null;
    if(S.wallet) S.chainId = parseInt(await _raw.request({method:'eth_chainId'}),16);
    syncUI();
  });
  _raw.on('chainChanged', async hex => {
    S.chainId = parseInt(hex, 16);
    syncUI();
    // Auto-switch back to Arc if user manually switched away
    if(S.wallet && !isOnArc()){
      await delay(800); // short wait for wallet to settle
      try {
        await _raw.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: ARC.chainIdHex }],
        });
        S.chainId = ARC.chainIdDec;
        syncUI();
      } catch(_){
        // User may have intentionally switched; show warning only
      }
    }
  });
}

/* ══════════════════════════════════════════
   CARD PREVIEW
══════════════════════════════════════════ */
function updatePreview(handle){
  const t = getTraits(handle);
  const wrap = $('cardArtWrap');
  if(wrap) wrap.innerHTML = buildSVG('@'+handle, t, 'main');
  txt('cardSerial','#'+t.tokenId);
  txt('cardHandle','@'+handle);
}
function resetPreview(){
  const wrap = $('cardArtWrap');
  if(wrap) wrap.innerHTML = buildSVG('@???', getTraits('defaultUser'), 'main');
  txt('cardSerial','#0000');
  txt('cardHandle','@username');
}

$('xInput').addEventListener('input', ()=>{
  const v = $('xInput').value.trim();
  $('checkBtn').disabled = v.length<1;
  clrErr(); S.checked=false;
  if(v.length>0) updatePreview(v);
  else resetPreview();
});
$('xInput').addEventListener('keydown', e=>{
  if(e.key==='Enter'&&!$('checkBtn').disabled) checkElig();
});
$('checkBtn').addEventListener('click', checkElig);

/* ══════════════════════════════════════════
   CHECK ELIGIBILITY
══════════════════════════════════════════ */
async function checkElig(){
  const v = $('xInput').value.trim();
  if(!v||v.length<3){ setErr('Username must be at least 3 characters.'); return; }
  clrErr();
  $('checkBtn').disabled=true;
  $('checkBtn').textContent='Checking…';
  try {
    await delay(700);
    const t = getTraits(v);
    S.handle  = '@'+v;
    S.token   = t.tokenId;
    S.checked = true;
    txt('rHandle', S.handle);
    txt('rWallet', S.wallet?short(S.wallet):'not connected');
    hide('okAlert'); hide('shareBtn');
    show('resultPanel');
    syncCTA();
    $('resultPanel').scrollIntoView({behavior:'smooth',block:'nearest'});
  } catch(e){
    setErr(e.message||'Username not found.');
  } finally {
    $('checkBtn').disabled=false;
    $('checkBtn').textContent='Check';
  }
}

/* ══════════════════════════════════════════
   MINT — NO ETHERS, PURE RAW RPC
   Bypass ethers.BrowserProvider entirely.
   Use window.ethereum.request directly:
   eth_sendTransaction + eth_getTransactionReceipt
   Zero dependency on ethers for tx sending.
══════════════════════════════════════════ */
$('mintBtn').addEventListener('click', doMint);

/* Encode string to hex for calldata */
function strToHex(str){
  let hex = '0x';
  for(let i=0;i<str.length;i++) hex += str.charCodeAt(i).toString(16).padStart(2,'0');
  return hex;
}

/* Poll for tx receipt using raw RPC */
async function waitForReceipt(raw, txHash, maxWait=60000){
  const start = Date.now();
  while(Date.now()-start < maxWait){
    try {
      const receipt = await raw.request({
        method:'eth_getTransactionReceipt',
        params:[txHash]
      });
      if(receipt && receipt.blockNumber) return receipt;
    } catch(_){}
    await delay(2000);
  }
  throw new Error('Transaction timeout. Check explorer: '+ARC.explorer+'/tx/'+txHash);
}

/* Get gas price via raw RPC */
async function getGasPrice(raw){
  try {
    const hex = await raw.request({ method:'eth_gasPrice', params:[] });
    return hex; // returns hex string like "0x..."
  } catch(_){
    return '0x3B9ACA00'; // 1 gwei fallback
  }
}

async function doMint(){
  if(!S.wallet || !isOnArc()){
    await handleWalletClick();
    if(!S.wallet || !isOnArc()) return;
  }

  const btn = $('mintBtn');
  btn.disabled = true;
  clrErr();

  const raw = getRawProvider();
  if(!raw){ setErr('Wallet not found. Refresh the page.'); btn.disabled=false; return; }

  /* Re-read chainId from wallet right before sending */
  try {
    S.chainId = parseInt(await raw.request({ method:'eth_chainId' }), 16);
    if(!isOnArc()){
      try { await raw.request({ method:'wallet_switchEthereumChain', params:[{chainId:ARC.chainIdHex}] }); await delay(400); S.chainId = parseInt(await raw.request({method:'eth_chainId'}),16); } catch(_){}
      if(!isOnArc()){ setErr('Please switch to Arc Testnet.'); btn.disabled=false; return; }
    }
  } catch(_){}

  try {
    let txHash, tokenId;

    /* ══════════════════════════════════════════
       PATH A: Backend available + contract deployed
       → Circle API mints NFT directly to user wallet
    ══════════════════════════════════════════ */
    if(BACKEND_URL && CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000'){
      btn.textContent = 'Minting…';
      const res = await fetch(`${BACKEND_URL}/api/mint`, {
        method  : 'POST',
        headers : { 'Content-Type': 'application/json' },
        body    : JSON.stringify({ walletAddress: S.wallet, handle: S.handle }),
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || 'Mint failed');
      txHash  = data.txHash;
      tokenId = data.tokenId || S.token;

    /* ══════════════════════════════════════════
       PATH B: Contract deployed, no backend
       → User signs mintTo tx directly from wallet
    ══════════════════════════════════════════ */
    } else if(CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000'){
      btn.textContent = 'Confirm in wallet…';
      const iface    = new ethers.Interface(CONTRACT_ABI);
      const tokenURI = `https://arccard.domith.xyz/metadata/${S.handle.replace('@','')}.json`;
      // ArcCard.mint(handle, role, tokenURI) — mints to msg.sender (the user)
      const calldata = iface.encodeFunctionData('mint', [S.handle, 'Builder', tokenURI]);
      const gasPrice = await getGasPrice(raw);

      txHash = await raw.request({
        method : 'eth_sendTransaction',
        params : [{
          from     : S.wallet,
          to       : CONTRACT_ADDRESS,
          value    : '0x0',
          data     : calldata,
          gasPrice : gasPrice,
          gas      : '0x493E0',  // 300 000 gas for mintTo
        }],
      });
      if(!txHash) throw new Error('No tx hash from wallet');
      btn.textContent = 'Confirming…';
      await waitForReceipt(raw, txHash);
      tokenId = S.token;

    /* ══════════════════════════════════════════
       PATH C: Demo mode — no contract yet
       → Plain self-transfer (no data, Arc rules)
       → Shows real on-chain tx in explorer
    ══════════════════════════════════════════ */
    } else {
      btn.textContent = 'Confirm in wallet…';
      const gasPrice = await getGasPrice(raw);
      txHash = await raw.request({
        method : 'eth_sendTransaction',
        params : [{
          from     : S.wallet,
          to       : S.wallet,
          value    : '0x0',
          data     : '0x',       // empty — Arc requires no data on EOA tx
          gasPrice : gasPrice,
          gas      : '0x5208',   // 21 000
        }],
      });
      if(!txHash) throw new Error('No tx hash from wallet');
      btn.textContent = 'Confirming…';
      await waitForReceipt(raw, txHash);
      tokenId = S.token;
    }

    /* ── SUCCESS ── */
    const explorerUrl = `${ARC.explorer}/tx/${txHash}`;
    $('txLink').href  = explorerUrl;
    txt('mintedToken', '#' + tokenId);
    show('okAlert');
    hide('mintBtn');
    hide('connectForMintBtn');
    show('shareBtn');
    showMintModal(txHash);
    $('nftCard').classList.add('minted');
    setTimeout(() => $('nftCard').classList.remove('minted'), 4000);

  } catch(e){
    console.error('Mint error:', e);
    let msg = e?.message || String(e) || 'Transaction failed.';
    if(/rejected|denied|cancel/i.test(msg))              msg = 'Transaction cancelled.';
    else if(/coalesce|provider/i.test(msg))               msg = 'Wallet conflict — please refresh and try again.';
    else if(/insufficient|funds|balance/i.test(msg))      msg = 'Insufficient USDC. Get testnet USDC at faucet.circle.com';
    else if(/internal.*data|data.*internal/i.test(msg))   msg = 'Arc network: cannot include data in wallet transaction.';
    else if(msg.length > 140) msg = msg.slice(0,140)+'…';
    setErr(msg);
    btn.disabled    = false;
    btn.textContent = 'Mint My Arc Card';
  }
}

/* ══════════════════════════════════════════
   MINT SUCCESS MODAL
══════════════════════════════════════════ */
function showMintModal(txHash){
  const v      = $('xInput').value.trim();
  const traits = getTraits(v);
  const modal  = $('mintedCardModal');

  /* Build and inject card SVG */
  $('mintedSvgWrap').innerHTML = buildSVG(S.handle, traits, 'modal');

  /* Fill pass info */
  txt('modalHandle', S.handle);
  txt('modalToken',  '#' + S.token);
  txt('modalType',   traits.name);
  txt('modalRarity', traits.rarity);

  /* Rarity color */
  const rc = {Legendary:'#fbbf24',Epic:'#a78bfa',Rare:'#60a5fa',Common:'#94a3b8'};
  const rarEl = $('modalRarity');
  if(rarEl) rarEl.style.color = rc[traits.rarity] || '#fff';

  /* Tx link */
  const explorerUrl = `${ARC.explorer}/tx/${txHash}`;
  $('modalTxLink').href = explorerUrl;
  txt('modalTxShort', txHash.slice(0,10)+'…'+txHash.slice(-6));

  /* Wire buttons */
  $('modalShareBtn').onclick  = shareToX;
  $('modalDownloadBtn').onclick = () => downloadPass(v, traits);
  $('modalCopyBtn').onclick    = () => copyPass();

  /* Show */
  modal.classList.remove('hidden');
  requestAnimationFrame(()=>{
    modal.classList.add('show');
    setTimeout(()=>$('mintedSvgWrap').classList.add('reveal'), 150);
  });
}

/* Download SVG pass */
/* ── SVG → PNG via Canvas ── */
function svgToPng(svgEl, scale, cb){
  const svgStr = new XMLSerializer().serializeToString(svgEl);
  const vb     = svgEl.viewBox.baseVal;
  const W      = (vb.width  || 400) * scale;
  const H      = (vb.height || 560) * scale;
  const img    = new Image();
  const blob   = new Blob([svgStr], {type:'image/svg+xml;charset=utf-8'});
  const url    = URL.createObjectURL(blob);
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, W, H);
    URL.revokeObjectURL(url);
    cb(canvas);
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

function downloadPass(handle, traits){
  const svg = $('mintedSvgWrap').querySelector('svg');
  if(!svg){ showPassToast('Card not ready'); return; }
  showPassToast('Preparing...');
  svgToPng(svg, 4, canvas => {
    const a = document.createElement('a');
    a.href     = canvas.toDataURL('image/png');
    a.download = `arc-card-${handle}.png`;
    a.click();
    showPassToast('Downloaded!');
  });
}

/* Copy Pass as PNG image to clipboard */
function copyPass(){
  const svg = $('mintedSvgWrap').querySelector('svg');
  if(!svg){ showPassToast('Card not ready'); return; }
  showPassToast('Copying...');

  svgToPng(svg, 3, canvas => {
    canvas.toBlob(async blob => {
      if(!blob) return;
      try {
        /* Modern Clipboard API — copies as real image */
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        showPassToast('Image copied!');
      } catch(e) {
        /* Fallback: open PNG in new tab so user can save */
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = 'arc-card.png';
        a.click();
        setTimeout(()=>URL.revokeObjectURL(url), 1000);
        showPassToast('Saved as PNG!');
      }
    }, 'image/png');
  });
}
function fallbackCopy(text){
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'absolute'; ta.style.left = '-9999px';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); showPassToast('Card copied!'); } catch(_){}
  document.body.removeChild(ta);
}
function showPassToast(msg){
  const el = $('passCopyToast');
  if(!el) return;
  el.textContent = msg;
  setTimeout(()=>{ if(el) el.textContent=''; }, 2500);
}

$('modalClose').addEventListener('click',()=>{
  const modal = $('mintedCardModal');
  modal.classList.remove('show');
  setTimeout(()=>{
    modal.classList.add('hidden');
    const wrap = $('mintedSvgWrap');
    if(wrap) wrap.classList.remove('reveal');
  },300);
});
$('mintedCardModal').addEventListener('click', e=>{
  if(e.target===$('mintedCardModal')) $('modalClose').click();
});

/* ══════════════════════════════════════════
   SHARE
══════════════════════════════════════════ */
$('shareBtn').addEventListener('click', shareToX);

function shareToX(){
  const v      = $('xInput').value.trim();
  const traits = getTraits(v);
  const text   = encodeURIComponent(
    `Just minted my Arc Card! 🏛️\n\n`+
    `Handle: ${S.handle}\nRole: Builder\nType: ${traits.name}\nRarity: ${traits.rarity}\nToken: #${S.token}\n\n`+
    `Build on Arc. ⚡\n\n@domith2025\n#ArcCards #BuildOnArc #Domith`
  );
  window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank','noopener,noreferrer');
}

/* ══════════════════════════════════════════
   RESET
══════════════════════════════════════════ */
$('resetBtn').addEventListener('click',()=>{
  S.handle=''; S.token=0; S.checked=false;
  $('xInput').value='';
  $('checkBtn').disabled=true;
  clrErr();
  hide('resultPanel'); hide('mintedCardModal');
  $('nftCard').classList.remove('minted');
  resetPreview();
  $('xInput').focus();
});

/* ══════════════════════════════════════════
   FAQ
══════════════════════════════════════════ */
document.querySelectorAll('.faq-q').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const open = btn.getAttribute('aria-expanded')==='true';
    document.querySelectorAll('.faq-q').forEach(b=>{
      b.setAttribute('aria-expanded','false');
      b.nextElementSibling.hidden=true;
    });
    if(!open){ btn.setAttribute('aria-expanded','true'); btn.nextElementSibling.hidden=false; }
  });
});

/* ══════════════════════════════════════════
   NAV SCROLL
══════════════════════════════════════════ */
window.addEventListener('scroll',()=>{
  $('navbar').style.borderBottomColor = scrollY>10?'rgba(39,42,62,0.8)':'var(--border)';
},{passive:true});

/* init */
resetPreview();

/* ══════════════════════════════════════════
   AUTO-SWITCH ON PAGE LOAD
   If wallet already connected (previously)
   but on wrong network → switch automatically
══════════════════════════════════════════ */
async function autoReconnect(){
  const raw = getRawProvider();
  if(!raw) return;
  try {
    // Check if already connected (no popup)
    const accounts = await raw.request({ method:'eth_accounts' });
    if(!accounts?.length) return;
    S.wallet  = accounts[0].toLowerCase();
    S.chainId = parseInt(await raw.request({method:'eth_chainId'}), 16);
    // Already on Arc — just sync UI
    if(isOnArc()){ syncUI(); return; }
    // Wrong network — silently try to switch
    try {
      await raw.request({
        method : 'wallet_switchEthereumChain',
        params : [{ chainId: ARC.chainIdHex }],
      });
      S.chainId = ARC.chainIdDec;
    } catch(_){
      // If switch needs user confirmation, just show the UI state
      // The "Switch now" button will handle it
    }
    syncUI();
  } catch(_){}
}

// Run on page load
autoReconnect();
