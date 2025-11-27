PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA wal_autocheckpoint = 1000;
PRAGMA cache_size = 10000;
PRAGMA temp_store = memory;

-- Init clear
DROP TRIGGER IF EXISTS udpate_total_tokens_insert;
DROP TRIGGER IF EXISTS update_total_tokens_delete;
DROP TABLE IF EXISTS usage_records;
DROP TABLE IF EXISTS user_tokens;
DROP TABLE IF EXISTS models;
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS providers;
DROP TABLE IF EXISTS admins;
DROP TABLE IF EXISTS system_config;

DROP TRIGGER IF EXISTS promote_child_usage_on_delete;
DROP TRIGGER IF EXISTS nullify_parent_usage_on_delete;
DROP TRIGGER IF EXISTS soft_delete_keys_on_provider_delete;
DROP TRIGGER IF EXISTS cascade_soft_delete_to_subkeys;

CREATE TABLE providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL, -- unix
    custom_headers TEXT,
    disable_cache_discount INTEGER DEFAULT 0
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
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

CREATE TABLE user_tokens (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    max_rpd REAL NOT NULL,
    max_rpm REAL NOT NULL,
    created_at INTEGER NOT NULL, -- unix
    allowed_providers TEXT,
    parent_token_id TEXT,
    key_type TEXT NOT NULL DEFAULT 'master',
    expires_at INTEGER,
    enabled INTEGER DEFAULT 1,
    sigma_boy INTEGER DEFAULT 0,
    max_sub_keys INTEGER DEFAULT 20,
    deleted_at INTEGER,
    FOREIGN KEY (parent_token_id) REFERENCES user_tokens(id) ON DELETE CASCADE
);

