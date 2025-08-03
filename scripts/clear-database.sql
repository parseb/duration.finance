-- Duration.Finance Database Clear Script
-- WARNING: This will delete ALL data from the database!

-- Show current data before clearing
SELECT 'BEFORE CLEARING - Current Database Contents:' as status;
SELECT 
    (SELECT COUNT(*) FROM commitments) as total_commitments,
    (SELECT COUNT(*) FROM active_options) as total_active_options,
    (SELECT COUNT(*) FROM commitments WHERE taken_at IS NULL) as active_commitments,
    (SELECT COUNT(*) FROM commitments WHERE taken_at IS NOT NULL) as taken_commitments;

-- Clear all data
-- Order matters due to foreign key constraints
DELETE FROM active_options;
DELETE FROM commitments;

-- Show results after clearing
SELECT 'AFTER CLEARING - Database Status:' as status;
SELECT 
    (SELECT COUNT(*) FROM commitments) as remaining_commitments,
    (SELECT COUNT(*) FROM active_options) as remaining_options;

-- Optional: Clean up any other test data or reset sequences
-- TRUNCATE TABLE commitments RESTART IDENTITY CASCADE;
-- TRUNCATE TABLE active_options RESTART IDENTITY CASCADE;

SELECT 'Database cleared successfully!' as final_status;