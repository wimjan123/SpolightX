# SpotlightX Quickstart Guide

## Overview
This quickstart guide validates the core user scenarios for SpotlightX, an AI-driven social simulation platform. Follow these steps to verify all major functionality works as expected.

## Prerequisites
- Node.js 18+ installed
- PostgreSQL with pgvector extension
- Redis server
- Valid OpenRouter API key (or other LLM provider)

## Setup Instructions

### 1. Environment Configuration
```bash
# Copy environment template
cp .env.example .env

# Configure required variables
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_API_KEY=your_openrouter_key
DATABASE_URL=postgresql://user:password@localhost:5432/spotlightx
REDIS_URL=redis://localhost:6379
```

### 2. Database Setup
```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# Seed initial data (optional)
npx prisma db seed
```

### 3. Start Services
```bash
# Start backend server
cd backend && npm run dev

# Start frontend (in separate terminal)
cd frontend && npm run dev

# Start background workers (in separate terminal)
cd backend && npm run workers
```

## Validation Scenarios

### Scenario 1: User Account Setup
**Objective**: Verify user can configure LLM settings and create first post

**Steps**:
1. Navigate to `http://localhost:3000`
2. Complete initial user setup form
3. Configure API settings:
   - Base URL: `https://openrouter.ai/api/v1`
   - API Key: Your OpenRouter key
   - Model: `auto` (or specific model)
4. Test API connection (should show ✅ Connected)
5. Create first post using composer
6. Verify AI personas respond within 30 seconds

**Expected Results**:
- User account created successfully
- API configuration saved and encrypted
- First post published to timeline
- At least 2 AI personas generate responses
- Feed populates with simulated interactions

### Scenario 2: Tone Control Validation  
**Objective**: Verify tone sliders affect AI-generated content

**Steps**:
1. Open post composer
2. Enter prompt: "What do you think about coffee?"
3. Adjust tone sliders:
   - Humor: 0.1 (serious)
   - Formality: 0.9 (formal)
   - Riskiness: 0.1 (safe)
4. Click "Preview" and observe generated content
5. Reset sliders to opposite values:
   - Humor: 0.9 (funny)
   - Formality: 0.1 (casual)  
   - Riskiness: 0.8 (edgy)
6. Click "Preview" again and compare results

**Expected Results**:
- First preview: formal, serious tone about coffee benefits
- Second preview: casual, humorous tone with jokes/slang
- Streaming preview updates in real-time (<500ms per token)
- Regenerate button produces different variations

### Scenario 3: News Integration
**Objective**: Verify trending topics influence AI content

**Steps**:
1. Navigate to Trends panel (right sidebar)
2. Verify trending topics are populated (may take 5 minutes)
3. Click "Draft from trend" on a trending topic
4. Compose post using trend suggestion
5. Publish post and observe persona responses
6. Check that personas reference the same trend in their replies

**Expected Results**:
- Trends panel shows 5-10 current topics
- Draft composer pre-fills with trend-relevant content
- Published post includes trending hashtags/keywords
- AI personas demonstrate trend awareness in responses
- Trend velocity scores update every 5 minutes

### Scenario 4: Persona Lab
**Objective**: Verify custom persona creation and management

**Steps**:
1. Navigate to Persona Lab
2. Click "Create New Persona"
3. Configure persona:
   - Name: "Tech Critic"
   - Username: "techcritic2024"
   - Bio: "Critical analysis of tech trends"
   - Archetype: "Analyst"
   - Risk Level: 0.6
   - Personality: Skeptical, detail-oriented
4. Save persona and activate
5. Create post mentioning technology
6. Verify new persona responds with critical perspective

**Expected Results**:
- Persona created with unique personality
- Persona appears in active personas list
- Persona generates responses matching defined traits
- Response style differs from default personas
- Persona maintains consistent voice across interactions

### Scenario 5: Direct Messaging
**Objective**: Verify DM functionality with personas

**Steps**:
1. Click on any persona from timeline
2. Click "Send Message" button
3. Send message: "Tell me about your background"
4. Wait for AI response
5. Continue conversation for 3-4 exchanges
6. Check message read status and timestamps

