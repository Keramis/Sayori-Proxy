PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA wal_autocheckpoint = 1000;
PRAGMA cache_size = 10000;
PRAGMA temp_store = memory;




-- Init clear
DROP TRIGGER IF EXISTS update_total_tokens_insert;   -- fix the typo from udpate→update
DROP TRIGGER IF EXISTS update_total_tokens_delete;
DROP TABLE IF EXISTS usage_records;
DROP TABLE IF EXISTS models;
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS providers;
DROP TABLE IF EXISTS admins;
DROP TABLE IF EXISTS system_config;

CREATE TABLE providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL, -- unix
    custom_headers TEXT,
    disable_cache_discount INTEGER DEFAULT 0,
    owner_id TEXT,
    visibility TEXT NOT NULL DEFAULT 'public',
    allowed_roles TEXT, -- JSON array of Discord role IDs, NULL for public
    max_rpd INTEGER,
    max_rpm INTEGER
);

CREATE TABLE api_keys (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    key TEXT NOT NULL,
    last_used INTEGER DEFAULT 0,
    request_count INTEGER DEFAULT 0,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

CREATE TABLE models (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    request_cost REAL NOT NULL DEFAULT 1.0,
    token_limit INTEGER,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

CREATE TABLE usage_records (
    id TEXT PRIMARY KEY,
    discord_user_id TEXT NOT NULL,
    model_id TEXT,
    provider_id TEXT,
    tokens INTEGER DEFAULT 0,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    timestamp INTEGER NOT NULL, -- unix once again
    cost REAL NOT NULL DEFAULT 1.0,
    FOREIGN KEY (discord_user_id) REFERENCES discord_users(id) ON DELETE CASCADE,
    FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE SET NULL,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL
);

CREATE TABLE admins (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at INTEGER NOT NULL
);


CREATE TABLE system_config (
    "key" TEXT PRIMARY KEY, -- config key
    value TEXT NOT NULL, -- config value (json or text)
    updated_at INTEGER NOT NULL -- timestamp change like vver
);

-- index hoolahoops for PERFORMANCE BABYYYY
CREATE INDEX idx_providers_enabled ON providers(enabled);
CREATE INDEX idx_providers_name ON providers(name);
CREATE INDEX idx_providers_owner_id ON providers(owner_id);
CREATE INDEX idx_providers_visibility ON providers(visibility);

CREATE INDEX idx_api_keys_provider_id ON api_keys(provider_id);
CREATE INDEX idx_api_keys_last_used ON api_keys(last_used);
CREATE INDEX idx_api_keys_request_count ON api_keys(request_count); -- count not cost you fucking retard :facepalm:

CREATE INDEX idx_models_provider_id ON models(provider_id);
CREATE INDEX idx_models_enabled ON models(enabled);
CREATE INDEX idx_models_model_id ON models(model_id);
CREATE UNIQUE INDEX idx_models_unique ON models(provider_id, model_id);

CREATE INDEX idx_usage_records_discord_user_id ON usage_records(discord_user_id);
CREATE INDEX idx_usage_records_timestamp ON usage_records(timestamp);
CREATE INDEX idx_usage_records_provider_id ON usage_records(provider_id);
CREATE INDEX idx_usage_records_model_id ON usage_records(model_id);

-- trying to figure out how triggers work for aggregated stats
CREATE TRIGGER update_total_tokens_insert
AFTER INSERT ON usage_records
BEGIN
    UPDATE system_config 
    SET value = CAST(CAST(value AS INTEGER) + NEW.tokens AS TEXT),
        updated_at = strftime('%s', 'now')
    WHERE key = 'total_tokens_all';
    
    UPDATE system_config 
    SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT),
        updated_at = strftime('%s', 'now')
    WHERE key = 'total_requests_all';
END;

CREATE TRIGGER update_total_tokens_delete
AFTER DELETE ON usage_records
BEGIN
    UPDATE system_config
    SET value = CAST(CAST(value AS INTEGER) - OLD.tokens AS TEXT),
        updated_at = strftime('%s', 'now')
    WHERE key = 'total_tokens_all';

    UPDATE system_config
    SET value = CAST(CAST(value AS INTEGER) - 1 AS TEXT),
        updated_at = strftime('%s', 'now')
    WHERE key = 'total_requests_all';
END;

INSERT INTO system_config (key, value, updated_at) VALUES
('total_tokens_all', '0', strftime('%s', 'now')),
('total_requests_all', '0', strftime('%s', 'now')),
('active_requests', '0', strftime('%s', 'now'));

-- Discord Users table
CREATE TABLE IF NOT EXISTS discord_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  discriminator TEXT NOT NULL,
  global_name TEXT,
  avatar TEXT,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL,
  ip TEXT,
  last_ip_update INTEGER,
  banned INTEGER DEFAULT 0,
  ban_reason TEXT,
  roles TEXT DEFAULT '["user"]'
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_discord_users_username ON discord_users(username);
CREATE INDEX IF NOT EXISTS idx_discord_users_roles ON discord_users(roles);
CREATE INDEX IF NOT EXISTS idx_discord_users_ip ON discord_users(ip);

-- User API Keys table
CREATE TABLE IF NOT EXISTS user_api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_rotated_at INTEGER,
  max_rpd REAL NOT NULL DEFAULT 1000,
  max_rpm REAL NOT NULL DEFAULT 60,
  FOREIGN KEY (user_id) REFERENCES discord_users(id) ON DELETE CASCADE
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON user_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_api_key ON user_api_keys(api_key);

-- Request Logs table
CREATE TABLE IF NOT EXISTS request_logs (
  id TEXT PRIMARY KEY,
  ip TEXT NOT NULL,
  discord_user_id TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  model_id TEXT,
  provider_id TEXT,
  timestamp INTEGER NOT NULL,
  referer TEXT,
  status_code INTEGER NOT NULL,
  latency INTEGER NOT NULL,
  FOREIGN KEY (discord_user_id) REFERENCES discord_users(id) ON DELETE SET NULL,
  FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE SET NULL,
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL
);

-- Indexes for request_logs
CREATE INDEX IF NOT EXISTS idx_request_logs_ip ON request_logs(ip);
CREATE INDEX IF NOT EXISTS idx_request_logs_discord_user_id ON request_logs(discord_user_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_request_logs_model_id ON request_logs(model_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_provider_id ON request_logs(provider_id);
