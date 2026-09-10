const { ethers } = require('ethers');

async function checkPlans() {
    const RPC_URL = 'https://sepolia.gateway.tenderly.co';
    const addr = '0x5F5B51defEF8F508212042AE15f2ee4ABb21dfcb';
    const ABI = [
        "function planCount() view returns (uint256)",
        "function plans(uint256) view returns (uint256 duration, uint256 apy, uint256 minStake, bool active, uint256 totalStaked)"
    ];

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(addr, ABI, provider);
    try {
        const count = await contract.planCount();
        console.log(`Plan count: ${count}`);
        for (let i = 0; i < Number(count); i++) {
            const plan = await contract.plans(i);
            console.log(`Plan ${i}: minStake=${ethers.formatEther(plan.minStake)} Trustive active=${plan.active}`);
        }
    } catch (err) {
        console.log(`${err.message}`);
    }
}

checkPlans();
