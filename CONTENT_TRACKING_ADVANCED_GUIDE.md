# Content Tracking Advanced - Implementation Guide

## Overview

Task #24 implements advanced content tracking with element-level analytics, interaction heatmaps, form analytics, and scroll depth tracking.

**Status**: ✅ Completed

## Features

### 1. **Element Interaction Tracking**
- Track buttons, links, forms, images, CTAs
- Click, hover, view, focus tracking
- Mouse position recording
- Viewport dimensions tracking
- Device and browser context

### 2. **Content Performance Metrics**
- Click-through rate (CTR)
- Hover rate
- View count and duration
- Engagement score (0-100)
- Element-level analytics

### 3. **Form Analytics**
- Field-level tracking
- Focus, blur, change events
- Submission status (success/error/abandoned)
- Completion rate by form
- Error tracking by field
- Time-to-fill metrics
- Drop-off analysis

### 4. **Heatmap Visualization**
- Click heatmaps
- Hover heatmaps
- Scroll heatmaps
- SVG-based visualization
- Intensity-based color coding
- Interactive viewport

### 5. **Scroll Depth Tracking**
- Maximum scroll percentage
- Total scroll distance
- Time-on-page
- Scroll event counting
- Session-level tracking

### 6. **Content Performance Analysis**
- Page-level aggregation
- Drill-down by element
- Time-based trends
- Performance comparisons

## Architecture

### Database Schema

#### `content_elements`
```sql
- Element identification and properties
- CSS selector for re-identification
- Page and section context
- Tracking status
```

#### `content_interactions`
```sql
- Individual user interaction events
- Element ID, type, page context
- Mouse coordinates, duration data
- Form field tracking
- Device/browser information
```

#### `content_performance`
```sql
- Aggregated daily metrics
- Views, clicks, hover counts
- CTR, engagement score
- Form completion metrics
```

#### `form_field_analytics`
```sql
- Form-specific field metrics
- Impressions, interactions, errors
- Completion and abandonment
- Time-to-fill tracking
```

#### `content_heatmap_points`
```sql
- Click/hover/scroll coordinates
- Intensity scoring
- Daily aggregation
```

#### `scroll_depth`
```sql
- Scroll tracking per session
- Maximum depth percentage
- Time-on-page metrics
```

### Edge Function

**Location**: `/supabase/functions/content-tracking/index.ts`

#### Endpoints

**POST /content-tracking/element** - Register tracked element
**POST /content-tracking/interaction** - Track interaction
**POST /content-tracking/scroll** - Track scroll depth

The POST body's `site_id` must be an active site (or, from the WordPress plugin, the account id of the site on the
request's Origin); anything else gets 403. The GET read endpoints were removed on 2026-11-20 (they returned any site's
data without auth) and now answer 405. Read the tables through the Supabase client, where RLS applies.

### React Components

#### `ContentTrackingAdvanced`
- Content element performance dashboard
- Form analytics with field-level breakdown
- Interactive heatmap visualization
- Scroll depth analysis
- Engagement scoring

## Implementation Guide

### 1. Initialize Tracking

```typescript
import { initializeContentTracking, autoTrackCTAs, autoTrackForms } from '@/lib/contentTracking';

const tracker = initializeContentTracking({
  siteId: 'your-site-uuid',
  sessionId: 'session-uuid',
  visitorHash: 'visitor-hash'
});

// Auto-track CTAs and forms
autoTrackCTAs(tracker);
autoTrackForms(tracker);
```

### 2. Track Specific Elements

```typescript
import { trackElement } from '@/lib/contentTracking';

// Track a specific button
trackElement(
  tracker,
  '#hero-cta-button',
  'hero-cta',
  'button'
);

// Track a link
trackElement(
  tracker,
  'a.featured-link',
  'featured-link',
  'link'
);
```

### 3. Embed in Tracking Script

```javascript
// Add to spa-tracking.js
if (window.CortIQAnalytics) {
  const tracker = window.CortIQAnalytics.initializeContentTracking({
    siteId: window.CortIQAnalytics.siteId,
    sessionId: window.CortIQAnalytics.sessionId,
    visitorHash: window.CortIQAnalytics.visitorHash
  });

  // Auto-track common elements
  window.CortIQAnalytics.ContentTracking.autoTrackCTAs(tracker);
  window.CortIQAnalytics.ContentTracking.autoTrackForms(tracker);
}
```

### 4. Custom Element Tracking

```typescript
// Track custom element with specific selector
tracker.registerElement({
  element_id: 'custom-widget',
  element_type: 'text',
  element_selector: '.custom-widget',
  element_text: 'Featured Section',
  page_url: window.location.href,
  page_title: document.title,
  section_name: 'hero',
  content_type: 'featured-product'
});
```

### 5. Display Analytics Dashboard

```typescript
import { ContentTrackingAdvanced } from '@/components/dashboard/ContentTrackingAdvanced';

export function ContentAnalyticsPage() {
  return (
    <ContentTrackingAdvanced
      siteId="your-site-uuid"
      dateRange={{
        from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date().toISOString()
      }}
    />
  );
}
```

## Metrics Explained

### Click-Through Rate (CTR)
```
(Clicks / Views) * 100
```
Percentage of views that result in clicks. Higher is better.

