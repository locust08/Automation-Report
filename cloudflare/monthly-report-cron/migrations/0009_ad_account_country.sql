ALTER TABLE ad_accounts ADD COLUMN country TEXT;

CREATE INDEX IF NOT EXISTS idx_ad_accounts_country
  ON ad_accounts(country);
