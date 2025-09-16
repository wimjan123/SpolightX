-- Migration: Add pgvector indexes for optimal performance
-- This migration adds specialized indexes for vector similarity search
-- and other performance optimizations for SpotlightX

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create indexes for vector similarity search
-- Content embeddings for posts
CREATE INDEX IF NOT EXISTS posts_content_embedding_cosine_idx 
ON "Post" USING ivfflat (content_embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS posts_content_embedding_l2_idx 
ON "Post" USING ivfflat (content_embedding vector_l2_ops) WITH (lists = 100);

-- User preference embeddings for personalization
CREATE INDEX IF NOT EXISTS users_preference_embedding_cosine_idx 
ON "User" USING ivfflat (preference_embedding vector_cosine_ops) WITH (lists = 50);

-- Persona personality embeddings
CREATE INDEX IF NOT EXISTS personas_personality_embedding_cosine_idx 
ON "Persona" USING ivfflat (personality_embedding vector_cosine_ops) WITH (lists = 50);

-- Topic embeddings for trending analysis
CREATE INDEX IF NOT EXISTS trends_topic_embedding_cosine_idx 
ON "TrendingTopic" USING ivfflat (topic_embedding vector_cosine_ops) WITH (lists = 30);

-- Standard B-tree indexes for frequent queries
-- Posts
CREATE INDEX IF NOT EXISTS posts_author_created_at_idx ON "Post" (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_created_at_idx ON "Post" (created_at DESC);
CREATE INDEX IF NOT EXISTS posts_visibility_created_at_idx ON "Post" (visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_parent_id_idx ON "Post" (parent_id) WHERE parent_id IS NOT NULL;

-- Engagement tracking
CREATE INDEX IF NOT EXISTS interactions_user_type_created_idx ON "Interaction" (user_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS interactions_post_type_idx ON "Interaction" (post_id, type);
CREATE INDEX IF NOT EXISTS interactions_created_at_idx ON "Interaction" (created_at DESC);

-- Direct messages
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON "DirectMessage" (conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS messages_sender_created_idx ON "DirectMessage" (sender_id, created_at DESC);

-- Conversations
CREATE INDEX IF NOT EXISTS conversations_participants_idx ON "Conversation" USING gin(participant_ids);
CREATE INDEX IF NOT EXISTS conversations_updated_at_idx ON "Conversation" (updated_at DESC);

-- Personas and scheduling
CREATE INDEX IF NOT EXISTS personas_active_idx ON "Persona" (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS personas_archetype_idx ON "Persona" (archetype);
CREATE INDEX IF NOT EXISTS persona_activities_scheduled_idx ON "PersonaActivity" (scheduled_for ASC) WHERE status = 'SCHEDULED';
CREATE INDEX IF NOT EXISTS persona_activities_persona_status_idx ON "PersonaActivity" (persona_id, status);

-- News and trending
CREATE INDEX IF NOT EXISTS news_articles_published_idx ON "NewsArticle" (published_at DESC);
CREATE INDEX IF NOT EXISTS news_articles_source_published_idx ON "NewsArticle" (source, published_at DESC);
CREATE INDEX IF NOT EXISTS trending_topics_score_idx ON "TrendingTopic" (trending_score DESC);
CREATE INDEX IF NOT EXISTS trending_topics_region_score_idx ON "TrendingTopic" (region, trending_score DESC);
CREATE INDEX IF NOT EXISTS trending_topics_expires_idx ON "TrendingTopic" (expires_at ASC) WHERE expires_at IS NOT NULL;

-- Safety and moderation
CREATE INDEX IF NOT EXISTS content_moderation_status_idx ON "ContentModeration" (status);
CREATE INDEX IF NOT EXISTS content_moderation_entity_idx ON "ContentModeration" (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS content_moderation_created_idx ON "ContentModeration" (created_at DESC);

-- Analytics and metrics
CREATE INDEX IF NOT EXISTS engagement_metrics_entity_date_idx ON "EngagementMetrics" (entity_type, entity_id, date DESC);
CREATE INDEX IF NOT EXISTS engagement_metrics_date_idx ON "EngagementMetrics" (date DESC);

-- Session and authentication
CREATE INDEX IF NOT EXISTS sessions_user_expires_idx ON "Session" (user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS sessions_token_idx ON "Session" (session_token);

-- Composite indexes for complex queries
-- Feed ranking queries
CREATE INDEX IF NOT EXISTS posts_feed_ranking_idx ON "Post" (visibility, created_at DESC, author_id) 
WHERE visibility = 'PUBLIC';

-- User timeline queries
CREATE INDEX IF NOT EXISTS posts_user_timeline_idx ON "Post" (author_id, visibility, created_at DESC)
WHERE visibility IN ('PUBLIC', 'FOLLOWERS');

-- Trending content queries
CREATE INDEX IF NOT EXISTS posts_trending_idx ON "Post" (created_at DESC, visibility) 
WHERE visibility = 'PUBLIC' AND created_at > NOW() - INTERVAL '24 hours';

-- Persona content generation queries
CREATE INDEX IF NOT EXISTS persona_posts_recent_idx ON "Post" (author_id, author_type, created_at DESC)
WHERE author_type = 'PERSONA' AND created_at > NOW() - INTERVAL '7 days';

-- Message thread queries
CREATE INDEX IF NOT EXISTS messages_thread_idx ON "DirectMessage" (conversation_id, created_at ASC, id);

-- Partial indexes for efficiency
-- Active personas only
CREATE INDEX IF NOT EXISTS personas_active_updated_idx ON "Persona" (updated_at DESC) 
WHERE is_active = true;

-- Recent interactions only (last 30 days)
CREATE INDEX IF NOT EXISTS interactions_recent_idx ON "Interaction" (post_id, type, created_at DESC)
WHERE created_at > NOW() - INTERVAL '30 days';

-- Pending moderation only
CREATE INDEX IF NOT EXISTS moderation_pending_idx ON "ContentModeration" (created_at ASC)
WHERE status = 'PENDING';

-- Future scheduled activities
CREATE INDEX IF NOT EXISTS activities_future_idx ON "PersonaActivity" (scheduled_for ASC)
WHERE status = 'SCHEDULED' AND scheduled_for > NOW();

-- Gin indexes for array columns
CREATE INDEX IF NOT EXISTS posts_hashtags_gin_idx ON "Post" USING gin(hashtags);
CREATE INDEX IF NOT EXISTS posts_mentions_gin_idx ON "Post" USING gin(mentioned_user_ids);
CREATE INDEX IF NOT EXISTS personas_categories_gin_idx ON "Persona" USING gin(categories);
CREATE INDEX IF NOT EXISTS trending_topics_categories_gin_idx ON "TrendingTopic" USING gin(categories);

-- Full text search indexes
CREATE INDEX IF NOT EXISTS posts_content_fts_idx ON "Post" USING gin(to_tsvector('english', content));
CREATE INDEX IF NOT EXISTS personas_bio_fts_idx ON "Persona" USING gin(to_tsvector('english', bio));
CREATE INDEX IF NOT EXISTS news_articles_fts_idx ON "NewsArticle" USING gin(to_tsvector('english', title || ' ' || content));

-- Statistics for query planner
ANALYZE "Post";
ANALYZE "User";
ANALYZE "Persona";
ANALYZE "Interaction";
ANALYZE "DirectMessage";
ANALYZE "Conversation";
ANALYZE "NewsArticle";
ANALYZE "TrendingTopic";
ANALYZE "ContentModeration";
ANALYZE "EngagementMetrics";

-- Comments for documentation
COMMENT ON INDEX posts_content_embedding_cosine_idx IS 'Vector similarity search for content recommendations';
COMMENT ON INDEX posts_author_created_at_idx IS 'User timeline and author queries';
COMMENT ON INDEX interactions_post_type_idx IS 'Engagement metrics aggregation';
COMMENT ON INDEX messages_conversation_created_idx IS 'Direct message threading';
COMMENT ON INDEX personas_active_idx IS 'Active persona filtering';
COMMENT ON INDEX trending_topics_score_idx IS 'Trending topics ranking';
COMMENT ON INDEX posts_feed_ranking_idx IS 'Main feed queries optimization';
COMMENT ON INDEX posts_content_fts_idx IS 'Full text search on post content';