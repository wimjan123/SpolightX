import { initTRPC, TRPCError } from '@trpc/server';
import { type NextRequest } from 'next/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { observable } from '@trpc/server/observable';
import { EventEmitter } from 'events';

// Event emitter for real-time updates
export const eventEmitter = new EventEmitter();

export const createTRPCContext = async (opts: { req: NextRequest }) => {
  // Extract user session from headers/cookies if needed
  const session = await getSession(opts.req);
  
  return {
    req: opts.req,
    prisma,
    redis,
    session,
    userId: session?.userId,
    eventEmitter,
  };
};

// Basic session extraction - will be enhanced with proper auth later
async function getSession(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const apiKey = req.headers.get('x-api-key');
  
  // For now, return a mock session - will integrate with proper auth
  if (authHeader || apiKey) {
    return {
      userId: 'test-user-id',
      user: {
        id: 'test-user-id',
        username: 'testuser',
        email: 'test@example.com',
      },
    };
  }
  
  return null;
}

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

// Protected procedure that requires authentication
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.userId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to access this resource',
    });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      userId: ctx.session.userId,
    },
  });
});

// Subscription procedure for real-time updates
export const subscriptionProcedure = t.procedure.use(async ({ ctx, next }) => {
  return next({
    ctx: {
      ...ctx,
      eventEmitter: ctx.eventEmitter,
    },
  });
});