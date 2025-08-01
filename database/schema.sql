-- Duration.Finance Database Schema
-- Drop existing tables and recreate to ensure clean state

-- Drop existing tables if they exist
DROP TABLE IF EXISTS active_options CASCADE;
DROP TABLE IF EXISTS commitments CASCADE;

-- Create commitments table for off-chain LP commitment storage
CREATE TABLE commitments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lp_address VARCHAR(42) NOT NULL,
    asset_address VARCHAR(42) NOT NULL,
    amount NUMERIC(78, 0) NOT NULL, -- BigInt support for wei amounts
    daily_premium_usdc NUMERIC(18, 6) NOT NULL, -- USDC amount with 6 decimals
    min_lock_days INTEGER NOT NULL,
    max_duration_days INTEGER NOT NULL,
    option_type SMALLINT NOT NULL CHECK (option_type IN (0, 1)), -- 0=CALL, 1=PUT
    expiry BIGINT NOT NULL, -- Unix timestamp
    nonce BIGINT NOT NULL,
    is_framentable BOOLEAN NOT NULL DEFAULT false,
    signature TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    taken_at TIMESTAMP NULL,
    
    -- Constraints
    CONSTRAINT check_amount_positive CHECK (amount > 0),
    CONSTRAINT check_premium_positive CHECK (daily_premium_usdc > 0),
    CONSTRAINT check_duration_valid CHECK (min_lock_days > 0 AND max_duration_days >= min_lock_days),
    CONSTRAINT check_expiry_future CHECK (expiry > EXTRACT(EPOCH FROM NOW())),
    CONSTRAINT check_nonce_positive CHECK (nonce >= 0)
);

-- Create active_options table for on-chain positions
CREATE TABLE active_options (
    position_hash VARCHAR(66) PRIMARY KEY, -- bytes32 as hex string
    commitment_id UUID REFERENCES commitments(id),
    taker_address VARCHAR(42) NOT NULL, -- Always the option holder
    lp_address VARCHAR(42) NOT NULL, -- Always provides collateral
    asset_address VARCHAR(42) NOT NULL,
    amount NUMERIC(78, 0) NOT NULL, -- Asset amount in wei
    strike_price NUMERIC(78, 0) NOT NULL, -- Strike price in wei (18 decimals)
    premium_paid_usdc NUMERIC(18, 6) NOT NULL, -- Premium in USDC
    option_type SMALLINT NOT NULL CHECK (option_type IN (0, 1)), -- 0=CALL, 1=PUT
    expiry_timestamp TIMESTAMP NOT NULL,
    exercise_status VARCHAR(20) DEFAULT 'active' CHECK (exercise_status IN ('active', 'exercised', 'expired', 'liquidated')),
    created_at TIMESTAMP DEFAULT NOW(),
    exercised_at TIMESTAMP NULL,
    
    -- Constraints
    CONSTRAINT check_option_amount_positive CHECK (amount > 0),
    CONSTRAINT check_strike_price_positive CHECK (strike_price > 0),
    CONSTRAINT check_premium_positive_options CHECK (premium_paid_usdc > 0)
);

-- Create indexes for efficient querying
CREATE INDEX idx_commitments_lp_address ON commitments(lp_address);
CREATE INDEX idx_commitments_asset_address ON commitments(asset_address);
CREATE INDEX idx_commitments_expiry ON commitments(expiry);
CREATE INDEX idx_commitments_taken_at ON commitments(taken_at);
CREATE INDEX idx_commitments_active ON commitments(lp_address, taken_at) WHERE taken_at IS NULL;

CREATE INDEX idx_active_options_taker ON active_options(taker_address);
CREATE INDEX idx_active_options_lp ON active_options(lp_address);
CREATE INDEX idx_active_options_asset ON active_options(asset_address);
CREATE INDEX idx_active_options_expiry ON active_options(expiry_timestamp);
CREATE INDEX idx_active_options_status ON active_options(exercise_status);

-- Create a view for easy querying of available commitments
CREATE VIEW available_commitments AS
SELECT 
    id,
    lp_address,
    asset_address,
    amount,
    daily_premium_usdc,
    min_lock_days,
    max_duration_days,
    option_type,
    expiry,
    nonce,
    is_framentable,
    signature,
    created_at,
    CASE 
        WHEN option_type = 0 THEN 'CALL'
        WHEN option_type = 1 THEN 'PUT'
        ELSE 'UNKNOWN'
    END as option_type_name,
    EXTRACT(EPOCH FROM (to_timestamp(expiry) - NOW())) / 86400 as days_until_expiry
