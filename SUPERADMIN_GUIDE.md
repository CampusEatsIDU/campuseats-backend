# 🛡️ CampusEats SuperAdmin — Full Deployment & Testing Guide

## 📋 What Was Built

### Backend (d:\campuseats-backend)
| File | Description |
|------|-------------|
| `src/routes/admin.routes.js` | Complete admin API with 15+ endpoints |
| `src/services/audit.service.js` | Enhanced audit logging with fallback column handling |
| `src/services/notification.service.js` | Enhanced notifications with admin view |
| `src/middleware/rateLimit.middleware.js` | In-memory rate limiter (200 req/min) |
| `src/app.js` | Updated with rate limiting |
| `src/routes/auth.routes.js` | Blocked/deleted users can't login |
| `src/db/migrations/002_superadmin_full.sql` | DB migration (orders table, column fixes) |

### Frontend (d:\campuseats-frontend-)
| File | Description |
|------|-------------|
| `admin.html` | Complete premium admin UI (dark theme, responsive) |
| `admin.js` | Full admin logic (all 7+ sections) |
| `script.js` | Superadmin auto-redirect to admin.html |

---

## 🚀 STEP 1: Deploy Backend

### Option A: Deploy to AlwaysData via SSH
```bash
# SSH into alwaysdata
ssh your_user@ssh-your_user.alwaysdata.net

# Navigate to backend directory
cd /path/to/campuseats-backend

# Pull latest code (or copy files)
git pull origin main

# Install deps (if needed)
npm install

# Restart the app (AlwaysData admin panel or pm2)
pm2 restart all
# OR
killall node && npm start &
```

### Option B: Deploy to Vercel (if using Vercel for backend)
```bash
cd D:\campuseats-backend

# Commit changes
git add -A
git commit -m "feat: complete superadmin panel with all features"
git push origin main

# Vercel will auto-deploy from the push
```

---

## 🚀 STEP 2: Run Database Migration

**IMPORTANT**: Run this ONCE to create the `orders` table and fix column mismatches.

```bash
cd D:\campuseats-backend
node run_migration_002.js
```

Expected output: `Migration 002 executed successfully!`

*(This migration was already run during development, so it should be idempotent - safe to run again)*

---

## 🚀 STEP 3: Deploy Frontend

```bash
cd D:\campuseats-frontend-

# Commit and push
git add -A
git commit -m "feat: professional superadmin panel UI"
git push origin main

# Vercel will auto-deploy
```

---

## ✅ STEP 4: Testing Checklist

### 🔐 Login Flow
- [ ] Open the site → Login page appears
- [ ] Login as **SuperAdmin** → Automatically redirects to `admin.html`
- [ ] Login as **regular user** → Normal food ordering interface
- [ ] Login as **blocked user** → Shows "Your account has been blocked" error
- [ ] Logout from admin panel → Returns to login page

### 📊 Dashboard
- [ ] Shows Total Users count
- [ ] Shows Total Restaurants count
- [ ] Shows Total Orders count
- [ ] Shows Total Revenue (UZS)
- [ ] Shows Pending Verifications count
- [ ] Shows Verified Students percentage
- [ ] Shows Blocked Accounts percentage
- [ ] Shows Audit Logs count
- [ ] Recent Activity table shows latest admin actions
- [ ] Pending Verifications quick-action panel works
- [ ] Refresh button updates all stats

