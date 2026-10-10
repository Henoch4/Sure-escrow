import { ethers } from 'ethers';
import { AppKit } from '@reown/appkit';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';

const PROJECT_ID = 'f018499b1e4a94d961ab67aeeeff3254';

const botTestnet = {
  id: 968, name: 'BOT Chain Testnet',
  nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.bohr.life'] } },
  blockExplorers: { default: { name: 'BOTScan Testnet', url: 'https://scan.bohr.life' } },
  testnet: true,
};
const botMainnet = {
  id: 677, name: 'BOT Chain',
  nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.botchain.ai'] } },
  blockExplorers: { default: { name: 'BOTScan', url: 'https://scan.botchain.ai' } },
};

const SE_ABI = [
  'function escrowToken() view returns (address)',
  'function totalDeals() view returns (uint256)',
  'function totalReleased() view returns (uint256)',
  'function owner() view returns (address)',
  'function createDeal(address freelancer,uint256[] milestoneAmounts)',
  'function release(uint256 dealId,uint256 milestoneIdx)',
  'function cancel(uint256 dealId)',
  'function dispute(uint256 dealId)',
  'function resolveDispute(uint256 dealId,bool payFreelancer)',
  'function getDeal(uint256 dealId) view returns (address,address,uint256,uint256,uint256,bool,bool,uint256[],bool[])',
  'event DealCreated(uint256 indexed dealId,address indexed client,address indexed freelancer,uint256 total,uint256 milestoneCount)',
];
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function deposit() payable',
  'function allowance(address,address) view returns (uint256)',
];

const CONTRACTS = {
  968: {
    se: '0xDf9229a3242a84cAa2cdB4AEC4e1475AFf6AB080',
    twbot: '0xD8FBaBf44B2dbb427d881F8Ea66F14D8287A55c0',
  },
  677: {
    se: '0xa6e6a6C84705D12b7CDc268c2fECB89612122A48',
    twbot: '0xD5452816194a3784dBa983426cCe7c122F4abd30',
  },
};

const $ = (id) => document.getElementById(id);
const fmt = (n, d = 18) => Number(ethers.formatUnits(n, d)).toLocaleString(undefined, { maximumFractionDigits: 4 });
const short = (a) => a.slice(0, 6) + '…' + a.slice(-4);

function getProvider() {
  try {
    if (typeof appkit !== 'undefined' && appkit && typeof appkit.getWalletProvider === 'function') {
      const p = appkit.getWalletProvider('eip155') || appkit.getWalletProvider();
      if (p) return p;
    }
  } catch (e) {}
  return null;
}
async function getSigner() {
  const wp = getProvider();
  if (!wp) { try { appkit.open(); } catch (e) {} return null; }
  return new ethers.BrowserProvider(wp).getSigner();
}

let appkit = null;
let readProvider;
let currentChainId = 677;
let account = null;

function initAppKit() {
  if (!$('connectBtn')) return;
  appkit = new AppKit({
    networks: [botMainnet, botTestnet],
    adapters: [new EthersAdapter()],
    projectId: PROJECT_ID,
    themeMode: 'dark',
    metadata: { name: 'SureEscrow', description: 'Milestone escrow on BOT Chain', url: location.origin, icons: [] },
  });
  appkit.subscribeAccount((state) => {
    account = state.address || null;
    $('connectBtn').textContent = account ? short(account) : 'Connect wallet';
    refresh();
  });
  $('connectBtn').addEventListener('click', () => appkit.open());
  $('netSel')?.addEventListener('change', (e) => { currentChainId = Number(e.target.value); refresh(); });
}

function readSE() {
  const c = CONTRACTS[currentChainId];
  if (!c) return null;
  return new ethers.Contract(c.se, SE_ABI, readProvider);
}

function showMsg(id, text) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.style.display = 'block';
}

async function dealIds() {
  const c = CONTRACTS[currentChainId];
  if (!c) return [];
  const topic = ethers.id('DealCreated(uint256,address,address,uint256,uint256)');
  const logs = await readProvider.getLogs({ address: c.se, topics: [topic], fromBlock: 0, toBlock: 'latest' });
  return logs.map((l) => Number(l.topics[1]));
}

