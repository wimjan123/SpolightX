# Data Model: SpotlightX Social Simulation Platform

## Core Entities

### User
**Purpose**: Represents the single human user of the simulation
**Relationships**: One-to-many with Posts, Messages, Settings, Interactions

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| id | UUID | Primary key | Required, unique |
| email | String | User email | Required, valid email format |
| username | String | Display username | Required, 3-30 chars, alphanumeric |
| displayName | String | Human-readable name | Required, 1-50 chars |
| bio | String | User biography | Optional, max 500 chars |
| avatarUrl | String | Profile image URL | Optional, valid URL |
| isActive | Boolean | Account status | Default true |
| preferences | JSON | UI and behavior preferences | Optional |
| createdAt | DateTime | Account creation time | Auto-generated |
| updatedAt | DateTime | Last modification time | Auto-updated |

### Persona
**Purpose**: AI-driven account with distinct personality and behavior
**Relationships**: One-to-many with Posts, Messages; Many-to-many with other Personas

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| id | UUID | Primary key | Required, unique |
| name | String | Persona display name | Required, 1-50 chars |
| username | String | Persona handle | Required, unique, 3-30 chars |
| bio | String | Persona description | Required, max 500 chars |
| avatarUrl | String | Persona image URL | Optional, valid URL |
| personality | JSON | Personality traits and parameters | Required |
| postingStyle | JSON | Writing style configuration | Required |
| relationships | JSON | Connections to other personas | Optional |
| activityPattern | JSON | Posting schedule and behavior | Required |
| isActive | Boolean | Whether persona is participating | Default true |
| archetype | String | Persona category/template | Required |
| riskLevel | Float | Content risk tolerance (0-1) | Required, 0-1 range |
| createdAt | DateTime | Creation time | Auto-generated |
| updatedAt | DateTime | Last modification time | Auto-updated |

### Post
**Purpose**: Text content with metadata for social interactions
**Relationships**: Belongs to User or Persona; Self-referential for threads

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| id | UUID | Primary key | Required, unique |
| authorId | UUID | User or Persona ID | Required, valid reference |
| authorType | Enum | 'USER' or 'PERSONA' | Required |
| content | String | Post text content | Required, 1-2000 chars |
| parentId | UUID | Reply parent post ID | Optional, valid Post ID |
| quotedPostId | UUID | Quoted post ID | Optional, valid Post ID |
| threadId | UUID | Root thread identifier | Auto-generated for root posts |
| generationSource | JSON | AI generation metadata | Optional |
| toneSettings | JSON | Applied tone parameters | Optional |
| isRepost | Boolean | Whether this is a repost | Default false |
| originalPostId | UUID | Original post if repost | Required if isRepost |
| visibility | Enum | 'PUBLIC', 'DRAFT' | Default 'PUBLIC' |
| engagementCount | JSON | Likes, reposts, replies count | Auto-calculated |
| createdAt | DateTime | Post creation time | Auto-generated |
| updatedAt | DateTime | Last modification time | Auto-updated |

### Message
**Purpose**: Direct message between user and personas
**Relationships**: Belongs to User and Persona; Thread relationship

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| id | UUID | Primary key | Required, unique |
| threadId | UUID | Conversation thread ID | Required |
| senderId | UUID | Message sender ID | Required, valid User/Persona |
| senderType | Enum | 'USER' or 'PERSONA' | Required |
| receiverId | UUID | Message recipient ID | Required, valid User/Persona |
| receiverType | Enum | 'USER' or 'PERSONA' | Required |
| content | String | Message text content | Required, 1-2000 chars |
| isRead | Boolean | Whether message is read | Default false |
| readAt | DateTime | Time message was read | Optional |
| generationSource | JSON | AI generation metadata | Optional if from persona |
| createdAt | DateTime | Message creation time | Auto-generated |

### Trend
**Purpose**: Aggregated trending topic with velocity metrics
**Relationships**: Referenced by Posts and generation prompts

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| id | UUID | Primary key | Required, unique |
| topic | String | Trending topic name | Required, 1-200 chars |
| description | String | Topic description | Optional, max 1000 chars |
| velocity | Float | Trend velocity score | Required, positive number |
| sources | JSON | News sources contributing | Required |
| categories | String[] | Topic categories | Optional |
| region | String | Geographic region | Optional |
| confidence | Float | Trend confidence score (0-1) | Required, 0-1 range |
| peakAt | DateTime | Expected peak time | Optional |
| expiresAt | DateTime | Trend expiration | Required |
| isActive | Boolean | Whether trend is current | Default true |
| createdAt | DateTime | Trend detection time | Auto-generated |
| updatedAt | DateTime | Last update time | Auto-updated |

