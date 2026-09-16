/**
 * Centralized RPC Provider with rotational failover.
 *
 * Maintains a list of 5 public BSC Testnet RPC endpoints and automatically
 * rotates to the next one when a call fails.  The working provider is
 * cached for CACHE_TTL ms so every request doesn't probe all endpoints.
 *
 * Usage:
 *   const { getProvider } = require('../Utils/rpcProvider');
 *   const provider = await getProvider();
 */

const { ethers } = require('ethers');

// ── 5+ public BSC Testnet RPC endpoints (rotational order) ──────────────
const RPC_ENDPOINTS = [
    process.env.RPC_URL || 'https://bsc-testnet-rpc.publicnode.com',
    'https://bsc-testnet-rpc.publicnode.com',
    'https://data-seed-prebsc-1-s1.binance.org:8545',
    'https://data-seed-prebsc-2-s1.binance.org:8545',
    'https://data-seed-prebsc-1-s3.binance.org:8545',
    'https://data-seed-prebsc-2-s3.binance.org:8545',
    'https://bsc-testnet.drpc.org',
];

// De-duplicate (e.g. when RPC_URL equals one of the hardcoded URLs)
const UNIQUE_RPCS = [...new Set(RPC_ENDPOINTS)];

const CACHE_TTL = 120_000;        // 2 minutes – re-probe after this
const CONNECT_TIMEOUT = 4_000;    // per-endpoint probe timeout

let _cachedProvider = null;
let _cachedIndex = 0;             // index of the currently-active endpoint
let _lastProbeTime = 0;

/**
 * Probe a single RPC URL – returns a connected JsonRpcProvider or null.
 */
async function probeRpc(url) {
    try {
        const provider = new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true });
        await Promise.race([
            provider.getBlockNumber(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('RPC probe timeout')), CONNECT_TIMEOUT)
            ),
        ]);
        return provider;
    } catch {
        return null;
    }
}

/**
 * Get a working JsonRpcProvider.
 *
 * 1. If the cached provider is still fresh, return it immediately.
 * 2. Otherwise, start probing from the *next* endpoint in the list
 *    (round-robin) so that a permanently-dead endpoint is skipped.
 * 3. If every endpoint fails, return the last known good provider
 *    (or throw if there has never been one).
 */
async function getProvider() {
    // Fast path – return cached provider
    if (_cachedProvider && Date.now() - _lastProbeTime < CACHE_TTL) {
        return _cachedProvider;
    }

    const total = UNIQUE_RPCS.length;
    const startIndex = (_cachedIndex + 1) % total; // begin after last winner

    for (let i = 0; i < total; i++) {
        const idx = (startIndex + i) % total;
        const url = UNIQUE_RPCS[idx];

        const provider = await probeRpc(url);
        if (provider) {
            _cachedProvider = provider;
            _cachedIndex = idx;
            _lastProbeTime = Date.now();
            console.log(`[RPC] Using endpoint #${idx}: ${url}`);
            return provider;
        }
        console.warn(`[RPC] Endpoint #${idx} failed: ${url}`);
    }

    // All probes failed – return stale provider if we have one
    if (_cachedProvider) {
        console.warn('[RPC] All endpoints failed, reusing last known good provider');
        return _cachedProvider;
    }

    throw new Error('[RPC] All BSC Testnet RPC endpoints are unreachable');
}

/**
 * Force-invalidate the cache so the next getProvider() call re-probes.
 * Useful after catching a mid-request RPC error.
 */
function invalidateProvider() {
    _lastProbeTime = 0;
}

/**
 * Execute an async callback with automatic RPC failover.
 *
 * If the callback throws (e.g. network error), the cache is invalidated,
 * a fresh provider is obtained, and the callback is retried once.
 *
 * @param {(provider: ethers.JsonRpcProvider) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withFailover(fn) {
    try {
        const provider = await getProvider();
        return await fn(provider);
    } catch (err) {
        console.warn('[RPC] Call failed, rotating provider:', err.message);
        invalidateProvider();
        const provider = await getProvider();
        return await fn(provider);
    }
}

module.exports = {
    getProvider,
    invalidateProvider,
    withFailover,
    RPC_ENDPOINTS: UNIQUE_RPCS,
};
