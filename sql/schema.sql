-- Duration.Finance Database Schema
-- PostgreSQL schema for Duration.Finance options protocol

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- LP Commitments Table (offchain storage until taken)
CREATE TABLE lp_commitments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lp_address VARCHAR(42) NOT NULL,
    asset_address VARCHAR(42) NOT NULL,
    amount DECIMAL(20, 8) NOT NULL CHECK (amount >= 0.1 AND amount <= 1000),
    target_price DECIMAL(20, 8) NOT NULL CHECK (target_price > 0),
    max_duration INTEGER NOT NULL CHECK (max_duration >= 86400 AND max_duration <= 31536000), -- 1 day to 1 year in seconds
    fractionable BOOLEAN NOT NULL DEFAULT true,
    signature TEXT NOT NULL,
    nonce INTEGER NOT NULL,
    expiry BIGINT NOT NULL, -- Unix timestamp in milliseconds
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    taken_at TIMESTAMP WITH TIME ZONE,
    commitment_hash VARCHAR(66) NOT NULL UNIQUE, -- 0x + 64 hex chars
    
    -- Indexes
    INDEX idx_lp_commitments_lp_address (lp_address),
    INDEX idx_lp_commitments_asset (asset_address),
    INDEX idx_lp_commitments_expiry (expiry),
    INDEX idx_lp_commitments_taken (taken_at),
    INDEX idx_lp_commitments_hash (commitment_hash)
);

-- Active Options Table (onchain positions)
CREATE TABLE active_options (
    id SERIAL PRIMARY KEY,
    position_hash VARCHAR(66) NOT NULL UNIQUE, -- Onchain position hash
    commitment_id UUID REFERENCES lp_commitments(id),
    taker_address VARCHAR(42) NOT NULL,
    lp_address VARCHAR(42) NOT NULL,
    asset_address VARCHAR(42) NOT NULL,
    amount_taken DECIMAL(20, 8) NOT NULL,
    target_price DECIMAL(20, 8) NOT NULL,
    premium_paid DECIMAL(20, 8) NOT NULL,
    expiry_timestamp BIGINT NOT NULL,
    option_type VARCHAR(4) NOT NULL CHECK (option_type IN ('CALL', 'PUT')),
    exercise_status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (exercise_status IN ('active', 'exercised', 'expired', 'liquidated')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    exercised_at TIMESTAMP WITH TIME ZONE,
    settlement_tx_hash VARCHAR(66),
    settlement_method VARCHAR(20) CHECK (settlement_method IN ('LIMIT_ORDER', 'UNOSWAP', 'GENERIC_ROUTER')),
    profit_realized DECIMAL(20, 8),
    protocol_fee_paid DECIMAL(20, 8),
    
    -- Indexes
    INDEX idx_active_options_taker (taker_address),
    INDEX idx_active_options_lp (lp_address),
    INDEX idx_active_options_status (exercise_status),
    INDEX idx_active_options_expiry (expiry_timestamp),
    INDEX idx_active_options_asset (asset_address)
);

-- User Sessions Table (for mini app authentication)
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_address VARCHAR(42) NOT NULL,
    farcaster_fid INTEGER,
    notification_token TEXT,
    notification_url TEXT,
    session_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Indexes
    INDEX idx_user_sessions_address (user_address),
    INDEX idx_user_sessions_fid (farcaster_fid),
    INDEX idx_user_sessions_active (last_active)
);

-- Price History Table (for analytics and charts)
CREATE TABLE price_history (
    id SERIAL PRIMARY KEY,
    asset_address VARCHAR(42) NOT NULL,
    price DECIMAL(20, 8) NOT NULL,
    timestamp BIGINT NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT '1inch_oracle',
    volume_24h DECIMAL(20, 8),
    
    -- Indexes
    INDEX idx_price_history_asset_time (asset_address, timestamp),
    INDEX idx_price_history_timestamp (timestamp)
);

-- Protocol Analytics Table
CREATE TABLE protocol_analytics (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    total_volume DECIMAL(20, 8) NOT NULL DEFAULT 0,
    total_premiums DECIMAL(20, 8) NOT NULL DEFAULT 0,
    total_fees DECIMAL(20, 8) NOT NULL DEFAULT 0,
    active_commitments INTEGER NOT NULL DEFAULT 0,
    active_options INTEGER NOT NULL DEFAULT 0,
    unique_users INTEGER NOT NULL DEFAULT 0,
    avg_option_duration INTEGER, -- Average in seconds
    most_traded_asset VARCHAR(42),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint on date
    UNIQUE(date),
    INDEX idx_protocol_analytics_date (date)
);

-- Transaction Log Table (for audit trail)
CREATE TABLE transaction_log (
    id SERIAL PRIMARY KEY,
    tx_hash VARCHAR(66) NOT NULL,
    tx_type VARCHAR(50) NOT NULL, -- 'commitment_created', 'option_taken', 'option_exercised', etc.
    user_address VARCHAR(42) NOT NULL,
    contract_address VARCHAR(42) NOT NULL,
    gas_used INTEGER,
    gas_price BIGINT,
    block_number BIGINT,
    block_timestamp TIMESTAMP WITH TIME ZONE,
    event_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Indexes
    INDEX idx_transaction_log_hash (tx_hash),
    INDEX idx_transaction_log_user (user_address),
    INDEX idx_transaction_log_type (tx_type),
    INDEX idx_transaction_log_block (block_number)
);

-- Notification Queue Table
CREATE TABLE notification_queue (
    id SERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB,
    scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Indexes
    INDEX idx_notification_queue_user (user_address),
    INDEX idx_notification_queue_scheduled (scheduled_for),
    INDEX idx_notification_queue_status (sent_at, failed_at)
);