async function refresh() {
  const se = readSE();
  if (!se) {
    ['tDeals', 'tReleased', 'stDeals', 'stReleased'].forEach((id) => { const e = $(id); if (e) e.textContent = 'not on this chain'; });
    return;
  }
  try {
    const [ids, totalDeals, totalReleased] = await Promise.all([dealIds(), se.totalDeals(), se.totalReleased()]);
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    set('tDeals', String(totalDeals));
    set('stDeals', String(totalDeals));
    set('tReleased', fmt(totalReleased) + ' TW');
    set('stReleased', fmt(totalReleased) + ' TW');
    if (account) {
      const bal = await new ethers.Contract(CONTRACTS[currentChainId].twbot, ERC20_ABI, readProvider).balanceOf(account);
      set('tBal', fmt(bal) + ' TW');
    } else set('tBal', 'connect wallet');

    const deals = await Promise.all(ids.map(async (id) => {
      const d = await se.getDeal(id);
      return { id, client: d[0], freelancer: d[1], funded: d[2], released: d[3], count: Number(d[4]), active: d[5], disputed: d[6], amts: d[7], rel: d[8] };
    }));
    const list = $('dealList');
    if (!list) return;
    if (!deals.length) { list.innerHTML = '<div class="hint">No deals yet — create the first one.</div>'; return; }
    list.innerHTML = deals.map((d) => {
      const tagCls = d.disputed ? 'dis' : d.active ? 'on' : 'off';
      const tagTxt = d.disputed ? 'disputed' : d.active ? 'active' : 'settled';
      const fullyPaid = !d.active && d.released >= d.funded;
      const miles = d.amts.map((a, i) => {
        const viaDispute = !d.rel[i] && fullyPaid;
        const done = d.rel[i] || viaDispute;
        return `<span class="mile ${done ? 'done' : ''}"${viaDispute ? ' title="paid via dispute resolution"' : ''}>m${i} · ${fmt(a)}${done ? (viaDispute ? ' ✓ (dispute)' : ' ✓') : ''}</span>`;
      }).join('');
      const youAre = account && (account.toLowerCase() === d.client.toLowerCase() || account.toLowerCase() === d.freelancer.toLowerCase());
      return `<div class="deal">
        <div class="d-top"><b>Deal #${d.id} · ${fmt(d.funded)} WBOT</b><span class="tag ${tagCls}">${tagTxt}</span></div>
        <div class="d-meta">
          <span>client <b class="mono">${short(d.client)}</b></span>
          <span>freelancer <b class="mono">${short(d.freelancer)}</b></span>
          <span>released <b>${fmt(d.released)}/${fmt(d.funded)}</b></span>
          <span>you <b>${youAre ? (account.toLowerCase() === d.client.toLowerCase() ? 'client' : 'freelancer') : '—'}</b></span>
        </div>
        <div class="miles">${miles}</div>
      </div>`;
    }).join('');
  } catch (e) {
    console.error(e);
    const list = $('dealList');
    if (list) list.innerHTML = '<div class="hint">Failed to load deals: ' + String(e.message || e).slice(0, 120) + '</div>';
  }
}

async function signerOrAlert() {
  if (!account) { appkit?.open(); return null; }
  if (!CONTRACTS[currentChainId]) { alert('No contracts on this network in this app. Switch to BOT Chain 677 or Testnet 968.'); return null; }
  const s = await getSigner();
  if (!s) { appkit?.open(); return null; }
  return s;
}

async function ensureWbot(amount, msgId) {
  const s = await signerOrAlert();
  if (!s) return false;
  const c = CONTRACTS[currentChainId];
  const w = new ethers.Contract(c.twbot, ERC20_ABI, s);
  const owner = await s.getAddress();
  const bal = await w.balanceOf(owner);
  if (bal >= amount) return true;
  const shortfall = amount - bal;
  const native = await s.provider.getBalance(owner);
  const gasCost = ethers.parseUnits('0.005', 18);
  if (native < shortfall + gasCost) {
    showMsg(msgId, 'Need ' + fmt(shortfall + gasCost - native) + ' more BOT — fund the wallet first (wrap + gas).');
    return false;
  }
  showMsg(msgId, 'Wrapping BOT → WBOT…');
  const tx = await w.deposit({ value: shortfall });
  await tx.wait();
  return true;
}

