-- Migration: Duration-Centric Pricing Model
-- Changes the protocol from static target prices to daily premium rates
-- This enables a duration-yield marketplace where LPs compete on daily rates

BEGIN;

-- Add new columns to support duration-centric model
ALTER TABLE commitments 
ADD COLUMN daily_premium_usdc NUMERIC,           -- LP daily premium rate
ADD COLUMN min_lock_days INTEGER,                -- LP minimum lock period
ADD COLUMN max_duration_days INTEGER,            -- LP maximum duration
ADD COLUMN requested_duration_days INTEGER,      -- Taker requested duration
ADD COLUMN taken_duration_days INTEGER,          -- Actual duration when taken
ADD COLUMN is_fractionable BOOLEAN DEFAULT false,
ADD COLUMN lp_yield_daily NUMERIC,               -- Calculated daily yield %
ADD COLUMN lp_yield_annualized NUMERIC;          -- Calculated annualized yield %

-- Update active_options table for duration tracking
ALTER TABLE active_options
ADD COLUMN daily_premium_usdc NUMERIC,
ADD COLUMN lock_duration_days INTEGER,
ADD COLUMN total_premium_paid NUMERIC,
ADD COLUMN lp_daily_yield NUMERIC;

-- Drop old constraint checks
ALTER TABLE commitments
DROP CONSTRAINT IF EXISTS check_lp_commitment,
DROP CONSTRAINT IF EXISTS check_taker_commitment;

-- Add new constraint checks for duration-centric model
ALTER TABLE commitments
ADD CONSTRAINT check_lp_commitment_v2 CHECK (
    lp_address IS NULL OR (
        daily_premium_usdc > 0 AND 
        min_lock_days >= 1 AND 
        max_duration_days >= min_lock_days AND
        requested_duration_days IS NULL
    )
),
ADD CONSTRAINT check_taker_commitment_v2 CHECK (
    taker_address IS NULL OR (
        daily_premium_usdc IS NULL AND 
        requested_duration_days > 0 AND
        min_lock_days IS NULL AND
        max_duration_days IS NULL
    )
),
ADD CONSTRAINT check_duration_range CHECK (
    min_lock_days IS NULL OR max_duration_days IS NULL OR min_lock_days <= max_duration_days
),
ADD CONSTRAINT check_positive_daily_premium CHECK (
    daily_premium_usdc IS NULL OR daily_premium_usdc > 0
);

-- Create indexes for efficient filtering and sorting
CREATE INDEX IF NOT EXISTS idx_commitments_daily_premium ON commitments(daily_premium_usdc) WHERE daily_premium_usdc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commitments_duration_range ON commitments(min_lock_days, max_duration_days) WHERE min_lock_days IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commitments_lp_yield ON commitments(lp_yield_daily) WHERE lp_yield_daily IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commitments_asset_available ON commitments(asset_address, taken_at) WHERE taken_at IS NULL;

-- Create compound index for marketplace queries
CREATE INDEX IF NOT EXISTS idx_commitments_marketplace ON commitments(
    asset_address, 
    taken_at, 
    daily_premium_usdc, 
    min_lock_days, 
    max_duration_days
) WHERE taken_at IS NULL AND lp_address IS NOT NULL;

-- Add indexes to active_options for portfolio queries
CREATE INDEX IF NOT EXISTS idx_active_options_duration ON active_options(lock_duration_days);
CREATE INDEX IF NOT EXISTS idx_active_options_premium ON active_options(daily_premium_usdc, total_premium_paid);

-- Create view for marketplace liquidity with calculated metrics
CREATE OR REPLACE VIEW marketplace_liquidity AS
SELECT 
    c.id,
    c.lp_address,
    c.asset_address,
    c.amount,
    c.daily_premium_usdc,
    c.min_lock_days,
    c.max_duration_days,
    c.is_fractionable,
    c.option_type,
    c.created_at,
    c.expiry,
    -- Calculate collateral value (amount * current_price from external source)
    c.amount * 3836.50 as estimated_collateral_value_usd,
    -- Calculate daily yield (will be updated by backend with real prices)
    CASE 
        WHEN c.amount > 0 AND c.daily_premium_usdc > 0 
        THEN (c.daily_premium_usdc / (c.amount * 3836.50)) * 100
        ELSE 0
    END as daily_yield_percent,
    -- Calculate annualized yield
    CASE 
        WHEN c.amount > 0 AND c.daily_premium_usdc > 0 
        THEN (c.daily_premium_usdc / (c.amount * 3836.50)) * 365 * 100
        ELSE 0
    END as annualized_yield_percent
FROM commitments c
WHERE c.taken_at IS NULL 
  AND c.lp_address IS NOT NULL
  AND c.daily_premium_usdc IS NOT NULL
  AND c.expiry > NOW();

-- Create function to calculate premium for a given duration
CREATE OR REPLACE FUNCTION calculate_premium_for_duration(
    commitment_id UUID,
    duration_days INTEGER
) RETURNS NUMERIC AS $$
DECLARE
    daily_premium NUMERIC;
    min_days INTEGER;
    max_days INTEGER;
BEGIN
    SELECT daily_premium_usdc, min_lock_days, max_duration_days
    INTO daily_premium, min_days, max_days
    FROM commitments
    WHERE id = commitment_id AND lp_address IS NOT NULL;
    
    -- Check if duration is within acceptable range
    IF daily_premium IS NULL OR duration_days < min_days OR duration_days > max_days THEN
        RETURN NULL;
    END IF;
    
    RETURN daily_premium * duration_days;
END;
$$ LANGUAGE plpgsql;

-- Update existing data (if any) to set default values
UPDATE commitments SET 
    is_fractionable = false,
    min_lock_days = 1,
    max_duration_days = 7
WHERE lp_address IS NOT NULL AND daily_premium_usdc IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN commitments.daily_premium_usdc IS 'LP daily premium rate in USDC - amount charged per day of option duration';
COMMENT ON COLUMN commitments.min_lock_days IS 'Minimum duration in days that LP accepts for option lock';
COMMENT ON COLUMN commitments.max_duration_days IS 'Maximum duration in days that LP accepts for option lock';
COMMENT ON COLUMN commitments.requested_duration_days IS 'Taker requested duration in days (for taker commitments only)';
COMMENT ON COLUMN commitments.taken_duration_days IS 'Actual duration when option was taken';

COMMIT;