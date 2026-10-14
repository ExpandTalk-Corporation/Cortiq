# 🏗️ CortIQ System Architecture

Complete technical architecture documentation for the CortIQ analytics platform.

---

## 📋 Table of Contents

- [System Overview](#-system-overview)
- [Architecture Diagram](#-architecture-diagram)
- [Technology Stack](#-technology-stack)
- [Data Flow](#-data-flow)
- [Database Schema](#-database-schema)
- [Edge Functions](#-edge-functions)
- [Frontend Architecture](#-frontend-architecture)
- [Security Architecture](#-security-architecture)
- [Scalability](#-scalability)
- [Design Decisions](#-design-decisions)

---

## 🎯 System Overview

CortIQ is a full-stack web analytics platform built on modern cloud-native architecture:

```
┌─────────────────────────────────────────────────────────┐
│                     CortIQ Platform                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Frontend (React/TypeScript)                             │
│  ↕                                                       │
│  Backend (Supabase)                                      │
│  ├─ PostgreSQL Database (62 tables)                     │
│  ├─ Edge Functions (51 serverless functions)            │
│  ├─ Authentication (Supabase Auth)                       │
│  └─ Storage (Supabase Storage)                          │
│  ↕                                                       │
│  External Integrations                                   │
│  ├─ Google Analytics 4                                   │
│  ├─ Google Search Console                                │
│  ├─ Data Warehouses (BigQuery, Snowflake, etc.)         │
│  └─ External Sites (tracking script)                    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Key Architectural Principles

1. **Serverless-First**: No servers to manage, auto-scaling
2. **Privacy-by-Design**: GDPR-compliant from ground up
3. **Real-time Capable**: WebSocket support for live data
4. **API-First**: All features accessible via API
5. **Modular**: Each feature can work independently

---

## 📐 Architecture Diagram

### High-Level Architecture

```
┌──────────────────────┐
│   External Websites  │
│   (with tracking)    │
└──────────┬───────────┘
           │
           ↓ spa-tracking.js
┌──────────────────────────────────────────────────────────┐
│                    Edge Functions Layer                   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │ track-     │  │ visitor-   │  │ ai-bot-    │        │
│  │ event      │  │ identify   │  │ tracker    │  + 48  │
│  └────────────┘  └────────────┘  └────────────┘   more  │
└────────────────────────┬──────────────────────────────────┘
                         │
                         ↓
┌──────────────────────────────────────────────────────────┐
│                  PostgreSQL Database                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ events   │  │ sessions │  │ visitors │  │ sites  │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
│  + 58 more tables + 43 custom functions                  │
└────────────────────────┬──────────────────────────────────┘
                         │
                         ↓
┌──────────────────────────────────────────────────────────┐
│                  React Frontend (SPA)                     │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │ Dashboard  │  │ Analytics  │  │ AI Agents  │        │
│  │ (15 tabs)  │  │ Components │  │ Tracking   │        │
│  └────────────┘  └────────────┘  └────────────┘        │
│                                                          │
│  Settings (4)    Advanced (6)     80+ Components        │
└──────────────────────────────────────────────────────────┘
                         │
                         ↓
                    User Browser
```

---

## 🛠 Technology Stack

### Frontend Stack

```typescript
{
  "framework": "React 18.3.1",
  "language": "TypeScript 5.5.3",
  "build": "Vite 5.4.1",
  "styling": "Tailwind CSS 3.4.11",
  "ui": "shadcn/ui (Radix UI)",
  "routing": "React Router 6.26.2",
  "state": "TanStack Query 5.56.2",
  "charts": "Recharts 2.12.7",
  "maps": "Leaflet 1.9.4",
  "recording": "rrweb 2.0.0-alpha.11"
}
```

### Backend Stack

```typescript
{
  "platform": "Supabase",
  "database": "PostgreSQL 14",
  "runtime": "Deno (Edge Functions)",
  "auth": "Supabase Auth",
  "storage": "Supabase Storage",
  "realtime": "Supabase Realtime"
}
```

### Infrastructure

- **Hosting**: Supabase Cloud (EU region)
- **CDN**: Supabase CDN for static assets
- **DNS**: Managed via domain provider
- **SSL**: Automatic via Supabase

---

## 🔄 Data Flow

### 1. Tracking Event Flow

```
External Website
  ↓ (spa-tracking.js loads)
  ↓
JavaScript captures event
  ↓
POST /functions/v1/track-event
  ↓
Edge Function validates
  ↓
Database insert (events table)
  ↓
Triggers fire
  ├→ Update session stats
  ├→ Update visitor profile
  └→ Calculate aggregations
  ↓
Real-time subscription updates dashboard
```

### 2. AI Agent Detection Flow

```
Request arrives
  ↓
Parse User-Agent
  ↓
Check patterns:
  ├→ ChatGPT? → ai_agent_sessions
  ├→ Perplexity? → ai_agent_sessions
  ├→ Claude? → ai_agent_sessions
  ├→ Bot? → bot_traffic
  └→ Human? → human_sessions
  ↓
Store in appropriate table
  ↓
Update unified_visitors profile
  ↓
Funnel analysis calculation
```

### 3. Dashboard Data Flow

```
User opens dashboard
  ↓
React app loads
  ↓
TanStack Query fetches:
  ├→ Supabase RPC functions
  ├→ Direct table queries (with RLS)
  └→ Edge Functions (for complex calc)
  ↓
Data cached in React Query
  ↓
Components render with data
  ↓
Real-time updates via WebSocket
```

---

## 🗄️ Database Schema

### Core Tables (62 total)

#### 1. Tracking & Events
```sql
events                    -- All tracking events
sessions                  -- User sessions
pageviews                 -- Page view events
clicks                    -- Click events
form_submissions          -- Form interactions
```

#### 2. Visitor Management
```sql
unified_visitors          -- Unified visitor profiles
visitor_session_links     -- Links sessions to visitors
visitor_segments          -- Segment assignments
visitor_segment_definitions  -- Segment rules
```

#### 3. AI Agent Tracking
```sql
ai_agent_sessions         -- AI agent sessions
ai_bot_traffic            -- Bot traffic logs
ai_search_traffic         -- AI search crawlers
ai_agent_journey_steps    -- Journey funnel steps
```

#### 4. Analytics
```sql
heatmap_data              -- Click heatmap points
form_analytics            -- Form field analytics
ab_tests                  -- A/B test definitions
ab_test_variants          -- Test variants
conversion_goals          -- Goal definitions
```

#### 5. Integrations
```sql
sites                     -- Registered websites
companies                 -- Customer companies
google_analytics_configs  -- GA4 settings
search_console_configs    -- GSC settings
warehouse_connectors      -- Data warehouse configs
```

#### 6. GDPR & Compliance
```sql
cookie_definitions        -- Cookie registry
cookie_consents           -- User consents
gdpr_settings             -- Site GDPR config
```

#### 7. Advanced Features
```sql
session_recordings        -- Session recording metadata
session_recording_events  -- Recording events (rrweb)
geolocation_aggregates    -- Geographic data
tags                      -- Tag manager tags
kpi_definitions           -- Custom KPIs
```

### Database Functions (43 total)

Key functions:
- `upsert_unified_visitor()` - Create/update visitor profiles
- `calculate_engagement_score()` - Engagement scoring
- `calculate_rfm_scores()` - RFM analysis
- `get_visitor_profile()` - Retrieve full profile
- `get_ai_agent_journey()` - AI funnel data
- `calculate_conversion_rate()` - Conversion metrics

---

## ⚡ Edge Functions (51 total)

### Categories

#### Tracking Functions (10)
```
track-event              -- Main event tracking
visitor-identification   -- Identify visitors
ai-bot-tracker          -- AI agent detection
cookiefree-analytics    -- Cookie-free tracking
pixel-tracking          -- Pixel tracking
...
```

#### Analytics Functions (15)
```
ga4-import              -- Import GA4 data
ga4-kpi-dashboard       -- GA4 KPI aggregation
funnel-analyzer         -- Funnel calculations
behavioral-analysis     -- Behavior patterns
user-lifetime-value     -- LTV calculation
...
```

#### Integration Functions (10)
```
warehouse-connector     -- Data warehouse sync
geolocation-lookup     -- IP to location
send-export-email      -- Email exports
sitekit-sync           -- Google SiteKit sync
...
```

#### Utility Functions (16)
```
consent-check          -- Check cookie consent
cookie-scanner         -- Scan site cookies
data-retention         -- Data cleanup
gdpr-compliant-tracking -- GDPR tracking
...
```

---

## 🎨 Frontend Architecture

### Component Structure

```
src/
├── components/
│   ├── dashboard/              # Dashboard features
│   │   ├── tabs/              # Main tabs (15)
│   │   │   ├── OverviewTab.tsx
│   │   │   ├── AITab.tsx
│   │   │   ├── AIBotTab.tsx
│   │   │   └── ...
│   │   ├── TagManager.tsx     # Advanced feature
│   │   ├── SessionRecordingList.tsx
│   │   ├── GeolocationDashboard.tsx
│   │   └── ...
│   ├── gdpr/                  # GDPR components
│   ├── ui/                    # shadcn/ui components
│   └── ...
├── hooks/                     # Custom hooks (40+)
│   ├── useAIBotTracking.tsx
│   ├── useHeatmapData.tsx
│   └── ...
├── pages/                     # Route pages
│   ├── Dashboard.tsx
│   ├── Auth.tsx
│   └── ...
└── integrations/
    └── supabase/             # Supabase client
```

### State Management

- **TanStack Query** for server state
- **React Context** for auth state
- **Local State** for UI state
- **Real-time** via Supabase subscriptions

### Routing Strategy

```typescript
// Main routes
/                    → Landing page
/dashboard           → Main dashboard (protected)
/auth                → Login/signup
/pricing             → Pricing page
/contact             → Contact page

// Protected routes use ProtectedRoute wrapper
// All use React Router v6
```

---

## 🔒 Security Architecture

### Authentication Flow

```
User submits credentials
  ↓
Supabase Auth validates
  ↓
JWT token issued
  ↓
Token stored in localStorage
  ↓
Auto-refresh on expiry
  ↓
Protected routes check token
```

### Authorization (Row Level Security)

```sql
-- Example RLS policy
CREATE POLICY "Users can only see their company data"
ON events
FOR SELECT
USING (
  site_id IN (
    SELECT id FROM sites
    WHERE company_id = auth.uid()
  )
);
```

### Data Protection

1. **RLS on all tables** - Database-level access control
2. **Input validation** - All edge functions validate input
3. **Rate limiting** - 1000 requests/min per site
4. **CORS policies** - Strict CORS configuration
5. **XSS protection** - Content Security Policy headers
6. **SQL injection** - Parameterized queries only

---

## 📈 Scalability

### Current Limits

```yaml
Rate Limits:
  - Tracking events: 10,000/hour per company
  - Analytics requests: 1,000/hour per company
  - Edge function: 500ms timeout, 50KB payload

Database:
  - PostgreSQL connection pooling: 60 connections
  - Table size: Unlimited (auto-vacuum)
  - Data retention: 365 days default (truncated IPs on AI-bot records cleared after 30 days)

Storage:
  - Session recordings: 1 GB free, then paid
  - Screenshots: Compressed, CDN cached
```

### Scaling Strategy

1. **Horizontal scaling**: Supabase auto-scales
2. **Caching**: TanStack Query + CDN
3. **Aggregation**: Pre-computed daily/hourly aggregates
4. **Archiving**: Old data archived to cold storage
5. **Sharding**: Future: shard by company_id

---

## 🎯 Design Decisions

### Why Supabase?

**Pros:**
- ✅ Fast development (BaaS)
- ✅ Real-time out of box
- ✅ Built-in auth
- ✅ PostgreSQL (powerful, flexible)
- ✅ Edge functions (serverless)
- ✅ Auto-scaling

**Cons:**
- ⚠️ Vendor lock-in
- ⚠️ Limited customization
- ⚠️ Price at scale

### Why React + TypeScript?

- **Type safety**: Catch errors at compile time
- **Developer experience**: Excellent tooling
- **Ecosystem**: Massive component library
- **Performance**: Virtual DOM optimization
- **Hiring**: Large talent pool

### Why Cookie-Free Tracking?

- **GDPR compliance**: No consent needed
- **Data accuracy**: No cookie blockers
- **User experience**: No annoying banners
- **Competitive advantage**: Unique selling point

### Why Vite over CRA?

- **Speed**: 10-100x faster HMR
- **Modern**: ESM-first, optimized builds
- **Bundle size**: Smaller production builds
- **DX**: Better error messages, instant server start

---

## 🔮 Future Architecture

### Planned Improvements

1. **Microservices**: Split edge functions into services
2. **Event streaming**: Kafka/Redis for real-time
3. **ML Pipeline**: Separate ML inference service
4. **Multi-region**: Deploy to US + EU regions
5. **CDN optimization**: Edge caching for analytics

### Technology Considerations

- **GraphQL?** Not needed, REST + RPC works well
- **Kubernetes?** Not yet, serverless sufficient
- **Message Queue?** Consider for high-volume tracking
- **Time-series DB?** Consider TimescaleDB for metrics

---

## 📚 Related Documentation

- **[README.md](../README.md)** - Project overview
- **[DEPLOYMENT.md](../DEPLOYMENT.md)** - Deployment guide
- **[CLAUDE.md](../CLAUDE.md)** - Complete documentation
- **[API_DOCUMENTATION.md](../API_DOCUMENTATION.md)** - API reference

---

<div align="center">

**🏗️ Architecture maintained by [Expandtalk](https://expandtalk.se)**

[Back to README](../README.md) · [Documentation Index](./INDEX.md) · [Deployment](../DEPLOYMENT.md)

</div>
