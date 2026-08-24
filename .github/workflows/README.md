# GitHub Actions Workflows

This directory contains automated CI/CD workflows for CortIQ.

---

## 📋 Available Workflows

### `deploy-production.yml`

**Purpose**: Automatically deploy to production (cortiq.se) when code is pushed to `main` branch.

**Triggers**:
- Push to `main` branch
- Manual trigger via GitHub Actions UI

**Steps**:
1. Checkout code
2. Setup Node.js 18
3. Install dependencies
4. Run TypeScript check (optional)
5. Run ESLint (optional)
6. Build production bundle
7. Deploy to cortiq.se via FTP
8. Run basic smoke test
9. Notify on Slack (optional)

**Duration**: ~3-5 minutes

---

## 🔐 Required Secrets

Before the workflow can run, you must configure these secrets in GitHub:

**Location**: Repository → Settings → Secrets and variables → Actions → New repository secret

### Required Secrets

#### 1. `VITE_SUPABASE_URL`
- **Value**: `https://cxmkdtgfocgbfizawlwa.supabase.co`
- **Description**: Supabase project URL

#### 2. `VITE_SUPABASE_ANON_KEY`
- **Value**: Your Supabase anonymous (public) key
- **Where to find**: Supabase Dashboard → Settings → API → anon public key
- **Example**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

#### 3. `VITE_SUPABASE_PROJECT_ID`
- **Value**: `cxmkdtgfocgbfizawlwa`
- **Description**: Supabase project ID

#### 4. `FTP_SERVER`
- **Value**: Your FTP server hostname
- **Example**: `ftp.cortiq.se` or `cortiq.se`

#### 5. `FTP_USERNAME`
- **Value**: Your FTP username
- **Example**: `cortiq_user`

#### 6. `FTP_PASSWORD`
- **Value**: Your FTP password
- **⚠️ IMPORTANT**: Keep this secret secure!

#### 7. `FTP_SERVER_DIR`
- **Value**: Target directory on FTP server
- **Example**: `/public_html/` or `/var/www/cortiq.se/`
- **Note**: Must end with `/`

### Optional Secrets

#### 8. `SLACK_WEBHOOK_URL` (Optional)
- **Value**: Slack webhook URL for deployment notifications
- **Where to create**: Slack → Apps → Incoming Webhooks
- **Example**: `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX`
- **Note**: If not set, Slack notifications are skipped

---

## 🚀 How to Set Up Secrets

### Step 1: Get FTP Credentials

Contact your hosting provider or check your hosting panel:

**Common hosting panels**:
- cPanel: Home → FTP Accounts → Create FTP Account
- Plesk: Websites & Domains → FTP Access
- DirectAdmin: Account Manager → FTP Management

**What you need**:
- FTP hostname (e.g., `ftp.cortiq.se`)
- FTP username
- FTP password
- Target directory path

### Step 2: Get Supabase Keys

1. Visit: https://supabase.com/dashboard/project/cxmkdtgfocgbfizawlwa
2. Go to: Settings → API
3. Copy:
   - Project URL: `https://cxmkdtgfocgbfizawlwa.supabase.co`
   - anon public key: `eyJhbGci...`

### Step 3: Add Secrets to GitHub

1. Go to GitHub repository: https://github.com/expandtalk/cortiq
2. Click: Settings (top menu)
3. Click: Secrets and variables → Actions (left sidebar)
4. Click: New repository secret (green button)
5. Add each secret:
   - Name: `VITE_SUPABASE_URL`
   - Value: `https://cxmkdtgfocgbfizawlwa.supabase.co`
   - Click: Add secret
6. Repeat for all secrets above

### Step 4: Verify Secrets

After adding all secrets, you should see:

```
✓ VITE_SUPABASE_URL
✓ VITE_SUPABASE_ANON_KEY
✓ VITE_SUPABASE_PROJECT_ID
✓ FTP_SERVER
✓ FTP_USERNAME
✓ FTP_PASSWORD
✓ FTP_SERVER_DIR
○ SLACK_WEBHOOK_URL (optional)
```

---

## 🧪 Testing the Workflow

### Option 1: Test with a Commit

