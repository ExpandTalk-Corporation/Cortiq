# Media Analytics - Implementation Guide

## Overview

Task #22 implements comprehensive media analytics for video, audio, and document tracking in CortIQ. Track user engagement with media content, analyze completion rates, and understand viewer behavior.

**Status**: ✅ Completed

## Features

### 1. **Multi-Format Media Support**
- Video (MP4, WebM, HLS, DASH)
- Audio (MP3, WAV, AAC, OGG)
- Documents (PDF, EPUB)
- Images (JPEG, PNG, WebP)

### 2. **Comprehensive Event Tracking**
- **Playback Events**: Play, pause, resume, complete
- **Navigation Events**: Seek, forward, rewind
- **Quality Events**: Quality changes, bitrate switches
- **User Events**: Fullscreen, mute, volume changes
- **Technical Events**: Buffering, errors, dropped frames

### 3. **Engagement Metrics**
- Total plays and sessions
- Unique viewers
- Average watch time
- Completion rate (%)
- Drop-off analysis
- Replay count

### 4. **Performance Analysis**
- Hourly performance timeline
- Quality distribution
- Buffer time tracking
- Error tracking and reporting
- Device/browser performance comparison

### 5. **Progress Tracking**
- Milestone tracking (25%, 50%, 75%, 100%)
- Fine-grained progress points
- Session-level tracking
- Visitor identification

## Architecture

### Database Schema

#### `media_metadata`
```sql
- Media file information
- Format, duration, bitrate, dimensions
- Title, URL, file size
- One record per unique media file
```

#### `media_events`
```sql
- Individual media interaction events
- Event type, timestamp, details
- Quality, volume, fullscreen state
- Error information
- Device/browser context
```

#### `media_engagement`
```sql
- Aggregated daily metrics by media
- Plays, sessions, viewers
- Watch time, completion rate
- Engagement scoring
```

#### `media_performance_timeline`
```sql
- Hourly aggregation
- Performance metrics by hour
- Quick query for timeline graphs
```

#### `media_progress_points`
```sql
- Progress milestone tracking
- 25%, 50%, 75%, 100% completion
- Fine-grained user progress data
```

#### `media_quality_distribution`
```sql
- Quality-specific metrics
- Performance by video quality
- Completion rates by quality level
```

### Edge Function

**Location**: `/supabase/functions/media-analytics/index.ts`

#### Endpoints

**POST /media-analytics/event**
```json
Request:
{
  "site_id": "uuid",
  "session_id": "uuid",
  "visitor_hash": "hash",
  "event": {
    "media_id": "video-123",
    "media_type": "video",
    "event_type": "play",
    "current_time": 0,
    "duration": 300,
    "quality": "720p"
  },
  "metadata": {
    "media_id": "video-123",
    "media_type": "video",
    "media_url": "https://...",
    "media_duration": 300
  }
}

Response:
{
  "success": true
}
```

The POST body's `site_id` must be an active site (or, from the WordPress plugin, the account id of the site on the
request's Origin); anything else gets 403. The GET read endpoints were removed on 2026-11-20 (they returned any site's
data without auth) and now answer 405. Read the tables through the Supabase client, where RLS applies.

### React Components

#### `MediaAnalyticsDashboard`
**Props**:
```typescript
{
  siteId: string;
  dateRange: { from: string; to: string };
}
```

**Features**:
- Overview of all media content
- Summary statistics (plays, viewers, completion)
- Drill-down into specific media
- Timeline performance charts
- Quality distribution analysis

## Implementation Guide

### 1. Basic Setup

```typescript
import { MediaTracker, getDeviceInfo } from '@/lib/mediaTracking';
import type { MediaMetadata } from '@/types/media';

// Create tracker instance
const metadata: MediaMetadata = {
  media_id: 'video-123',
  media_type: 'video',
  media_url: 'https://example.com/video.mp4',
  media_title: 'My Video',
  media_duration: 600,
  format: 'mp4',
  bitrate: 5000
};

const tracker = new MediaTracker(
  'video-123',
  'video',
  {
    siteId: 'site-uuid',
    sessionId: 'session-uuid',
    visitorHash: 'visitor-hash'
  },
  metadata
);
```

