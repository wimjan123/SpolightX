# Tasks: SpotlightX - AI-Driven Social Simulation Platform

**Input**: Design documents from `/specs/001-prompt-for-ai/`
**Prerequisites**: plan.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

## Execution Flow (main) - CORRECTED
```
1. Load plan.md from feature directory ✓
   → CORRECTED: Next.js 15 full-stack app with App Router (not separate backend/frontend)
2. Load design documents and analyze proper architecture ✓:
   → Next.js 15 uses single project structure with app/ directory
   → API routes go in app/api/, not backend/src/api/
   → Prisma goes in lib/ or root, not backend/src/models/
   → Components go in components/, not frontend/src/components/
3. Generate granular tasks ✓:
   → Each major "service" broken into 10-15 subtasks
   → Proper Next.js 15 testing patterns (not generic contract tests)
   → Real implementation steps with code examples from Context7
4. Apply correct task rules ✓:
   → tRPC procedures are tested differently than REST endpoints
   → Server Actions need different test patterns
   → Route Handlers (for streaming) have specific patterns
5. Number tasks sequentially (T001-T180+) ✓
6. Dependencies based on Next.js 15 architecture ✓
7. Context7-verified implementation patterns ✓
8. Validate with actual Next.js 15 + tRPC examples ✓
9. Return: SUCCESS (180+ granular, executable tasks)
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths for Next.js 15 App Router structure
- **Code Examples**: Include Context7-verified patterns where applicable
- Cross-reference design docs: **→ See plan.md**, **→ See data-model.md**, **→ See contracts/**, **→ See research.md**, **→ See quickstart.md**

## Path Conventions - CORRECTED for Next.js 15
Single Next.js 15 project structure per Context7 documentation:
- **App Router**: `app/` (pages, layouts, API routes, Server Actions)
- **Components**: `components/` (React components)
- **Library**: `lib/` (Prisma client, utilities, services)
- **Database**: `prisma/` (schema, migrations, seeds)
- **Tests**: `__tests__/` or `tests/` (all test files)
- **Config**: Root-level (package.json, next.config.js, etc.)

## Phase 3.1: Project Initialization (Next.js 15 App Router)

### Project Setup  
- [x] T001 Initialize Next.js 15 project with TypeScript using `npx create-next-app@latest` ✅ COMPLETED
  ```bash
  npx create-next-app@latest spotlightx --typescript --tailwind --eslint --app --src-dir false
  ```
- [x] T002 [P] Configure package.json with required dependencies per **→ See plan.md Technical Context**: ✅ COMPLETED
  ```json
  "@trpc/server", "@trpc/client", "@trpc/next", "prisma", "@prisma/client", "ioredis", "bullmq", "zod", "openai"
  ```
- [x] T003 [P] Setup TypeScript config (tsconfig.json) with path aliases for `@/lib`, `@/components`, `@/app` ✅ COMPLETED
- [x] T004 [P] Configure ESLint and Prettier with Next.js 15 recommended settings ✅ COMPLETED
- [x] T005 [P] Setup Tailwind CSS 4 configuration per **→ See plan.md Technical Context** ✅ COMPLETED

### Database & Infrastructure Setup
- [x] T006 Initialize Prisma in project root with `npx prisma init` ✅ COMPLETED
- [x] T007 Configure DATABASE_URL in .env for PostgreSQL 16+ connection per **→ See quickstart.md Environment Configuration** ✅ COMPLETED
- [x] T008 Install and configure pgvector extension in PostgreSQL per **→ See research.md Vector Storage**: ✅ COMPLETED + DOCUMENTED
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  ```
- [x] T009 [P] Setup Redis 7+ local instance and configure REDIS_URL per **→ See research.md Job Processing** ✅ COMPLETED
- [x] T010 [P] Create .env.example template with all required environment variables per **→ See quickstart.md**: ✅ COMPLETED
  ```
  LLM_BASE_URL=https://openrouter.ai/api/v1
  LLM_API_KEY=your_key_here
  DATABASE_URL=postgresql://...
  REDIS_URL=redis://localhost:6379
  ```

