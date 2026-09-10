const { ethers } = require('ethers');

const RPC_URL = 'https://eth-sepolia-testnet.api.pocket.network';
const TOKEN_ADDRESS = '0xe12F60d7c0bc493b033c789Aa533E772541041eA';

async function checkToken() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const abi = [
        'function decimals() view returns (uint8)',
        'function symbol() view returns (string)',
        'function name() view returns (string)'
    ];
    const contract = new ethers.Contract(TOKEN_ADDRESS, abi, provider);

    try {
        const [decimals, symbol, name] = await Promise.all([
            contract.decimals(),
            contract.symbol(),
            contract.name()
        ]);
        console.log(`Token: ${name} (${symbol})`);
        console.log(`Decimals: ${decimals}`);
    } catch (err) {
        console.error('Error checking token:', err.message);
    }
}

checkToken();
