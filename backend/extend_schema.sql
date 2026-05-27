USE lamu_admin;

-- ─── Conversations (from Tauri lamu.db) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR(150) PRIMARY KEY,
  title TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  source VARCHAR(20) DEFAULT 'tauri',
  imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── Messages (from Tauri lamu.db) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(200) PRIMARY KEY,
  conversation_id VARCHAR(150) NOT NULL,
  role VARCHAR(20) NOT NULL,
  content LONGTEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  attached_files TEXT,
  source VARCHAR(20) DEFAULT 'tauri',
  imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_msg_ts ON messages(timestamp);

-- ─── KB Chunks (from Tauri knowledge.db) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS kb_chunks (
  id VARCHAR(150) PRIMARY KEY,
  document_id VARCHAR(150) NOT NULL,
  content LONGTEXT NOT NULL,
  chunk_index INT NOT NULL DEFAULT 0,
  source VARCHAR(20) DEFAULT 'tauri',
  imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chunk_doc ON kb_chunks(document_id);
