/**
 * Which action a stake row offers, derived from the lock period against the
 * current clock. Kept free of React so the transition can be reasoned about
 * (and checked) on its own.
 */
export type StakeActionKind = 'claim' | 'emergency' | 'none';

export interface StakeActionState {
  /** 'emergency' while the lock period runs, 'claim' once it has ended */
  kind: StakeActionKind;
  /** false when the stake has no on-chain index to act on */
  enabled: boolean;
  lockExpired: boolean;
  /** Lock end as epoch ms, or null for a stake with no expiry */
  endsAt: number | null;
}

export interface StakeActionInput {
  status: 'active' | 'completed' | 'unstaked';
  end_at: string | null;
  chain_stake_index: number | null;
}

export const getStakeAction = (stake: StakeActionInput, now: number): StakeActionState => {
  const parsed = stake.end_at ? new Date(stake.end_at).getTime() : NaN;
  const endsAt = Number.isNaN(parsed) ? null : parsed;
  // No end date (or an unparseable one) means nothing is holding the stake
  const lockExpired = endsAt === null || now > endsAt;

  // A withdrawn stake offers nothing
  if (stake.status === 'unstaked') return { kind: 'none', enabled: false, lockExpired, endsAt };

  return {
    kind: lockExpired ? 'claim' : 'emergency',
    enabled: stake.chain_stake_index != null,
    lockExpired,
    endsAt,
  };
};
