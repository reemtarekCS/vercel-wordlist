-- Migration: Add customizable titles and descriptions to lists

-- Add customizable fields to lists table
ALTER TABLE lists ADD COLUMN IF NOT EXISTS custom_title VARCHAR(200);
ALTER TABLE lists ADD COLUMN IF NOT EXISTS custom_subtitle TEXT;

-- Add comments for clarity
COMMENT ON COLUMN lists.custom_title IS 'Custom title displayed above submit button in list view';
COMMENT ON COLUMN lists.custom_subtitle IS 'Custom subtitle/description displayed in list view';
