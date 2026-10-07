---
title: "How to Track AI Agents Visiting Your Website - Complete Guide"
description: "Learn how to identify and track AI agent traffic from ChatGPT Browser, Perplexity, and Claude. Step-by-step guide with examples."
author: "CortIQ Team"
date: "2025-02-09"
category: "Guides"
tags: ["AI-agents", "tracking", "analytics", "ChatGPT-Browser", "how-to"]
slug: "how-to-track-ai-agents"
image: "/blog-images/ai-agent-tracking.png"
imageAlt: "Dashboard showing AI agent tracking data and statistics"
readingTime: "8 min read"
---

# How to Track AI Agents Visiting Your Website - Complete Guide

Most websites get visits from AI agents like ChatGPT Browser, Perplexity, and Claude. But traditional analytics don't track them properly. Here's how to identify, track, and analyze AI agent traffic.

## Why You Should Track AI Agents

Before diving into the "how," understand the "why":

- **Accurate Traffic Metrics** - Separate real users from agents
- **Better Insights** - Understand actual human behavior
- **Optimization Opportunities** - Optimize content for agent discovery
- **New Revenue Streams** - Monetize AI agent traffic
- **Competitive Intelligence** - See what agents find valuable
- **Future-Proofing** - Stay ahead of the agentic web trend

## Understanding AI Agent Detection

### How AI Agents Identify Themselves

When an AI agent visits your website, it sends HTTP headers that identify it:

```
User-Agent: Mozilla/5.0 (compatible; ChatGPTBot/1.0; +http://openai.com/bot)
```

Each AI agent has a unique user agent string:

| Agent | User Agent |
|-------|-----------|
| **ChatGPT Browser** | `ChatGPTBot/1.0` |
| **Perplexity Bot** | `PerplexityBot` |
| **Claude Browser** | `Claude-Web/1.0` |
| **Google Gemini** | `Googlebot` (with additional signals) |
| **Microsoft Copilot** | `Copilot` |
| **You.com** | `YouBot` |
| **Phind** | `Phind-Bot` |

### Beyond User Agents

However, user agents alone aren't sufficient. AI agents exhibit distinctive behavioral patterns:

1. **Request Patterns**
   - Requests are rapid and sequential
   - No mouse movements or clicks
   - No scrolling events
   - High request frequency per session

2. **Temporal Patterns**
   - Requests clustered in short time windows
   - No human-like delays between requests
   - 24/7 consistent activity

