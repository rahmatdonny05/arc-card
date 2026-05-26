/**
 * ARC CARDS — app.js  © 2026 Domith
 * Arc Testnet: Chain 5042002 | rpc.testnet.arc.network
 *
 * ARSITEKTUR: Satu objek APP sebagai single source of truth.
 * Mint page dan My Card page berbagi data yang sama.
 * syncHandle() = satu fungsi yang update semua komponen sekaligus.
 */
'use strict';

/* ══════════════════════════════════════════
   NETWORK CONFIG
══════════════════════════════════════════ */
const ARC = {
  chainIdHex   : '0x4cef52',
  chainIdDec   : 5042002,
  chainIdAlt   : 5041234,
  chainIdAltHex: '0x4cec52',
  name         : 'Arc Testnet',
  currency     : { name:'USDC', symbol:'USDC', decimals:18 },
  rpc          : 'https://rpc.testnet.arc.network',
  explorer     : 'https://testnet.arcscan.app',
};

const CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000';
const BACKEND_URL      = '';
const CONTRACT_ABI     = [
  'function mint(string calldata handle, string calldata role, string calldata tokenURI) external',
  'function hasMinted(address) external view returns (bool)',
  'function tokenIdOf(address) external view returns (uint256)',
  'function balanceOf(address) external view returns (uint256)',
  'function totalSupply() external view returns (uint256)',
];

/* ══════════════════════════════════════════
   TIER SYSTEM
══════════════════════════════════════════ */
const TIERS = [
  { name:'Common',    min:0,   max:15,  accent:'#94a3b8', frame:'#2a3040', bg:'#08090d', ring:'rgba(148,163,184,.3)',  icon:'◆', price:0  },
  { name:'Rare',      min:15,  max:40,  accent:'#4a7cdc', frame:'#1e2e50', bg:'#04060f', ring:'rgba(74,124,220,.5)',   icon:'◈', price:3  },
  { name:'Epic',      min:40,  max:80,  accent:'#7F77DD', frame:'#2a1a4a', bg:'#060310', ring:'rgba(127,119,221,.5)',  icon:'⬡', price:8  },
  { name:'Legendary', min:80,  max:999, accent:'#EF9F27', frame:'#3a2800', bg:'#100800', ring:'rgba(239,159,39,.5)',   icon:'★', price:20 },
];

/* ══════════════════════════════════════════
   TRAITS — card character from username hash
══════════════════════════════════════════ */
const CHARS = [
  { acc:'#a78bfa', name:'Phantom',  rarity:'Legendary' },
  { acc:'#22d3ee', name:'Cyber',    rarity:'Epic'      },
  { acc:'#f97316', name:'Inferno',  rarity:'Rare'      },
  { acc:'#4ade80', name:'Mech',     rarity:'Rare'      },
  { acc:'#f0abfc', name:'Astral',   rarity:'Epic'      },
  { acc:'#fde047', name:'Blade',    rarity:'Common'    },
  { acc:'#60a5fa', name:'Arc',      rarity:'Legendary' },
  { acc:'#f87171', name:'Ronin',    rarity:'Epic'      },
];
function seedOf(s){ let n=0; for(let i=0;i<s.length;i++) n=(n*31+s.charCodeAt(i))>>>0; return n; }
function getTraits(h){
  const seed = seedOf(h||'user');
  const c    = CHARS[seed % CHARS.length];
  return { ...c, tokenId: 1000+(seed%8999), seed };
}

/* ══════════════════════════════════════════
   SINGLE SOURCE OF TRUTH — satu objek APP
   Menggabungkan S (session) dan DS (dynamic)
   menjadi satu. Semua komponen baca dari sini.
══════════════════════════════════════════ */
const APP = {
  // Identitas
  handle    : '',        // username yang diketik, tanpa @
  wallet    : null,      // wallet address setelah connect
  chainId   : null,
  token     : 0,
  checked   : false,

  // Onchain activity (dibaca dari Arc RPC + localStorage)
  txCount   : 0,
  gasUsdc   : 0,
  weekHeld  : 0,
  usdcHeld  : 0,
  nftsMinted: 0,

  // Evolve state
  mintedAt  : null,
  mintedTier: 0,
  minted    : false,
};

/* Persist ke localStorage — hanya data yang perlu disimpan */
function loadAPP(){
  try {
    const raw = localStorage.getItem('arcCards_v3');
    if(!raw) return;
    const saved = JSON.parse(raw);
    // Merge hanya field yang boleh di-persist
    const fields = ['handle','txCount','gasUsdc','weekHeld','usdcHeld','nftsMinted','mintedAt','mintedTier','minted','token'];
    fields.forEach(k => { if(saved[k] !== undefined) APP[k] = saved[k]; });
  } catch(_){}
}
function saveAPP(){
  try {
    const toSave = {
      handle:APP.handle, txCount:APP.txCount, gasUsdc:APP.gasUsdc,
      weekHeld:APP.weekHeld, usdcHeld:APP.usdcHeld, nftsMinted:APP.nftsMinted,
      mintedAt:APP.mintedAt, mintedTier:APP.mintedTier, minted:APP.minted, token:APP.token,
    };
    localStorage.setItem('arcCards_v3', JSON.stringify(toSave));
  } catch(_){}
}
loadAPP();

/* Score & tier — langsung dari APP */
function calcScore(){
  return APP.txCount * 1
    + Math.floor(APP.gasUsdc) * 0.4
    + APP.weekHeld * 0.5
    + Math.floor(APP.usdcHeld / 10) * 0.3
    + APP.nftsMinted * 2;
}
function getCurrentTier(){
  const sc = calcScore();
  for(let i=TIERS.length-1; i>=0; i--)
    if(sc >= TIERS[i].min) return TIERS[i];
  return TIERS[0];
}
function getTierIdx(){ return TIERS.indexOf(getCurrentTier()); }

/* ══════════════════════════════════════════
   DOM HELPERS
══════════════════════════════════════════ */
const $      = id => document.getElementById(id);
const show   = id => { const e=$(id); if(e) e.classList.remove('hidden'); };
const hide   = id => { const e=$(id); if(e) e.classList.add('hidden'); };
const txt    = (id,t) => { const e=$(id); if(e) e.textContent=t; };
const setErr = msg => { txt('errTxt',msg); show('errBox'); };
const clrErr = ()  => hide('errBox');
const delay  = ms  => new Promise(r=>setTimeout(r,ms));
const short  = a   => a ? a.slice(0,6)+'…'+a.slice(-4) : '';

