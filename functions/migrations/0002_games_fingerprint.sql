-- Content hash used by the sync engine to tell a real change from a re-sighting.
-- Nullable so rows written before the engine existed stay valid.

ALTER TABLE games ADD COLUMN IF NOT EXISTS fingerprint STRING(64);