FROM commitments 
WHERE taken_at IS NULL 
  AND expiry > EXTRACT(EPOCH FROM NOW())
ORDER BY created_at DESC;

-- Create a view for portfolio tracking
CREATE VIEW user_portfolio AS
SELECT 
    ao.taker_address as user_address,
    'taker' as position_type,
    ao.position_hash,
    ao.asset_address,
    ao.amount,
    ao.strike_price,
    ao.premium_paid_usdc as premium_amount,
    ao.option_type,
    ao.expiry_timestamp,
    ao.exercise_status,
    ao.created_at,
    CASE 
        WHEN ao.option_type = 0 THEN 'CALL'
        WHEN ao.option_type = 1 THEN 'PUT'
        ELSE 'UNKNOWN'
    END as option_type_name
FROM active_options ao
WHERE ao.exercise_status = 'active'

UNION ALL

SELECT 
    ao.lp_address as user_address,
    'lp' as position_type,
    ao.position_hash,
    ao.asset_address,
    ao.amount,
    ao.strike_price,
    ao.premium_paid_usdc as premium_amount,
    ao.option_type,
    ao.expiry_timestamp,
    ao.exercise_status,
    ao.created_at,
    CASE 
        WHEN ao.option_type = 0 THEN 'CALL'
        WHEN ao.option_type = 1 THEN 'PUT'
        ELSE 'UNKNOWN'
    END as option_type_name
FROM active_options ao
WHERE ao.exercise_status = 'active';

-- Function to clean up expired commitments
CREATE OR REPLACE FUNCTION cleanup_expired_commitments()
RETURNS INTEGER AS $$
DECLARE 
    expired_count INTEGER;
BEGIN
    DELETE FROM commitments 
    WHERE taken_at IS NULL 
      AND expiry <= EXTRACT(EPOCH FROM NOW());
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get commitment statistics
CREATE OR REPLACE FUNCTION get_commitment_stats()
RETURNS TABLE(
    total_active INTEGER,
    total_expired INTEGER,
    total_taken INTEGER,
    avg_daily_premium NUMERIC,
    total_locked_weth NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_active,
        (SELECT COUNT(*)::INTEGER FROM commitments WHERE taken_at IS NULL AND expiry <= EXTRACT(EPOCH FROM NOW())) as total_expired,
        (SELECT COUNT(*)::INTEGER FROM commitments WHERE taken_at IS NOT NULL) as total_taken,
        AVG(daily_premium_usdc)::NUMERIC as avg_daily_premium,
        SUM(amount::NUMERIC / 1e18)::NUMERIC as total_locked_weth
    FROM commitments 
    WHERE taken_at IS NULL 
      AND expiry > EXTRACT(EPOCH FROM NOW());
END;
$$ LANGUAGE plpgsql;

-- Insert sample data for testing (optional)
-- Uncomment the following lines to insert sample commitments

/*
INSERT INTO commitments (
    lp_address, 
    asset_address, 
    amount, 
    daily_premium_usdc, 
    min_lock_days, 
    max_duration_days, 
    option_type, 
    expiry, 
    nonce, 
    is_framentable, 
    signature
) VALUES 
(
    '0x742d35Cc6635C0532925a3b8D7AA25b0c7c0C3d3',
    '0x4200000000000000000000000000000000000006', -- WETH on Base
    '500000000000000000', -- 0.5 ETH in wei
    50.00, -- $50 daily premium
    1, -- Min 1 day
    14, -- Max 14 days
    0, -- CALL
    EXTRACT(EPOCH FROM NOW() + INTERVAL '24 hours')::BIGINT, -- Expires in 24 hours
    123456, -- Sample nonce
    true, -- Framentable
    '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' -- Mock signature
),
(
    '0x8ba1f109551bD432803012645Hac136c42Ed14e2',
    '0x4200000000000000000000000000000000000006', -- WETH on Base
    '1000000000000000000', -- 1 ETH in wei
    80.00, -- $80 daily premium
    3, -- Min 3 days
    30, -- Max 30 days
    1, -- PUT
    EXTRACT(EPOCH FROM NOW() + INTERVAL '48 hours')::BIGINT, -- Expires in 48 hours
    789012, -- Sample nonce
    false, -- Not framentable
    '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' -- Mock signature
);
*/

-- Final verification queries
SELECT 'Database schema created successfully' as status;
SELECT * FROM get_commitment_stats();