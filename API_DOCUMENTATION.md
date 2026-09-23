# CortIQ Public REST API

> **World's First Analytics Platform with Dedicated AI Agent Tracking**

The CortIQ Public REST API provides programmatic access to your analytics data. Build custom dashboards, automate reports, and integrate CortIQ with your favorite tools.

## 🚀 Quick Start

### 1. Get Your API Key

1. Log in to [CortIQ Dashboard](https://cortiq.se/dashboard)
2. Navigate to **Settings** → **API Keys**
3. Click **Create API Key**
4. Copy your API key (starts with `ck_live_`)

⚠️ **Important**: Store your API key securely. It won't be shown again!

### 2. Make Your First Request

```bash
curl https://cortiq.se/api/v1/sites \
  -H "Authorization: Bearer ck_live_your_api_key_here"
```

## 📚 Documentation

- **Interactive API Docs**: [https://cortiq.se/api-docs/](https://cortiq.se/api-docs/)
- **API Landing Page**: [https://cortiq.se/api](https://cortiq.se/api)
- **OpenAPI Spec**: [swagger.json](./public/api-docs/swagger.json)

## 🔑 Authentication

All API requests require authentication using an API key in the `Authorization` header:

```bash
Authorization: Bearer ck_live_your_api_key_here
```

## 📊 Available Endpoints

### Sites

- `GET /api/v1/sites` - List all sites

### Analytics Data

- `GET /api/v1/sites/{id}/visits` - Get visit/session data
- `GET /api/v1/sites/{id}/pages` - Get page views
- `GET /api/v1/sites/{id}/referrers` - Get traffic sources
- `GET /api/v1/sites/{id}/events` - Get custom events
- `GET /api/v1/sites/{id}/conversions` - Get conversions
- `GET /api/v1/sites/{id}/heatmaps` - Get heatmap click data

### AI Agent Analytics (🤖 Unique to CortIQ!)

- `GET /api/v1/sites/{id}/agents` - Get AI agent traffic data
  - Track ChatGPT Browser, Perplexity Comet, Claude Browser
  - Understand how AI agents interact with your content
  - Optimize for the Agentic Web

## 🔧 Query Parameters

All endpoints support the following query parameters:

| Parameter   | Type     | Description                                    | Default        |
|-------------|----------|------------------------------------------------|----------------|
| `date_from` | ISO 8601 | Start date for data range                      | 30 days ago    |
| `date_to`   | ISO 8601 | End date for data range                        | Now            |
| `limit`     | Integer  | Maximum number of results (max 10,000)         | 1,000          |
| `offset`    | Integer  | Number of results to skip (pagination)         | 0              |
| `format`    | String   | Response format (`json` or `csv`)              | `json`         |

## 💡 Examples

### Get Visits for the Last 7 Days

```bash
curl "https://cortiq.se/api/v1/sites/abc-123/visits?date_from=2024-01-01&date_to=2024-01-07" \
  -H "Authorization: Bearer ck_live_your_api_key_here"
```

### Export Page Views as CSV

```bash
curl "https://cortiq.se/api/v1/sites/abc-123/pages?format=csv" \
  -H "Authorization: Bearer ck_live_your_api_key_here" \
  -o pageviews.csv
```

### Get AI Agent Traffic (Unique to CortIQ!)

```bash
curl "https://cortiq.se/api/v1/sites/abc-123/agents?date_from=2024-01-01" \
  -H "Authorization: Bearer ck_live_your_api_key_here"
```

**Response:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "site_id": "abc-123",
    "agent_type": "chatgpt_browser",
    "started_at": "2024-01-15T10:30:00Z",
    "page_views": 5,
    "query_intent": "research product features"
  },
  {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "site_id": "abc-123",
    "agent_type": "perplexity_comet",
    "started_at": "2024-01-15T11:45:00Z",
    "page_views": 3,
    "query_intent": "compare pricing"
  }
]
```

### Get Traffic Sources

```bash
curl "https://cortiq.se/api/v1/sites/abc-123/referrers" \
  -H "Authorization: Bearer ck_live_your_api_key_here"
```

**Response:**
```json
[
  {
    "domain": "google.com",
    "visits": 1250
  },
  {
    "domain": "facebook.com",
    "visits": 830
  },
  {
    "domain": "direct",
    "visits": 620
  }
]
```

## 🔒 Rate Limiting

- **Default**: 1,000 requests per hour per API key
- **Configurable**: Increase limits in dashboard settings
- **Headers**: Rate limit info returned in response headers

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 856
X-RateLimit-Reset: 1642348800
```

When rate limit is exceeded, you'll receive a `429 Too Many Requests` response:

```json
{
  "error": "Rate limit exceeded",
  "retry_after": 3600
}
```

## 📦 Response Formats

### JSON (Default)

```bash
curl "https://cortiq.se/api/v1/sites/abc-123/visits" \
  -H "Authorization: Bearer ck_live_your_api_key_here"
```

### CSV Export

```bash
curl "https://cortiq.se/api/v1/sites/abc-123/visits?format=csv" \
  -H "Authorization: Bearer ck_live_your_api_key_here" \
  -o visits.csv
```

## ❌ Error Handling

### 401 Unauthorized

```json
{
  "error": "Invalid or missing API key"
}
```

**Solution**: Check that your API key is correct and included in the `Authorization` header.

### 404 Not Found

```json
{
  "error": "Site not found or access denied"
}
```

**Solution**: Verify the site ID and that your API key has access to this site.

### 429 Rate Limit Exceeded

```json
{
  "error": "Rate limit exceeded",
  "retry_after": 3600
}
```

**Solution**: Wait before making more requests or upgrade your rate limit.

### 500 Internal Server Error

```json
{
  "error": "Internal server error",
  "message": "Detailed error message"
}
```

**Solution**: Contact support if the issue persists.

## 🌟 Unique Features

### AI Agent Analytics

CortIQ is the **world's first analytics platform** with dedicated AI agent tracking:

- **Agent Types Tracked**:
  - ChatGPT Browser
  - Perplexity Comet
  - Claude Browser
  - Other AI agents

- **Why It Matters**:
  - AI agents will account for 10-15% of web traffic within 3 years
  - Optimize your content for AI-driven discovery
  - Understand query intent from AI agents
  - Track AI-driven conversions

### Consent-Gated Tracking

- Visitor analytics start only after analytics consent (GDPR Art. 6.1.a / ePrivacy Art. 5.3), in both Cookieless and Full mode
- Cookieless mode: no cookies, no fingerprint, no cross-visit profile, no persistent IDs
- Consent valid 12 months, then re-asked
- AI-bot / security layer runs without consent, designed as strictly necessary security processing — the site operator makes the final legal assessment

## 🛠️ SDKs & Libraries

### JavaScript/TypeScript

```typescript
import { CortIQClient } from '@cortiq/sdk';

const client = new CortIQClient({
  apiKey: 'ck_live_your_api_key_here'
});

const visits = await client.sites.getVisits('site-id', {
  dateFrom: '2024-01-01',
  dateTo: '2024-01-31'
});
```

### Python

```python
from cortiq import CortIQClient

client = CortIQClient(api_key='ck_live_your_api_key_here')

visits = client.sites.get_visits(
    site_id='site-id',
    date_from='2024-01-01',
    date_to='2024-01-31'
)
```

> 📝 **Note**: SDKs are coming soon! For now, use direct HTTP requests.

## 📞 Support

- **Documentation**: [https://cortiq.se/api](https://cortiq.se/api)
- **Email**: support@cortiq.se
- **Status Page**: [status.cortiq.se](https://status.cortiq.se)

## 📄 License

The CortIQ API is proprietary. See [Terms of Service](https://cortiq.se/terms) for usage rights.

## 🚀 Getting Started

1. [Sign up for CortIQ](https://cortiq.se/auth)
2. [Create your first site](https://cortiq.se/dashboard)
3. [Generate an API key](https://cortiq.se/dashboard)
4. [Read the docs](https://cortiq.se/api-docs/)
5. Start building!

---

Made with ❤️ by [CortIQ](https://cortiq.se) - The Analytics Platform for the Agentic Web
