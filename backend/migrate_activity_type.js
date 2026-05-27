#!/usr/bin/env node

// Migration script to add activity_type column to activity_log table
// Run with: node migrate_activity_type.js

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function migrate() {
  console.log('Starting migration: Add activity_type column to activity_log table');

  // Read database config
  const dbConfigPath = path.join(__dirname, 'db.js');
  const dbConfig = require(dbConfigPath);

  let connection;

  try {
    // Connect to database
    connection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
      multipleStatements: true
    });

    console.log('Connected to database');

    // Read migration SQL
    const migrationSQL = fs.readFileSync(path.join(__dirname, 'migrate_activity_type.sql'), 'utf8');

    // Execute migration
    await connection.execute(migrationSQL);

    console.log('Migration completed successfully!');
    console.log('Added activity_type column to activity_log table');

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

migrate();