import { createCallerFactory, createTRPCRouter } from '@/server/api/trpc';
import { postRouter } from '@/server/api/routers/post';
import { socialRouter } from '@/server/api/routers/social';
import { personasRouter } from '@/server/api/routers/personas';
import { contentRouter } from '@/server/api/routers/content';
import { trendsRouter } from '@/server/api/routers/trends';

export const appRouter = createTRPCRouter({
  // Legacy post router (can be deprecated once social router is fully tested)
  post: postRouter,
  
  // Main API routers matching contracts
  social: socialRouter,
  personas: personasRouter,
  content: contentRouter,
  trends: trendsRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);