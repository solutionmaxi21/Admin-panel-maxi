-- Add email_verified column to users table
-- Migration: 002_add_email_verified.sql

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

-- Set existing users as verified (since they're already in the system)
UPDATE users 
SET email_verified = TRUE 
WHERE deleted_at IS NULL;

-- Add index for faster queries on email_verified
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified);

-- Add comment for documentation
COMMENT ON COLUMN users.email_verified IS 'Indicates whether the user has verified their email address';
