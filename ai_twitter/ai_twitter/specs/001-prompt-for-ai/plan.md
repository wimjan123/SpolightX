# Implementation Plan: SpotlightX - AI-Driven Social Simulation Platform

**Branch**: `001-prompt-for-ai` | **Date**: 2025-09-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-prompt-for-ai/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → COMPLETE: Feature spec loaded successfully
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → COMPLETE: Detected web application project type
   → Set Structure Decision based on project type
3. Evaluate Constitution Check section below
   → COMPLETE: Initial check performed
   → Update Progress Tracking: Initial Constitution Check
4. Execute Phase 0 → research.md
   → COMPLETE: Comprehensive research completed, all unknowns resolved
5. Execute Phase 1 → contracts, data-model.md, quickstart.md, CLAUDE.md
   → COMPLETE: All design artifacts generated
6. Re-evaluate Constitution Check section
   → COMPLETE: Post-Design Constitution Check passed
7. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
   → COMPLETE: Task generation strategy defined
8. STOP - Ready for /tasks command
```

## Summary
SpotlightX is an AI-driven social simulation platform that creates a realistic X-like environment where a single human user interacts with AI personas. The system requires real-time content generation with configurable tone controls, news feed integration, personalized AI responses, and comprehensive safety controls. Primary technical approach: Next.js 15 with React 19 Server Components, hybrid tRPC + Server Actions API architecture, PostgreSQL 16+ with pgvector for vector similarity search, Redis for caching, and edge-deployed AI persona management.

**2025 Updates Applied**: Plan updated with latest Next.js 15, React 19, Prisma 6.13+, and PostgreSQL 16+ patterns based on validation research.

## Technical Context
**Language/Version**: TypeScript/JavaScript with Node.js 20+, Next.js 15 with React 19  
**Primary Dependencies**: Next.js 15, React 19 Server Components, Prisma 6.13+, pgvector 0.8.0+, Redis 7+, BullMQ, Tailwind CSS 4, Radix UI  
**Storage**: PostgreSQL 16+ with pgvector extension for embeddings and vector similarity search  
**API Architecture**: Hybrid tRPC + Server Actions + Route Handlers for optimal type safety and streaming  
**Testing**: Jest, React Testing Library, Playwright for E2E, Supertest for API tests  
**Target Platform**: Web browsers (desktop/mobile), edge deployment for global performance  
**Project Type**: web - determines frontend + backend structure with edge optimization  
**Performance Goals**: <100ms p95 API response time, support 5000+ concurrent users, real-time streaming <200ms latency  
**Constraints**: GDPR compliance, EU data residency, encrypted API key storage, content safety controls  
**Scale/Scope**: Single-user simulation with 100+ AI personas, 50k+ posts capacity, real-time news ingestion with vector search

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Simplicity**:
- Projects: 2 (frontend, backend) (max 3 ✓)
- Using framework directly? Yes - Next.js and Node.js without wrappers ✓
- Single data model? Yes - shared Prisma schema ✓  
- Avoiding patterns? Yes - direct database access via Prisma, no Repository/UoW ✓

**Architecture**:
- EVERY feature as library? Yes - AI generation, news ingestion, persona management as separate libs
- Libraries listed: 
  * ai-generation (LLM integration, prompt management)
  * news-ingestion (RSS/API feeds, trending detection)
  * persona-engine (AI persona behavior, scheduling)
  * content-safety (filtering, moderation)
  * feed-ranking (hybrid algorithm, personalization)
- CLI per library: Each exposes --help/--version/--format JSON options
- Library docs: llms.txt format planned for each library

**Testing (NON-NEGOTIABLE)**:
- RED-GREEN-Refactor cycle enforced? YES - contract tests will fail first
- Git commits show tests before implementation? YES - constitutional requirement
- Order: Contract→Integration→E2E→Unit strictly followed? YES
- Real dependencies used? YES - actual PostgreSQL, Redis, not mocks
- Integration tests for: new libraries, contract changes, shared schemas? YES
- FORBIDDEN: Implementation before test, skipping RED phase

**Observability**:
- Structured logging included? YES - Winston with JSON format
- Frontend logs → backend? YES - unified logging stream via API
- Error context sufficient? YES - request tracing, error boundaries

**Versioning**:
- Version number assigned? 0.1.0 (initial development)
- BUILD increments on every change? YES
- Breaking changes handled? YES - parallel API versions, migration scripts

## Project Structure

### Documentation (this feature)
```
specs/001-prompt-for-ai/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
# Option 2: Web application (frontend + backend detected)
backend/
├── src/
│   ├── models/         # Prisma schema, data models
│   ├── services/       # Business logic libraries
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
```

**Structure Decision**: Option 2 (Web application) - frontend and backend separation for scalability

## Phase 0: Outline & Research

**Research Tasks Identified**:
1. LLM API integration patterns for streaming and function calling
2. Real-time news feed aggregation and deduplication strategies  
3. Vector embedding storage and similarity search with pgvector
4. Content safety and moderation approaches for AI-generated content
5. Social graph simulation algorithms for realistic persona behavior
6. Feed ranking algorithms for hybrid content discovery
7. WebSocket/SSE patterns for real-time updates
8. EU GDPR compliance requirements for user data and AI processing

**Research Execution**: COMPLETED - Comprehensive research finished, all unknowns resolved.

**Cross-Reference with Technical Context**:
- **LLM Integration**: Research recommended OpenAI Realtime API → Technical Context specifies Node.js 20+ for compatibility
- **News Aggregation**: Research chose NewsData.io → Architecture includes real-time news ingestion
- **Vector Storage**: Research selected pgvector 0.8.0+ → Technical Context specifies PostgreSQL 16+ with pgvector
- **Content Safety**: Research identified OpenAI Moderation API → Incorporated into content safety controls
- **Feed Ranking**: Research recommended hybrid algorithms → Technical Context includes personalized AI responses
- **Real-time Updates**: Research chose SSE over WebSockets → API Architecture includes streaming Route Handlers
- **GDPR Compliance**: Research outlined automated retention → Constraints include EU data residency requirements

**2025 Validation Updates Applied**: 
- Updated to Next.js 15 + React 19 based on latest documentation review
- Enhanced API architecture with hybrid tRPC + Server Actions pattern
- Improved performance targets leveraging edge deployment capabilities

**Output**: research.md with technical decisions + 2025-validation-report.md with current best practices

## Phase 1: Design & Contracts
*Prerequisites: research.md complete ✓*

**COMPLETED**: All Phase 1 deliverables generated:

1. **Data model extraction** → `data-model.md`:
   - 9 core entities with relationships and validation rules
   - State transition diagrams for posts and jobs
   - Business rules and data integrity constraints

2. **API contracts generation** → `contracts/api-contracts.yaml`:
   - 15 REST endpoints with OpenAPI 3.0 specification
   - Request/response schemas for all operations
   - Error handling and authentication patterns

3. **Quickstart scenarios** → `quickstart.md`:
   - 8 validation scenarios covering all user stories
   - Performance criteria and troubleshooting guide
   - Success criteria and health check endpoints

4. **Agent context file** → `CLAUDE.md`:
   - Technology stack and project structure
   - Development commands and testing procedures
   - Code style guidelines and recent changes

**Output**: data-model.md, contracts/api-contracts.yaml, quickstart.md, CLAUDE.md

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `tasks-template.md` as base structure
- Generate from Phase 1 design docs (contracts, data model, quickstart)
- Each API endpoint → contract test task [P]
- Each entity → model creation task [P]
- Each user story → integration test task
- Each library → CLI implementation task
- Implementation tasks to make tests pass

**Ordering Strategy**:
- **TDD order**: Contract tests → Integration tests → E2E tests → Unit tests → Implementation
- **Dependency order**: Database → Models → Services → APIs → Frontend
- **Parallel tasks**: Mark [P] for independent files/components
- **Library order**: Core libraries first, then dependent features

**Task Categories**:
1. **Database Setup** (5 tasks): Schema, migrations, seeds, vector extensions
2. **Service Libraries** (15 tasks): AI generation, news ingestion, persona engine, content safety, feed ranking
3. **API Implementation** (12 tasks): tRPC endpoints, validation, error handling
4. **Frontend Components** (20 tasks): UI components, pages, state management
5. **Integration & Testing** (8 tasks): E2E tests, performance validation, quickstart verification

**Estimated Output**: 60 numbered, ordered tasks in tasks.md

**Critical Dependencies**:
- pgvector extension installation before database tasks
- Redis setup before job queue implementation
- API contract tests before endpoint implementation
- Component tests before UI implementation

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*No constitutional violations identified - all complexity justified*

| Area | Complexity Level | Justification |
|------|-----------------|---------------|
| Library Count | 5 libraries | Each has distinct purpose: AI generation, news ingestion, persona engine, content safety, feed ranking |
| Database Schema | 9 entities | Minimal viable set for social simulation with AI personas |
| API Endpoints | 15 endpoints | RESTful design covering all functional requirements |
| Frontend Components | ~30 components | Standard React component hierarchy for social media UI |

## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (none required)

---
*Based on Constitution v2.1.1 - See `.specify/memory/constitution.md`*
