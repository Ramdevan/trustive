const { ethers } = require('ethers');

async function checkPlan0() {
    const RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const addr = '0x5F5B51defEF8F508212042AE15f2ee4ABb21dfcb';

    const ABI = [
        "function plans(uint256) view returns (uint256 duration, uint256 apy, uint256 minStake, bool active, uint256 totalStaked)"
    ];

    const contract = new ethers.Contract(addr, ABI, provider);

    try {
        const plan = await contract.plans(0);
        console.log(`Plan 0:`);
        console.log(`  Duration: ${plan.duration}`);
        console.log(`  APY: ${plan.apy}`);
        console.log(`  Min Stake: ${ethers.formatEther(plan.minStake)} Trustive`);
        console.log(`  Active: ${plan.active}`);
    } catch (err) {
        console.error(err);
    }
}

checkPlan0();