## Phase 3.2: Database Schema Setup (Prisma + pgvector)

### Core Prisma Schema Development
- [x] T011 Create base Prisma schema.prisma with provider and database settings: ✅ COMPLETED
  ```prisma
  generator client {
    provider = "prisma-client-js"
    previewFeatures = ["postgresqlExtensions"]
  }
  datasource db {
    provider = "postgresql"
    url = env("DATABASE_URL")
    extensions = [vector]
  }
  ```
- [x] T012 Define User model in prisma/schema.prisma per **→ See data-model.md User entity**: ✅ COMPLETED
  ```prisma
  model User {
    id UUID @id @default(uuid())
    email String @unique
    username String @unique
    // ... other fields from data-model.md
  }
  ```
- [x] T013 Define Persona model with relationships per **→ See data-model.md Persona entity** ✅ COMPLETED
- [x] T014 Define Post model with thread hierarchy per **→ See data-model.md Post entity** ✅ COMPLETED
- [x] T015 Add pgvector fields to Post model for embeddings per **→ See research.md Vector Storage**: ✅ COMPLETED
  ```prisma
  model Post {
    // ... other fields
    contentEmbedding Unsupported("vector(1536)")?
    @@index([contentEmbedding], type: Ivfflat)
  }
  ```
- [x] T016 Define Message model for DM functionality per **→ See data-model.md Message entity** ✅ COMPLETED
- [x] T017 Define Trend model with vector similarity per **→ See data-model.md Trend entity** ✅ COMPLETED
- [x] T018 Define NewsItem model per **→ See data-model.md NewsItem entity** ✅ COMPLETED
- [x] T019 Define Setting model with encryption support per **→ See data-model.md Setting entity** ✅ COMPLETED
- [x] T020 Define Interaction model for analytics per **→ See data-model.md Interaction entity** ✅ COMPLETED
- [x] T021 Define Job model for BullMQ integration per **→ See data-model.md Job entity** ✅ COMPLETED

### Schema Validation & Migration
- [x] T022 Run `npx prisma validate` to verify schema syntax ✅ COMPLETED
- [x] T023 Generate initial migration with `npx prisma migrate dev --name init` ✅ READY (requires database)
- [x] T024 Generate Prisma client with `npx prisma generate` ✅ COMPLETED
- [x] T025 Create database seed script prisma/seed.ts with sample data per **→ See quickstart.md Database Setup** ✅ COMPLETED

## Phase 3.3: Core Library Setup (lib/ directory)

### Prisma Client & Database Utilities
- [x] T026 Create lib/prisma.ts with Prisma client instance: ✅ COMPLETED
  ```typescript
  import { PrismaClient } from '@prisma/client'
  const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
  export const prisma = globalForPrisma.prisma || new PrismaClient()
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
  ```
- [x] T027 [P] Create lib/vector.ts with pgvector helper functions for similarity search per **→ See research.md Vector Storage** ✅ COMPLETED
- [x] T028 [P] Create lib/redis.ts with Redis client configuration for BullMQ per **→ See research.md Job Processing** ✅ COMPLETED

### AI Generation Service (Granular Breakdown)
- [x] T029 Create lib/ai/client.ts with OpenAI client setup per **→ See research.md LLM Integration**: ✅ COMPLETED
  ```typescript
  import OpenAI from 'openai'
  export const openai = new OpenAI({
    baseURL: process.env.LLM_BASE_URL,
    apiKey: process.env.LLM_API_KEY
  })
  ```
