# Arc Cards — Build on Arc
**© 2026 Domith**

Community soulbound NFT card app for the Arc ecosystem.  
Users enter their X username → check eligibility → connect wallet → mint on Arc Testnet → share to X.

---

## Arc Network Details

| Parameter | Value |
|-----------|-------|
| Network | Arc Testnet |
| Chain ID | `5042002` |
| RPC URL | `https://rpc.testnet.arc.network` |
| Currency | USDC |
| Explorer | https://testnet.arcscan.app |

> The app automatically adds Arc Testnet to the user's wallet on connect.

---

## Project Structure

```
arc-cards/
├── index.html        ← Full page markup
├── css/
│   └── style.css     ← All styles + animations
├── js/
│   └── app.js        ← Wallet connect + mint logic
├── vercel.json       ← Vercel deploy config
├── netlify.toml      ← Netlify deploy config
└── README.md
```

---

## Deploy in 60 seconds

### Vercel (recommended)
```bash
npm i -g vercel
cd arc-cards
vercel
```
Or drag-and-drop folder at https://vercel.com/new

### Netlify
Drag-and-drop folder at https://app.netlify.com/drop

### GitHub Pages
Push to repo → Settings → Pages → Deploy from branch → main → / (root)

---

## Integrating Your Smart Contract

In `js/app.js`, find these two lines and fill them in:

```js
const CONTRACT_ADDRESS = '0xYourContractAddress';
const CONTRACT_ABI = [
  'function mint(address to, string calldata handle, string calldata role) external',
  'function tokenIdOf(address owner) external view returns (uint256)',
  'function hasMinted(address owner) external view returns (bool)',
];
```

### Sample Solidity Contract (ArcCard.sol)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ArcCard is ERC721, Ownable {
    uint256 private _tokenIdCounter;

    struct Card {
        string handle;
        string role;
        uint256 mintedAt;
    }

    mapping(uint256 => Card) public cards;
    mapping(address => uint256) public tokenIdOf;
    mapping(address => bool) public hasMinted;

    event CardMinted(address indexed to, uint256 tokenId, string handle, string role);

    constructor() ERC721("Arc Card", "ARCCARD") Ownable(msg.sender) {}

    function mint(address to, string calldata handle, string calldata role) external {
        require(!hasMinted[to], "Already minted");
        uint256 tokenId = ++_tokenIdCounter;
        _safeMint(to, tokenId);
        cards[tokenId] = Card(handle, role, block.timestamp);
        tokenIdOf[to]  = tokenId;
        hasMinted[to]  = true;
        emit CardMinted(to, tokenId, handle, role);
    }

    // Soulbound: block all transfers except mint
    function _update(address to, uint256 tokenId, address auth)
        internal override returns (address)
    {
        address from = _ownerOf(tokenId);
        require(from == address(0), "Soulbound: non-transferable");
        return super._update(to, tokenId, auth);
    }

    function totalSupply() external view returns (uint256) {
        return _tokenIdCounter;
    }
}
```

**Deploy on Arc Testnet:**
```bash
npm install --save-dev hardhat @openzeppelin/contracts
npx hardhat compile
npx hardhat run scripts/deploy.js --network arc_testnet
```

**hardhat.config.js:**
```js
networks: {
  arc_testnet: {
    url: 'https://rpc.testnet.arc.network',
    chainId: 5042002,
    accounts: [process.env.PRIVATE_KEY],
  }
}
```

---

## Wallet Support

Works with any EIP-1193 compatible wallet:
- MetaMask
- Rabby
- Coinbase Wallet  
- Rainbow
- Any EVM wallet with browser extension

---

## Demo Mode (no contract)

If `CONTRACT_ADDRESS` is still the zero address, the app runs in **demo mode**:
- Wallet connects and switches to Arc Testnet normally
- "Mint" sends a 0-value self-transaction with card metadata embedded in calldata
- Transaction is viewable on https://testnet.arcscan.app
- Everything works end-to-end for testing

---

## Eligibility API (optional)

Replace the stub in `checkEligibility()`:

```js
const res  = await fetch(`/api/check?username=${encodeURIComponent(v)}`);
const data = await res.json();
// data: { eligible: boolean, role?: string }
if (!data.eligible) throw new Error('Not eligible for this wave.');
```

---

## Customization

| What | Where |
|------|-------|
| Brand name | `index.html` — "ARC" / "Domith" text |
| Colors | `css/style.css` → `:root` variables |
| Tweet text | `js/app.js` → `shareToX()` |
| FAQ content | `index.html` → `.faq-item` blocks |
| Contract | `js/app.js` → `CONTRACT_ADDRESS` + `CONTRACT_ABI` |
