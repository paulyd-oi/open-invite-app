# Railway Deployment Guide for Open Invite Backend

## Prerequisites
- A Railway account (https://railway.app)
- Railway CLI installed (optional, but helpful)

## Step-by-Step Deployment

### Step 1: Prepare Your Backend for Railway

Before deploying, you need to make these changes to switch from SQLite to PostgreSQL:

1. **Replace the Prisma schema:**
   ```bash
   cp prisma/schema.railway.prisma prisma/schema.prisma
   ```

2. **Replace the database client:**
   ```bash
   cp src/db.railway.ts src/db.ts
   ```

3. **Replace the main entry file (removes Vibecode proxy):**
   ```bash
   cp src/index.railway.ts src/index.ts
   ```

4. **Remove Vibecode-specific packages from package.json:**
   - Remove `@vibecodeapp/proxy`
   - Remove `@vibecodeapp/cloud-studio`
   - Remove `@prisma/adapter-better-sqlite3`

5. **Update package.json scripts:**
   ```json
   {
     "scripts": {
       "dev": "NODE_ENV=development bun run --hot src/index.ts",
       "build": "NODE_ENV=production bun build src/index.ts --outdir dist --target bun",
       "start": "NODE_ENV=production bun run dist/index.js",
       "postinstall": "prisma generate",
       "typecheck": "tsc --noEmit"
     }
   }
   ```

### Step 2: Create Railway Project

1. Go to https://railway.app/new
2. Click "Deploy from GitHub repo" or "Empty project"
3. If using GitHub:
   - Connect your GitHub account
   - Select your repository
   - Choose the `backend` folder as root directory

### Step 3: Add PostgreSQL Database

1. In your Railway project, click "New"
2. Select "Database" → "PostgreSQL"
3. Railway will automatically create a `DATABASE_URL` variable

### Step 4: Configure Environment Variables

In your Railway project settings, add these environment variables:

| Variable | Value | Notes |
|----------|-------|-------|
| `PORT` | `3000` | Railway will override this with `$PORT` |
| `NODE_ENV` | `production` | |
| `DATABASE_URL` | (auto-filled) | Railway provides this |
| `BETTER_AUTH_SECRET` | (generate one) | Min 32 characters. Use `openssl rand -base64 32` |
| `BACKEND_URL` | `https://your-app.railway.app` | Your Railway domain |

To generate a secure secret:
```bash
openssl rand -base64 32
```

### Step 5: Deploy

If using GitHub integration:
- Push to your main branch
- Railway will auto-deploy

If using Railway CLI:
```bash
cd backend
railway login
railway link
railway up
```

### Step 6: Run Database Migrations

After first deploy, you need to run migrations:

**Option A: Via Railway Shell**
1. Go to your service in Railway
2. Click "Shell" tab
3. Run: `bunx prisma migrate deploy`

**Option B: Via Railway CLI**
```bash
railway run bunx prisma migrate deploy
```

### Step 7: Update Your Mobile App

In your Expo app, update the backend URL:

1. Go to the ENV tab in Vibecode
2. Update `EXPO_PUBLIC_VIBECODE_BACKEND_URL` to your Railway URL
   - Example: `https://your-app-name.railway.app`

Or update `.env` directly:
```
EXPO_PUBLIC_VIBECODE_BACKEND_URL=https://your-app-name.railway.app
```

---

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `BETTER_AUTH_SECRET` | Auth encryption secret (min 32 chars) | `your-super-secret-key-here-32chars` |
| `BACKEND_URL` | Public URL of your backend | `https://app.railway.app` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port (Railway overrides this) |
| `NODE_ENV` | `development` | Environment mode |

---

## Troubleshooting

### "Database connection failed"
- Make sure PostgreSQL is added to your Railway project
- Check that `DATABASE_URL` is correctly set
- Run `bunx prisma migrate deploy` to create tables

### "BETTER_AUTH_SECRET is required"
- Add `BETTER_AUTH_SECRET` environment variable
- Must be at least 32 characters

### "Module not found: @vibecodeapp/proxy"
- You need to use the Railway-specific files:
  - `src/index.railway.ts` → `src/index.ts`
  - `src/db.railway.ts` → `src/db.ts`

### "Prisma Client not generated"
- Run `bunx prisma generate` locally before deploying
- Or ensure `postinstall` script runs: `"postinstall": "prisma generate"`

---

## Quick Setup Script

Create a `prepare-railway.sh` script:

```bash
#!/bin/bash
echo "Preparing backend for Railway deployment..."

# Backup original files
cp prisma/schema.prisma prisma/schema.sqlite.prisma.bak
cp src/db.ts src/db.sqlite.ts.bak
cp src/index.ts src/index.vibecode.ts.bak

# Use Railway-compatible files
cp prisma/schema.railway.prisma prisma/schema.prisma
cp src/db.railway.ts src/db.ts
cp src/index.railway.ts src/index.ts

echo "✅ Backend prepared for Railway!"
echo ""
echo "Next steps:"
echo "1. Remove @vibecodeapp packages from package.json"
echo "2. Push to GitHub or run 'railway up'"
echo "3. Add PostgreSQL database in Railway"
echo "4. Set environment variables"
echo "5. Run migrations: railway run bunx prisma migrate deploy"
```

---

## File Changes Summary

| Original File | Railway File | Change |
|--------------|--------------|--------|
| `prisma/schema.prisma` | `prisma/schema.railway.prisma` | SQLite → PostgreSQL |
| `src/db.ts` | `src/db.railway.ts` | Remove SQLite pragmas |
| `src/index.ts` | `src/index.railway.ts` | Remove Vibecode proxy |

---

## Cost Estimate

Railway pricing (as of 2024):
- **Hobby Plan**: $5/month includes $5 of usage
- **PostgreSQL**: ~$0.000231/GB-hour
- **Compute**: ~$0.000463/vCPU-hour

For a small app, expect ~$5-15/month total.
