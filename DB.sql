-- Schema PostgreSQL pour le carnet gastronomique
-- Respecte les 3 formes normales (3FN)
-- Version corrigée avec BIGINT pour les IDs JavaScript

-- Supprimer les tables existantes si elles existent (optionnel)
DROP TABLE IF EXISTS ratings CASCADE;
DROP TABLE IF EXISTS restaurants CASCADE;
DROP TABLE IF EXISTS cuisine_types CASCADE;

-- Table des types de cuisine (normalisation)
CREATE TABLE cuisine_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    emoji VARCHAR(10) DEFAULT '🍽️',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table principale des restaurants
CREATE TABLE restaurants (
    id BIGINT PRIMARY KEY, -- BIGINT pour supporter les timestamps JavaScript
    name VARCHAR(255) NOT NULL,
    cuisine_type_id INTEGER REFERENCES cuisine_types(id),
    location VARCHAR(255),
    address TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    price_range VARCHAR(10) DEFAULT '€€',
    photo_url TEXT,
    comment TEXT,
    status VARCHAR(20) CHECK (status IN ('tested', 'wishlist')) NOT NULL,
    reason TEXT, -- Pour wishlist uniquement
    date_added DATE DEFAULT CURRENT_DATE,
    date_visited DATE, -- Pour tested uniquement
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des notes (séparée pour respecter la 3FN)
CREATE TABLE ratings (
    id SERIAL PRIMARY KEY,
    restaurant_id BIGINT UNIQUE REFERENCES restaurants(id) ON DELETE CASCADE, -- BIGINT pour référencer restaurants
    plats DECIMAL(2,1) CHECK (plats >= 1 AND plats <= 5),
    vins DECIMAL(2,1) CHECK (vins >= 1 AND vins <= 5),
    accueil DECIMAL(2,1) CHECK (accueil >= 1 AND accueil <= 5),
    lieu DECIMAL(2,1) CHECK (lieu >= 1 AND lieu <= 5),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour les performances
CREATE INDEX idx_restaurants_status ON restaurants(status);
CREATE INDEX idx_restaurants_cuisine_type ON restaurants(cuisine_type_id);
CREATE INDEX idx_restaurants_location ON restaurants(location);

-- Fonction pour mise à jour automatique du timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers pour mise à jour automatique
CREATE TRIGGER update_restaurants_updated_at 
    BEFORE UPDATE ON restaurants 
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_ratings_updated_at 
    BEFORE UPDATE ON ratings 
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Données initiales des types de cuisine
INSERT INTO cuisine_types (name, emoji) VALUES 
    ('français', '🥖'),
    ('italien', '🍕'),
    ('asiatique', '🍜'),
    ('japonais', '🍣'),
    ('chinois', '🥡'),
    ('indien', '🍛'),
    ('mexicain', '🌮'),
    ('libanais', '🥙'),
    ('grec', '🫒'),
    ('thaï', '🌶️'),
    ('coréen', '🥢'),
    ('vietnamien', '🍲'),
    ('américain', '🍔'),
    ('méditerranéen', '🐟'),
    ('végétarien', '🥗'),
    ('brasserie', '🍺'),
    ('bistrot', '🍷'),
    ('gastronomique', '⭐'),
    ('fast-food', '🍟'),
    ('desserts', '🍰');

-- Vue pour récupérer facilement les restaurants avec leurs infos complètes
CREATE VIEW restaurants_full AS
SELECT 
    r.id,
    r.name,
    ct.name as cuisine_type,
    ct.emoji as cuisine_emoji,
    r.location,
    r.address,
    r.latitude,
    r.longitude,
    r.price_range,
    r.photo_url,
    r.comment,
    r.status,
    r.reason,
    r.date_added,
    r.date_visited,
    rt.plats,
    rt.vins,
    rt.accueil,
    rt.lieu,
    CASE 
        WHEN rt.plats IS NOT NULL THEN 
            ROUND((rt.plats * 2 + rt.vins * 1.5 + rt.accueil * 1.5 + rt.lieu * 1) / 6.0, 1)
        ELSE NULL 
    END as calculated_rating,
    r.created_at,
    r.updated_at
FROM restaurants r
LEFT JOIN cuisine_types ct ON r.cuisine_type_id = ct.id
LEFT JOIN ratings rt ON r.id = rt.restaurant_id
ORDER BY r.created_at DESC;

-- Vérification du schema créé
SELECT 
    table_name, 
    column_name, 
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name IN ('restaurants', 'ratings', 'cuisine_types')
ORDER BY table_name, ordinal_position;

-- Message de confirmation
SELECT 'Schema PostgreSQL créé avec succès ! Tables: cuisine_types, restaurants (BIGINT), ratings' as status;