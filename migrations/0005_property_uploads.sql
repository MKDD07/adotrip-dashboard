CREATE TABLE IF NOT EXISTS property_images (
 property_id TEXT PRIMARY KEY REFERENCES properties(id),
 mime_type TEXT NOT NULL,
 image_data TEXT NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