async function doCreate() {
  const s = await signerOrAlert();
  if (!s) return;
  const c = CONTRACTS[currentChainId];
  const free = ($('dFree')?.value || '').trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(free)) return showMsg('dMsg', 'Enter a valid freelancer address');
  const freelancer = ethers.getAddress(free);
  const me0 = await s.getAddress();
  if (freelancer.toLowerCase() === me0.toLowerCase()) return showMsg('dMsg', "Freelancer can't be your own address — enter the other party.");
  const amts = ($('dAmts')?.value || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!amts.length) return showMsg('dMsg', 'Enter milestone amounts');
  let bigs;
  try { bigs = amts.map((a) => ethers.parseEther(a)); } catch { return showMsg('dMsg', 'Invalid amount'); }
  if (bigs.some((b) => b <= 0n)) return showMsg('dMsg', 'All milestones must be > 0');
  const total = bigs.reduce((x, y) => x + y, 0n);
  const token = new ethers.Contract(c.twbot, ERC20_ABI, s);
  const owner = await s.getAddress();
  if (!(await ensureWbot(total, 'dMsg'))) return;
  showMsg('dMsg', 'Approving ' + fmt(total) + ' WBOT…');
  try {
    const allow = await token.allowance(owner, c.se);
    if (allow < total) { const tx = await token.approve(c.se, total); await tx.wait(); }
    const se = new ethers.Contract(c.se, SE_ABI, s);
    showMsg('dMsg', 'Sending createDeal…');
    const tx = await se.createDeal(freelancer, bigs);
    await tx.wait();
    showMsg('dMsg', 'Deal created ✓ (' + amts.length + ' milestones, ' + fmt(total) + ' WBOT escrowed)');
    refresh();
  } catch (e) { showMsg('dMsg', 'Failed: ' + (e.shortMessage || e.message || '').slice(0, 140)); }
}

async function act(msgId, fn) {
  const s = await signerOrAlert();
  if (!s) return;
  const idStr = $('aId')?.value;
  if (idStr === '' || idStr === undefined) return showMsg(msgId, 'Enter a deal ID');
  const id = BigInt(idStr);
  const se = new ethers.Contract(CONTRACTS[currentChainId].se, SE_ABI, s);
  try {
    await fn(se, id);
    refresh();
  } catch (e) { showMsg(msgId, 'Failed: ' + (e.shortMessage || e.message || '').slice(0, 140)); }
}

function boot() {
  readProvider = new ethers.JsonRpcProvider(currentChainId === 677 ? 'https://rpc.botchain.ai' : 'https://rpc.bohr.life');
  initAppKit();
  $('dBtn')?.addEventListener('click', doCreate);
  $('aRelease')?.addEventListener('click', () => act('aMsg', async (se, id) => {
    const mid = BigInt($('aMid')?.value || '0');
    showMsg('aMsg', 'Sending release…');
    const tx = await se.release(id, mid);
    await tx.wait();
    showMsg('aMsg', 'Milestone released ✓');
  }));
  $('aCancel')?.addEventListener('click', () => act('aMsg', async (se, id) => {
    showMsg('aMsg', 'Sending cancel…');
    const tx = await se.cancel(id);
    await tx.wait();
    showMsg('aMsg', 'Deal cancelled — refund sent ✓');
  }));
  $('aDispute')?.addEventListener('click', () => act('aMsg', async (se, id) => {
    showMsg('aMsg', 'Sending dispute…');
    const tx = await se.dispute(id);
    await tx.wait();
    showMsg('aMsg', 'Dispute opened ✓ (arbiter must resolve)');
  }));
  $('aResolve')?.addEventListener('click', () => act('aMsg', async (se, id) => {
    const payFree = $('aSplit')?.value === '1';
    showMsg('aMsg', 'Sending resolveDispute…');
    const tx = await se.resolveDispute(id, payFree);
    await tx.wait();
    showMsg('aMsg', 'Dispute resolved ✓');
  }));
  refresh();
  setInterval(refresh, 30000);
}
boot();
