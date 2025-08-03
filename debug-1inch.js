// Quick test of 1inch API
const ONEINCH_API_KEY = 'TyyifghunHnM2xDV19qUpKeCWZHPB3x3';
const ONEINCH_API_URL = 'https://api.1inch.dev';
const BASE_CHAIN_ID = 8453;

async function test1inch() {
  const fromToken = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'; // Native ETH
  const toToken = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC
  const amount = '1000000000000000000'; // 1 ETH in wei

  const url = `${ONEINCH_API_URL}/swap/v6.0/${BASE_CHAIN_ID}/quote?` +
    `src=${fromToken}&dst=${toToken}&amount=${amount}&includeProtocols=true&includeGas=true`;

  console.log('🔗 URL:', url);

  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'Duration.Finance/1.0',
    'Authorization': `Bearer ${ONEINCH_API_KEY}`,
  };

  console.log('📨 Headers:', headers);

  try {
    const response = await fetch(url, { headers });
    
    console.log('📡 Response status:', response.status);
    console.log('📡 Response headers:', Object.fromEntries(response.headers));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error response:', errorText);
      return;
    }

    const data = await response.json();
    console.log('✅ Success response:', JSON.stringify(data, null, 2));
    
    const usdcAmount = parseInt(data.toAmount || data.dstAmount) / 1e6;
    console.log('💰 Calculated WETH price: $' + usdcAmount);

  } catch (error) {
    console.error('💥 Fetch error:', error.message);
  }
}

test1inch();