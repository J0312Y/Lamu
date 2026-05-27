-- Migration: Add activity_type column to activity_log table
-- Run this after the main schema.sql to add the activity_type column

USE lamu_admin;

-- Add activity_type column to activity_log table
ALTER TABLE activity_log
ADD COLUMN activity_type VARCHAR(50) DEFAULT 'chat_streaming' AFTER machine_id;

-- Update existing records to have a default activity_type
UPDATE activity_log SET activity_type = 'chat_streaming' WHERE activity_type IS NULL;