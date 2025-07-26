-- Seed data for development and testing
-- This file provides sample data for local development

-- Insert sample commitments for testing
INSERT INTO commitments (
    id,
    lp_address,
    taker_address,
    asset_address,
    amount,
    target_price,
    premium,
    duration_days,
    option_type,
    signature,
    nonce,
    expiry
) VALUES 
-- LP Commitments
(
    '550e8400-e29b-41d4-a716-446655440001',
    '0x1234567890123456789012345678901234567890',
    NULL,
    '0x4200000000000000000000000000000000000006', -- WETH
    1.5,
    4200,
    0,
    2,
    'CALL',
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
    1,
    NOW() + INTERVAL '1 hour'
),
(
    '550e8400-e29b-41d4-a716-446655440002',
    '0x2345678901234567890123456789012345678901',
    NULL,
    '0x4200000000000000000000000000000000000006', -- WETH
    2.0,
    4500,
    0,
    7,
    'CALL',
    '0x2234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
    1,
    NOW() + INTERVAL '30 minutes'
),
-- Taker Commitments
(
    '550e8400-e29b-41d4-a716-446655440003',
    NULL,
    '0x3456789012345678901234567890123456789012',
    '0x4200000000000000000000000000000000000006', -- WETH
    0.8,
    0,
    150,
    1,
    'PUT',
    '0x3234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
    1,
    NOW() + INTERVAL '2 hours'
),
(
    '550e8400-e29b-41d4-a716-446655440004',
    NULL,
    '0x4567890123456789012345678901234567890123',
    '0x4200000000000000000000000000000000000006', -- WETH
    1.0,
    0,
    300,
    3,
    'CALL',
    '0x4234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
    1,
    NOW() + INTERVAL '1.5 hours'
);

-- Insert sample price history
INSERT INTO price_history (asset_address, price, source) VALUES 
('0x4200000000000000000000000000000000000006', 3500, '1inch_api'),
('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 1, '1inch_api'),
('0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', 1, '1inch_api');

-- Insert sample user sessions for testing
INSERT INTO user_sessions (
    user_address,
    session_token,
    farcaster_fid,
    farcaster_username,
    expires_at
) VALUES 
(
    '0x1234567890123456789012345678901234567890',
    'session_token_test_user_1_' || extract(epoch from now()),
    12345,
    'testuser1',
    NOW() + INTERVAL '7 days'
),
(
    '0x2345678901234567890123456789012345678901',
    'session_token_test_user_2_' || extract(epoch from now()),
    67890,
    'testuser2',
    NOW() + INTERVAL '7 days'
);

-- Insert analytics tracking
INSERT INTO protocol_analytics (metric_name, metric_value, metadata) VALUES 
('total_commitments', 4, '{"lp_commitments": 2, "taker_commitments": 2}'),
('total_value_locked', 0, '{"tvl_usd": 0, "assets": {"WETH": 0, "USDC": 0}}'),
('active_users', 2, '{"unique_addresses": 4}');