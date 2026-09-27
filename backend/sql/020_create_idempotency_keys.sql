-- Create idempotency_keys table for offline sync deduplication
-- Tracks which mutations have already been processed to prevent duplicates

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  idempotency_key UUID NOT NULL,
  mutation_type VARCHAR(50) NOT NULL,  -- 'add_to_cart', 'remove_from_cart', 'update_quantity', 'add_to_wishlist', etc.
  payload JSONB NOT NULL,  -- Original mutation payload for retry validation
  response JSONB,  -- Response from processing (for replay on retry)
  status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'completed', 'failed'
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),  -- Auto-cleanup after 24h
  UNIQUE(user_id, idempotency_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for faster lookups during sync
CREATE INDEX IF NOT EXISTS idx_idempotency_user_expires 
  ON idempotency_keys(user_id, expires_at);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_idempotency_expires 
  ON idempotency_keys(expires_at);

-- Create a function to cleanup expired idempotency keys
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys()
RETURNS void AS $$
BEGIN
  DELETE FROM idempotency_keys
  WHERE expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Optionally schedule cleanup (requires pg_cron extension, may not be available)
-- SELECT cron.schedule('cleanup_idempotency_keys', '0 * * * *', 'SELECT cleanup_expired_idempotency_keys()');
