import { toWei } from "../common/constants";

export * from "../common/constants";

export const MAX_SWAP_FEE = toWei("0.95");
export const PRICE_DEVIATION = toWei(0.0001); // Deviation percentage of prices.
export const MIN_FEE_DURATION = 2 * 30 * 24 * 60 * 60; // Minimum period to charge guaranteed management fee.
export const MIN_RELIABLE_VAULT_VALUE = toWei(1); // Minimum reliable vault TVL in base token
export const MIN_SIGNIFICANT_DEPOSIT_VALUE = toWei(20); // Minimum significant deposit value. It will be measured in base token terms.
export const MIN_YIELD_ACTION_THRESHOLD = toWei(0.01); // Minimum action threshold for yield bearing assets. It will be measured in base token terms.
export const MAX_ORACLE_SPOT_DIVERGENCE = toWei(1.1); // Maximum oracle spot price divergence.
export const MAX_ORACLE_DELAY = 5 * 60 * 60; // Maximum update delay of oracles.
