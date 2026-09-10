#!/bin/bash
# ============================================================
# Trustive ICO — API Test Commands
# Base URL: http://localhost:3007
# Copy any curl command and paste it in Postman or terminal
# ============================================================

WALLET="0x1DE6383befD31A8700ba4EC3bAfc1aA4356FB00B"
BASE="http://localhost:3007"

echo ""
echo "========================================"
echo "  USER ROUTES (/api/user)"
echo "========================================"

# ----- Auth -----

echo ""
echo "--- 1. Signup ---"
curl -s -X POST "$BASE/api/user/signup" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"Test@1234"}'

echo ""
echo "--- 2. Login ---"
curl -s -X POST "$BASE/api/user/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test@1234"}'

echo ""
echo "--- 3. Verify Email (GET — needs real token) ---"
curl -s "$BASE/api/user/verify-email?token=PASTE_VERIFICATION_TOKEN_HERE"

echo ""
echo "--- 4. Link Wallet (needs JWT token from login) ---"
curl -s -X POST "$BASE/api/user/link-wallet" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer PASTE_JWT_TOKEN_HERE" \
  -d "{\"wallet_address\":\"$WALLET\"}"

# ----- Wallet Registration -----

echo ""
echo "--- 5. Register New User (wallet only) ---"
curl -s "$BASE/api/user/RegisterNewUser?wallet_address=$WALLET"

# ----- ICO Purchase Flow -----

echo ""
echo "--- 6. Create Signature (ETH, index 0) ---"
curl -s -X POST "$BASE/api/user/createSign" \
  -H "Content-Type: application/json" \
  -d "{\"index\":0,\"address\":\"$WALLET\",\"caller\":\"$WALLET\",\"amount\":\"0.01\"}"

echo ""
echo "--- 7. Create Signature (USDT, index 1) ---"
curl -s -X POST "$BASE/api/user/createSign" \
  -H "Content-Type: application/json" \
  -d "{\"index\":1,\"address\":\"$WALLET\",\"caller\":\"$WALLET\",\"amount\":\"10\"}"

echo ""
echo "--- 8. Create Signature (USDC, index 2) ---"
curl -s -X POST "$BASE/api/user/createSign" \
  -H "Content-Type: application/json" \
  -d "{\"index\":2,\"address\":\"$WALLET\",\"caller\":\"$WALLET\",\"amount\":\"10\"}"

echo ""
echo "--- 9. Create Purchase ---"
curl -s -X POST "$BASE/api/user/createPurchase" \
  -H "Content-Type: application/json" \
  -d "{\"address\":\"$WALLET\",\"CryptoValue\":\"0.01\",\"payment_type\":\"ETH\",\"trustive_tokens\":\"222.22\",\"transHash\":\"0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab\",\"USDvalue_of_crypto_purchased\":\"0\",\"status\":\"success\"}"

# ----- User Data -----

echo ""
echo "--- 10. Get User Data ---"
curl -s "$BASE/api/user/getUserData?address=$WALLET"

echo ""
echo "--- 11. Get Referral Data ---"
curl -s "$BASE/api/user/getRefferalData?address=$WALLET"

echo ""
echo "--- 12. Get Transaction Details ---"
curl -s "$BASE/api/user/getTransactionDetails?address=$WALLET"

# ----- Sale & Settings -----

echo ""
echo "--- 13. Get Active Sale ---"
curl -s "$BASE/api/user/getActiveSale"

echo ""
echo "--- 14. Get Settings ---"
curl -s "$BASE/api/user/getSettings"

# ----- Staking (User) -----

echo ""
echo "--- 15. Get Staking Plans ---"
curl -s "$BASE/api/user/staking/plans"

echo ""
echo "--- 16. Create Stake Record ---"
curl -s -X POST "$BASE/api/user/staking/stake" \
  -H "Content-Type: application/json" \
  -d "{\"user_address\":\"$WALLET\",\"amount\":\"1000\",\"plan_id\":1,\"tx_hash\":\"0xTEST_STAKE_TX_HASH\"}"

echo ""
echo "--- 17. Create Unstake Record ---"
curl -s -X POST "$BASE/api/user/staking/unstake" \
  -H "Content-Type: application/json" \
  -d '{"stake_id":1,"tx_hash":"0xTEST_UNSTAKE_TX_HASH","reward_amount":"50"}'

echo ""
echo "--- 18. Claim Staking Reward ---"
curl -s -X POST "$BASE/api/user/staking/claim-reward" \
  -H "Content-Type: application/json" \
  -d "{\"user_address\":\"$WALLET\",\"stake_id\":1,\"reward_amount\":\"25\",\"tx_hash\":\"0xTEST_CLAIM_TX_HASH\"}"

echo ""
echo "--- 19. Get User Stakes ---"
curl -s "$BASE/api/user/staking/user/$WALLET"

echo ""
echo "--- 20. Get User Staking Rewards ---"
curl -s "$BASE/api/user/staking/rewards/$WALLET"

echo ""
echo "--- 21. Get Staking Contract Info ---"
curl -s "$BASE/api/user/staking/contract-info"

# ----- Vesting (User) -----

echo ""
echo "--- 22. Get User Vestings ---"
curl -s "$BASE/api/user/vesting/$WALLET"

echo ""
echo "--- 23. Get Vesting Details (address, index 0) ---"
curl -s "$BASE/api/user/vesting/details/$WALLET/0"


echo ""
echo ""
echo "========================================"
echo "  ADMIN ROUTES (/api/admin)"
echo "========================================"

# ----- Admin Auth -----

echo ""
echo "--- 24. Admin Login ---"
curl -s -X POST "$BASE/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@trustive.com","password":"admin123"}'