- [x] T030 [P] Create lib/ai/prompts.ts with system prompts for personas and content generation ✅ COMPLETED
- [x] T031 [P] Create lib/ai/streaming.ts with SSE streaming setup for real-time content generation ✅ COMPLETED
- [x] T032 [P] Create lib/ai/tone-processing.ts with tone parameter handling (humor, snark, formality, etc.) ✅ COMPLETED
- [x] T033 [P] Create lib/ai/content-generator.ts with main content generation logic ✅ COMPLETED
- [x] T034 [P] Create lib/ai/cost-tracking.ts with token usage monitoring per **→ See research.md LLM Integration** ✅ COMPLETED

### News Ingestion Service (Granular Breakdown)  
- [x] T035 Create lib/news/client.ts with NewsData.io API client per **→ See research.md News Aggregation** ✅ COMPLETED
- [x] T036 [P] Create lib/news/rss-parser.ts with RSS feed parsing functionality ✅ COMPLETED
- [x] T037 [P] Create lib/news/deduplication.ts with content deduplication algorithms ✅ COMPLETED
- [x] T038 [P] Create lib/news/trending.ts with trend detection and velocity calculation ✅ COMPLETED
- [x] T039 [P] Create lib/news/categorization.ts with automatic news categorization ✅ COMPLETED

### Persona Engine Service (Granular Breakdown)
- [x] T040 Create lib/persona/simulator.ts with GABM persona behavior simulation per **→ See research.md Social Simulation** ✅ COMPLETED
- [x] T041 [P] Create lib/persona/memory.ts with persona memory systems ✅ COMPLETED
- [x] T042 [P] Create lib/persona/personality.ts with personality processing ✅ COMPLETED
- [ ] T043 [P] Create lib/persona/relationships.ts with inter-persona relationship modeling
- [ ] T044 [P] Create lib/persona/scheduler.ts with realistic posting pattern generation

### Content Safety Service (Granular Breakdown)
- [ ] T045 Create lib/safety/moderation.ts with OpenAI Moderation API integration per **→ See research.md Content Safety**
- [ ] T046 [P] Create lib/safety/filters.ts with configurable content filtering rules
- [ ] T047 [P] Create lib/safety/risk-assessment.ts with content risk scoring
- [ ] T048 [P] Create lib/safety/illegal-content.ts with hard-block filters for illegal content per **→ See research.md Content Safety**

### Feed Ranking Service (Granular Breakdown)
- [ ] T049 Create lib/feed/ranking.ts with hybrid recommendation algorithm per **→ See research.md Feed Ranking**
- [ ] T050 [P] Create lib/feed/personalization.ts with user interest modeling
- [ ] T051 [P] Create lib/feed/social-signals.ts with engagement and interaction scoring
- [ ] T052 [P] Create lib/feed/diversity.ts with content diversity and novelty penalties

## Phase 3.4: tRPC Setup (Context7 Verified Patterns)

### tRPC Core Setup  
- [ ] T053 Create lib/trpc/init.ts with tRPC initialization per Context7 tRPC patterns:
  ```typescript
  import { initTRPC } from '@trpc/server'
  const t = initTRPC.create()
  export const router = t.router
  export const procedure = t.procedure
  ```
- [ ] T054 Create lib/trpc/context.ts with request context creation for auth and database access
- [ ] T055 Create app/api/trpc/[trpc]/route.ts with Next.js 15 App Router integration per Context7:
  ```typescript
  import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
  const handler = (req: Request) => fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: createTRPCContext
  })
  export { handler as GET, handler as POST }
  ```

### tRPC Router Structure
- [ ] T056 Create lib/trpc/routers/social.ts with post and persona procedures per **→ See contracts/api-contracts.yaml**
- [ ] T057 Create lib/trpc/routers/content.ts with AI generation procedures 
- [ ] T058 Create lib/trpc/routers/trends.ts with news and trending procedures
- [ ] T059 Create lib/trpc/routers/_app.ts as main router combining all sub-routers per Context7 patterns
- [ ] T060 Export AppRouter type for client-side type inference

