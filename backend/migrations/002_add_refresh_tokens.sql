-- Up Migration
CREATE TABLE IF NOT EXISTS public.refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked BOOLEAN DEFAULT FALSE,
    replaced_by_token VARCHAR(255), -- For reuse detection
    ip_address VARCHAR(45),
    user_agent TEXT
);

CREATE INDEX idx_refresh_tokens_user_id ON public.refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON public.refresh_tokens(token_hash);

-- Down Migration
-- DROP TABLE IF EXISTS public.refresh_tokens;