echo ""
echo "--- 25. Admin Verify Token (needs JWT) ---"
curl -s "$BASE/api/admin/verify" \
  -H "Authorization: Bearer PASTE_ADMIN_JWT_HERE"

echo ""
echo "--- 26. Get Owner Address ---"
curl -s "$BASE/api/admin/get-owner-address"

echo ""
echo "--- 27. Admin Reset Password (needs JWT) ---"
curl -s -X POST "$BASE/api/admin/reset-password" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer PASTE_ADMIN_JWT_HERE" \
  -d '{"currentPassword":"admin123","newPassword":"newpass123"}'

# ----- Admin Dashboard -----

echo ""
echo "--- 28. Admin Dashboard ---"
curl -s "$BASE/api/admin/dashboard"

echo ""
echo "--- 29. Users List ---"
curl -s "$BASE/api/admin/users-list?page=1&limit=10"

# ----- Token Sales -----

echo ""
echo "--- 30. Get Active Sales ---"
curl -s "$BASE/api/admin/getActiveSales"

echo ""
echo "--- 31. Get All Active Sales ---"
curl -s "$BASE/api/admin/getAllActiveSales"

echo ""
echo "--- 32. Get Sale Data by ID ---"
curl -s "$BASE/api/admin/getSaledata/1"

echo ""
echo "--- 33. Create Sale ---"
curl -s -X POST "$BASE/api/admin/createSale" \
  -H "Content-Type: application/json" \
  -d '{"type":"presale","name":"Test Sale","quantity":"1000000","minimum":"10","maximum":"50000","start_at":"2026-04-15 00:00:00","end_at":"2026-05-15 00:00:00","price":"0.05"}'

echo ""
echo "--- 34. Update Sale ---"
curl -s -X POST "$BASE/api/admin/updateSale" \
  -H "Content-Type: application/json" \
  -d '{"id":1,"type":"presale","name":"Presale Round 1","quantity":"5000000","minimum":"10","maximum":"50000","start_at":"2026-01-01 00:00:00","end_at":"2026-12-31 00:00:00","status":"active","price":"0.045"}'

echo ""
echo "--- 35. Delete Sale ---"
curl -s -X DELETE "$BASE/api/admin/deleteSale/999"

# ----- Transactions -----

echo ""
echo "--- 36. Admin Get Transactions ---"
curl -s "$BASE/api/admin/getTransactionDetails?page=1&limit=10"

echo ""
echo "--- 37. Get Referral Claim Details ---"
curl -s "$BASE/api/admin/getreferralClaimDetails?page=1&limit=10"

# ----- Settings -----

echo ""
echo "--- 38. Get Admin Settings ---"
curl -s "$BASE/api/admin/settings"

echo ""
echo "--- 39. Update Settings ---"
curl -s -X POST "$BASE/api/admin/updateSettings" \
  -H "Content-Type: application/json" \
  -d '{"token_name":"Trustive","token_symbol":"Trustive","chain":"Sepolia","token_decimal":"18"}'

