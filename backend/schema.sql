-- Lamu Admin Database Schema
-- Run once to create all tables

CREATE DATABASE IF NOT EXISTS lamu_admin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lamu_admin;

-- ─── Models ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS models (
  id VARCHAR(100) PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  model VARCHAR(150) NOT NULL,
  description TEXT,
  modality VARCHAR(50) DEFAULT 'text',
  is_available TINYINT(1) DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─── Prompts ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prompts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  prompt TEXT NOT NULL,
  model_id VARCHAR(100),
  model_name VARCHAR(100) DEFAULT 'Default Model',
  is_active TINYINT(1) DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─── Activity ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  requests INT DEFAULT 0,
  tokens BIGINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ai_model VARCHAR(150),
  app_version VARCHAR(20),
  machine_id VARCHAR(100),
  prompt_tokens INT DEFAULT 0,
  completion_tokens INT DEFAULT 0,
  total_tokens INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── Knowledge Base ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kb_documents (
  id VARCHAR(36) PRIMARY KEY,
  type VARCHAR(20) NOT NULL DEFAULT 'file',
  name VARCHAR(255) NOT NULL,
  url TEXT,
  content LONGTEXT NOT NULL,
  chars INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── Admin Users ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'admin',
  is_active TINYINT(1) DEFAULT 1,
  last_login TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─── Settings (key/value store for SMTP, email templates, etc.) ──────────────
CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(100) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─── Licenses ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS licenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  license_key VARCHAR(100) NOT NULL UNIQUE,
  customer_name VARCHAR(150),
  customer_email VARCHAR(150),
  plan VARCHAR(50) DEFAULT 'basic',
  max_requests INT DEFAULT 1000,
  is_active TINYINT(1) DEFAULT 1,
  expires_at DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