### 👥 Users
- [ ] All users are listed in table
- [ ] Search by phone works
- [ ] Search by name works
- [ ] Filter by role (All/User/Restaurant/SuperAdmin) works
- [ ] Filter by status (All/Active/Blocked/Deleted) works
- [ ] Click eye icon → Modal shows full user details (phone, role, status, verified, balance, registration date, orders, verifications)
- [ ] Block button → Blocks user, shows toast notification
- [ ] Unblock button → Unblocks user, shows toast notification
- [ ] Reset Password button → Shows new temp password in modal
- [ ] Change Role button → Toggles between user↔restaurant
- [ ] Delete button → Prompts for soft/hard, then deletes
- [ ] SuperAdmin accounts show "Protected" (can't be modified)
- [ ] Pagination works for large user lists

### 🍽 Restaurants
- [ ] Create form: Fill phone + name → Click Create → Shows temp password
- [ ] Password is displayed prominently with "SAVE - SHOWN ONCE ONLY" warning
- [ ] All restaurants listed in table with order count and revenue
- [ ] Block/Activate restaurant works
- [ ] Reset restaurant password works

### 🎓 Verifications
- [ ] Shows pending verifications by default
- [ ] Filter: All / Pending / Approved / Rejected
- [ ] Images display (front/back when available)
- [ ] Click image → Opens in new tab (full size)
- [ ] Approve → Updates status, sends notification, creates audit log
- [ ] Reject → Prompts for reason, updates status, sends notification
- [ ] Rejected entries show reason text

### 📦 Orders
- [ ] All orders displayed in table
- [ ] Filter by user ID works
- [ ] Filter by status (pending/confirmed/...) works
- [ ] Date range filter works (from → to)
- [ ] Shows customer name, restaurant, total, status, address, date
- [ ] Pagination works
- [ ] *(If no orders yet, shows "No orders found" empty state)*

### 📜 Audit Logs
- [ ] All admin actions are logged
- [ ] Filter by action type works
- [ ] Shows: Admin name, Action tag (color-coded), Details (JSON), Date
- [ ] Pagination works
- [ ] Actions include: VERIFICATION_APPROVED, VERIFICATION_REJECTED, USER_BLOCKED, USER_UNBLOCKED, USER_DELETED, RESTAURANT_CREATED, PASSWORD_RESET, ROLE_CHANGED

### 🔔 Notifications
- [ ] All notifications displayed
- [ ] Shows: User, Type, Message, Read status, Date
- [ ] Pagination works

### 🛡 Security
- [ ] All admin routes require JWT token (401 without)
- [ ] Only `superadmin` role can access admin routes (403 for others)
- [ ] Can't block/delete yourself
- [ ] Can't block/delete other superadmins
- [ ] Can't change your own role
- [ ] Rate limiting works (200 req/min per IP)
- [ ] Blocked users can't login

### 📱 Responsive
- [ ] Admin panel works on desktop (full sidebar)
- [ ] Admin panel works on tablet (collapsible sidebar)
- [ ] Mobile hamburger menu works

---

## 🔧 STEP 5: Create SuperAdmin Account (if needed)

If you don't have a superadmin account yet, run this:

```bash
cd D:\campuseats-backend
node -e "
require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./src/config/db');

async function createAdmin() {
  const phone = '+998XXXXXXXXX';  // ← YOUR PHONE
  const password = 'YourSecurePassword123';  // ← YOUR PASSWORD
  const hash = await bcrypt.hash(password, 10);
  
  try {
    const result = await pool.query(
      'INSERT INTO users (phone, password, role, full_name, status) VALUES (\$1, \$2, \'superadmin\', \'Super Admin\', \'active\') RETURNING id, phone',
      [phone, hash]
    );
    console.log('SuperAdmin created:', result.rows[0]);
  } catch(e) {
    if (e.code === '23505') console.log('Phone already exists. You may already be a superadmin.');
    else console.error(e.message);
  }
  pool.end();
}
createAdmin();
"
```

Or if you already have a user account and want to promote it:

```sql
UPDATE users SET role = 'superadmin' WHERE phone = '+998XXXXXXXXX';
```

---

## 📁 API Endpoints Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/dashboard` | Dashboard analytics |
| GET | `/api/admin/users` | List users (search, role, status, pagination) |
| GET | `/api/admin/users/:id` | Single user detail + orders + verifications |
| POST | `/api/admin/users/:id/block` | Block user |
| POST | `/api/admin/users/:id/unblock` | Unblock user |
| POST | `/api/admin/users/:id/delete` | Soft-delete user |
| POST | `/api/admin/users/:id/hard-delete` | Hard-delete user |
| POST | `/api/admin/users/:id/reset-password` | Reset password |
| POST | `/api/admin/users/:id/change-role` | Change role (user↔restaurant) |
| GET | `/api/admin/restaurants` | List restaurants with stats |
| POST | `/api/admin/restaurants/create` | Create restaurant account |
| GET | `/api/admin/verifications` | List verifications (status filter) |
| POST | `/api/admin/verifications/:id/approve` | Approve verification |
| POST | `/api/admin/verifications/:id/reject` | Reject verification (with reason) |
| GET | `/api/admin/orders` | List orders (user, restaurant, status, date filters) |
| GET | `/api/admin/orders/:id` | Single order detail + items |
| GET | `/api/admin/audit` | Audit logs (action filter, pagination) |
| GET | `/api/admin/notifications` | All notifications (pagination) |

All protected by: `authMiddleware` + `requireRole("superadmin")`

---

## 🎨 Design Features
- Premium dark theme with orange accent (#f97316)
- Glassmorphism-inspired cards
- Smooth animations (fadeSlideIn, hover effects)
- Color-coded badges (Active=green, Blocked=red, Pending=yellow)
- Color-coded action tags in audit logs
- Toast notifications (success/error/info)
- Modal dialogs for details and password display
- Responsive sidebar with mobile hamburger
- Custom scrollbar styling
- Font: Inter (Google Fonts)
- Icons: Font Awesome 6