echo ""
echo "--- 40. Update Token Price ---"
curl -s -X POST "$BASE/api/admin/updateTokenPrice" \
  -H "Content-Type: application/json" \
  -d '{"sale_id":1,"price":"0.05"}'

# ----- Payment Settings -----

echo ""
echo "--- 41. Get Payment Settings ---"
curl -s "$BASE/api/admin/payment-settings"

echo ""
echo "--- 42. Update Payment Settings ---"
curl -s -X POST "$BASE/api/admin/payment-settings" \
  -H "Content-Type: application/json" \
  -d '{"payment_type":"ETH","is_active":true,"index":0}'

echo ""
echo "--- 43. Get Payment Settings History ---"
curl -s "$BASE/api/admin/getPaymentSettingsHistory"

# ----- Withdrawals -----

echo ""
echo "--- 44. Get Withdraw History ---"
curl -s "$BASE/api/admin/getWithdrawHistory"

echo ""
echo "--- 45. Create Withdraw ---"
curl -s -X POST "$BASE/api/admin/createWithdraw" \
  -H "Content-Type: application/json" \
  -d '{"tx_hash":"0xTEST_WITHDRAW_TX","amount":"100","token":"ETH","to_address":"0x1DE6383befD31A8700ba4EC3bAfc1aA4356FB00B"}'

# ----- Referrals -----

echo ""
echo "--- 46. Get Referral Percentage History ---"
curl -s "$BASE/api/admin/getReferralPercentageHistory"

echo ""
echo "--- 47. Get All Referral Data ---"
curl -s "$BASE/api/admin/getAllReferralData?page=1&limit=10"

echo ""
echo "--- 48. Get All Referral Users ---"
curl -s "$BASE/api/admin/getAllReferralUsers?page=1&limit=10"

echo ""
echo "--- 49. Get Global Claim History ---"
curl -s "$BASE/api/admin/getGlobalClaimHistory"

# ----- Price Oracle -----

echo ""
echo "--- 50. Fetch And Update ETH Price ---"
curl -s "$BASE/api/admin/fetchAndUpdatePrice"

# ----- Admin Vesting -----

echo ""
echo "--- 51. Get All Vestings ---"
curl -s "$BASE/api/admin/vestings?page=1&limit=10"

echo ""
echo "--- 52. Create Vesting ---"
curl -s -X POST "$BASE/api/admin/createVesting" \
  -H "Content-Type: application/json" \
  -d "{\"beneficiary\":\"$WALLET\",\"amount\":\"10000\",\"cliff_months\":1,\"vesting_months\":6,\"tx_hash\":\"0xTEST_VESTING_TX\",\"vesting_index\":0}"

echo ""
echo "--- 53. Revoke Vesting ---"
curl -s -X POST "$BASE/api/admin/revokeVesting" \
  -H "Content-Type: application/json" \
  -d '{"id":1,"tx_hash":"0xTEST_REVOKE_TX"}'

echo ""
echo "--- 54. Get Vesting Settings ---"
curl -s "$BASE/api/admin/vesting/settings"

echo ""
echo "--- 55. Toggle Vesting Settings ---"
curl -s -X POST "$BASE/api/admin/vesting/settings/toggle" \
  -H "Content-Type: application/json" \
  -d '{"key":"auto_vesting","value":true}'

# ----- Admin Staking -----

echo ""
echo "--- 56. Get All Staking Plans (Admin) ---"
curl -s "$BASE/api/admin/staking/plans"

echo ""
echo "--- 57. Create/Update Staking Plan ---"
curl -s -X POST "$BASE/api/admin/staking/plans" \
  -H "Content-Type: application/json" \
  -d '{"name":"Flexible","duration_days":0,"apy":8,"min_stake":"1000","is_active":1}'

echo ""
echo "--- 58. Toggle Staking Plan ---"
curl -s -X POST "$BASE/api/admin/staking/plans/toggle" \
  -H "Content-Type: application/json" \
  -d '{"id":1,"is_active":true}'

echo ""
echo "--- 59. Get All Stakes (Admin) ---"
curl -s "$BASE/api/admin/staking/all-stakes?page=1&limit=10"

echo ""
echo "--- 60. Get Staking Stats (Admin) ---"
curl -s "$BASE/api/admin/staking/stats"


echo ""
echo ""
echo "========================================"
echo "  DONE — 60 endpoints tested"
echo "========================================"
