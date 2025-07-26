-- Duration.Finance Database Schema
-- This file is automatically executed when the PostgreSQL container starts

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Custom types
CREATE TYPE commitment_type AS ENUM ('LP', 'TAKER');
CREATE TYPE option_type_enum AS ENUM ('CALL', 'PUT');
CREATE TYPE option_state AS ENUM ('ACTIVE', 'EXERCISED', 'EXPIRED', 'LIQUIDATED');

-- Unified Commitments table (LP and Taker commitments)
CREATE TABLE commitments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lp_address VARCHAR(42), -- Non-null for LP commitments, NULL for taker commitments
    taker_address VARCHAR(42), -- Non-null for taker commitments, NULL for LP commitments
    asset_address VARCHAR(42) NOT NULL,
    amount DECIMAL(36, 18) NOT NULL CHECK (amount > 0),
    target_price DECIMAL(36, 18) NOT NULL DEFAULT 0, -- LP's desired price (0 for taker commitments)
    premium DECIMAL(36, 18) NOT NULL DEFAULT 0, -- Taker's offered premium in USDC (0 for LP commitments)
    duration_days INTEGER NOT NULL CHECK (duration_days >= 1 AND duration_days <= 365),
    option_type option_type_enum NOT NULL,
    signature TEXT NOT NULL,
    nonce INTEGER NOT NULL,
    expiry TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    taken_at TIMESTAMP NULL,
    
    -- Ensure exactly one of lp_address or taker_address is set
    CONSTRAINT check_commitment_type CHECK (
        (lp_address IS NOT NULL AND taker_address IS NULL) OR
        (lp_address IS NULL AND taker_address IS NOT NULL)
    ),
    
    -- Ensure proper field usage based on commitment type
    CONSTRAINT check_lp_commitment CHECK (
        lp_address IS NULL OR (target_price > 0 AND premium = 0)
    ),
    
    CONSTRAINT check_taker_commitment CHECK (
        taker_address IS NULL OR (target_price = 0 AND premium > 0)
    )
);

-- Active Options table (onchain positions)
CREATE TABLE active_options (
    id SERIAL PRIMARY KEY,
    position_hash VARCHAR(66) UNIQUE NOT NULL, -- Ethereum bytes32 hash
    commitment_id UUID REFERENCES commitments(id) ON DELETE CASCADE,
    taker_address VARCHAR(42) NOT NULL, -- Always the option holder
    lp_address VARCHAR(42) NOT NULL, -- Always provides collateral
    asset_address VARCHAR(42) NOT NULL,
    amount DECIMAL(36, 18) NOT NULL CHECK (amount > 0),
    target_price DECIMAL(36, 18) NOT NULL, -- Final strike price
    premium_paid_usdc DECIMAL(36, 18) NOT NULL, -- Premium in USDC
    current_price_at_taking DECIMAL(36, 18) NOT NULL,
    option_type option_type_enum NOT NULL,
    expiry_timestamp TIMESTAMP NOT NULL,
    exercise_status option_state DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    exercised_at TIMESTAMP NULL,
    
    -- Indexes for performance
    INDEX idx_active_options_taker (taker_address),
    INDEX idx_active_options_lp (lp_address),
    INDEX idx_active_options_asset (asset_address),
    INDEX idx_active_options_expiry (expiry_timestamp),
    INDEX idx_active_options_status (exercise_status)
);

-- Price History table (for charts and analytics)
CREATE TABLE price_history (
    id SERIAL PRIMARY KEY,
    asset_address VARCHAR(42) NOT NULL,
    price DECIMAL(36, 18) NOT NULL,
    source VARCHAR(50) NOT NULL, -- '1inch_api', 'fallback', etc.
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint to prevent duplicate entries
    UNIQUE (asset_address, timestamp),
    INDEX idx_price_history_asset_time (asset_address, timestamp DESC)
);

-- User Sessions table (for mini app authentication)
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_address VARCHAR(42) NOT NULL,
    session_token VARCHAR(256) UNIQUE NOT NULL,
    farcaster_fid INTEGER,
    farcaster_username VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_user_sessions_address (user_address),
    INDEX idx_user_sessions_token (session_token),
    INDEX idx_user_sessions_expiry (expires_at)
);

-- Notification Tokens table (for push notifications)
CREATE TABLE notification_tokens (
    id SERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    token VARCHAR(512) NOT NULL,
    platform VARCHAR(20) NOT NULL, -- 'farcaster', 'web_push', etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE (user_address, token, platform),
    INDEX idx_notification_tokens_user (user_address)
);

-- Protocol Analytics table
CREATE TABLE protocol_analytics (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(36, 18) NOT NULL,
    metadata JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_protocol_analytics_metric_time (metric_name, timestamp DESC)
);

-- Create indexes for better query performance
CREATE INDEX idx_commitments_lp_address ON commitments(lp_address) WHERE lp_address IS NOT NULL;
CREATE INDEX idx_commitments_taker_address ON commitments(taker_address) WHERE taker_address IS NOT NULL;
CREATE INDEX idx_commitments_asset ON commitments(asset_address);
CREATE INDEX idx_commitments_expiry ON commitments(expiry);
CREATE INDEX idx_commitments_created_at ON commitments(created_at DESC);

-- Insert some initial supported assets
INSERT INTO protocol_analytics (metric_name, metric_value, metadata) VALUES 
('supported_assets', 3, '{"assets": ["WETH", "USDC", "DAI"], "addresses": ["0x4200000000000000000000000000000000000006", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb"]}'),
('protocol_version', 1, '{"version": "1.0.0", "deployment_date": "2024-01-01"}');