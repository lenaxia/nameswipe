import { buildApp } from './app.js';
import { openDatabase } from './db/client.js';
import { migrateDatabase } from './db/migrate.js';
import { createRoomsRouter } from './rooms/router.js';

const port = Number(process.env.PORT ?? 4000);

// Same URL convention as drizzle.config.ts (optional file: prefix).
const dbUrl = process.env.DATABASE_URL ?? 'file:./nameswipe.db';
const dbPath = dbUrl.startsWith('file:') ? dbUrl.slice('file:'.length) : dbUrl;
const db = openDatabase(dbPath);
migrateDatabase(db);

buildApp([createRoomsRouter(db)]).listen(port, () => {
  console.log(`NameSwipe API listening on http://localhost:${port}`);
});
