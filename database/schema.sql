-- Users table for authentication
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    credits_balance INTEGER DEFAULT 0,
    plan VARCHAR(50) DEFAULT 'free',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Scenes/Generations table
CREATE TABLE scenes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Input parameters
    prompt TEXT NOT NULL,
    negative_prompt TEXT,
    image_url TEXT,
    aspect_ratio VARCHAR(10) DEFAULT '16:9',
    duration INTEGER DEFAULT 5,
    
    -- Provider info
    provider VARCHAR(50) NOT NULL, -- 'runway', 'luma', 'replicate'
    provider_task_id VARCHAR(255),
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
    progress INTEGER DEFAULT 0,
    
    -- Output
    video_url TEXT,
    thumbnail_url TEXT,
    metadata JSONB, -- Store provider-specific response data
    
    -- Variations (for your "3 scenes" feature)
    variation_index INTEGER, -- 0, 1, 2
    parent_scene_id UUID REFERENCES scenes(id), -- Link variations to original request
    
    -- Cost tracking
    credits_used INTEGER DEFAULT 0,
    cost_usd DECIMAL(10,4),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_scenes_user_id ON scenes(user_id);
CREATE INDEX idx_scenes_status ON scenes(status);
CREATE INDEX idx_scenes_provider_task ON scenes(provider_task_id);

-- Credit transactions table
CREATE TABLE credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL, -- positive for purchases, negative for usage
    type VARCHAR(50) NOT NULL, -- 'purchase', 'generation', 'refund', 'bonus'
    description TEXT,
    scene_id UUID REFERENCES scenes(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
