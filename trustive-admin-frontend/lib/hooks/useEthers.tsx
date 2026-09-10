'use client';

import { useMemo } from 'react';
import { type Config, useClient, useConnectorClient } from 'wagmi';
import { BrowserProvider, JsonRpcProvider, JsonRpcSigner } from 'ethers';
import type { Account, Chain, Client, Transport } from 'viem';

export function clientToProvider(client: Client<Transport, Chain>) {
    const { chain, transport } = client;
    const network = {
        chainId: chain.id,
        name: chain.name,
        ensAddress: chain.contracts?.ensRegistry?.address,
    };
    if (transport.type === 'fallback') {
        const jsonRpcProviders = (transport.transports as ReturnType<Transport>[]).map(
            ({ value }) => new JsonRpcProvider(value?.url, network)
        );
        if (jsonRpcProviders.length === 1) return jsonRpcProviders[0];
        return new BrowserProvider(transport as any);
    }
    return new JsonRpcProvider(transport.url as string, network);
}

/** Action to convert a viem Client to an ethers.js Provider. */
export function useEthersProvider({ chainId }: { chainId?: number } = {}) {
    const client = useClient<Config>({ chainId });
    return useMemo(() => (client ? clientToProvider(client) : undefined), [client]);
}

export function clientToSigner(client: Client<Transport, Chain, Account>) {
    const { account, chain, transport } = client;
    const network = {
        chainId: chain.id,
        name: chain.name,
        ensAddress: chain.contracts?.ensRegistry?.address,
    };
    const provider = new BrowserProvider(transport as any, network);
    const signer = new JsonRpcSigner(provider, account.address);
    return signer;
}

/** Action to convert a viem ConnectorClient to an ethers.js Signer. */
export function useEthersSigner({ chainId }: { chainId?: number } = {}) {
    const { data: client } = useConnectorClient<Config>({ chainId });
    return useMemo(() => (client ? clientToSigner(client) : undefined), [client]);
}
