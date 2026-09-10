const { ethers } = require('ethers');

async function checkCode() {
    const RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';
    const addr = '0x5F5B51defEF8F508212042AE15f2ee4ABb21dfcb';
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    try {
        const code = await provider.getCode(addr);
        console.log(`Code length: ${code.length}`);
        if (code.length > 2) {
            console.log(`Code starts with: ${code.slice(0, 10)}`);
        }
    } catch (err) {
        console.error(err);
    }
}

checkCode();