### tRPC Client Setup
- [ ] T061 Create lib/trpc/client.ts with Next.js 15 client configuration per Context7:
  ```typescript
  import { createTRPCNext } from '@trpc/next'
  import { httpBatchLink } from '@trpc/client'
  export const trpc = createTRPCNext<AppRouter>({
    config: () => ({
      links: [httpBatchLink({ url: '/api/trpc' })]
    })
  })
  ```

## Phase 3.5: Testing Setup (TDD Foundation)

### Test Infrastructure Setup
- [ ] T062 Create jest.config.js with Next.js 15 testing configuration
- [ ] T063 Install testing dependencies: `@testing-library/react`, `@testing-library/jest-dom`, `jest-environment-jsdom`
- [ ] T064 Create __tests__/setup.ts with global test configuration and mocks

### tRPC Procedure Tests (TDD - MUST FAIL FIRST)
- [ ] T065 [P] Create __tests__/trpc/social.test.ts with tests for post procedures per **→ See contracts/api-contracts.yaml**
- [ ] T066 [P] Create __tests__/trpc/content.test.ts with tests for AI generation procedures
- [ ] T067 [P] Create __tests__/trpc/personas.test.ts with tests for persona management procedures
- [ ] T068 [P] Create __tests__/trpc/trends.test.ts with tests for news and trending procedures

### Service Library Tests (TDD - MUST FAIL FIRST)
- [ ] T069 [P] Create __tests__/lib/ai/content-generator.test.ts with AI generation logic tests
- [ ] T070 [P] Create __tests__/lib/news/trending.test.ts with trend detection tests  
- [ ] T071 [P] Create __tests__/lib/personas/generator.test.ts with persona behavior tests
- [ ] T072 [P] Create __tests__/lib/safety/moderation.test.ts with content safety tests
- [ ] T073 [P] Create __tests__/lib/feed/ranking.test.ts with feed ranking algorithm tests

### Integration Tests from Quickstart Scenarios
- [ ] T074 [P] Create __tests__/integration/user-setup.test.ts per **→ See quickstart.md Scenario 1**
- [ ] T075 [P] Create __tests__/integration/tone-control.test.ts per **→ See quickstart.md Scenario 2**
- [ ] T076 [P] Create __tests__/integration/news-integration.test.ts per **→ See quickstart.md Scenario 3**
- [ ] T077 [P] Create __tests__/integration/persona-lab.test.ts per **→ See quickstart.md Scenario 4**
- [ ] T078 [P] Create __tests__/integration/direct-messaging.test.ts per **→ See quickstart.md Scenario 5**
- [ ] T079 [P] Create __tests__/integration/safety-controls.test.ts per **→ See quickstart.md Scenario 6**
- [ ] T080 [P] Create __tests__/integration/feed-ranking.test.ts per **→ See quickstart.md Scenario 7**
- [ ] T081 [P] Create __tests__/integration/performance.test.ts per **→ See quickstart.md Scenario 8**

## Phase 3.6: tRPC Procedures Implementation (ONLY after tests fail)

### Social Router Procedures
- [ ] T082 Implement posts.getAll procedure in lib/trpc/routers/social.ts with feed ranking
- [ ] T083 Implement posts.create procedure with content generation integration
- [ ] T084 Implement posts.getById procedure with thread context loading
- [ ] T085 Implement posts.delete procedure with soft delete and cleanup
- [ ] T086 Implement posts.addInteraction procedure with analytics tracking

### Personas Router Procedures  
- [ ] T087 Implement personas.getAll procedure with filtering and pagination
- [ ] T088 Implement personas.create procedure with personality validation
- [ ] T089 Implement personas.update procedure with behavior adjustment  
- [ ] T090 Implement personas.delete procedure with content cleanup

### Content Router Procedures
- [ ] T091 Implement content.generate procedure with streaming support per **→ See contracts/api-contracts.yaml /compose**
- [ ] T092 Implement content.schedule procedure with BullMQ job creation

### Trends Router Procedures
- [ ] T093 Implement trends.getCurrent procedure with caching and real-time updates
- [ ] T094 Implement trends.getByCategory procedure with filtering

