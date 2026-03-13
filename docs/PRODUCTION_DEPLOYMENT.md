# Production Deployment Guide

**Version:** v2.9
**App Name:** Open Invite - Social coordination iOS app

---

## Production URLs

- **Backend API:** https://api.openinvite.cloud
- **Share Domain:** https://go.openinvite.cloud
- **App Store:** https://apps.apple.com/app/id6757429210

---

## GitHub Repository (Backend Only)

- **URL:** https://github.com/paulyd-oi/my-app-backend
- **Token:** [REDACTED - See secure notes]
- **CRITICAL:** Only push the `/backend` folder to this repo, NOT the full Vibecode workspace
- **Render auto-deploys from this repo when you push to main**

---

## Deploy Backend to Production (One-liner)

```bash
rm -rf /tmp/backend-push && mkdir -p /tmp/backend-push && cp -r /home/user/workspace/backend/. /tmp/backend-push/ && cd /tmp/backend-push && rm -rf .git && git init && git add -A && git commit -m "Your message" && git remote add origin https://[TOKEN]@github.com/paulyd-oi/my-app-backend.git && git branch -M main && git push -f origin main
```

**Wait 2-5 minutes for Render to redeploy.**

---

## App Icon Management

The app icon exists in multiple locations:

### 1. Main App Icon
- **Path:** `/icon.png`
- **Referenced:** `app.json` line 39: `"icon": "./icon.png"`
- **Purpose:** Expo builds, home screen icon
- **Current:** New design (1.5MB PNG)

### 2. Public Folder Icon
- **Path:** `/public/open-invite-app-icon.png`
- **URL:** `https://api.openinvite.cloud/uploads/open-invite-app-icon.png`
- **Purpose:** Web sharing, universal links, backend static serving
- **Current:** New design (1.5MB PNG)

### 3. Source Upload
- **Path:** `/assets/icon-{timestamp}.png`
- **Purpose:** Latest upload from IMAGES tab
- **Example:** `/assets/icon-1767499672323.png`

### Icon Update Process
1. User uploads via IMAGES tab → saved to `/assets/icon-{timestamp}.png`
2. Copy to `/icon.png` for Expo builds
3. Copy to `/public/open-invite-app-icon.png` for web/backend
4. Commit changes and redeploy backend using one-liner above
5. Republish app via Vibecode to update frontend
6. **App Store:** Submit new build via EAS/App Store Connect

---

## Environment Variables

### Google Maps API
- **Variable:** `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY`
- **Configuration:** Set in EAS/Expo environment (NEVER commit keys)
- **Usage:** Google Places API, Maps, location autocomplete
- **Status:** Configured in Expo production environment

---

## Admin Endpoints (Testing)

### Delete User by Email
```bash
curl -X DELETE "https://api.openinvite.cloud/api/profile/admin/delete-user/EMAIL_HERE"
```
Deletes user and all related data (profile, sessions, verification codes, friendships, etc.)

### Discount Codes System
- **Admin Key:** `openinvite-admin-2026` (Render env: ADMIN_API_KEY)
- **Seed codes:**
  ```bash
  curl -X POST "http://localhost:10000/api/discount/seed" -H "X-Admin-Api-Key: openinvite-admin-2026" -H "Content-Type: application/json"
  ```
- **Update limits:**
  ```bash
  curl -X POST "http://localhost:10000/api/discount/update-limits" -H "X-Admin-Api-Key: openinvite-admin-2026" -H "Content-Type: application/json"
  ```
- **Available codes:** `MONTH1FREE` (500 uses), `YEAR1FREE` (200 uses), `LIFETIME4U` (100 uses)

---

## App Store Submission

**Cannot assist with App Store or Google Play submission processes** (app.json, eas.json, EAS CLI commands).

For submission help: **Click "Share" on top right in Vibecode App → Select "Submit to App Store"**