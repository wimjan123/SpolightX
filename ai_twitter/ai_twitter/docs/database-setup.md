# Database Setup Guide

## PostgreSQL with pgvector Extension

SpotlightX requires PostgreSQL 16+ with the pgvector extension for vector similarity search.

### Option 1: Local PostgreSQL Installation

1. **Install PostgreSQL 16+**:
   ```bash
   # Ubuntu/Debian
   sudo apt update
   sudo apt install postgresql-16 postgresql-contrib-16

   # macOS with Homebrew
   brew install postgresql@16
   brew services start postgresql@16

   # Windows
   # Download from https://www.postgresql.org/download/windows/
   ```

2. **Install pgvector extension**:
   ```bash
   # Ubuntu/Debian
   sudo apt install postgresql-16-pgvector

   # macOS with Homebrew
   brew install pgvector

   # From source (if not available via package manager)
   git clone --branch v0.8.0 https://github.com/pgvector/pgvector.git
   cd pgvector
   make
   sudo make install
   ```

3. **Create database and enable extension**:
   ```sql
   -- Connect as postgres user
   psql -U postgres

   -- Create database
   CREATE DATABASE spotlightx;

   -- Connect to the database
   \c spotlightx

   -- Enable pgvector extension
   CREATE EXTENSION IF NOT EXISTS vector;

   -- Verify installation
   SELECT * FROM pg_extension WHERE extname = 'vector';
   ```

4. **Update .env file**:
   ```env
   DATABASE_URL="postgresql://postgres:your_password@localhost:5432/spotlightx?schema=public"
   ```

### Option 2: Docker Setup

1. **Create docker-compose.yml**:
   ```yaml
   version: '3.8'
   services:
     postgres:
       image: pgvector/pgvector:pg16
       environment:
         POSTGRES_DB: spotlightx
         POSTGRES_USER: postgres
         POSTGRES_PASSWORD: password
       ports:
         - "5432:5432"
       volumes:
         - postgres_data:/var/lib/postgresql/data

     redis:
       image: redis:7-alpine
       ports:
         - "6379:6379"
       volumes:
         - redis_data:/data

   volumes:
     postgres_data:
     redis_data:
   ```

2. **Start services**:
   ```bash
   docker-compose up -d
   ```

3. **Update .env file**:
   ```env
   DATABASE_URL="postgresql://postgres:password@localhost:5432/spotlightx?schema=public"
   REDIS_URL="redis://localhost:6379"
   ```

### Option 3: Cloud Services

#### Supabase (Recommended for development)
1. Create account at [supabase.com](https://supabase.com)
2. Create new project
3. Go to Settings > Database
4. Copy connection string to .env
5. Enable pgvector in SQL Editor:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

#### Neon, PlanetScale, or other cloud providers
- Follow provider-specific setup instructions
- Ensure pgvector extension is available
- Update DATABASE_URL in .env

### Database Migration

After setting up PostgreSQL with pgvector:

1. **Generate Prisma client**:
   ```bash
   npm run db:generate
   ```

2. **Run migrations**:
   ```bash
   npm run db:migrate
   ```

3. **Seed initial data** (optional):
   ```bash
   npm run db:seed
   ```

4. **Open Prisma Studio** (optional):
   ```bash
   npm run db:studio
   ```

### Verification

To verify your setup is working:

1. **Check database connection**:
   ```bash
   npx prisma db pull
   ```

2. **Verify pgvector extension**:
   ```sql
   SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
   ```

3. **Test vector operations** (after migration):
   ```sql
   -- Should work without errors
   SELECT '[1,2,3]'::vector;
   ```

### Troubleshooting

#### pgvector extension not found
- Ensure PostgreSQL version is 16+
- Install pgvector extension for your PostgreSQL version
- Restart PostgreSQL service after installation

#### Permission denied
- Ensure user has superuser privileges to create extensions
- Or ask database administrator to enable pgvector

#### Connection refused
- Check PostgreSQL service is running
- Verify port and host in connection string
- Check firewall settings

#### Vector operations fail
- Ensure pgvector extension is enabled in your database
- Check extension version compatibility (need v0.8.0+)

For additional help, see:
- [pgvector documentation](https://github.com/pgvector/pgvector)
- [Prisma PostgreSQL guide](https://www.prisma.io/docs/concepts/database-connectors/postgresql)