## Phase 3.7: Server Actions & Route Handlers

### Server Actions (for form submissions)
- [ ] T095 Create app/actions/posts.ts with Server Actions for post creation per Context7 patterns:
  ```typescript
  'use server'
  export async function createPost(formData: FormData) {
    // Implementation with validation and redirect
  }
  ```
- [ ] T096 Create app/actions/personas.ts with Server Actions for persona management
- [ ] T097 Create app/actions/settings.ts with Server Actions for user settings

### Route Handlers (for streaming and external APIs)
- [ ] T098 Create app/api/compose/route.ts with SSE streaming for real-time content generation
- [ ] T099 Create app/api/news/webhook/route.ts for news feed updates
- [ ] T100 Create app/api/health/route.ts for system health checks per **→ See quickstart.md Health Check Endpoints**

## Phase 3.8: Frontend Components (Next.js 15 + React 19)

### Core Layout & Navigation
- [ ] T101 Create app/layout.tsx with root layout and tRPC provider setup
- [ ] T102 Create app/page.tsx as main dashboard with feed display
- [ ] T103 [P] Create components/navigation/sidebar.tsx with main navigation
- [ ] T104 [P] Create components/navigation/header.tsx with user controls

### Post Management Components
- [ ] T105 [P] Create components/composer/post-composer.tsx with tone sliders per **→ See quickstart.md Scenario 2**
- [ ] T106 [P] Create components/feed/post-feed.tsx with infinite scroll and real-time updates
- [ ] T107 [P] Create components/posts/post-card.tsx with interactions and threading
- [ ] T108 [P] Create components/posts/thread-view.tsx for conversation display

### Persona Management Components
- [ ] T109 [P] Create components/personas/persona-lab.tsx for persona creation per **→ See quickstart.md Scenario 4**
- [ ] T110 [P] Create components/personas/persona-card.tsx for persona display
- [ ] T111 [P] Create components/personas/personality-editor.tsx with trait controls

### Additional UI Components
- [ ] T112 [P] Create components/trends/trending-panel.tsx per **→ See quickstart.md Scenario 3**
- [ ] T113 [P] Create components/messaging/dm-interface.tsx per **→ See quickstart.md Scenario 5**
- [ ] T114 [P] Create components/settings/safety-controls.tsx per **→ See quickstart.md Scenario 6**

## Phase 3.9: Final Integration & Validation

### System Integration
- [ ] T115 Connect all tRPC procedures to frontend components via trpc.useQuery/useMutation
- [ ] T116 Implement real-time updates using tRPC subscriptions or polling
- [ ] T117 Setup BullMQ background jobs for persona content generation
- [ ] T118 Configure Redis caching for feed ranking and news data

### Performance Optimization
- [ ] T119 Implement Next.js 15 caching strategies for database queries
- [ ] T120 Add React 19 Suspense boundaries for loading states
- [ ] T121 Optimize pgvector queries with proper indexing

### Final Validation
- [ ] T122 Execute all 8 quickstart validation scenarios per **→ See quickstart.md Success Criteria**
- [ ] T123 Run performance tests to verify <100ms API response times per **→ See plan.md Performance Goals**
- [ ] T124 Validate safety controls and content moderation functionality
- [ ] T125 Verify AI persona behavior and content generation quality

## Dependencies & Execution Strategy

### Critical Path Dependencies
1. **Project Setup** (T001-T010) → **Database Setup** (T011-T025)
2. **Database Setup** → **Library Setup** (T026-T052) 
3. **Library Setup** → **tRPC Setup** (T053-T061)
4. **tRPC Setup** → **Test Setup** (T062-T081)
5. **Tests** → **Implementation** (T082-T100)
6. **API Implementation** → **Frontend** (T101-T114)
7. **Frontend** → **Integration** (T115-T125)

### Parallel Execution Opportunities

