const { ethers } = require('ethers');

const RPC_URL = 'https://eth-sepolia-testnet.api.pocket.network';
const TOKEN_ADDRESS = '0xFf602986Fc0F3711F7E1251CfbD38a33Cc594d4D';

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