/* ══════════════════════════════════════════
   CANVAS — card drawing
══════════════════════════════════════════ */
function clipRound(ctx, W, H, R){
  ctx.beginPath();
  ctx.moveTo(R,0); ctx.lineTo(W-R,0); ctx.quadraticCurveTo(W,0,W,R);
  ctx.lineTo(W,H-R); ctx.quadraticCurveTo(W,H,W-R,H);
  ctx.lineTo(R,H); ctx.quadraticCurveTo(0,H,0,H-R);
  ctx.lineTo(0,R); ctx.quadraticCurveTo(0,0,R,0);
  ctx.closePath();
}

function drawArcLogo(ctx, cx, cy, size, color){
  const s = size/100;
  ctx.save(); ctx.translate(cx-50*s, cy-50*s); ctx.scale(s,s);
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(50,8); ctx.bezierCurveTo(28,8,13,29,13,54);
  ctx.lineTo(13,92); ctx.lineTo(27,92); ctx.lineTo(27,58);
  ctx.bezierCurveTo(27,37,37,23,50,23); ctx.bezierCurveTo(63,23,73,37,73,58);
  ctx.lineTo(73,92); ctx.lineTo(87,92); ctx.lineTo(87,54);
  ctx.bezierCurveTo(87,29,72,8,50,8); ctx.closePath();
  ctx.moveTo(33,70); ctx.lineTo(33,92); ctx.lineTo(67,92); ctx.lineTo(67,70);
  ctx.bezierCurveTo(67,61,59,55,50,55); ctx.bezierCurveTo(41,55,33,61,33,70);
  ctx.closePath(); ctx.fill(); ctx.restore();
}

/**
 * drawCard — fungsi tunggal untuk semua canvas di seluruh app.
 * Dipakai: hero floating card (via SVG), dynCanvas, cfBefore, cfAfter, successCanvas.
 */