### Hover Rate
```
(Hover Events / Views) * 100
```
Percentage of views where user hovers over element. Indicates interest.

### Engagement Score (0-100)
```
(Clicks * 0.4) + (Hovers * 0.3) + (ViewDuration * 0.3)
```
Composite score combining multiple interactions.

### Form Completion Rate
```
(Successful Submissions / Total Form Impressions) * 100
```
Percentage of form views that result in successful submission.

### Time-to-Fill (ms)
```
Average milliseconds spent on form field before moving to next
```
Indicates field complexity and user experience.

## Use Cases

### 1. **Optimize CTAs**
- Find underperforming call-to-action buttons
- A/B test different placements and text
- Analyze by device and browser

### 2. **Form Optimization**
- Identify problematic form fields
- Reduce abandonment rates
- Minimize errors and validation issues
- Improve time-to-complete

### 3. **Content Heatmaps**
- Visualize user interaction patterns
- Identify most-clicked elements
- Understand scroll behavior
- Optimize above-the-fold content

### 4. **Scroll Analysis**
- Identify optimal content placement
- Reduce content below scroll fold
- Analyze by device type
- Track content engagement depth

### 5. **Multi-device Testing**
- Compare desktop vs mobile performance
- Optimize for each device type
- Identify device-specific issues

## Performance Optimization

### 1. **Event Batching**
For high-traffic sites, batch events before sending:

```typescript
const eventQueue: any[] = [];
const BATCH_SIZE = 10;

function queueEvent(event: any) {
  eventQueue.push(event);
  if (eventQueue.length >= BATCH_SIZE) {
    flushEvents();
  }
}

function flushEvents() {
  // Send all events at once
  eventQueue.length = 0;
}
```

### 2. **Sampling**
Track only 10% of interactions for high-traffic elements:

```typescript
function shouldTrack(): boolean {
  return Math.random() < 0.1;
}
```

### 3. **Debouncing**
Debounce scroll tracking to reduce event volume:

```typescript
const debounce = (fn: Function, ms: number) => {
  let timeoutId: NodeJS.Timeout | null = null;
  return () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      fn();
      timeoutId = null;
    }, ms);
  };
};

window.addEventListener('scroll', debounce(() => {
  // Update scroll depth
}, 500));
```

## Testing

### Test Element Registration

```typescript
const tracker = initializeContentTracking({ siteId: 'test' });

tracker.registerElement({
  element_id: 'test-button',
  element_type: 'button',
  element_selector: '#test',
  page_url: 'https://example.com',
});
```

### Verify in Database

```sql
SELECT * FROM content_elements
WHERE element_id = 'test-button'
LIMIT 1;
```

## Browser Compatibility

- Chrome/Chromium: Full support
- Firefox: Full support
- Safari: Full support (iOS 10+)
- Edge: Full support
- IE 11: Limited (polyfills needed)

## Privacy & GDPR

Content tracking does not collect:
- Personal identifying information
- Password or sensitive form data
- Session contents

It collects:
- Element IDs and interactions
- Form field names (not values) *
- Anonymous visitor hash
- Device/browser info

*Configure to exclude sensitive fields

## GDPR Compliance

Ensure:
1. Obtain user consent before tracking
2. Don't track password/CC fields
3. Anonymize visitor identifiers
4. Implement DSAR (Data Subject Access Request)
5. Configure data retention policy

## Troubleshooting

### Elements Not Tracking
- Check CSS selectors are correct
- Verify siteId is valid
- Ensure tracking script loads before elements render
- Check browser console for errors

### Heatmap Not Showing Data
- Verify page_url parameter matches
- Check date range has interactions
- Ensure data aggregation has completed
- Check database for interactions

### Forms Not Tracking
- Verify form has name or id attribute
- Check field names are set
- Ensure form listeners attached
- Test with console logs

### Low Engagement Scores
- May indicate:
  - Element not visible/discoverable
  - Poor placement or design
  - Confusing call-to-action text
  - Device-specific issues

## Integration Checklist

- [x] Database migrations created
- [x] Edge Function deployed
- [x] React component built
- [x] TypeScript types defined
- [x] Tracking utility library
- [x] RLS policies configured
- [x] Documentation completed
- [ ] Dashboard integration
- [ ] Test element tracking
- [ ] Form tracking enabled
- [ ] Heatmap validation
- [ ] Performance testing

## Files Created

```
supabase/migrations/
  └── 20260209160000_content_tracking_advanced.sql

supabase/functions/
  └── content-tracking/
      └── index.ts

src/components/dashboard/
  └── ContentTrackingAdvanced.tsx

src/types/
  └── contentTracking.ts

src/lib/
  └── contentTracking.ts
```

## Next Steps

1. **Integration**
   - Add ContentTrackingAdvanced to dashboard
   - Embed tracker in tracking script
   - Test with sample elements

2. **Optimization**
   - Identify low-performing elements
   - A/B test improvements
   - Monitor metrics

3. **Advanced Analysis**
   - Create custom segments by device
   - Compare form variants
   - Heatmap analysis

---

**Task #24 Status**: ✅ Complete - Advanced Content Tracking Implemented

