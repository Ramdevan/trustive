const { ethers } = require('ethers');

async function checkBaseSepolia() {
    const RPC_URL = 'https://sepolia.base.org';
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const addr = '0x5F5B51defEF8F508212042AE15f2ee4ABb21dfcb';

    const ABI = [
        "function planCount() view returns (uint256)",
        "function plans(uint256) view returns (uint256 duration, uint256 apy, uint256 minStake, bool active, uint256 totalStaked)"
    ];

    const contract = new ethers.Contract(addr, ABI, provider);

    try {
        const count = await contract.planCount();
        console.log(`Plan count on Base Sepolia: ${count}`);

        for (let i = 0; i < Number(count); i++) {
            const plan = await contract.plans(i);
            console.log(`Plan ${i}:`);
            console.log(`  Duration: ${plan.duration}`);
            console.log(`  APY: ${plan.apy}`);
            console.log(`  Min Stake: ${ethers.formatEther(plan.minStake)} Trustive`);
            console.log(`  Active: ${plan.active}`);
        }
    } catch (err) {
        if (err.code === 'CALL_EXCEPTION') {
            console.log('Reverted on Base Sepolia too');
        } else {
            console.error(err);
        }
    }
}

checkBaseSepolia();