function drawCard(canvas, handle, tier, W, H, sc){
  const ctx = canvas.getContext('2d');
  const R   = Math.round(W * 0.065);
  const ti  = TIERS.indexOf(tier);
  const score = sc !== undefined ? sc : calcScore();

  ctx.clearRect(0,0,W,H);
  ctx.save(); clipRound(ctx,W,H,R); ctx.clip();

  // BG
  ctx.fillStyle = tier.bg; ctx.fillRect(0,0,W,H);
  const g = ctx.createRadialGradient(W/2, H*.42, 0, W/2, H*.42, W*.8);
  g.addColorStop(0, tier.accent+'28'); g.addColorStop(1,'transparent');
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);

  // Grid
  ctx.strokeStyle = tier.accent+'12'; ctx.lineWidth = .4;
  for(let x=0; x<W; x+=W/5){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for(let y=0; y<H; y+=H/5.5){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

  // Orbit rings
  ctx.globalAlpha = .18;
  for(let ri=0; ri<ti+2; ri++){
    ctx.strokeStyle = tier.accent;
    ctx.lineWidth   = ti>=2 ? .9 : .6;
    ctx.setLineDash(ri>1 ? [3,5] : []);
    ctx.beginPath(); ctx.arc(W/2, H*.42, W*(.14+ri*.085), 0, Math.PI*2); ctx.stroke();
  }
  ctx.setLineDash([]); ctx.globalAlpha = 1;

  // Orbit dots
  const dn = [2,4,6,8][ti];
  for(let i=0; i<dn; i++){
    const rad = (i/dn)*Math.PI*2, rv = W*.28;
    ctx.globalAlpha = .4+(i%2)*.35; ctx.fillStyle = tier.accent;
    ctx.beginPath(); ctx.arc(W/2+Math.cos(rad)*rv, H*.42+Math.sin(rad)*rv, ti>=3?2.2:1.4, 0, Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Logo
  drawArcLogo(ctx, W/2, H*.42, W*.58, tier.accent);

  // Legendary glow
  if(ti===3){
    ctx.globalAlpha=.08; ctx.fillStyle=tier.accent;
    ctx.beginPath(); ctx.ellipse(W/2, H*.57, W*.22, H*.04, 0, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha=1;
  }

  // Tier pips
  const pips = [1,3,5,8][ti];
  for(let i=0; i<8; i++){
    ctx.fillStyle = i<pips ? tier.accent : tier.frame;
    ctx.beginPath(); ctx.roundRect(W*.05+i*(W*.1125), H*.732, W*.09, W*.016, 1.2); ctx.fill();
  }

  // Corner accents
  ctx.strokeStyle = tier.accent+'75'; ctx.lineWidth = 1.2;
  const ca = W*.04;
  [[ca,ca*2.5,ca,ca],[W-ca*2.5,ca,W-ca,ca],[ca,H-ca*2.5,ca,H-ca],[W-ca*2.5,H-ca,W-ca,H-ca]]
    .forEach(([x1,y1,x2,y2])=>{ ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); });

  // Info bar
  ctx.fillStyle = 'rgba(0,0,0,.85)'; ctx.fillRect(0, H*.78, W, H*.22);
  ctx.strokeStyle = tier.accent+'44'; ctx.lineWidth = .5;
  ctx.beginPath(); ctx.moveTo(0,H*.78); ctx.lineTo(W,H*.78); ctx.stroke();

  const fb = W/14, fs = W/18;
  ctx.font = `bold ${fb}px "Space Mono",monospace`;
  ctx.fillStyle = tier.accent; ctx.textAlign = 'start';
  ctx.fillText('ARC', 5, H*.78+fb*1.3);
  ctx.fillStyle = '#e0e8f8'; ctx.fillText(' CARDS', 5+fb*2.65, H*.78+fb*1.3);

  ctx.font = `${fs}px "Space Mono",monospace`;
  ctx.fillStyle = '#e0e8f8cc';
  ctx.fillText(('@'+(handle||'username')).slice(0,13), 5, H*.78+fb*2.5);

  ctx.font = `bold ${fs*.88}px "Space Mono",monospace`;
  ctx.fillStyle = tier.accent; ctx.textAlign = 'end';
  ctx.fillText(tier.name.toUpperCase(), W-4, H*.78+fb*1.3);
  ctx.fillStyle = '#e0e8f870';
  ctx.fillText('SCORE '+Math.round(score), W-4, H*.78+fb*2.5);

  // Border
  ctx.strokeStyle = tier.frame; ctx.lineWidth = 1.2;
  clipRound(ctx,W,H,R); ctx.stroke();
  ctx.restore();
}

/* SVG untuk hero floating card */
function buildSVG(handle, t, uid){
  uid = uid||('c'+Math.random().toString(36).slice(2,7));
  const ac = t.acc||'#4a7cdc';
  let pips = '';
  for(let i=0;i<8;i++) pips+=`<rect x="${4+i*9}" y="0" width="7" height="2.5" rx="1.2" fill="${i<1?ac:'#1e2530'}"/>`;
  return `<svg viewBox="0 0 120 200" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="${uid}-bg" x1="0%" y1="0%" x2="60%" y2="100%">
<stop offset="0%" stop-color="#0c1530"/><stop offset="100%" stop-color="#04060f"/>
</linearGradient>
<linearGradient id="${uid}-arc" x1="30%" y1="0%" x2="70%" y2="100%">
<stop offset="0%" stop-color="#d4e0f4"/><stop offset="100%" stop-color="${ac}"/>
</linearGradient>
<radialGradient id="${uid}-orb" cx="50%" cy="45%" r="55%">
<stop offset="0%" stop-color="${ac}" stop-opacity="0.14"/>
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
<circle cx="60" cy="52" r="1.5" fill="${ac}" opacity="0.9"/>
<circle cx="87" cy="65" r="1" fill="${ac}" opacity="0.6"/>
<circle cx="33" cy="65" r="1" fill="${ac}" opacity="0.6"/>
<g transform="translate(60,90)">
<path d="M0 -38C-21 -38 -33 -19 -33 2L-33 34L-23 34L-23 4C-23 -13 -14 -22 0 -22C14 -22 23 -13 23 4L23 34L33 34L33 2C33 -19 21 -38 0 -38Z" fill="url(#${uid}-arc)"/>
<path d="M-12 14L-12 34L12 34L12 14C12 7 7 3 0 3C-7 3 -12 7 -12 14Z" fill="url(#${uid}-arc)" opacity="0.55"/>
</g>
<rect x="105" y="0" width="15" height="200" fill="#080c14" opacity="0.9"/>
<line x1="105" y1="0" x2="105" y2="200" stroke="#1a2540" stroke-width="0.5"/>
<text x="112" y="135" font-family="'Space Mono',monospace" font-size="4" fill="#2a3a5a" text-anchor="middle" writing-mode="tb" letter-spacing="1.5">BUILD ON ARC · WAVE 1 · 2025</text>
<rect x="0" y="0" width="120" height="200" fill="none" stroke="${ac}" stroke-width="0.4" opacity="0.25" rx="10"/>
<path d="M3,14 L3,3 L14,3" stroke="${ac}" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.8"/>
<path d="M102,3 L106,3 L106,14" stroke="${ac}" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.8"/>
<path d="M3,186 L3,197 L14,197" stroke="${ac}" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.8"/>
<path d="M102,197 L106,197 L106,186" stroke="${ac}" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.8"/>
<rect x="3" y="3" width="102" height="20" fill="rgba(0,0,0,.6)" rx="2"/>
<text x="15" y="14" font-family="'Space Mono',monospace" font-size="5" fill="#e0e8f8" font-weight="700" letter-spacing="1"><tspan fill="${ac}">ARC</tspan> CARDS</text>
<circle cx="92" cy="10" r="2.5" fill="${ac}" opacity="0.9"/>
<g transform="translate(4,140)">${pips}</g>
<rect x="3" y="150" width="102" height="1" fill="#1e2540" opacity="0.8"/>
<text x="5" y="163" font-family="'Space Mono',monospace" font-size="5.5" fill="${ac}" font-weight="700" letter-spacing="0.5">${handle||'@username'}</text>
<rect x="3" y="168" width="102" height="1" fill="#1e2540" opacity="0.8"/>
<text x="18" y="178" font-family="'Space Mono',monospace" font-size="4" fill="#4a5068" text-anchor="middle">TOKEN</text>
<text x="53" y="178" font-family="'Space Mono',monospace" font-size="4" fill="#4a5068" text-anchor="middle">TYPE</text>
<text x="88" y="178" font-family="'Space Mono',monospace" font-size="4" fill="#4a5068" text-anchor="middle">WAVE</text>
<text x="18" y="187" font-family="'Space Mono',monospace" font-size="5" fill="${ac}" font-weight="700" text-anchor="middle">#${t.tokenId}</text>
<text x="53" y="187" font-family="'Space Mono',monospace" font-size="5" fill="#e0e8f8" font-weight="700" text-anchor="middle">${(t.name||'ARC').toUpperCase()}</text>
<text x="88" y="187" font-family="'Space Mono',monospace" font-size="5" fill="#e0e8f8" font-weight="700" text-anchor="middle">#001</text>
<rect x="3" y="191" width="102" height="1" fill="#1e2540" opacity="0.8"/>
<text x="5" y="198" font-family="'Space Mono',monospace" font-size="3.5" fill="#2a3a5a">arccard.domith.xyz</text>
<rect x="72" y="193" width="33" height="7" rx="3" fill="rgba(0,0,0,.5)" stroke="#1e2e50" stroke-width="0.5"/>
<circle cx="77" cy="196.5" r="2.5" fill="#0a1a30" stroke="${ac}" stroke-width="0.8"/>
<path d="M76,196.5 L77,198 L79,195" stroke="${ac}" stroke-width="0.7" fill="none" stroke-linecap="round"/>
<text x="81" y="198" font-family="'Space Mono',monospace" font-size="3.5" fill="${ac}" font-weight="700" letter-spacing="0.5">ARC VERIFIED</text>
</g></svg>`;
}

/* ══════════════════════════════════════════
   SYNC HANDLE — PUSAT SINKRONISASI
   Dipanggil setiap kali username berubah.
   Update: hero card + My Card canvas + identity card sekaligus.
══════════════════════════════════════════ */
function syncHandle(val){
  APP.handle = (val||'').trim().replace(/^@/,'');

  // Update hero floating card
  const wrap = $('cardArtWrap');
  if(wrap){
    const t = getTraits(APP.handle||'defaultUser');
    wrap.innerHTML = buildSVG(APP.handle ? '@'+APP.handle : '@???', t, 'main');
    txt('cardSerial', '#'+t.tokenId);
    txt('cardHandle',  APP.handle ? '@'+APP.handle : '@username');
  }

  // Update My Card canvas live
  const dc = $('dynCanvas');
  if(dc) drawCard(dc, APP.handle, getCurrentTier(), 220, 312, calcScore());

  // Update identity card in My Card section
  renderIdentityCard();

  // Update result panel handle if visible
  if(APP.checked) txt('rHandle', '@'+APP.handle);

  // Update input field placeholder feel
  const inp = $('xInput');
  if(inp && inp.value !== APP.handle) inp.value = APP.handle;
}

/* ══════════════════════════════════════════
   IDENTITY CARD — shows who the card belongs to
══════════════════════════════════════════ */
function renderIdentityCard(){
  const ic = $('identityCard');
  if(!ic) return;

  const h = APP.handle || '';
  const w = APP.wallet;

  const avatar = $('idAvatar');
  if(avatar){
    avatar.textContent = h ? h.charAt(0).toUpperCase() : '?';
    const tier = getCurrentTier();
    avatar.style.cssText = `width:42px;height:42px;border-radius:10px;background:${tier.bg};border:1px solid ${tier.frame};display:flex;align-items:center;justify-content:center;font-size:18px;color:${tier.accent};font-family:'Space Mono',monospace;font-weight:700;flex-shrink:0;`;
  }

  const hdl = $('idHandle');
  if(hdl){ hdl.textContent = h ? '@'+h : 'Enter your username →'; hdl.style.color = h ? '#e0e8f8' : '#5a6080'; }

  const wlt = $('idWallet');
  if(wlt){ wlt.textContent = w ? short(w)+' · Arc Testnet' : 'Wallet not connected'; wlt.style.color = w ? '#3fcf8e' : '#5a6080'; }

  const liveDot = $('idLiveDot');
  if(liveDot) liveDot.style.display = (w && isOnArc()) ? 'flex' : 'none';

  const score = $('idScore');
  if(score){ score.textContent = 'Score: '+Math.round(calcScore()); score.style.color = getCurrentTier().accent; }
}

/* ══════════════════════════════════════════
   INPUT EVENTS
══════════════════════════════════════════ */
$('xInput').addEventListener('input', ()=>{
  const v = $('xInput').value.trim().replace(/^@/,'');
  $('checkBtn').disabled = v.length < 1;
  clrErr(); APP.checked = false;
  syncHandle(v);
});
$('xInput').addEventListener('keydown', e=>{
  if(e.key==='Enter' && !$('checkBtn').disabled) checkElig();
});
$('checkBtn').addEventListener('click', checkElig);

/* ══════════════════════════════════════════
   WALLET
══════════════════════════════════════════ */
function getRawProvider(){
  const eth = window.ethereum;
  if(!eth) return null;
  if(eth.providers?.length){
    return eth.providers.find(p=>p.isMetaMask)
        || eth.providers.find(p=>p.isRabby)
        || eth.providers[0];
  }
  return eth;
}
function isOnArc(){ return APP.chainId===ARC.chainIdDec || APP.chainId===ARC.chainIdAlt; }

async function connectAndSwitchArc(){
  const raw = getRawProvider();
  if(!raw){ showNoWalletBanner(); return false; }
  let accs;
  try { accs = await raw.request({ method:'eth_requestAccounts' }); }
  catch(e){ if(e.code===4001) return false; throw e; }
  if(!accs?.length) return false;
  APP.wallet  = accs[0].toLowerCase();
  APP.chainId = parseInt(await raw.request({ method:'eth_chainId' }),16);
  if(isOnArc()) return true;
  for(const tryHex of [ARC.chainIdHex, ARC.chainIdAltHex]){
    try {
      await raw.request({ method:'wallet_switchEthereumChain', params:[{chainId:tryHex}] });
      await delay(500);
      APP.chainId = parseInt(await raw.request({method:'eth_chainId'}),16);
      if(isOnArc()) return true;
    } catch(sw){
      if(sw.code===4001) return true;
      const notFound = sw.code===4902||sw.code===-32603||/unrecognized|unknown|not found/i.test(String(sw.message));
      if(!notFound){
        const sameRpc = /same.*rpc|already.*exist/i.test(String(sw.message));
        if(sameRpc) continue;
        APP.chainId = parseInt(await raw.request({method:'eth_chainId'}),16);
        return true;
      }
    }
  }
  try {
    await raw.request({ method:'wallet_addEthereumChain', params:[{
      chainId:ARC.chainIdHex, chainName:ARC.name,
      nativeCurrency:ARC.currency, rpcUrls:[ARC.rpc], blockExplorerUrls:[ARC.explorer],
    }]});
  } catch(add){
    if(add.code===4001){ APP.chainId=parseInt(await raw.request({method:'eth_chainId'}),16); return true; }
    const sameRpc = /same.*rpc|already.*exist/i.test(String(add.message));
    if(sameRpc){
      try { await raw.request({method:'wallet_switchEthereumChain',params:[{chainId:ARC.chainIdAltHex}]}); await delay(400); } catch(_){}
      APP.chainId = parseInt(await raw.request({method:'eth_chainId'}),16); return true;
    }
    throw add;
  }
  try { await raw.request({method:'wallet_switchEthereumChain',params:[{chainId:ARC.chainIdHex}]}); } catch(_){}
  await delay(600);
  APP.chainId = parseInt(await raw.request({method:'eth_chainId'}),16);
  return true;
}

function syncUI(){
  const btn = $('walletBtn');
  if(!APP.wallet){
    $('walletBtnText').textContent = 'Connect Wallet';
    btn.className = 'wallet-btn';
    hide('walletStatus'); hide('netWarn'); hide('walletInfo');
    renderIdentityCard();
    return;
  }
  const onArc = isOnArc();
  $('walletBtnText').textContent = short(APP.wallet);
  btn.className = 'wallet-btn '+(onArc?'connected':'wrong');
  show('walletStatus');
  $('wsDot').className  = 'ws-dot '+(onArc?'green':'orange');
  $('wsText').textContent = onArc ? short(APP.wallet)+' · Arc Testnet ✓' : short(APP.wallet)+' · Wrong network';
  $('wsExplorer').href    = `${ARC.explorer}/address/${APP.wallet}`;
  onArc ? hide('netWarn') : show('netWarn');
  txt('rWallet', short(APP.wallet));
  show('walletInfo');
  if(APP.checked) syncCTA();
  renderIdentityCard();
  renderMyCard();
}

function syncCTA(){
  if(!APP.wallet){
    show('connectForMintBtn'); hide('mintBtn');
    $('connectForMintBtn').textContent = 'Connect Wallet to Mint';
    $('connectForMintBtn').style.cssText = '';
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

async function handleWalletClick(){
  clrErr();
  const btn = $('walletBtn');
  const prevTxt = $('walletBtnText').textContent;
  $('walletBtnText').textContent = 'Connecting…';
  btn.disabled = true;
  try {
    await connectAndSwitchArc();
    syncUI();
    if(APP.wallet && !isOnArc()){ await connectAndSwitchArc(); syncUI(); }
    if(APP.wallet && isOnArc()) fetchOnchainData();
  } catch(e){
    let msg = e?.message||'Wallet error.';
    if(msg.includes('coalesce')) msg = 'Provider conflict — refresh.';
    setErr(msg.slice(0,100));
  } finally {
    btn.disabled = false;
    if(!APP.wallet) $('walletBtnText').textContent = prevTxt;
  }
}
$('walletBtn').addEventListener('click', handleWalletClick);
$('connectForMintBtn').addEventListener('click', handleWalletClick);

const _rawProv = getRawProvider();
if(_rawProv){
  _rawProv.on('accountsChanged', async accs=>{
    APP.wallet = accs[0]?.toLowerCase()||null;
    if(APP.wallet) APP.chainId = parseInt(await _rawProv.request({method:'eth_chainId'}),16);
    syncUI();
    if(APP.wallet && isOnArc()) fetchOnchainData();
  });
  _rawProv.on('chainChanged', async hex=>{
    APP.chainId = parseInt(hex,16); syncUI();
    if(APP.wallet && !isOnArc()){
      await delay(800);
      try {
        await _rawProv.request({method:'wallet_switchEthereumChain',params:[{chainId:ARC.chainIdHex}]});
        APP.chainId = ARC.chainIdDec; syncUI();
      } catch(_){}
    }
    if(APP.wallet && isOnArc()) fetchOnchainData();
  });
}

/* ══════════════════════════════════════════
   CHECK ELIGIBILITY
══════════════════════════════════════════ */
async function checkElig(){
  const v = $('xInput').value.trim().replace(/^@/,'');
  if(!v||v.length<3){ setErr('Username must be at least 3 characters.'); return; }
  clrErr();
  $('checkBtn').disabled = true;
  $('checkBtn').textContent = 'Checking…';
  try {
    await delay(500);
    const t = getTraits(v);
    APP.handle  = v;
    APP.token   = t.tokenId;
    APP.checked = true;
    syncHandle(v);
    txt('rHandle', '@'+v);
    txt('rWallet', APP.wallet ? short(APP.wallet) : 'not connected');
    hide('okAlert'); hide('shareBtn');
    show('resultPanel');
    syncCTA();
    $('resultPanel').scrollIntoView({ behavior:'smooth', block:'nearest' });
    // Scroll hint ke My Card di navbar
    const navMC = $('navMyCard');
    if(navMC) navMC.style.fontWeight = '900';
  } catch(e){ setErr(e.message||'Check failed.'); }
  finally {
    $('checkBtn').disabled = false;
    $('checkBtn').textContent = 'Check';
  }
}

/* ══════════════════════════════════════════
   MINT
══════════════════════════════════════════ */
$('mintBtn').addEventListener('click', doMint);

async function getGasPrice(raw){
  try { return await raw.request({ method:'eth_gasPrice', params:[] }); }
  catch(_){ return '0x3B9ACA00'; }
}
async function waitForReceipt(raw, txHash, maxWait=60000){
  const start = Date.now();
  while(Date.now()-start < maxWait){
    try {
      const r = await raw.request({ method:'eth_getTransactionReceipt', params:[txHash] });
      if(r && r.blockNumber) return r;
    } catch(_){}
    await delay(2000);
  }
  throw new Error('TX timeout. Check: '+ARC.explorer+'/tx/'+txHash);
}

async function doMint(){
  if(!APP.wallet||!isOnArc()){ await handleWalletClick(); if(!APP.wallet||!isOnArc()) return; }
  const btn = $('mintBtn');
  btn.disabled = true; clrErr();
  const raw = getRawProvider();
  if(!raw){ setErr('Wallet not found. Refresh.'); btn.disabled=false; return; }
  try {
    APP.chainId = parseInt(await raw.request({method:'eth_chainId'}),16);
    if(!isOnArc()){
      try { await raw.request({method:'wallet_switchEthereumChain',params:[{chainId:ARC.chainIdHex}]}); await delay(400); APP.chainId=parseInt(await raw.request({method:'eth_chainId'}),16); } catch(_){}
      if(!isOnArc()){ setErr('Please switch to Arc Testnet.'); btn.disabled=false; return; }
    }
  } catch(_){}

  try {
    let txHash, tokenId;

    if(BACKEND_URL && CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000'){
      btn.textContent = 'Minting…';
      const res  = await fetch(`${BACKEND_URL}/api/mint`,{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ walletAddress:APP.wallet, handle:'@'+APP.handle }),
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error||'Mint failed');
      txHash = data.txHash; tokenId = data.tokenId||APP.token;

    } else if(CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000'){
      btn.textContent = 'Confirm in wallet…';
      const iface    = new ethers.Interface(CONTRACT_ABI);
      const tokenURI = `https://arccard.domith.xyz/metadata/${APP.handle}.json`;
      const calldata = iface.encodeFunctionData('mint', ['@'+APP.handle,'Builder',tokenURI]);
      const gasPrice = await getGasPrice(raw);
      txHash = await raw.request({ method:'eth_sendTransaction',
        params:[{ from:APP.wallet, to:CONTRACT_ADDRESS, value:'0x0', data:calldata, gasPrice, gas:'0x493E0' }] });
      if(!txHash) throw new Error('No tx hash');
      btn.textContent = 'Confirming…';
      await waitForReceipt(raw, txHash);
      tokenId = APP.token;

    } else {
      btn.textContent = 'Confirm in wallet…';
      const gasPrice = await getGasPrice(raw);
      txHash = await raw.request({ method:'eth_sendTransaction',
        params:[{ from:APP.wallet, to:APP.wallet, value:'0x0', data:'0x', gasPrice, gas:'0x5208' }] });
      if(!txHash) throw new Error('No tx hash');
      btn.textContent = 'Confirming…';
      await waitForReceipt(raw, txHash);
      tokenId = APP.token;
    }

    // SUCCESS — update APP state
    APP.txCount  += 1;
    APP.mintedAt  = APP.mintedAt || new Date().toISOString();
    APP.minted    = true;
    saveAPP();

    const explorerUrl = `${ARC.explorer}/tx/${txHash}`;
    $('txLink').href  = explorerUrl;
    txt('mintedToken', '#'+tokenId);
    show('okAlert'); hide('mintBtn'); hide('connectForMintBtn'); show('shareBtn');

    showMintModal(txHash);
    $('nftCard').classList.add('minted');
    setTimeout(()=>$('nftCard').classList.remove('minted'), 4000);

    // Refresh onchain data setelah mint
    fetchOnchainData();
    renderMyCard();

  } catch(e){
    let msg = e?.message||String(e)||'Transaction failed.';
    if(/rejected|denied|cancel/i.test(msg))           msg = 'Transaction cancelled.';
    else if(/coalesce|provider/i.test(msg))            msg = 'Wallet conflict — refresh and try again.';
    else if(/insufficient|funds|balance/i.test(msg))   msg = 'Insufficient USDC. Get testnet USDC at faucet.circle.com';
    else if(msg.length > 140) msg = msg.slice(0,140)+'…';
    setErr(msg);
    btn.disabled = false;
    btn.textContent = 'Mint My Arc Card';
  }
}

/* ══════════════════════════════════════════
   MINT MODAL
══════════════════════════════════════════ */
function showMintModal(txHash){
  const traits = getTraits(APP.handle);
  const modal  = $('mintedCardModal');
  $('mintedSvgWrap').innerHTML = buildSVG('@'+APP.handle, traits, 'modal');
  txt('modalHandle', '@'+APP.handle);
  txt('modalToken',  '#'+APP.token);
  txt('modalType',   traits.name);
  txt('modalRarity', traits.rarity);
  const rc = {Legendary:'#fbbf24',Epic:'#a78bfa',Rare:'#60a5fa',Common:'#94a3b8'};
  const rarEl = $('modalRarity');
  if(rarEl) rarEl.style.color = rc[traits.rarity]||'#fff';
  $('modalTxLink').href = `${ARC.explorer}/tx/${txHash}`;
  txt('modalTxShort', txHash.slice(0,10)+'…'+txHash.slice(-6));
  $('modalShareBtn').onclick    = shareToX;
  $('modalDownloadBtn').onclick = ()=>downloadPass();
  $('modalCopyBtn').onclick     = ()=>copyPass();
  modal.classList.remove('hidden');
  requestAnimationFrame(()=>{
    modal.classList.add('show');
    setTimeout(()=>$('mintedSvgWrap').classList.add('reveal'), 150);
  });
}

$('modalClose').addEventListener('click',()=>{
  const m = $('mintedCardModal');
  m.classList.remove('show');
  setTimeout(()=>{ m.classList.add('hidden'); const w=$('mintedSvgWrap'); if(w) w.classList.remove('reveal'); }, 300);
});
$('mintedCardModal').addEventListener('click', e=>{
  if(e.target===$('mintedCardModal')) $('modalClose').click();
});

/* ══════════════════════════════════════════
   PNG UTILS
══════════════════════════════════════════ */
function svgToPng(svgEl, scale, cb){
  const svgStr = new XMLSerializer().serializeToString(svgEl);
  const vb     = svgEl.viewBox.baseVal;
  const W      = (vb.width ||400)*scale;
  const H      = (vb.height||560)*scale;
  const img    = new Image();
  const blob   = new Blob([svgStr], {type:'image/svg+xml;charset=utf-8'});
  const url    = URL.createObjectURL(blob);
  img.onload  = ()=>{ const c=document.createElement('canvas'); c.width=W; c.height=H; c.getContext('2d').drawImage(img,0,0,W,H); URL.revokeObjectURL(url); cb(c); };
  img.onerror = ()=>URL.revokeObjectURL(url);
  img.src     = url;
}
function canvasToPng(canvas, filename){
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png'); a.download = filename; a.click();
}

function downloadPass(){
  const svg = $('mintedSvgWrap')?.querySelector('svg');
  if(!svg){ showPassToast('Card not ready'); return; }
  showPassToast('Preparing…');
  svgToPng(svg, 4, c=>{ canvasToPng(c, `arc-card-${APP.handle}.png`); showPassToast('Downloaded!'); });
}
function copyPass(){
  const svg = $('mintedSvgWrap')?.querySelector('svg');
  if(!svg){ showPassToast('Card not ready'); return; }
  showPassToast('Copying…');
  svgToPng(svg, 3, c=>{
    c.toBlob(async blob=>{
      try { await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]); showPassToast('Image copied!'); }
      catch(_){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='arc-card.png'; a.click(); showPassToast('Saved as PNG!'); }
    }, 'image/png');
  });
}
function showPassToast(msg){
  const el=$('passCopyToast'); if(!el) return;
  el.textContent=msg; setTimeout(()=>{ if(el) el.textContent=''; }, 2500);
}

/* Download dari My Card */
function downloadDynCard(){
  const c = $('dynCanvas');
  if(!c) return;
  canvasToPng(c, `arc-card-${APP.handle||'card'}-${getCurrentTier().name.toLowerCase()}.png`);
}

/* ══════════════════════════════════════════
   SHARE
══════════════════════════════════════════ */
$('shareBtn').addEventListener('click', shareToX);
function shareToX(){
  const traits = getTraits(APP.handle);
  const tier   = getCurrentTier();
  const text   = encodeURIComponent(
    `Just minted my Arc Card on @arc testnet!\n\nHandle: @${APP.handle}\nType: ${traits.name}\nTier: ${tier.name}\nScore: ${Math.round(calcScore())}\nToken: #${APP.token}\n\nBuild on Arc. #ArcCards #BuildOnArc @domith2025`
  );
  window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank','noopener,noreferrer');
}

/* ══════════════════════════════════════════
   RESET
══════════════════════════════════════════ */
$('resetBtn').addEventListener('click',()=>{
  APP.checked = false;
  $('xInput').value = '';
  $('checkBtn').disabled = true;
  clrErr(); hide('resultPanel');
  syncHandle('');
  $('xInput').focus();
});

/* ══════════════════════════════════════════
   MY CARD — RENDER
══════════════════════════════════════════ */
function renderMyCard(){
  const tier = getCurrentTier();
  const dc   = $('dynCanvas');
  if(dc) drawCard(dc, APP.handle, tier, 220, 312, calcScore());

  // Ring glow
  const ring = $('dynRingOuter');
  if(ring) ring.style.background = tier.ring;

  // Tier pill
  txt('tierPillIcon', tier.icon);
  const tpn = $('tierPillName');
  if(tpn){ tpn.textContent = tier.name; tpn.style.color = tier.accent; }

  // Identity card
  renderIdentityCard();

  // Tier progress
  const sc  = calcScore();
  const ti  = getTierIdx();
  const nxt = TIERS[ti+1];
  const ibox = $('tierIconWrap');
  if(ibox){
    ibox.textContent  = tier.icon;
    ibox.style.cssText = `background:${tier.bg};border:.5px solid ${tier.frame};color:${tier.accent};width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;transition:all .4s;`;
  }
  const tnb = $('tierNameBig');
  if(tnb){ tnb.textContent = tier.name; tnb.style.color = tier.accent; }
  txt('tierScoreNext', nxt ? `${Math.ceil(nxt.min-sc)} score to ${nxt.name}` : 'Max tier reached ✦');
  const xp = $('xpBar');
  if(xp){
    const pct = nxt ? Math.min(100,((sc-tier.min)/(nxt.min-tier.min))*100) : 100;
    xp.style.width = pct.toFixed(1)+'%'; xp.style.background = tier.accent;
  }
  const tpc = $('tierProgressCard');
  if(tpc) tpc.style.borderColor = tier.accent+'44';

  // Attribute bars
  const ATTRS = [
    { label:'Transactions',  unit:'tx',   max:80,  color:'#4a7cdc', val:APP.txCount },
    { label:'Gas burned',    unit:'USDC', max:40,  color:'#D85A30', val:parseFloat(APP.gasUsdc.toFixed(1)) },
    { label:'Weeks holding', unit:'wks',  max:52,  color:'#1D9E75', val:APP.weekHeld },
    { label:'USDC held',     unit:'USDC', max:500, color:'#EF9F27', val:APP.usdcHeld },
    { label:'NFTs minted',   unit:'NFTs', max:20,  color:'#7F77DD', val:APP.nftsMinted },
  ];
  const al = $('attrList');
  if(al){
    al.innerHTML = ATTRS.map(a=>{
      const p = Math.min(100,(a.val/a.max)*100).toFixed(1);
      return `<div class="attr-item">
        <div class="attr-head">
          <span class="attr-name">${a.label}</span>
          <span class="attr-val">${a.val} ${a.unit}</span>
        </div>
        <div class="attr-track"><div class="attr-bar" style="width:${p}%;background:${a.color};"></div></div>
      </div>`;
    }).join('');
  }

  // Evolve box
  renderEvolveBox();

  // Buttons
  const dlBtn = $('dlCardBtn');
  if(dlBtn) dlBtn.onclick = downloadDynCard;
  const shareBtn2 = $('shareCardBtn');
  if(shareBtn2) shareBtn2.onclick = shareToX;
}

/* ══════════════════════════════════════════
   EVOLVE BOX
══════════════════════════════════════════ */
function renderEvolveBox(){
  const ti  = getTierIdx();
  const mt  = APP.mintedTier;
  const box = $('evolveBox');
  const btn = $('evolveBtn');
  const ei  = $('evolveIcon');
  const ts  = $('tierSteps');
  if(!box||!btn||!ei||!ts) return;

  ts.innerHTML = TIERS.map((t,i)=>{
    const isMinted = i===mt, isActive = i>mt&&i<=ti, isFuture = i>ti;
    let st = '';
    if(isMinted)      st = `<div class="ts-status" style="color:#1D9E75;">Minted</div>`;
    else if(isActive) st = `<div class="ts-status" style="color:${t.accent};">Ready!</div>`;
    else if(isFuture) st = `<div class="ts-status" style="color:#2c2e42;">Locked</div>`;
    else              st = `<div class="ts-status" style="color:#2c2e42;">Done</div>`;
    return `<div class="tier-step${isActive?' active':''}" style="--step-c:${t.accent}">
      <div class="ts-icon" style="color:${isFuture&&!isActive?'#2c2e42':t.accent}">${t.icon}</div>
      <div class="ts-name" style="color:${isFuture&&!isActive?'#2c2e42':t.accent}">${t.name}</div>
      <div class="ts-price">${t.price===0?'Free':t.price+' USDC'}</div>
      ${st}
    </div>`;
  }).join('');

  if(ti<=mt){
    box.className = 'evolve-box';
    ei.style.cssText = 'width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;border:1px solid var(--border);background:var(--surface2);';
    ei.textContent = '🔒';
    txt('evolveTitle','Evolve & Re-mint');
    txt('evolveSub','Keep building to unlock next tier');
    btn.className   = 'evolve-btn locked';
    btn.textContent = TIERS[mt+1] ? `Reach ${TIERS[mt+1].name} to unlock` : 'Max tier achieved ✦';
    btn.onclick     = null;
  } else {
    const nextT = TIERS[mt+1];
    box.className = 'evolve-box unlocked'+(ti===3?' legendary':'');
    ei.style.cssText = `background:${nextT.bg};border:.5px solid ${nextT.frame};color:${nextT.accent};width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;`;
    ei.textContent = nextT.icon;
    txt('evolveTitle',`Evolve to ${nextT.name}`);
    txt('evolveSub', nextT.price===0 ? 'Free re-mint' : `Pay ${nextT.price} USDC to lock tier`);
    btn.className   = ti===3 ? 'evolve-btn legend' : 'evolve-btn ready';
    btn.textContent = nextT.price===0 ? `Evolve to ${nextT.name} — Free` : `Evolve to ${nextT.name} — ${nextT.price} USDC`;
    btn.onclick     = openEvolveConfirm;
  }
}

/* ══════════════════════════════════════════
   EVOLVE CONFIRM & SUCCESS
══════════════════════════════════════════ */
function openEvolveConfirm(){
  const ti = getTierIdx();
  if(ti <= APP.mintedTier) return;
  const nextT = TIERS[APP.mintedTier+1];
  const cf    = $('evolveConfirm');
  const cfIn  = $('evolveConfirmInner');
  if(!cf||!cfIn) return;
  txt('cfTitle', `Evolve to ${nextT.name}`);
  $('cfTitle').style.color   = nextT.accent;
  cfIn.style.borderColor     = nextT.accent;
  const cfp = $('cfPrice');
  cfp.textContent = nextT.price===0 ? 'Free' : `Cost: ${nextT.price} USDC`;
  cfp.style.color = nextT.price===0 ? '#1D9E75' : nextT.accent;
  const ccb = $('cfConfirmBtn');
  ccb.style.cssText = `flex:1;padding:10px;border-radius:8px;font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.08em;cursor:pointer;border:1px solid ${nextT.accent};color:${nextT.accent};background:${nextT.bg};transition:opacity .2s;`;
  drawCard($('cfBefore'), APP.handle, TIERS[APP.mintedTier], 90, 128);
  drawCard($('cfAfter'),  APP.handle, nextT, 90, 128);
  $('mycardNormalView').style.display = 'none';
  cf.classList.add('show');
}
function closeEvolveConfirm(){
  $('evolveConfirm').classList.remove('show');
  $('mycardNormalView').style.display = 'block';
}
window.closeEvolveConfirm = closeEvolveConfirm;

function doRemint(){
  closeEvolveConfirm();
  APP.mintedTier = Math.min(APP.mintedTier+1, TIERS.length-1);
  saveAPP();
  const newTier = TIERS[APP.mintedTier];
  const sc = $('successCanvas');
  if(sc) drawCard(sc, APP.handle, newTier, 160, 228);
  txt('successTitle', `Evolved to ${newTier.name}!`);
  $('successTitle').style.color = newTier.accent;
  txt('successSub', `${newTier.name} tier locked permanently onchain. TX confirmed on Arc Testnet.`);
  $('successShareBtn').style.borderColor = newTier.accent;
  $('successShareBtn').style.color       = newTier.accent;
  $('mycardNormalView').style.display    = 'none';
  $('evolveSuccess').classList.add('show');
}
window.doRemint = doRemint;

function closeEvolveSuccess(){
  $('evolveSuccess').classList.remove('show');
  $('mycardNormalView').style.display = 'block';
  renderMyCard();
}
window.closeEvolveSuccess = closeEvolveSuccess;

/* ══════════════════════════════════════════
   FETCH ONCHAIN DATA dari Arc Testnet RPC
   Membaca txCount, balance, weeks held
   langsung dari wallet address.
══════════════════════════════════════════ */
async function fetchOnchainData(){
  if(!APP.wallet || !isOnArc()) return;
  const rpc  = ARC.rpc;
  const addr = APP.wallet;
  try {
    // TX count
    const txRes = await fetch(rpc, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'eth_getTransactionCount', params:[addr,'latest'] })
    });
    const txData = await txRes.json();
    if(txData.result){
      const txc = parseInt(txData.result, 16);
      if(txc > APP.txCount) APP.txCount = txc;
    }

    // USDC balance (native)
    const balRes = await fetch(rpc, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ jsonrpc:'2.0', id:2, method:'eth_getBalance', params:[addr,'latest'] })
    });
    const balData = await balRes.json();
    if(balData.result){
      const bal = parseInt(balData.result, 16) / 1e18;
      APP.usdcHeld = parseFloat(bal.toFixed(2));
    }

    // Week held
    if(APP.mintedAt){
      const ms = Date.now() - new Date(APP.mintedAt).getTime();
      APP.weekHeld = Math.floor(ms / (7*24*60*60*1000));
    }

    saveAPP();
    renderMyCard();
  } catch(e){ console.warn('[ARC] RPC fetch failed:', e.message); }
}

