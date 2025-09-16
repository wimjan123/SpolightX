# SpotlightX Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-09-15

## Active Technologies

**Frontend**: Next.js 15, React 19 Server Components, TypeScript, Tailwind CSS 4, Radix UI  
**Backend**: Node.js 20+, TypeScript, Prisma 6.13+, Hybrid tRPC + Server Actions + Route Handlers  
**Database**: PostgreSQL 16+ with pgvector 0.8.0+ extension for vector similarity search  
**Caching**: Redis 7+ with BullMQ for job queues  
**AI/ML**: OpenAI Realtime API, OpenRouter fallback, vector embeddings, real-time content generation  
**Testing**: Jest, React Testing Library, Playwright, Supertest  
**Infrastructure**: Edge deployment, EU-compliant hosting, Docker  

## Project Structure
```
backend/
├── src/
│   ├── models/         # Prisma schema, data models
│   ├── services/       # Business logic libraries
│   │   ├── ai-generation/     # LLM integration, prompt management
│   │   ├── news-ingestion/    # RSS/API feeds, trending detection  
│   │   ├── persona-engine/    # AI persona behavior, scheduling
│   │   ├── content-safety/    # Filtering, moderation
│   │   └── feed-ranking/      # Hybrid algorithm, personalization
│   ├── api/           # tRPC/REST endpoints
│   └── lib/           # Shared utilities
├── tests/
│   ├── contract/      # API contract tests
│   ├── integration/   # Service integration tests
│   └── unit/          # Unit tests
└── prisma/            # Database schema and migrations

frontend/
├── src/
│   ├── components/    # React components
│   ├── pages/         # Next.js pages/routes
│   ├── services/      # Frontend service calls
│   └── lib/           # Client utilities
├── tests/
│   ├── e2e/          # Playwright tests
│   ├── integration/   # Component integration
│   └── unit/          # Component unit tests
└── public/            # Static assets

specs/001-prompt-for-ai/
├── plan.md              # Implementation plan
├── research.md          # Technical research findings
├── data-model.md        # Database schema and entities
├── quickstart.md        # Validation scenarios
└── contracts/           # API contracts (OpenAPI)
```

## Commands

### Development
```bash
# Backend
npm run dev          # Start development server
npm run build        # Build production
npm run test         # Run test suite
npm run test:watch   # Watch mode testing
npm run workers      # Start background job workers

# Frontend  
npm run dev          # Start Next.js dev server
npm run build        # Build for production
npm run test         # Run React tests
npm run test:e2e     # Run Playwright E2E tests

# Database
npx prisma generate  # Generate Prisma client
npx prisma migrate dev # Run development migrations
npx prisma db seed   # Seed database
npx prisma studio    # Database GUI

# Library Testing
npm run test:contract    # API contract tests
npm run test:integration # Service integration tests
npm run lint            # ESLint + Prettier
npm run typecheck       # TypeScript validation
```

### Service Libraries
Each service library exposes CLI commands:
```bash
# AI Generation Library
node src/services/ai-generation/cli.js --help
node src/services/ai-generation/cli.js generate --prompt "text" --format json

# News Ingestion Library  
node src/services/news-ingestion/cli.js --help
node src/services/news-ingestion/cli.js ingest --source rss --format json

# Persona Engine Library
node src/services/persona-engine/cli.js --help
node src/services/persona-engine/cli.js simulate --personas 5 --format json
```

## Code Style

### TypeScript
- Strict mode enabled (`"strict": true`)
- No implicit any (`"noImplicitAny": true`)
- Consistent interface naming: `interface UserProps {}`
- Prefer type unions over enums: `type Status = 'active' | 'inactive'`
- Use const assertions: `const themes = ['light', 'dark'] as const`

### React Components
- Functional components with hooks
- Props interfaces: `interface ComponentProps {}`
- Default exports for pages, named exports for components
- Use React Server Components where possible (Next.js 14)
- Error boundaries for robust UX

### Database
- Prisma schema as single source of truth
- Use UUID for all primary keys
- Soft deletes with `deletedAt` timestamps
- Created/updated timestamps on all entities
- Indexes on foreign keys and frequently queried fields

### API Design
- RESTful endpoints for CRUD operations
- tRPC for type-safe client-server communication
- Consistent error response format
- Pagination with cursor-based approach
- OpenAPI documentation for external consumption

### Testing
- TDD enforced: write failing tests first
- Contract tests before implementation
- Integration tests with real dependencies (PostgreSQL, Redis)
- E2E tests for critical user journeys
- 80%+ test coverage target

## Recent Changes

### Feature 001-prompt-for-ai (Current) - Updated for 2025
**Added**: Complete SpotlightX AI social simulation platform
- AI-powered content generation with tone controls using OpenAI Realtime API
- Real-time news feed integration and trending detection via NewsData.io
- Social graph simulation with realistic persona behaviors using GABM algorithms
- Comprehensive safety controls and content moderation with OpenAI Moderation API
- Hybrid feed ranking algorithm with personalization and vector similarity search
- Direct messaging system between user and AI personas with streaming responses
- Persona Lab for creating and managing custom AI characters with distinct personalities
- GDPR-compliant data handling and user privacy controls with automated retention
- **2025 Updates**: Next.js 15 + React 19, edge deployment, enhanced streaming, pgvector 0.8.0+

<!-- MANUAL ADDITIONS START -->
Always check off tasks from the tasks.md file
Check other files in the specs folder for additional information
<!-- MANUAL ADDITIONS END -->