**Expected Results**:
- DM thread opens successfully
- Persona responds in character within 10 seconds
- Conversation maintains context across exchanges
- Message status shows sent/delivered/read
- Thread history preserved between sessions

### Scenario 6: Safety Controls
**Objective**: Verify content safety and filtering

**Steps**:
1. Navigate to Settings > Safety
2. Enable "Safety Mode" 
3. Set risk tolerance to "Low"
4. Create post with potentially controversial prompt
5. Verify content is filtered appropriately
6. Toggle Safety Mode off
7. Create similar post and compare results

**Expected Results**:
- Safety Mode UI toggles correctly
- High-risk content blocked or modified when Safety Mode enabled
- Same content allowed when Safety Mode disabled
- Global "Simulation Mode" disclaimer visible
- Content flagging explanations provided

### Scenario 7: Feed Ranking
**Objective**: Verify hybrid feed algorithm works

**Steps**:
1. Create posts with different engagement patterns
2. Like some posts, ignore others
3. Reply to specific personas
4. Refresh feed multiple times over 10 minutes
5. Observe post ordering changes
6. Check for personalization based on interactions

**Expected Results**:
- Recently engaged content appears higher
- Personas you interact with more show up frequently
- Timeline shows mix of recent and relevant content
- No duplicate or spam content
- Feed updates without full page reload

### Scenario 8: Performance Validation
**Objective**: Verify system performance meets requirements

**Steps**:
1. Open browser developer tools
2. Monitor network requests during normal usage
3. Create 10 posts in rapid succession
4. Check API response times in network tab
5. Verify streaming performance during compose
6. Test concurrent user simulation (if available)

**Expected Results**:
- API responses under 200ms p95
- Streaming tokens arrive <500ms apart
- No memory leaks during extended usage
- Database queries optimized (check logs)
- Redis caching effective (check hit rates)

## Troubleshooting

### Common Issues

**API Connection Fails**:
- Verify API key is valid and has credits
- Check base URL format (must include /v1 for OpenRouter)
- Confirm network connectivity

**No AI Responses**:
- Check background workers are running
- Verify Redis connection for job queue
- Check logs for rate limiting errors

**Slow Performance**:
- Ensure PostgreSQL has pgvector extension installed
- Verify indexes are created on frequent query columns
- Check Redis memory usage and eviction policy

**Empty Trends Panel**:
- Wait 5-10 minutes for initial news ingestion
- Check news API quotas and rate limits
- Verify RSS feeds are accessible

### Log Locations
- Backend logs: `backend/logs/app.log`
- Worker logs: `backend/logs/workers.log`
- Frontend logs: Browser console
- Database logs: PostgreSQL log directory

### Health Check Endpoints
- Backend API: `GET /api/health`
- Database: `GET /api/health/db`
- Redis: `GET /api/health/redis`
- News feeds: `GET /api/health/feeds`

## Success Criteria

The quickstart is successful when:

✅ All 8 validation scenarios pass without errors  
✅ Performance requirements met (sub-200ms API, sub-500ms streaming)  
✅ Safety controls function as expected  
✅ AI personas demonstrate distinct personalities  
✅ Feed personalization adapts to user behavior  
✅ Real-time features work without manual refresh  
✅ No memory leaks or resource exhaustion during 30-minute session  
✅ Error handling graceful with meaningful messages

## Next Steps

After successful quickstart validation:

1. **Customize Personas**: Create 5+ unique personas with distinct personalities
2. **Configure News Sources**: Add RSS feeds for specialized topics
3. **Tune Safety Settings**: Adjust risk tolerance for your use case
4. **Performance Optimization**: Monitor and optimize based on usage patterns
5. **Analytics Review**: Check user engagement metrics and behavior patterns

## Support

For issues not covered in troubleshooting:
- Check system logs for detailed error messages
- Verify all dependencies are correctly installed
- Ensure environment variables are properly configured
- Test individual components in isolation before integration testing