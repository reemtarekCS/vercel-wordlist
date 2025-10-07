-- Migration: Add list functionality to word list app

-- Create lists table first
CREATE TABLE IF NOT EXISTS lists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    password_hash VARCHAR(255), -- NULL for public lists, hashed password for private lists
    is_public BOOLEAN DEFAULT true,
    owner_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create list_members table
CREATE TABLE IF NOT EXISTS list_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role VARCHAR(20) DEFAULT 'member', -- 'owner', 'admin', 'member'
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(list_id, user_id)
);

-- Create list_join_requests table
CREATE TABLE IF NOT EXISTS list_join_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    message TEXT,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    responded_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(list_id, user_id)
);

-- Add columns to words table (if it exists)
DO $$
BEGIN
    -- Add owner_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'words' AND column_name = 'owner_id') THEN
        ALTER TABLE words ADD COLUMN owner_id UUID;
    END IF;

    -- Add list_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'words' AND column_name = 'list_id') THEN
        ALTER TABLE words ADD COLUMN list_id UUID REFERENCES lists(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_lists_owner_id ON lists(owner_id);
CREATE INDEX IF NOT EXISTS idx_lists_public ON lists(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_list_members_list_id ON list_members(list_id);
CREATE INDEX IF NOT EXISTS idx_list_members_user_id ON list_members(user_id);
CREATE INDEX IF NOT EXISTS idx_list_join_requests_list_id ON list_join_requests(list_id);
CREATE INDEX IF NOT EXISTS idx_list_join_requests_status ON list_join_requests(status);
CREATE INDEX IF NOT EXISTS idx_words_list_id ON words(list_id);

-- Create updated_at trigger for lists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_lists_updated_at BEFORE UPDATE ON lists
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Migrate existing words to a default public list (only if words table exists)
DO $$
DECLARE
    default_list_id UUID;
    existing_owner_id UUID;
    words_table_exists BOOLEAN := false;
BEGIN
    -- Check if words table exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'words'
    ) INTO words_table_exists;

    -- Only proceed if words table exists
    IF words_table_exists THEN
        -- Try to find an existing owner_id from words table
        SELECT owner_id INTO existing_owner_id
        FROM words
        WHERE owner_id IS NOT NULL
        LIMIT 1;

        -- If no owner found, use a dummy UUID (this list will be managed by the system)
        IF existing_owner_id IS NULL THEN
            existing_owner_id := gen_random_uuid();
        END IF;

        -- Create a default public list for existing words
        INSERT INTO lists (name, description, is_public, owner_id)
        VALUES ('General', 'Default list for existing words', true, COALESCE(existing_owner_id, gen_random_uuid()))
        ON CONFLICT DO NOTHING
        RETURNING id INTO default_list_id;

        -- If no default list was created (shouldn't happen due to ON CONFLICT DO NOTHING), create one with a new UUID
        IF default_list_id IS NULL THEN
            INSERT INTO lists (name, description, is_public, owner_id)
            VALUES ('General', 'Default list for existing words', true, gen_random_uuid())
            RETURNING id INTO default_list_id;
        END IF;

        -- Update existing words to reference the default list
        UPDATE words SET list_id = default_list_id WHERE list_id IS NULL;
    ELSE
        -- If no words table exists, create the default list anyway for future use
        INSERT INTO lists (name, description, is_public, owner_id)
        VALUES ('General', 'Default list for words', true, gen_random_uuid())
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
