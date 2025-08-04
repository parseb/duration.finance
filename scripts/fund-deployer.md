# Deploy DurationOptionsSimplified Contract

## Issue: Deployer Address Mismatch

- **Expected deployer**: `0xFeef9E212dc42ca1809f3f2d8D9D65745ecA2d0b`
- **Current DEPLOYER_PRIVATE_KEY maps to**: `0x709ef2CBa57dfB96704aC10FB739c9dFF8B9e5Fe`

## Options to Resolve:

### Option 1: Update Private Key (Recommended)
Update the `.env` file so that `DEPLOYER_PRIVATE_KEY` corresponds to `0xFeef9E212dc42ca1809f3f2d8D9D65745ecA2d0b`.

### Option 2: Fund Current Address
Fund the current deployer address and proceed with deployment.

**Account to fund**: `0x709ef2CBa57dfB96704aC10FB739c9dFF8B9e5Fe`  
**Required Amount**: ~0.000003 ETH (about $0.01 USD)

#### Get Base Sepolia ETH:
1. **Coinbase Faucet**: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
2. **Alchemy Faucet**: https://www.alchemy.com/faucets/base-sepolia
3. **QuickNode Faucet**: https://faucet.quicknode.com/base/sepolia

## Deploy After Resolution

```bash
cd /home/pbq1/Desktop/baseo/duration.finance
PRIVATE_KEY=${DEPLOYER_PRIVATE_KEY} forge script script/DeploySimplified.s.sol:DeploySimplified --rpc-url https://api.developer.coinbase.com/rpc/v1/base-sepolia/TNex2pEzC3zyFXIqPdOR5yHEem1SRy0P --broadcast --verify --etherscan-api-key KPHCNFUKC5A6ZEVFR52R5D8UT4Y3MQ8ATA
```

**Expected deployment address**: `0x9FC6E5Ff91D2be55b9ee25eD5b64DFB1020eBC44`

## Environment Variable Update

After successful deployment, add this to your `.env`:
```
NEXT_PUBLIC_DURATION_OPTIONS_SIMPLIFIED_ADDRESS_BASE_SEPOLIA=0x9FC6E5Ff91D2be55b9ee25eD5b64DFB1020eBC44
```