```bash
# Make a small change
echo "# Test deployment" >> test.txt

# Commit and push to main
git add test.txt
git commit -m "test: Trigger deployment workflow"
git push origin main
```

### Option 2: Manual Trigger

1. Go to: https://github.com/expandtalk/cortiq/actions
2. Click: "Deploy to Production" workflow (left sidebar)
3. Click: "Run workflow" (blue button)
4. Select: Branch: `main`
5. Click: "Run workflow" (confirm)

---

## 📊 Monitoring Deployments

### View Workflow Runs

**URL**: https://github.com/expandtalk/cortiq/actions

**What you'll see**:
- ✅ Green checkmark: Deployment successful
- ❌ Red X: Deployment failed
- 🟡 Yellow circle: In progress

### View Deployment Logs

1. Click on a workflow run
2. Click on "Build and Deploy to cortiq.se" job
3. Expand each step to see logs

### Common Errors

#### Error: "FTP connection failed"
**Cause**: FTP credentials incorrect or server unreachable
**Fix**:
- Verify FTP_SERVER, FTP_USERNAME, FTP_PASSWORD in secrets
- Test FTP connection manually with FileZilla

#### Error: "Build failed"
**Cause**: TypeScript errors or missing dependencies
**Fix**:
- Check logs for specific error
- Fix locally first: `npm run build`
- Commit fix and push

#### Error: "Secrets not found"
**Cause**: Required secrets not configured
**Fix**:
- Add missing secrets (see "Required Secrets" above)

#### Error: "Permission denied"
**Cause**: FTP user doesn't have write permission
**Fix**:
- Check FTP_SERVER_DIR has correct permissions (755)
- Ensure FTP user owns the directory

---

## 🔧 Customizing the Workflow

### Change Deployment Branch

Edit `.github/workflows/deploy-production.yml`:

```yaml
on:
  push:
    branches:
      - main        # Change to your branch
      - production  # Or add multiple branches
```

### Add Staging Environment

Create `.github/workflows/deploy-staging.yml`:

```yaml
name: Deploy to Staging

on:
  push:
    branches:
      - develop

# Same steps but deploy to staging.cortiq.se
```

### Add More Tests

Add test step before deployment:

```yaml
- name: 🧪 Run tests
  run: npm test

- name: 🧪 Run E2E tests
  run: npm run test:e2e
```

### Change Node Version

Edit:

```yaml
env:
  NODE_VERSION: '20'  # Change from 18 to 20
```

---

## 📞 Troubleshooting

### Workflow not running?

**Check**:
1. Workflow file is in `.github/workflows/` directory
2. File has `.yml` or `.yaml` extension
3. YAML syntax is valid (use YAML validator)
4. You pushed to the correct branch

### Deployment succeeded but site not updated?

**Check**:
1. FTP_SERVER_DIR is correct
2. Files were uploaded (check FTP manually)
3. Web server is serving correct directory
4. Clear browser cache
5. Check `.htaccess` or nginx config

### How to disable auto-deploy?

**Option 1**: Remove workflow file
```bash
git rm .github/workflows/deploy-production.yml
git commit -m "Disable auto-deploy"
git push
```

**Option 2**: Change trigger to manual only
```yaml
on:
  workflow_dispatch:  # Only manual trigger
```

---

## 📚 Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [FTP-Deploy-Action](https://github.com/SamKirkland/FTP-Deploy-Action)

---

## ✅ Setup Checklist

Before first deployment:

- [ ] All required secrets added to GitHub
- [ ] FTP credentials tested manually
- [ ] Supabase keys verified
- [ ] Target directory on server exists and is writable
- [ ] Web server configured correctly
- [ ] HTTPS/SSL certificate active
- [ ] DNS points to correct server
- [ ] `.htaccess` or nginx config ready

After first successful deployment:

- [ ] Site loads at https://cortiq.se
- [ ] No console errors in browser
- [ ] Tracking script loads correctly
- [ ] Can log in to dashboard
- [ ] Smoke tests pass
- [ ] Monitoring configured (UptimeRobot, Sentry)

---

**Need help?** Check the logs in GitHub Actions or refer to [DEPLOYMENT.md](../../DEPLOYMENT.md)