3. **Content Consumption**
   - Uniform content access (doesn't follow links like humans)
   - Requests core content repeatedly
   - No banner/ad interaction
   - Full-page scraping patterns

4. **Session Characteristics**
   - No cookies or minimal cookie usage
   - No JavaScript execution
   - No DOM interaction
   - Basic HTML parsing

## Method 1: Using CortIQ (Recommended)

CortIQ automatically detects and tracks AI agents. Here's how:

### Setup (5 minutes)

1. **Create Account**
   ```
   Visit cortiq.se → Sign up → Verify email
   ```

2. **Add Your Website**
   ```
   Dashboard → Add Site → Enter domain name
   ```

3. **Install Tracking Code**
   ```html
   <script src="https://cortiq.se/tracking.js"></script>
   <script>
     window.CortIQ.track({
       siteId: 'your-site-id',
       apiKey: 'your-api-key'
     });
   </script>
   ```

4. **Verify Installation**
   ```
   Dashboard → Verify Installation → See "Connected" status
   ```

### View AI Agent Insights

After 24 hours of tracking, you'll see:

- **AI Agent Dashboard**
  - Total agent visits this month
  - Breakdown by agent type
  - Trend over time
  - Comparison to human traffic

- **Detailed Agent Analytics**
  - Pages agents access
  - Content they consume
  - Frequency of visits
  - Geographic origin
  - Device types

- **Agent-Specific Reports**
  - ChatGPT Browser behavior
  - Perplexity trends
  - Claude interaction patterns
  - Other agent analytics

## Method 2: Google Analytics 4 Custom Events

If you're not ready for a dedicated solution, use Google Analytics 4:

### Step 1: Add Detection Code

```javascript
// Detect AI agents in your tracking code
function detectAIAgent() {
  const userAgent = navigator.userAgent.toLowerCase();

  const agentPatterns = {
    'chatgpt': /chatgptbot/i,
    'perplexity': /perplexitybot/i,
    'claude': /claude-web/i,
    'copilot': /copilot/i,
    'youbot': /youbot/i,
    'phind': /phind/i
  };

  for (const [agent, pattern] of Object.entries(agentPatterns)) {
    if (pattern.test(userAgent)) {
      return agent;
    }
  }

  return null;
}

// Log AI agent visit to GA4
const detectedAgent = detectAIAgent();
if (detectedAgent) {
  gtag('event', 'ai_agent_visit', {
    'agent_type': detectedAgent,
    'timestamp': new Date().toISOString()
  });
}
```

### Step 2: Create GA4 Custom Report

In Google Analytics 4:
1. Go to **Reports** → **Exploration**
2. Create new blank exploration
3. **Rows**: Event name, Agent type
4. **Values**: Event count, Session count
5. **Filter**: Event name = "ai_agent_visit"

## Method 3: Server-Side Detection

For more control, detect AI agents on your server:

### Node.js/Express Example

```javascript
const express = require('express');
const app = express();

// Middleware to detect AI agents
app.use((req, res, next) => {
  const userAgent = req.get('User-Agent') || '';

  const aiAgents = {
    'chatgpt': /chatgptbot/i,
    'perplexity': /perplexitybot/i,
    'claude': /claude-web/i,
    'copilot': /copilot/i,
    'youbot': /youbot/i,
    'phind': /phind/i
  };

  req.aiAgent = null;
  for (const [agent, pattern] of Object.entries(aiAgents)) {
    if (pattern.test(userAgent)) {
      req.aiAgent = agent;
      break;
    }
  }

  // Log to your analytics
  if (req.aiAgent) {
    console.log(`AI Agent Visit: ${req.aiAgent} - ${req.path}`);
    // Log to database, analytics, etc.
  }

  next();
});

// Use in your routes
app.get('/api/page', (req, res) => {
  if (req.aiAgent) {
    // Serve agent-optimized response
    res.json({ optimized_for: 'ai_agent' });
  } else {
    // Serve human-optimized response
    res.json({ optimized_for: 'human' });
  }
});
```

### Python/Flask Example

```python
from flask import Flask, request
import re

app = Flask(__name__)

AI_AGENTS = {
    'chatgpt': r'chatgptbot',
    'perplexity': r'perplexitybot',
    'claude': r'claude-web',
    'copilot': r'copilot',
    'youbot': r'youbot',
    'phind': r'phind'
}

def detect_ai_agent(user_agent):
    for agent_name, pattern in AI_AGENTS.items():
        if re.search(pattern, user_agent, re.IGNORECASE):
            return agent_name
    return None

@app.before_request
def log_ai_agents():
    user_agent = request.headers.get('User-Agent', '')
    detected_agent = detect_ai_agent(user_agent)

    if detected_agent:
        print(f"AI Agent Visit: {detected_agent} - {request.path}")
        # Log to analytics database
        # Log to monitoring service
```

## Understanding AI Agent Metrics

### Key Metrics to Track

1. **Traffic Volume**
   - Percentage of total traffic from agents
   - Trend over time
   - Growth rate

2. **Content Engagement**
   - Most visited pages by agents
   - Average time agent spends per page
   - Pages agents ignore
   - Click patterns

3. **Behavioral Patterns**
   - Pages accessed per session
   - Session duration
   - Return frequency
   - Geographic distribution

4. **Impact Analysis**
   - Server load from agents
   - Bandwidth consumption
   - Cache hit rates
   - API usage

### Creating Reports

In CortIQ, create custom reports:

```
Dashboard → Reports → AI Agent Analysis
├── Traffic by Agent Type
├── Top Pages Accessed by Agents
├── Agent Traffic Trend (30-day)
├── Agent vs Human Metrics Comparison
└── Agent Conversion Goals
```

## Practical Applications

### Example 1: Content Optimization

**Finding**: Perplexity agents frequently access your FAQ page

**Action**:
- Improve FAQ structure and clarity
- Add more Q&A content
- Implement schema.org markup for better parsing
- Monitor if more agents visit

**Result**: Better AI-driven traffic, more appearances in Perplexity answers

### Example 2: Server Resource Planning

**Finding**: ChatGPT agents account for 5% of traffic but 15% of bandwidth

**Action**:
- Compress images and assets
- Implement smart caching for agent requests
- Optimize database queries
- Add CDN for static content

**Result**: Reduced server load, faster response times for all users

### Example 3: API Monetization

**Finding**: Your API is heavily used by Claude and other agents

**Action**:
- Create premium API tier for agents
- Implement rate limiting for agents
- Offer direct integration partnerships
- Build agent-optimized endpoints

**Result**: New revenue stream from AI partners

## Best Practices for AI Agent Tracking

### Do's ✅

- **Do track agents separately** from human traffic
- **Do use multiple detection methods** (user agents + behavioral)
- **Do monitor over time** to spot trends
- **Do analyze what agents want** from your content
- **Do optimize for agents** when it makes business sense
- **Do prepare for growth** - agent traffic will increase

### Don'ts ❌

- **Don't block all agents** - they drive valuable traffic
- **Don't ignore agent traffic** - it's growing fast
- **Don't confuse agents with humans** in your reports
- **Don't spam agents** with ads or tracking pixels
- **Don't serve inferior content** to agents
- **Don't rely solely on user agents** - behavioral analysis matters

## Getting Started with CortIQ

Ready to track your AI agents properly?

1. **[Start Free Trial](https://cortiq.se/signup)** → 14 days, no credit card
2. **[Install Tracking](https://cortiq.se/install)** → 5-minute setup
3. **[View Analytics](https://cortiq.se/dashboard)** → See agent traffic within hours
4. **[Optimize Content](https://cortiq.se/guides)** → Follow our guides

---

## Related Articles

- [What is the Agentic Web?](/blog/what-is-agentic-web)
- [AI Agent Behavior Patterns](/blog/ai-agent-behavior)
- [Optimizing Content for AI Discovery](/blog/agentic-seo)

**Still have questions?** [Email our support team](mailto:info@expandtalk.se)