/* ══════════════════════════════════════════
   FAQ
══════════════════════════════════════════ */
document.querySelectorAll('.faq-q').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const open = btn.getAttribute('aria-expanded')==='true';
    document.querySelectorAll('.faq-q').forEach(b=>{
      b.setAttribute('aria-expanded','false'); b.nextElementSibling.hidden=true;
    });
    if(!open){ btn.setAttribute('aria-expanded','true'); btn.nextElementSibling.hidden=false; }
  });
});

/* ══════════════════════════════════════════
   NAV SCROLL
══════════════════════════════════════════ */
window.addEventListener('scroll',()=>{
  $('navbar').style.borderBottomColor = scrollY>10?'rgba(39,42,62,.8)':'var(--border)';
},{passive:true});

/* ══════════════════════════════════════════
   NO WALLET BANNER
══════════════════════════════════════════ */
function showNoWalletBanner(){
  const existing = document.getElementById('noWalletBanner');
  if(existing){ existing.remove(); return; }
  const el = document.createElement('div');
  el.className = 'no-wallet-toast';
  el.innerHTML = `<span>No EVM wallet detected.</span>
    <a href="https://metamask.io" target="_blank" rel="noopener">Install MetaMask</a>
    <span style="color:var(--text3)">or</span>
    <a href="https://rabby.io" target="_blank" rel="noopener">Rabby</a>
    <button onclick="this.parentElement.remove()" style="margin-left:auto;background:transparent;border:none;color:var(--text3);cursor:pointer;font-size:14px;">✕</button>`;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 8000);
}

