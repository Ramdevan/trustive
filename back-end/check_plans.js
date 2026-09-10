const { ethers } = require('ethers');

async function checkPlans() {
    const RPC_URL = 'https://eth-sepolia-testnet.api.pocket.network';
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const addr = '0x5F5B51defEF8F508212042AE15f2ee4ABb21dfcb';

    // Minimal ABI to check plans
    const ABI = [
        "function totalPlans() view returns (uint256)",
        "function getPlanDetails(uint256) view returns (uint256 rewardPercent, uint256 durationLimit, bool active, bool exists)"
    ];

    const contract = new ethers.Contract(addr, ABI, provider);

    try {
        const count = await contract.totalPlans();
        console.log(`Total Plans: ${count}`);

        for (let i = 1; i <= Number(count); i++) {
            const plan = await contract.getPlanDetails(i);
            console.log(`Plan ${i}:`);
            console.log(`  Duration: ${plan.durationLimit} seconds`);
            console.log(`  APY: ${plan.rewardPercent}%`);
            console.log(`  Active: ${plan.active}`);
            console.log(`  Exists: ${plan.exists}`);
        }
    } catch (err) {
        console.error(err);
    }
}

checkPlans();
