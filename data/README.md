# Runtime Uploads

This folder is only used for uploaded document files during local Node.js runs.

System records are stored in Supabase. The app no longer falls back to `database.json`; configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_ANON_KEY` in `.env` before starting the server.
