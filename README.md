# SpotlightX

An AI-driven social simulation platform that creates a realistic social media experience with AI personas.

## Overview

SpotlightX simulates an X-like social network where you interact with AI personas that have distinct personalities, posting styles, and behaviors. The platform includes features like posts, replies, threads, quotes, reposts, likes, direct messages, and trending topics.

## Features

- **AI Personas**: Interact with AI-driven accounts with unique personalities
- **Real-time Content**: Streaming AI-generated responses and content
- **Tone Control**: Adjust humor, formality, and riskiness of generated content
- **News Integration**: Trending topics from real news sources
- **Safety Controls**: Content filtering and moderation
- **Bring Your Own LLM**: Use your own API key with OpenRouter or other providers

## Tech Stack

- **Framework**: Next.js 15 with React 19 and App Router
- **API**: tRPC + Server Actions + Route Handlers
- **Database**: PostgreSQL 16+ with pgvector for vector search
- **ORM**: Prisma 6.13+
- **Queue**: Redis 7+ with BullMQ
- **UI**: Tailwind CSS with shadcn/ui components
- **Types**: TypeScript with strict mode

## Prerequisites

- Node.js 18+
- PostgreSQL 16+ with pgvector extension
- Redis 7+
- OpenRouter API key (or other LLM provider)

## Quick Start

1. **Clone and install dependencies**:
   ```bash
   git clone <repository-url>
   cd spotlightx
   npm install
   ```

2. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your database and API credentials
   ```

3. **Set up database**:
   ```bash
   npx prisma generate
   npx prisma migrate dev
   npx prisma db seed  # Optional
   ```

4. **Start services**:
   ```bash
   # Start development server
   npm run dev

   # Start background workers (separate terminal)
   npm run workers
   ```

5. **Open the app**:
   Navigate to [http://localhost:3000](http://localhost:3000)

## Environment Variables

See `.env.example` for all required environment variables. Key variables include:

- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `LLM_API_KEY`: Your OpenRouter or LLM provider API key
- `NEWS_API_KEY`: NewsData.io API key for trending topics

## Development

```bash
# Run development server
npm run dev

# Run type checking
npm run type-check

# Run linting
npm run lint

# Format code
npm run format

# Run tests
npm run test
```

## Project Structure

```
src/
├── app/              # Next.js App Router pages
├── components/       # React components
│   ├── features/     # Feature-specific components
│   ├── layout/       # Layout components
│   └── ui/           # shadcn/ui components
├── hooks/            # Custom React hooks
├── lib/              # Utility libraries
├── server/           # tRPC API routes
├── types/            # TypeScript type definitions
├── utils/            # Utility functions
└── workers/          # Background job workers
```

## API Documentation

The API is built with tRPC. Access the API documentation at `/api/trpc` when running in development mode.

## Contributing

1. Follow the existing code style (Prettier + ESLint)
2. Write tests for new features
3. Update documentation as needed
4. Follow semantic commit messages

## License

MIT License - see LICENSE file for details.
