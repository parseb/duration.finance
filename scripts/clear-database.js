#!/usr/bin/env node

/**
 * Script to clear all data from the Duration.Finance database
 * Usage: node scripts/clear-database.js
 */

const { Pool } = require('pg');
const readline = require('readline');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/duration_finance',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Create readline interface for user confirmation
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function clearDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🗑️  Clearing Duration.Finance Database...\n');
    
    // Get current data counts before clearing
    const countResult = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM commitments) as total_commitments,
        (SELECT COUNT(*) FROM active_options) as total_active_options,
        (SELECT COUNT(*) FROM commitments WHERE taken_at IS NULL) as active_commitments,
        (SELECT COUNT(*) FROM commitments WHERE taken_at IS NOT NULL) as taken_commitments
    `);
    
    const counts = countResult.rows[0];
    console.log('📊 Current Database Contents:');
    console.log(`   • Total commitments: ${counts.total_commitments}`);
    console.log(`   • Active commitments: ${counts.active_commitments}`);
    console.log(`   • Taken commitments: ${counts.taken_commitments}`);
    console.log(`   • Active options: ${counts.total_active_options}\n`);
    
    if (counts.total_commitments === '0' && counts.total_active_options === '0') {
      console.log('✅ Database is already empty. Nothing to clear.');
      return;
    }
    
    // Clear all tables
    console.log('🧹 Clearing all tables...');
    
    // Clear active_options first (due to foreign key)
    await client.query('DELETE FROM active_options');
    console.log('   ✓ Cleared active_options table');
    
    // Clear commitments
    await client.query('DELETE FROM commitments');
    console.log('   ✓ Cleared commitments table');
    
    // Reset sequences if they exist
    try {
      await client.query('SELECT setval(pg_get_serial_sequence(\'commitments\', \'id\'), 1, false)');
      console.log('   ✓ Reset commitments sequence');
    } catch (err) {
      // Sequence might not exist, that's okay
    }
    
    // Verify clearing
    const verifyResult = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM commitments) as remaining_commitments,
        (SELECT COUNT(*) FROM active_options) as remaining_options
    `);
    
    const remaining = verifyResult.rows[0];
    
    if (remaining.remaining_commitments === '0' && remaining.remaining_options === '0') {
      console.log('\n✅ Database cleared successfully!');
      console.log('   • All commitments removed');
      console.log('   • All active options removed');
      console.log('   • Database is now empty and ready for fresh data\n');
    } else {
      console.log('\n⚠️  Warning: Some data may remain:');
      console.log(`   • Remaining commitments: ${remaining.remaining_commitments}`);
      console.log(`   • Remaining options: ${remaining.remaining_options}\n`);
    }
    
  } catch (error) {
    console.error('❌ Error clearing database:', error.message);
    console.error('\nFull error details:', error);
  } finally {
    client.release();
  }
}

async function confirmAndClear() {
  return new Promise((resolve) => {
    rl.question('⚠️  Are you sure you want to clear ALL data from the database? This cannot be undone! (yes/no): ', (answer) => {
      if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
        clearDatabase().then(resolve);
      } else {
        console.log('❌ Operation cancelled. Database not cleared.');
        resolve();
      }
    });
  });
}

async function main() {
  console.log('🔄 Duration.Finance Database Cleaner\n');
  
  try {
    // Test database connection
    const client = await pool.connect();
    client.release();
    console.log('✅ Database connection successful\n');
    
    // Interactive mode - ask for confirmation
    if (process.argv.includes('--force')) {
      console.log('🚨 Force mode enabled - clearing without confirmation...\n');
      await clearDatabase();
    } else {
      await confirmAndClear();
    }
    
  } catch (error) {
    console.error('❌ Failed to connect to database:', error.message);
    console.error('\nPlease check:');
    console.error('1. Database is running');
    console.error('2. DATABASE_URL is set correctly');
    console.error('3. Database credentials are valid\n');
    process.exit(1);
  } finally {
    rl.close();
    await pool.end();
  }
}

// Run the script
main().catch(console.error);