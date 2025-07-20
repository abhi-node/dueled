-- Migration: Update from 4-class system to 3-class system
-- Archer → Gunslinger, Berserker → Demolitionist, Mage → Buckshot, Bomber → Demolitionist

-- Update player_stats table
UPDATE player_stats 
SET favorite_class = CASE 
  WHEN favorite_class = 'archer' THEN 'gunslinger'
  WHEN favorite_class = 'berserker' THEN 'demolitionist' 
  WHEN favorite_class = 'mage' THEN 'buckshot'
  WHEN favorite_class = 'bomber' THEN 'demolitionist'
  ELSE 'gunslinger'  -- Default fallback
END;

-- Update matches table player1_class
UPDATE matches 
SET player1_class = CASE 
  WHEN player1_class = 'archer' THEN 'gunslinger'
  WHEN player1_class = 'berserker' THEN 'demolitionist'
  WHEN player1_class = 'mage' THEN 'buckshot' 
  WHEN player1_class = 'bomber' THEN 'demolitionist'
  ELSE 'gunslinger'  -- Default fallback
END;

-- Update matches table player2_class
UPDATE matches 
SET player2_class = CASE 
  WHEN player2_class = 'archer' THEN 'gunslinger'
  WHEN player2_class = 'berserker' THEN 'demolitionist'
  WHEN player2_class = 'mage' THEN 'buckshot'
  WHEN player2_class = 'bomber' THEN 'demolitionist' 
  ELSE 'gunslinger'  -- Default fallback
END;

-- Add constraint to ensure only valid classes
ALTER TABLE player_stats DROP CONSTRAINT IF EXISTS player_stats_favorite_class_check;
ALTER TABLE player_stats ADD CONSTRAINT player_stats_favorite_class_check 
  CHECK (favorite_class IN ('gunslinger', 'demolitionist', 'buckshot'));

ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_player1_class_check;
ALTER TABLE matches ADD CONSTRAINT matches_player1_class_check 
  CHECK (player1_class IN ('gunslinger', 'demolitionist', 'buckshot'));

ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_player2_class_check;
ALTER TABLE matches ADD CONSTRAINT matches_player2_class_check 
  CHECK (player2_class IN ('gunslinger', 'demolitionist', 'buckshot'));