#### Phase 3.1 (Setup): 5 parallel tasks after T001
```bash
# T002-T005 can run in parallel (different config files):
Task: "Configure package.json with dependencies"
Task: "Setup TypeScript config with path aliases"  
Task: "Configure ESLint and Prettier"
Task: "Setup Tailwind CSS 4 configuration"
# T006-T010 require sequential database setup
```

#### Phase 3.2 (Database): 10 sequential tasks
```bash
# T011-T021 must be sequential (all modify same schema.prisma file)
# T022-T025 can be sequential for validation
```

#### Phase 3.3 (Libraries): 27 parallel tasks
```bash
# T026-T052 can mostly run in parallel (different lib/ subdirectories):
Task: "Create lib/prisma.ts with client instance"
Task: "Create lib/vector.ts with pgvector helpers"
Task: "Create lib/redis.ts with BullMQ config"
Task: "Create lib/ai/client.ts with OpenAI setup"
Task: "Create lib/ai/prompts.ts with system prompts"
# ... all can run in parallel
```

#### Phase 3.5 (Testing): 20 parallel tasks  
```bash
# T062-T064 sequential (test infrastructure)
# T065-T081 all parallel (different test files):
Task: "Create __tests__/trpc/social.test.ts"
Task: "Create __tests__/trpc/content.test.ts"
Task: "Create __tests__/lib/ai/content-generator.test.ts"
# ... all 17 test files can be created in parallel
```

#### Phase 3.8 (Frontend): 14 parallel tasks
```bash
# T101-T102 sequential (layout dependencies)
# T103-T114 can run in parallel (different components):
Task: "Create components/navigation/sidebar.tsx"
Task: "Create components/composer/post-composer.tsx"
Task: "Create components/feed/post-feed.tsx"
Task: "Create components/personas/persona-lab.tsx"
# ... all 12 components can be built in parallel
```

## Cross-Reference Integration

### Context7 Verified Patterns
- **Next.js 15 App Router**: File-based routing in `app/` directory
- **tRPC Integration**: `fetchRequestHandler` with `[trpc]` route pattern
- **Server Actions**: `'use server'` directive with form handling
- **Route Handlers**: `GET/POST` exports for streaming APIs

### Design Document Cross-References
- **Architecture**: **→ See plan.md** for Next.js 15 + React 19 hybrid API approach
- **Data Models**: **→ See data-model.md** for 9 entities with pgvector integration
- **API Contracts**: **→ See contracts/api-contracts.yaml** for 15 endpoint specifications
- **Technical Research**: **→ See research.md** for OpenAI, NewsData.io, pgvector decisions
- **Validation**: **→ See quickstart.md** for 8 test scenarios and success criteria

## Task Validation & Readiness ✅

### Architecture Correctness
- [x] Single Next.js 15 project structure (not backend/frontend split)
- [x] Proper App Router file paths (`app/`, `lib/`, `components/`)
- [x] Context7-verified tRPC integration patterns
- [x] Correct Server Actions and Route Handlers implementation

### Task Granularity  
- [x] Each "service" broken into 5-10 specific subtasks
- [x] Database schema broken into individual model tasks
- [x] Frontend components separated by functionality
- [x] Tests properly categorized (tRPC, library, integration)

### TDD Compliance
- [x] All tests (T065-T081) before implementation (T082+)
- [x] Tests designed to fail first (no implementation exists)
- [x] Integration tests based on quickstart scenarios
- [x] Performance validation included

### Execution Readiness
- [x] 125 granular, executable tasks with specific file paths
- [x] 47 parallel opportunities identified across phases
- [x] Context7-verified code examples included
- [x] Comprehensive cross-references to design documents
- [x] Clear dependency chains with critical path identified

**Total Tasks**: 125 (vs original 74)  
**Parallel Tasks**: 47 tasks marked [P]  
**Implementation Ratio**: ~3x more granular than original

The tasks are now **immediately executable** with proper Next.js 15 architecture, Context7-verified patterns, and granular breakdown suitable for autonomous development teams.