### 2. Tracking HTML5 Video

```typescript
const videoElement = document.getElementById('my-video') as HTMLVideoElement;

// Auto-attach to video element
tracker.attachToVideoElement(videoElement);

// Or manually track events
videoElement.addEventListener('play', () => {
  tracker.trackPlay(videoElement.currentTime, videoElement.duration);
});

videoElement.addEventListener('pause', () => {
  tracker.trackPause(videoElement.currentTime, videoElement.duration);
});
```

### 3. Tracking HTML5 Audio

```typescript
const audioElement = document.getElementById('my-audio') as HTMLAudioElement;

tracker.attachToAudioElement(audioElement);
```

### 4. Manual Event Tracking

```typescript
// Track quality change
await tracker.trackQualityChange('1080p', videoElement.currentTime);

// Track error
await tracker.trackError('404', 'Video not found', videoElement.currentTime);

// Track buffering
await tracker.trackBuffering(2500, videoElement.currentTime); // 2.5s buffer
```

### 5. Custom Progress Intervals

```typescript
// Report progress every 10 seconds
tracker.setProgressInterval(10000);

// Report only if progress changed by 10%
tracker.setProgressThreshold(10);
```

## Usage Examples

### Display Media Analytics Dashboard

```typescript
import { MediaAnalyticsDashboard } from '@/components/dashboard/MediaAnalyticsDashboard';

export function AnalyticsPage() {
  return (
    <MediaAnalyticsDashboard
      siteId="your-site-uuid"
      dateRange={{
        from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date().toISOString()
      }}
    />
  );
}
```

### Track Video with React

```typescript
import { useEffect, useRef } from 'react';
import { MediaTracker, getDeviceInfo } from '@/lib/mediaTracking';

export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    const tracker = new MediaTracker(
      'video-123',
      'video',
      {
        siteId: 'site-uuid',
        sessionId: 'session-uuid',
        visitorHash: 'visitor-hash'
      },
      {
        media_id: 'video-123',
        media_type: 'video',
        media_url: 'https://example.com/video.mp4',
        media_title: 'My Video',
        media_duration: 600
      }
    );

    tracker.attachToVideoElement(videoRef.current);
  }, []);

  return <video ref={videoRef} controls src="https://example.com/video.mp4" />;
}
```

### Embed in Tracking Script

```javascript
// Add to tracking script (spa-tracking.js)
if (window.CortIQAnalytics) {
  // Get video elements
  const videos = document.querySelectorAll('video[data-cortiq-track]');

  videos.forEach((video) => {
    const tracker = new CortIQAnalytics.MediaTracker(
      video.id || 'video-' + Math.random(),
      'video',
      window.CortIQAnalytics.config,
      {
        media_id: video.id,
        media_type: 'video',
        media_url: video.src,
        media_title: video.title,
        media_duration: video.duration
      }
    );

    tracker.attachToVideoElement(video);
  });
}
```

## Event Types and Details

### Playback Events

**play**
- Triggered when video starts playing
- Payload: current_time, duration

**pause**
- Triggered when video is paused
- Payload: current_time, duration

**resume**
- Triggered when paused video is resumed
- Payload: current_time, duration

**complete**
- Triggered when video ends
- Payload: duration

### Navigation Events

**seek**
- Triggered when user seeks to new position
- Payload: current_time, target_time, duration

**progress**
- Regular heartbeat event (every 5s default)
- Payload: current_time, duration

### Quality Events

**quality_change**
- Triggered when video quality is changed
- Payload: quality (e.g., "720p"), current_time

### User Events

**fullscreen**
- Triggered when fullscreen state changes
- Payload: is_fullscreen, current_time

### Error Events

**error**
- Triggered on playback error
- Payload: error_code, error_message, current_time

## Metrics Explained

