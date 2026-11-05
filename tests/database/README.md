# Isolated PostgreSQL workflow tests

These run against a new in-memory PostgreSQL database, not Supabase Production. Auth/storage fixture schemas model the Supabase dependencies. All project migrations are executed, followed by workflow assertions, including authenticated RLS. No credentials or live project are used.

In Codespaces, install the test engine outside the application:

```bash
npm install --prefix /tmp/cropnex-db-audit @electric-sql/pglite@0.5.15
CROPNEX_PGLITE_MODULE=/tmp/cropnex-db-audit/node_modules/@electric-sql/pglite/dist/index.js node tests/database/run.mjs --scenarios
```

The normal application dependencies are unchanged. The standard regression tests remain under tests/*.test.mjs. This fixture does not simulate all organisation/adviser role combinations or external services.