-- Views for common queries

-- Active commitments view (not yet taken, not expired)
CREATE VIEW active_commitments AS
SELECT 
    lc.*,
    (lc.expiry / 1000) > EXTRACT(epoch FROM NOW()) AS is_valid,
    (SELECT price FROM price_history ph WHERE ph.asset_address = lc.asset_address ORDER BY timestamp DESC LIMIT 1) AS current_price
FROM lp_commitments lc
WHERE lc.taken_at IS NULL 
  AND (lc.expiry / 1000) > EXTRACT(epoch FROM NOW());

-- Exercisable options view
CREATE VIEW exercisable_options AS
SELECT 
    ao.*,
    (ao.expiry_timestamp / 1000) > EXTRACT(epoch FROM NOW()) AS is_valid,
    (SELECT price FROM price_history ph WHERE ph.asset_address = ao.asset_address ORDER BY timestamp DESC LIMIT 1) AS current_price,
    CASE 
        WHEN ao.option_type = 'CALL' THEN 
            (SELECT price FROM price_history ph WHERE ph.asset_address = ao.asset_address ORDER BY timestamp DESC LIMIT 1) > ao.target_price
        WHEN ao.option_type = 'PUT' THEN
            (SELECT price FROM price_history ph WHERE ph.asset_address = ao.asset_address ORDER BY timestamp DESC LIMIT 1) < ao.target_price
    END AS is_profitable
FROM active_options ao
WHERE ao.exercise_status = 'active'
  AND (ao.expiry_timestamp / 1000) > EXTRACT(epoch FROM NOW());

-- User portfolio view
CREATE VIEW user_portfolios AS
SELECT 
    ao.taker_address,
    COUNT(*) as total_options,
    SUM(CASE WHEN ao.exercise_status = 'active' THEN 1 ELSE 0 END) as active_options,
    SUM(ao.premium_paid) as total_premiums_paid,
    SUM(COALESCE(ao.profit_realized, 0)) as total_profit_realized,
    SUM(COALESCE(ao.profit_realized, 0)) - SUM(ao.premium_paid) as net_pnl
FROM active_options ao
GROUP BY ao.taker_address;

-- Functions for common operations

-- Function to clean up expired commitments
CREATE OR REPLACE FUNCTION cleanup_expired_commitments()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM lp_commitments 
    WHERE taken_at IS NULL 
      AND (expiry / 1000) < EXTRACT(epoch FROM NOW()) - 86400; -- 1 day grace period
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update daily analytics
CREATE OR REPLACE FUNCTION update_daily_analytics(target_date DATE DEFAULT CURRENT_DATE)
RETURNS VOID AS $$
BEGIN
    INSERT INTO protocol_analytics (
        date,
        total_volume,
        total_premiums,
        total_fees,
        active_commitments,
        active_options,
        unique_users,
        avg_option_duration
    )
    VALUES (
        target_date,
        (SELECT COALESCE(SUM(amount_taken * target_price), 0) FROM active_options WHERE DATE(created_at) = target_date),
        (SELECT COALESCE(SUM(premium_paid), 0) FROM active_options WHERE DATE(created_at) = target_date),
        (SELECT COALESCE(SUM(protocol_fee_paid), 0) FROM active_options WHERE DATE(created_at) = target_date),
        (SELECT COUNT(*) FROM lp_commitments WHERE taken_at IS NULL AND (expiry / 1000) > EXTRACT(epoch FROM NOW())),
        (SELECT COUNT(*) FROM active_options WHERE exercise_status = 'active'),
        (SELECT COUNT(DISTINCT taker_address) FROM active_options WHERE DATE(created_at) = target_date),
        (SELECT AVG((expiry_timestamp - EXTRACT(epoch FROM created_at) * 1000) / 1000) FROM active_options WHERE DATE(created_at) = target_date)
    )
    ON CONFLICT (date) DO UPDATE SET
        total_volume = EXCLUDED.total_volume,
        total_premiums = EXCLUDED.total_premiums,
        total_fees = EXCLUDED.total_fees,
        active_commitments = EXCLUDED.active_commitments,
        active_options = EXCLUDED.active_options,
        unique_users = EXCLUDED.unique_users,
        avg_option_duration = EXCLUDED.avg_option_duration;
END;
$$ LANGUAGE plpgsql;

-- Triggers

-- Trigger to update taken_at when commitment is used
CREATE OR REPLACE FUNCTION update_commitment_taken()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE lp_commitments 
    SET taken_at = NOW() 
    WHERE id = NEW.commitment_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_option_taken
    AFTER INSERT ON active_options
    FOR EACH ROW
    EXECUTE FUNCTION update_commitment_taken();

-- Initial data

-- Insert supported assets
INSERT INTO price_history (asset_address, price, timestamp, source) VALUES
('0x4200000000000000000000000000000000000006', 3500.00, EXTRACT(epoch FROM NOW()) * 1000, '1inch_oracle'), -- WETH
('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 1.00, EXTRACT(epoch FROM NOW()) * 1000, '1inch_oracle'), -- USDC
('0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', 1.00, EXTRACT(epoch FROM NOW()) * 1000, '1inch_oracle'); -- DAI

-- Create indexes for performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lp_commitments_composite ON lp_commitments (asset_address, taken_at, expiry);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_active_options_composite ON active_options (taker_address, exercise_status, expiry_timestamp);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_price_history_latest ON price_history (asset_address, timestamp DESC);

-- Set up row level security (if needed)
-- ALTER TABLE lp_commitments ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE active_options ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;