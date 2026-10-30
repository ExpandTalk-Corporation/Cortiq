export interface Site {
  id: string;
  /** Owner. In this data model the owner's user id is also the company id (companies.id). */
  user_id?: string;
  site_name: string;
  domain: string;
  tracking_id: string;
  is_active: boolean;
  created_at: string;
  ga_measurement_id?: string;
  ga_integration_enabled?: boolean;
  ga_sync_events?: string[];
  ga_enhanced_ecommerce?: boolean;
}

export interface HeatmapPoint {
  x_coordinate?: number; // Legacy support
  y_coordinate?: number; // Legacy support
  grid_x?: number; // New GDPR-compliant grid system
  grid_y?: number; // New GDPR-compliant grid system
  viewport_width?: number;
  viewport_height?: number;
  intensity: number;
  interaction_type: string;
  element_text?: string;
  ip_address?: string;
  url?: string;
  device_type?: string;
  // Mobile-specific fields from GA4
  mobile_device_brand?: string; // Apple, Samsung, Huawei
  mobile_device_model?: string; // iPhone 14 Pro, SM-G998B
  operating_system?: string; // iOS, Android
  operating_system_version?: string; // iOS 17.5.1, Android 14
  browser?: string; // Safari, Chrome
  touch_force?: number; // Touch pressure (3D Touch/Force Touch)
  touch_radius?: number; // Touch area size
  is_touch_device?: boolean; // Touch vs mouse interaction
}

export interface Analytics {
  totalSessions: number;
  totalPageViews: number;
  averageSessionDuration: number; // Updated naming to match GA4
  averageEngagementTime: number; // GA4 metric - average time for engaged sessions
  engagementRate: number; // GA4 metric - replaces bounce rate
  averageTimeOnSite: number; // Legacy metric for backwards compatibility
  topPages: Array<{ url: string; views: number; title?: string }>;
  deviceBreakdown: Array<{ device: string; count: number; percentage: number }>;
}

export interface NavigationMenuItem {
  id: string;
  menu_item_id: number;
  menu_title: string;
  menu_url: string;
  menu_order: number;
  parent_id: number;
  css_classes: string[];
  menu_location: string;
  is_active: boolean;
}

export interface NavigationAnalytics {
  menu_item_id: number;
  menu_title: string;
  menu_url: string;
  click_count: number;
  device_type: string;
  date: string;
}