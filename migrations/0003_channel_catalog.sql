CREATE TABLE IF NOT EXISTS channel_catalog (
  url TEXT PRIMARY KEY,
  source_id INTEGER NOT NULL,
  source_name TEXT NOT NULL,
  epg_url TEXT,
  name TEXT NOT NULL,
  logo TEXT,
  category TEXT NOT NULL,
  tvg_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('online','offline')),
  last_checked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_channel_catalog_category_name
  ON channel_catalog(category, name);

CREATE INDEX IF NOT EXISTS idx_channels_url_status_id
  ON channels(url, status, id);

WITH preferred AS (
  SELECT url, COALESCE(MIN(CASE WHEN status='online' THEN id END), MIN(id)) AS id
  FROM channels
  GROUP BY url
)
INSERT INTO channel_catalog(url,source_id,source_name,epg_url,name,logo,category,tvg_id,status,last_checked_at)
SELECT c.url,c.source_id,s.name,s.epg_url,c.name,c.logo,c.category,c.tvg_id,c.status,c.last_checked_at
FROM preferred p
JOIN channels c ON c.id=p.id
JOIN sources s ON s.id=c.source_id;