/* ══════════════════════════════════════════
   AUTO-RECONNECT
══════════════════════════════════════════ */
async function autoReconnect(){
  const raw = getRawProvider();
  if(!raw) return;
  try {
    const accs = await raw.request({ method:'eth_accounts' });
    if(!accs?.length) return;
    APP.wallet  = accs[0].toLowerCase();
    APP.chainId = parseInt(await raw.request({method:'eth_chainId'}),16);
    if(!isOnArc()){
      try {
        await raw.request({method:'wallet_switchEthereumChain',params:[{chainId:ARC.chainIdHex}]});
        APP.chainId = ARC.chainIdDec;
      } catch(_){}
    }
    syncUI();
    if(isOnArc()) fetchOnchainData();
  } catch(_){}
}

/* ══════════════════════════════════════════
   INIT — urutan penting
══════════════════════════════════════════ */
// 1. Restore handle dari localStorage ke input field
if(APP.handle){
  const inp = $('xInput');
  if(inp) inp.value = APP.handle;
  $('checkBtn').disabled = APP.handle.length < 1;
}

// 2. Render hero card
syncHandle(APP.handle);

// 3. Render My Card (selalu visible, tidak perlu mint dulu)
renderMyCard();

// 4. Restore checked state
if(APP.handle && APP.minted){
  APP.checked = true;
  txt('rHandle', '@'+APP.handle);
  show('resultPanel');
  show('okAlert');
  show('shareBtn');
  hide('mintBtn');
  hide('connectForMintBtn');
}

// 5. Connect wallet yang sudah pernah connect
autoReconnect();
