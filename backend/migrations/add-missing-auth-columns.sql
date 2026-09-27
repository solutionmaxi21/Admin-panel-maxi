-- Migration: Add missing columns for password reset and Google OAuth
-- Date: 2026-01-03
-- Description: Adds columns needed for password reset functionality and Google OAuth login

-- ============================================
-- 1. Add Google OAuth support to users table
-- ============================================
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

COMMENT ON COLUMN users.google_id IS 'Google OAuth unique identifier for users who sign in with Google';

-- ============================================
-- 2. Add password reset token columns
-- ============================================
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS reset_token_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS reset_expires_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token_hash);

COMMENT ON COLUMN users.reset_token_hash IS 'Hashed password reset token (SHA256)';
COMMENT ON COLUMN users.reset_expires_at IS 'Expiration timestamp for password reset token';

-- ============================================
-- 3. Add name fields to addresses for shipping
-- ============================================
ALTER TABLE addresses 
ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);

COMMENT ON COLUMN addresses.first_name IS 'Recipient first name for shipping';
COMMENT ON COLUMN addresses.last_name IS 'Recipient last name for shipping';

-- ============================================
-- 4. Rename phone_number to phone for consistency
-- ============================================
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'addresses' AND column_name = 'phone_number'
    ) THEN
        ALTER TABLE addresses RENAME COLUMN phone_number TO phone;
    END IF;
END $$;

-- ============================================
-- 5. Rename street_address to address_line1
-- ============================================
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'addresses' AND column_name = 'street_address'
    ) THEN
        ALTER TABLE addresses RENAME COLUMN street_address TO address_line1;
    END IF;
END $$;

-- ============================================
-- 6. Add soft delete support to addresses
-- ============================================
ALTER TABLE addresses 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_addresses_deleted_at ON addresses(deleted_at);

COMMENT ON COLUMN addresses.deleted_at IS 'Soft delete timestamp - NULL means active';

-- ============================================
-- Verification queries
-- ============================================
SELECT 
    'users table columns:' as info,
    column_name, 
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'users' 
    AND column_name IN ('google_id', 'reset_token_hash', 'reset_expires_at')
ORDER BY column_name;

SELECT 
    'addresses table columns:' as info,
    column_name, 
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'addresses' 
    AND column_name IN ('first_name', 'last_name', 'phone', 'address_line1', 'deleted_at')
ORDER BY column_name;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Migration completed successfully!';
    RAISE NOTICE 'Added columns:';
    RAISE NOTICE '  - users.google_id (for Google OAuth)';
    RAISE NOTICE '  - users.reset_token_hash (for password reset)';
    RAISE NOTICE '  - users.reset_expires_at (for password reset)';
    RAISE NOTICE '  - addresses.first_name (for shipping)';
    RAISE NOTICE '  - addresses.last_name (for shipping)';
    RAISE NOTICE '  - addresses.deleted_at (for soft delete)';
    RAISE NOTICE 'Renamed columns:';
    RAISE NOTICE '  - addresses.phone_number → phone';
    RAISE NOTICE '  - addresses.street_address → address_line1';
END $$;
