# Railway Deployment Guide

## Overview

This guide will help you deploy the Shipping Doc Gen application to Railway in under 10 minutes.

**Cost**: ~$5-10/month (includes free $5 credit)

## Prerequisites

- GitHub account
- Railway account (sign up at [railway.app](https://railway.app))
- Git installed locally

## Quick Start (Web UI Method)

### 1. Connect GitHub Repository

1. Go to [railway.app](https://railway.app)
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select `JoelA510/Shipping-Doc-Gen`
4. Railway will detect your services automatically

### 2. Configure Services

Railway will create services for each Dockerfile. You need to configure:

#### **API Service** (apps/api)
```bash
# Environment Variables to set in Railway dashboard:
PORT=3001
NODE_ENV=production
AUTH_SECRET=<generate-random-32-char-string>
STORAGE_PATH=/app/storage
REDIS_HOST=${{Redis.RAILWAY_PRIVATE_DOMAIN}}
REDIS_PORT=6379
OCR_SERVICE_URL=http://${{OCR.RAILWAY_PRIVATE_DOMAIN}}:3002
OCR_ENABLED=true
```

#### **Web Service** (apps/web)
```bash
# No environment variables needed
# Railway will auto-assign a public URL
```

#### **OCR Service** (services/ocr)
```bash
# No special environment variables needed
```

#### **Redis Service**
1. Click **"New Service"** → **"Database"** → **"Add Redis"**
2. Railway provisions this automatically
3. Reference in API as `${{Redis.RAILWAY_PRIVATE_DOMAIN}}`

### 3. Enable Public Domains

For services that need public access:

**API Service:**
1. Go to service → Settings → Networking
2. Click **"Generate Domain"**
3. Copy the URL (e.g., `api-production-xxxx.up.railway.app`)

**Web Service:**
1. Go to service → Settings → Networking
2. Click **"Generate Domain"**
3. This is your app URL!

### 4. Update Web Environment

Update the web service to point to your API:
1. Edit API nginx.conf or add env var
2. Set `VITE_API_URL` to your Railway API domain

## Alternative: CLI Method (Advanced)

### Install Railway CLI

```bash
npm install -g @railway/cli
railway login
```

### Deploy from Command Line

```bash
# In project root
cd /path/to/Shipping-Doc-Gen

# Link to Railway project
railway link

# Deploy all services
railway up
```

### Set Environment Variables via CLI

```bash
# API service
railway variables set AUTH_SECRET=your-secret-here
railway variables set REDIS_HOST='${{Redis.RAILWAY_PRIVATE_DOMAIN}}'

# Deploy
railway up
```

## Service Configuration Summary

| Service | Port | Public Access | Auto-Deploy |
|---------|------|---------------|-------------|
| Web (nginx) | 80 | ✅ Yes | ✅ |
| API (Express) | 3001 | ✅ Yes | ✅ |
| OCR | 3002 | ❌ Internal only | ✅ |
| Redis | 6379 | ❌ Internal only | N/A |

## Environment Variables Reference

### Required

```bash
# API Service (apps/api)
AUTH_SECRET=<32-char-random-string>
REDIS_HOST=${{Redis.RAILWAY_PRIVATE_DOMAIN}}
OCR_SERVICE_URL=http://${{OCR.RAILWAY_PRIVATE_DOMAIN}}:3002
```

### Optional

```bash
# If using Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Railway-Specific Features Used

✅ **Private Networking** - Services communicate via internal domains
✅ **Automatic SSL** - HTTPS enabled by default
✅ **Auto-Deploy** - Deploys on git push to main
✅ **Health Checks** - Uses Dockerfile HEALTHCHECK
✅ **Persistent Volumes** - Automatic for Redis
✅ **Logs** - Real-time in dashboard

## Post-Deployment Checklist

- [ ] All 4 services deployed (web, api, ocr, redis)
- [ ] Public domains generated for web and api
- [ ] Environment variables set (especially AUTH_SECRET)
- [ ] Health checks passing (check Railway dashboard)
- [ ] Visit web URL and test:
  - [ ] Can register/login
  - [ ] Can upload document
  - [ ] Can view parsed data
  - [ ] Can export PDF

## Monitoring

**Railway Dashboard:**
- View logs: Click service → Logs tab
- Check metrics: CPU, Memory, Network
- View deployments: Deployment history

## Troubleshooting

### Service won't start
- Check logs in Railway dashboard
- Verify environment variables are set
- Ensure Dockerfile builds successfully

### Can't connect to Redis
- Verify Redis service is running
- Check `REDIS_HOST` uses `${{Redis.RAILWAY_PRIVATE_DOMAIN}}`
- Ensure services are in same project

### Frontend can't reach API
- Verify API has public domain
- Update web environment with API URL
- Check CORS settings in API

## Cost Optimization

**Free Tier Usage:**
- $5/month credit covers ~500 hours
- Optimize by:
  - Reducing replica count
  - Using smaller instances
  - Monitoring usage in dashboard

**Estimated Monthly Cost:**
- Hobby plan: $5/month minimum
- Typical usage: $5-10/month
- Can set spending limits in settings

## Custom Domain (Optional)

1. Go to web service → Settings → Networking
2. Click **"Custom Domain"**
3. Add your domain (e.g., `app.yourdomain.com`)
4. Update DNS records as instructed
5. SSL certificate auto-generated

## Next Steps

After deployment:
1. Test all features in production
2. Set up monitoring/alerts (Railway webhooks)
3. Configure backups for Redis data
4. Add custom domain
5. Invite beta users!

## Support

- Railway Docs: https://docs.railway.app
- Discord: https://discord.gg/railway
- Your deployment is ready! 🚀