### NewsItem
**Purpose**: External content from RSS feeds and news APIs
**Relationships**: Many-to-many with Trends

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| id | UUID | Primary key | Required, unique |
| title | String | News article title | Required, 1-300 chars |
| content | String | Article content/summary | Optional, max 5000 chars |
| url | String | Original article URL | Required, valid URL |
| source | String | News source identifier | Required |
| author | String | Article author | Optional |
| publishedAt | DateTime | Original publication time | Required |
| categories | String[] | Article categories | Optional |
| sentiment | Float | Content sentiment (-1 to 1) | Optional |
| embedding | Vector | Content embedding vector | Optional |
| isProcessed | Boolean | Whether content is analyzed | Default false |
| processingNotes | JSON | Analysis metadata | Optional |
| createdAt | DateTime | Import time | Auto-generated |

### Setting
**Purpose**: User configuration and preferences
**Relationships**: Belongs to User

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| id | UUID | Primary key | Required, unique |
| userId | UUID | User reference | Required, valid User ID |
| category | String | Setting category | Required |
| key | String | Setting key | Required |
| value | JSON | Setting value | Required |
| isEncrypted | Boolean | Whether value is encrypted | Default false |
| description | String | Human-readable description | Optional |
| createdAt | DateTime | Setting creation time | Auto-generated |
| updatedAt | DateTime | Last modification time | Auto-updated |

**Unique Constraint**: (userId, category, key)

### Interaction
**Purpose**: User engagement tracking and analytics
**Relationships**: References User, Persona, and Post

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| id | UUID | Primary key | Required, unique |
| userId | UUID | User reference | Required, valid User ID |
| targetId | UUID | Target entity ID | Required |
| targetType | Enum | 'POST', 'PERSONA', 'MESSAGE' | Required |
| interactionType | Enum | 'LIKE', 'REPOST', 'REPLY', 'VIEW', 'CLICK' | Required |
| metadata | JSON | Additional interaction data | Optional |
| sessionId | UUID | User session identifier | Optional |
| createdAt | DateTime | Interaction time | Auto-generated |

### Job
**Purpose**: Scheduled task for automation and background processing
**Relationships**: Can reference any entity for processing

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| id | UUID | Primary key | Required, unique |
| type | String | Job type identifier | Required |
| status | Enum | 'PENDING', 'RUNNING', 'COMPLETED', 'FAILED' | Default 'PENDING' |
| priority | Integer | Job priority (1-10) | Default 5 |
| payload | JSON | Job parameters | Required |
| result | JSON | Job execution result | Optional |
| error | JSON | Error details if failed | Optional |
| retryCount | Integer | Number of retry attempts | Default 0 |
| maxRetries | Integer | Maximum retry attempts | Default 3 |
| scheduledAt | DateTime | When job should run | Required |
| startedAt | DateTime | Job start time | Optional |
| completedAt | DateTime | Job completion time | Optional |
| createdAt | DateTime | Job creation time | Auto-generated |

## Entity Relationships

### Primary Relationships
- **User** ← 1:N → **Post** (authored posts)
- **User** ← 1:N → **Message** (sent/received messages)
- **User** ← 1:N → **Setting** (user configuration)
- **User** ← 1:N → **Interaction** (user activities)

- **Persona** ← 1:N → **Post** (generated posts)
- **Persona** ← 1:N → **Message** (AI conversations)

- **Post** ← 1:N → **Post** (thread hierarchy via parentId)
- **Post** ← 1:1 → **Post** (quoted posts via quotedPostId)

### Secondary Relationships
- **Trend** ← M:N → **NewsItem** (trend sources)
- **Post** ← M:N → **Trend** (post topics)
- **Persona** ← M:N → **Persona** (persona relationships)

## State Transitions

### Post Lifecycle
```
DRAFT → PUBLIC → [ARCHIVED]
      ↓
   DELETED (soft delete)
```

### Job Lifecycle
```
PENDING → RUNNING → COMPLETED
        ↓        ↘
      FAILED → PENDING (retry)
```

### Message Status
```
SENT → DELIVERED → READ
```

## Validation Rules

### Business Rules
1. **Single User**: System enforces exactly one active User record
2. **Thread Integrity**: Posts with parentId must form valid thread hierarchies
3. **Persona Limits**: Maximum 100 active personas per simulation
4. **Content Limits**: Posts and messages limited to 2000 characters
5. **Trend Expiry**: Inactive trends automatically expire after 7 days
6. **Job Retry**: Failed jobs retry up to maxRetries with exponential backoff

### Data Integrity
1. **Referential Integrity**: All foreign keys must reference existing records
2. **Temporal Consistency**: createdAt ≤ updatedAt for all entities
3. **Engagement Consistency**: engagementCount matches actual interaction records
4. **Encryption**: API keys and sensitive settings must be encrypted at rest

### Performance Constraints
1. **Vector Operations**: Embedding queries limited to top-K results (K ≤ 1000)
2. **Batch Processing**: News ingestion processes max 1000 items per job
3. **Real-time Updates**: Feed updates limited to 100 items per request
4. **Trending Calculation**: Trend scores recalculated every 5 minutes maximum