CREATE TABLE usage_records (
    id TEXT PRIMARY KEY,
    user_token_id TEXT,
    model_id TEXT,
    provider_id TEXT,
    tokens INTEGER DEFAULT 0,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    timestamp INTEGER NOT NULL, -- unix once again
    cost REAL NOT NULL DEFAULT 1.0,
    FOREIGN KEY (user_token_id) REFERENCES user_tokens(id) ON DELETE SET NULL,
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

CREATE INDEX idx_api_keys_provider_id ON api_keys(provider_id);
CREATE INDEX idx_api_keys_last_used ON api_keys(last_used);
CREATE INDEX idx_api_keys_request_count ON api_keys(request_count); -- count not cost you fucking retard :facepalm:

CREATE INDEX idx_models_provider_id ON models(provider_id);
CREATE INDEX idx_models_enabled ON models(enabled);
CREATE INDEX idx_models_model_id ON models(model_id);
CREATE UNIQUE INDEX idx_models_unique ON models(provider_id, model_id);

CREATE INDEX idx_user_tokens_token ON user_tokens(token);
CREATE INDEX idx_user_tokens_parent_id ON user_tokens(parent_token_id);
CREATE INDEX idx_user_tokens_key_type ON user_tokens(key_type);
CREATE INDEX idx_user_tokens_enabled ON user_tokens(enabled);
CREATE INDEX idx_user_tokens_expires_at ON user_tokens(expires_at);
CREATE INDEX idx_user_tokens_sigma_boy ON user_tokens(sigma_boy);

CREATE INDEX idx_usage_records_user_token_id ON usage_records(user_token_id);
CREATE INDEX idx_usage_records_timestamp ON usage_records(timestamp);
CREATE INDEX idx_usage_records_provider_id ON usage_records(provider_id);
CREATE INDEX idx_usage_records_model_id ON usage_records(model_id);
CREATE INDEX idx_usage_records_user_today ON usage_records(user_token_id, timestamp);

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

CREATE TRIGGER promote_child_usage_on_delete
BEFORE DELETE ON user_tokens
FOR EACH ROW
WHEN OLD.parent_token_id IS NOT NULL
BEGIN
    UPDATE usage_records 
    SET user_token_id = OLD.parent_token_id 
    WHERE user_token_id = OLD.id;
END;

CREATE TRIGGER nullify_parent_usage_on_delete
BEFORE DELETE ON user_tokens
FOR EACH ROW
WHEN OLD.parent_token_id IS NULL
BEGIN
    UPDATE usage_records 
    SET user_token_id = NULL 
    WHERE user_token_id = OLD.id;
END;

CREATE TRIGGER soft_delete_keys_on_provider_delete
BEFORE DELETE ON providers
FOR EACH ROW
BEGIN
    UPDATE user_tokens 
    SET deleted_at = strftime('%s', 'now')
    WHERE key_type = 'master' 
    AND (
        allowed_providers IS NULL 
        OR allowed_providers = '["' || OLD.id || '"]'
        OR allowed_providers LIKE '[' || OLD.id || ',%'
        OR allowed_providers LIKE '%,' || OLD.id || ',%'
        OR allowed_providers LIKE '%,' || OLD.id || ']'
    );
END

CREATE TRIGGER cascade_soft_delete_to_subkeys
AFTER UPDATE OF deleted_at ON user_tokens
FOR EACH ROW
WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
BEGIN
    UPDATE user_tokens 
    SET deleted_at = NEW.deleted_at
    WHERE parent_token_id = NEW.id AND deleted_at IS NULL;
END;

INSERT INTO system_config (key, value, updated_at) VALUES
('auth_mode', '"user_tokens"', strftime('%s', 'now')),
('general_password', 'NULL', strftime('%s', 'now')),
('total_tokens_all', '0', strftime('%s', 'now')),
('total_requests_all', '0', strftime('%s', 'now')),
('active_requests', '0', strftime('%s', 'now'));

/*
USE THIS TO MIGRATE PROD DB:
-- 1. Disable foreign keys temporarily
PRAGMA foreign_keys = OFF;

-- 2. Drop existing triggers if they exist
DROP TRIGGER IF EXISTS promote_child_usage_on_delete;
DROP TRIGGER IF EXISTS nullify_parent_usage_on_delete;

-- 3. Create new usage_records table with correct constraints
CREATE TABLE usage_records_new (
    id TEXT PRIMARY KEY,
    user_token_id TEXT,
    model_id TEXT,
    provider_id TEXT,
    tokens INTEGER DEFAULT 0,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    timestamp INTEGER NOT NULL,
    cost REAL NOT NULL DEFAULT 1.0,
    FOREIGN KEY (user_token_id) REFERENCES user_tokens(id) ON DELETE SET NULL,
    FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE SET NULL,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL
);

-- 4. Copy data
INSERT INTO usage_records_new SELECT * FROM usage_records;

-- 5. Replace old table
DROP TABLE usage_records;
ALTER TABLE usage_records_new RENAME TO usage_records;

-- 6. Recreate indexes
CREATE INDEX idx_usage_records_user_token_id ON usage_records(user_token_id);
CREATE INDEX idx_usage_records_timestamp ON usage_records(timestamp);
CREATE INDEX idx_usage_records_provider_id ON usage_records(provider_id);
CREATE INDEX idx_usage_records_model_id ON usage_records(model_id);
CREATE INDEX idx_usage_records_user_today ON usage_records(user_token_id, timestamp);

-- 7. Recreate triggers
CREATE TRIGGER promote_child_usage_on_delete
BEFORE DELETE ON user_tokens
FOR EACH ROW
WHEN OLD.parent_token_id IS NOT NULL
BEGIN
    UPDATE usage_records 
    SET user_token_id = OLD.parent_token_id 
    WHERE user_token_id = OLD.id;
END;

CREATE TRIGGER nullify_parent_usage_on_delete
BEFORE DELETE ON user_tokens
FOR EACH ROW
WHEN OLD.parent_token_id IS NULL
BEGIN
    UPDATE usage_records 
    SET user_token_id = NULL 
    WHERE user_token_id = OLD.id;
END;

-- Add the trigger to soft delete keys when provider is deleted
CREATE TRIGGER soft_delete_keys_on_provider_delete
BEFORE DELETE ON providers
FOR EACH ROW
BEGIN
    UPDATE user_tokens 
    SET deleted_at = strftime('%s', 'now')
    WHERE key_type = 'master' 
    AND id IN (
        SELECT api_keys.id 
        FROM api_keys 
        WHERE api_keys.provider_id = OLD.id
    );
END;

-- Trigger to cascade deleted_at to subkeys when a parent token is soft deleted
CREATE TRIGGER cascade_soft_delete_to_subkeys
AFTER UPDATE OF deleted_at ON user_tokens
FOR EACH ROW
WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
BEGIN
    UPDATE user_tokens 
    SET deleted_at = NEW.deleted_at
    WHERE parent_token_id = NEW.id AND deleted_at IS NULL;
END;

-- 8. Re-enable foreign keys
PRAGMA foreign_keys = ON;

-- afterwards (deleted_at col)
ALTER TABLE user_tokens ADD deleted_at INTEGER;
*/