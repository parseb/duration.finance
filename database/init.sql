-- Initialize Duration.Finance Database
-- This script wipes existing data and recreates schema

-- Ensure we're using the correct database
\c duration_finance;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Import the main schema
\i schema.sql

-- Verify the setup
SELECT 'Duration.Finance database initialized successfully' as message;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;