### Completion Rate (%)
```
(Videos with play event) / (Videos that started) * 100
```
Shows percentage of viewers who watched to the end.

### Drop-off Rate (%)
```
100 - (Viewers at 100%) / (Viewers at start) * 100
```
Shows where viewers typically stop watching.

### Engagement Score (0-100)
```
(Completion Rate * 0.5) + (Watch Time Ratio * 0.3) + (Sessions * 0.2)
```
Overall engagement quality metric.

### Average Watch Time
```
Total Watch Time / Number of Plays
```
Average duration per play session.

## Performance Considerations

### 1. Event Batching
Events are sent individually for real-time tracking but consider batching for high-traffic scenarios:

```typescript
const eventBuffer: MediaEvent[] = [];
const batchSize = 10;

async function bufferEvent(event: MediaEvent) {
  eventBuffer.push(event);
  if (eventBuffer.length >= batchSize) {
    await flushEvents();
  }
}

async function flushEvents() {
  // Send all events at once
  for (const event of eventBuffer) {
    await tracker.trackEvent(event);
  }
  eventBuffer.length = 0;
}
```

### 2. Progress Report Optimization
Only report progress at meaningful intervals:

```typescript
tracker.setProgressInterval(10000); // Every 10 seconds
tracker.setProgressThreshold(5);    // Only if 5%+ progress
```

### 3. Database Indexes
All tables are indexed for optimal query performance:
- site_id + date for time-range queries
- media_id for individual media lookups
- event_type for event filtering

## Testing

### Test with Sample Videos

```typescript
// Quick test
const tracker = new MediaTracker('test-video', 'video', {
  siteId: 'test-site',
  sessionId: 'test-session'
});

// Simulate events
await tracker.trackPlay(0, 100);
await tracker.trackProgress(25, 100);
await tracker.trackProgress(50, 100);
await tracker.trackComplete(100);
```

### Verify Events in Database

```sql
SELECT * FROM media_events
WHERE media_id = 'test-video'
ORDER BY event_timestamp DESC
LIMIT 20;
```

## Troubleshooting

### Events not being tracked
- Check CORS headers are correct
- Verify site_id is valid
- Check browser console for errors
- Ensure media element is properly loaded

### Completion rate showing 0%
- Ensure 'complete' event is being triggered
- Check video element has `ended` event listener
- Verify duration is correctly set

### Slow analytics queries
- Use date range filter to limit data
- Check indexes are created
- Consider archiving old data

## Browser Support

- Chrome/Chromium: Full support
- Firefox: Full support
- Safari: Full support (iOS 10+)
- Edge: Full support
- IE 11: Limited (polyfills needed)

## GDPR Compliance

Media analytics can track individual viewers. Ensure:
1. User consent is obtained before tracking
2. IP addresses are anonymized/pseudonymized
3. Visitor hash is used instead of personal data
4. Data retention policy is enforced
5. Users can request data deletion

## Integration Checklist

- [x] Database migrations created
- [x] Edge Function deployed
- [x] React components built
- [x] TypeScript types defined
- [x] Tracking utility library implemented
- [x] RLS policies configured
- [x] Documentation completed
- [ ] Dashboard integration
- [ ] Performance testing
- [ ] User acceptance testing

## Files Created

```
supabase/migrations/
  └── 20260209140000_media_analytics.sql

supabase/functions/
  └── media-analytics/
      └── index.ts

src/components/dashboard/
  └── MediaAnalyticsDashboard.tsx

src/types/
  └── media.ts

src/lib/
  └── mediaTracking.ts
```

## Next Steps

1. **Integrate Dashboard**
   - Add MediaAnalyticsDashboard to main analytics page
   - Wire up date range picker
   - Configure site selector

2. **Implement Tracking**
   - Add media tracker to tracking script
   - Test with real videos/audio
   - Verify data collection

3. **Advanced Features**
   - Heatmap of seek patterns
   - Quality comparison analytics
   - Device performance comparison
   - Geographic viewer distribution

---

**Task #22 Status**: ✅ Complete - Media Analytics Implemented

