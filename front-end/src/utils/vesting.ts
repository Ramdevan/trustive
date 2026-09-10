export interface VestingClaim {
  period_index: number;
  amount: string;
  tx_hash: string;
  created_at?: string;
}

export interface VestingRecord {
  id: number;
  tx_hash: string;
  total_amount: string;
  cliff_months: number; // Contract units (1 unit = 2 minutes)
  vesting_months: number; // Contract units (1 unit = 2 minutes)
  start_at: string;
  status: string;
  display_status?: string;
  vesting_index: number;
  claims?: VestingClaim[];
  details?: {
    totalAmount: string;
    claimedAmount: string;
    claimableNow: string;
    remainingToClaim: string;
    cliffRemaining: string;
    vestingRemaining: string;
    cliffMonths?: string;
    vestingMonths?: string;
    claimedPeriods?: string | null;
    unlockedPeriods?: string | null;
    claimablePeriods?: string | null;
  };
}

// 1 contract unit = 2 real minutes
export const PERIOD_SECONDS = 120;

export const formatVestId = (v: VestingRecord) =>
  `VEST${String((v.vesting_index ?? 0) + 1).padStart(3, '0')}`;
