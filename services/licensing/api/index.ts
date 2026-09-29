/**
 * Vercel entry point. Every path is rewritten here (vercel.json); Hono routes
 * on the original URL. Runs in the Node.js runtime in sin1 (Singapore), next
 * to the Neon database.
 */
import { neon } from '@neondatabase/serverless';
import { handle } from 'hono/vercel';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { Oidc } from '../src/oidc.js';
import { Store } from '../src/store.js';

let app: ReturnType<typeof createApp> | null = null;

function getApp() {
  if (app) return app;
  const cfg = loadConfig();
  const sql = neon(cfg.databaseUrl);
  const store = new Store((text, params) => sql.query(text, params ?? []) as Promise<Record<string, any>[]>);
  app = createApp({ cfg, store, oidc: new Oidc({ fetch }) });
  return app;
}

const handler = (req: Request) => handle(getApp())(req);

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
export const OPTIONS = handler;
