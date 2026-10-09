# SureEscrow — milestone escrow on BOT Chain

Freelance payments held in code on **BOT Chain testnet (chain 968)**. The client funds the
full contract at deal creation; each milestone releases only its slice to the freelancer.
Disputes go to a contract arbiter — neither party can touch the funds mid-job.

## Pages

| Page | What it does |
|---|---|
| `index.html` | Landing — why escrow, the three money paths |
| `app.html` | Create deals, release/cancel/dispute milestones, arbiter resolve |
| `docs.html` | Deal lifecycle, contract API, demo activity, build & verify |

## On-chain (testnet)

- **SureEscrow:** [`0xDf9229a3242a84cAa2cdB4AEC4e1475AFf6AB080`](https://scan.bohr.life/address/0xDf9229a3242a84cAa2cdB4AEC4e1475AFf6AB080) — verified ✓
- **TestWBOT (escrow token):** [`0xD8FBaBf44B2dbb427d881F8Ea66F14D8287A55c0`](https://scan.bohr.life/address/0xD8FBaBf44B2dbb427d881F8Ea66F14D8287A55c0) — `faucet()` mints 1,000 per tx
- Chain: `968` · RPC `https://rpc.bohr.life` · explorer `https://scan.bohr.life`

## Core API

```
createDeal(freelancer, milestoneAmounts)   — client escrows the full total
release(dealId, milestoneIdx)              — client pays out one milestone
cancel(dealId)                             — client cancels before any release
dispute(dealId) / resolveDispute(dealId, payFreelancer)  — arbiter decides the split
getDeal(dealId)                            — full state incl. per-milestone flags
```

Events: `DealCreated`, `MilestoneReleased`, `DealCancelled`, `DealDisputed`, `DisputeResolved`.

## Run locally

Static site — any file server works:

```bash
npx serve .
```

## Stack

- Vanilla HTML/CSS/JS (no build step)
- [ethers.js 6](https://docs.ethers.org/) via esm.sh
- [Reown AppKit](https://reown.com/appkit) for wallet connect
- Testnet tokens only — no monetary value
