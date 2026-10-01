# CortIQ — Deployment Guide

**Note**: CortIQ uses Supabase as its backend. All Edge Functions and the database are already running in the cloud. You only need to deploy the frontend.

## Architecture

- **Frontend**: React/Vite app — runs locally for development, deployed to cortiq.se for production
- **Backend**: Supabase (Edge Functions + Database) — already in production
- **Tracking Script**: `public/spa-tracking.js` — deployed alongside the frontend

---

## Local Development

### Prerequisites

- Node.js 18+
- npm or bun
- Git
- Supabase CLI (only needed for Edge Function changes)

### Setup

1. **Clone the repository**:
```bash
git clone https://github.com/ExpandTalk-Corporation/Cortiq.git
cd cortiq
```

2. **Install dependencies**:
```bash
npm install
```

3. **Configure environment variables** — copy the example and fill in your values:
```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://[YOUR_PROJECT_REF].supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

4. **Start the development server**:
```bash
npm run dev
```

The app runs at `http://localhost:8080`.

### Production build

```bash
npm run build
```

Output goes to `dist/`. The `.htaccess` file is automatically copied to `dist/` at build time — it is required for Apache SPA routing.

---

## Backend — Supabase

The backend is already in production. Only deploy changes here if you modify Edge Functions or database schema.

### Edge Functions

```bash
# Install Supabase CLI
npm install -g supabase

# Log in
supabase login

# Link to your project
supabase link --project-ref [YOUR_PROJECT_REF]

# Deploy all Edge Functions
npm run supabase:deploy

# Deploy a single function
supabase functions deploy track-event
```

### Database migrations

```bash
# Apply migrations to production
npm run supabase:db:push

# Reset local database (for testing)
npm run supabase:db:reset
```

**Note**: Migrations normally run via the Supabase Dashboard. Use the CLI only for new migrations.

---

## Frontend — cortiq.se

### Method 1: FTP/SFTP

1. Build: `npm run build`
2. Upload all files from `dist/` to your web server root (e.g. `/public_html/`)
3. Verify `.htaccess` was uploaded (it may be hidden in your FTP client)
4. Confirm `https://cortiq.se/spa-tracking.js` is accessible

### Method 2: Git + server hook

```bash
# On the server
cd /var/www/cortiq.se
git init
git remote add origin https://github.com/ExpandTalk-Corporation/Cortiq.git
```

Deploy script (`deploy.sh`):
```bash
#!/bin/bash
git pull origin main
npm install
npm run build
cp -r dist/* /var/www/cortiq.se/public_html/
```

### Method 3: GitHub Actions (CI/CD)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to cortiq.se

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run build
      - uses: SamKirkland/FTP-Deploy-Action@4.3.0
        with:
          server: ${{ secrets.FTP_SERVER }}
          username: ${{ secrets.FTP_USERNAME }}
          password: ${{ secrets.FTP_PASSWORD }}
          local-dir: ./dist/
          exclude: |
            **/.git*
            **/.git*/**
            **/node_modules/**
```

---

## Supabase Auth Configuration

Required for correct `/auth` routing. In the Supabase Dashboard → Authentication → URL Configuration:

- **Site URL**: `https://cortiq.se/`
- **Redirect URLs** (add all):
  - `https://cortiq.se/**`
  - `https://cortiq.se/auth`
  - `https://cortiq.se/auth?type=recovery`
  - `https://cortiq.se/dashboard`

---

## Post-deployment checklist

### Frontend
- [ ] `https://cortiq.se` loads correctly
- [ ] `https://cortiq.se/spa-tracking.js` is accessible
- [ ] `.htaccess` exists in the web root
- [ ] `/auth` route works (no 404)
- [ ] Password recovery flow works end-to-end
- [ ] Tracking fires in browser console
- [ ] All routes work (`/dashboard`, `/cmp`, etc.)

### Backend (Supabase)
- [x] Database — 62 tables deployed
- [x] Database functions — 43 deployed
- [x] Edge Functions — 51 deployed
- [ ] Verify Site URL and Redirect URLs in Auth settings
- [ ] Test Edge Functions if you deployed changes
- [ ] Verify RLS policies if you modified them

---

## Troubleshooting

**404 on all routes except `/`**
Check that `.htaccess` exists in the web root and that Apache has `mod_rewrite` enabled.

**404 on `/auth` after Supabase redirect**
Verify Redirect URLs in Supabase Auth settings include `https://cortiq.se/**`.

**Tracking script not loading**
Confirm `spa-tracking.js` is in `dist/` after build and accessible via the web server. Check CORS settings if loading cross-origin.

**Supabase connection fails**
Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in your `.env`. Check that the Supabase project is active.

**Edge Functions not working**
Run `supabase functions list` to verify deployment. Check logs in the Supabase Dashboard under Edge Functions → [function name] → Logs.

**Password recovery gives 404**
Verify `.htaccess` exists on the server and that Redirect URLs include `https://cortiq.se/auth?type=recovery`.
