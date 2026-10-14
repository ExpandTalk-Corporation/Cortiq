import { z } from 'zod';

// Basic/Common Schemas
export const EmailSchema = z
  .string()
  .email('Invalid email address')
  .max(255, 'Email must be less than 255 characters');

export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const UrlSchema = z
  .string()
  .url('Invalid URL')
  .max(2048, 'URL must be less than 2048 characters');

export const DomainSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/,
    'Invalid domain name'
  )
  .max(253, 'Domain must be less than 253 characters');

export const UUIDSchema = z
  .string()
  .uuid('Invalid UUID format');

export const TrackingIdSchema = z
  .string()
  .regex(/^tk_[a-f0-9]{32}$/, 'Invalid tracking ID format');

export const CompanyIdSchema = UUIDSchema;
export const SiteIdSchema = UUIDSchema;
export const UserIdSchema = UUIDSchema;

// String Validators
export const NameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(255, 'Name must be less than 255 characters')
  .trim();

export const DescriptionSchema = z
  .string()
  .max(2000, 'Description must be less than 2000 characters')
  .optional();

export const SlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug format')
  .max(255, 'Slug must be less than 255 characters');

// Authentication Schemas
export const SignUpSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  confirmPassword: z.string(),
  name: NameSchema,
  companyName: NameSchema.optional(),
  acceptTerms: z.boolean().refine(val => val === true, 'You must accept the terms'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

export const ResetPasswordSchema = z.object({
  email: EmailSchema,
});

export const UpdatePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: PasswordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Company/Site Management Schemas
export const CreateCompanySchema = z.object({
  name: NameSchema,
  description: DescriptionSchema,
  website: UrlSchema.optional(),
  industry: z.string().optional(),
});

export const UpdateCompanySchema = z.object({
  name: NameSchema.optional(),
  description: DescriptionSchema,
  website: UrlSchema.optional(),
  industry: z.string().optional(),
});

export const CreateSiteSchema = z.object({
  name: NameSchema,
  domain: DomainSchema,
  description: DescriptionSchema,
  companyId: CompanyIdSchema,
  trackingEnabled: z.boolean().default(true),
  aiAgentTrackingEnabled: z.boolean().default(true),
  heatmapEnabled: z.boolean().default(true),
});

export const UpdateSiteSchema = z.object({
  name: NameSchema.optional(),
  domain: DomainSchema.optional(),
  description: DescriptionSchema,
  trackingEnabled: z.boolean().optional(),
  aiAgentTrackingEnabled: z.boolean().optional(),
  heatmapEnabled: z.boolean().optional(),
});

// Event Tracking Schemas
export const TrackingEventSchema = z.object({
  trackingId: TrackingIdSchema,
  eventType: z.enum([
    'pageview',
    'click',
    'scroll',
    'form_submission',
    'custom',
    'conversion',
    'error',
  ]),
  eventName: z.string().max(255).optional(),
  pageUrl: UrlSchema,
  referrer: UrlSchema.optional(),
  userAgent: z.string().max(1024),
  ipAddress: z.string(),
  timestamp: z.number().int().positive(),
  sessionId: z.string().max(255),
  userId: z.string().max(255).optional(),
  properties: z.record(z.any()).optional(),
  aiAgent: z.enum([
    'chatgpt',
    'perplexity',
    'claude',
    'gemini',
    'grok',
    'bingbot',
    'meta',
    'other',
  ]).optional(),
  deviceType: z.enum(['desktop', 'mobile', 'tablet']).optional(),
  osName: z.string().max(255).optional(),
  browserName: z.string().max(255).optional(),
});

export const BatchTrackingEventSchema = z.object({
  trackingId: TrackingIdSchema,
  events: z.array(TrackingEventSchema).min(1).max(100),
});

// Heatmap Schemas
export const HeatmapEventSchema = z.object({
  trackingId: TrackingIdSchema,
  sessionId: z.string().max(255),
  eventType: z.enum(['click', 'scroll', 'attention']),
  pageUrl: UrlSchema,
  x: z.number().int().min(0).optional(),
  y: z.number().int().min(0).optional(),
  viewportWidth: z.number().int().min(0),
  viewportHeight: z.number().int().min(0),
  timestamp: z.number().int().positive(),
  scrollPercentage: z.number().min(0).max(100).optional(),
});

// Form Analytics Schemas
export const FormAnalyticsEventSchema = z.object({
  trackingId: TrackingIdSchema,
  sessionId: z.string().max(255),
  formId: z.string().max(255),
  formName: z.string().max(255),
  fieldName: z.string().max(255),
  fieldType: z.string().max(50),
  eventType: z.enum(['focus', 'blur', 'change', 'submit', 'error']),
  timestamp: z.number().int().positive(),
  timeSpent: z.number().int().min(0).optional(),
  valueLength: z.number().int().min(0).optional(),
  pageUrl: UrlSchema,
});

// A/B Testing Schemas
export const ABTestSchema = z.object({
  name: NameSchema,
  description: DescriptionSchema,
  siteId: SiteIdSchema,
  variantA: z.object({
    name: z.string().max(255),
    description: DescriptionSchema,
  }),
  variantB: z.object({
    name: z.string().max(255),
    description: DescriptionSchema,
  }),
  trafficAllocation: z.object({
    variantA: z.number().min(0).max(100),
    variantB: z.number().min(0).max(100),
  }).refine((data) => data.variantA + data.variantB === 100, {
    message: 'Traffic allocation must sum to 100',
  }),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  status: z.enum(['draft', 'running', 'paused', 'completed']).default('draft'),
});

export const UpdateABTestSchema = z.object({
  name: NameSchema.optional(),
  description: DescriptionSchema,
  status: z.enum(['draft', 'running', 'paused', 'completed']).optional(),
  endDate: z.coerce.date().optional(),
});

export const ABTestConversionSchema = z.object({
  testId: UUIDSchema,
  variant: z.enum(['A', 'B']),
  sessionId: z.string().max(255),
  conversionValue: z.number().positive().optional(),
  timestamp: z.number().int().positive(),
});

// GDPR/CMP Schemas
export const ConsentPreferencesSchema = z.object({
  trackingId: TrackingIdSchema,
  sessionId: z.string().max(255),
  analytics: z.boolean().default(false),
  marketing: z.boolean().default(false),
  essential: z.boolean().default(true),
  personalization: z.boolean().default(false),
  timestamp: z.number().int().positive(),
  expiresAt: z.number().int().positive().optional(),
});

export const DataRequestSchema = z.object({
  companyId: CompanyIdSchema,
  dataType: z.enum(['export', 'delete']),
  reason: z.string().optional(),
  email: EmailSchema,
  requestedAt: z.number().int().positive(),
});

export const CookieBannerSchema = z.object({
  siteId: SiteIdSchema,
  title: z.string().max(255),
  description: z.string().max(1000),
  acceptButtonText: z.string().max(100).default('Accept All'),
  rejectButtonText: z.string().max(100).default('Reject All'),
  customizeButtonText: z.string().max(100).default('Customize'),
  position: z.enum(['top', 'bottom', 'center']).default('bottom'),
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  textColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  nudgingEnabled: z.boolean().default(false),
  nudgingDuration: z.number().int().min(1).max(30).optional(),
});

// Analytics Query Schemas
export const DateRangeSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
}).refine((data) => data.startDate <= data.endDate, {
  message: 'Start date must be before end date',
  path: ['endDate'],
});

export const AnalyticsQuerySchema = z.object({
  siteId: SiteIdSchema,
  ...DateRangeSchema.shape,
  metrics: z.array(z.string()).optional(),
  dimensions: z.array(z.string()).optional(),
  filters: z.record(z.string(), z.any()).optional(),
  limit: z.number().int().min(1).max(10000).default(100),
  offset: z.number().int().min(0).default(0),
});

export const ReportGenerationSchema = z.object({
  siteId: SiteIdSchema,
  reportType: z.enum(['performance', 'traffic', 'conversion', 'aibots', 'custom']),
  ...DateRangeSchema.shape,
  format: z.enum(['pdf', 'csv', 'json']).default('pdf'),
  includeCharts: z.boolean().default(true),
  includeSummary: z.boolean().default(true),
});

// Integration Schemas
export const GoogleAnalyticsIntegrationSchema = z.object({
  siteId: SiteIdSchema,
  gaPropertyId: z.string().regex(/^\d+$/, 'Invalid GA property ID'),
  gaStreamId: z.string().regex(/^\d+$/, 'Invalid GA stream ID'),
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  syncEnabled: z.boolean().default(true),
});

export const BingWebmasterIntegrationSchema = z.object({
  siteId: SiteIdSchema,
  siteUrl: UrlSchema,
  apiKey: z.string(),
  accessToken: z.string(),
  syncEnabled: z.boolean().default(true),
});

// User Management Schemas
export const UpdateUserProfileSchema = z.object({
  name: NameSchema.optional(),
  email: EmailSchema.optional(),
  phone: z.string().max(20).optional(),
  companyName: z.string().max(255).optional(),
  role: z.string().max(100).optional(),
  language: z.enum(['en', 'sv']).optional(),
  timezone: z.string().optional(),
});

export const InviteUserSchema = z.object({
  email: EmailSchema,
  companyId: CompanyIdSchema,
  role: z.enum(['admin', 'editor', 'viewer']).default('viewer'),
});

// Settings Schemas
export const DataRetentionSettingsSchema = z.object({
  siteId: SiteIdSchema,
  retentionDays: z.number().int().min(1).max(2555).default(365),
  anonymizeIpAfterDays: z.number().int().min(0).max(365).default(30),
  deleteSessionsOlderThan: z.number().int().min(1).max(365).default(90),
});

export const TrackingSettingsSchema = z.object({
  siteId: SiteIdSchema,
  trackingEnabled: z.boolean().default(true),
  aiAgentTrackingEnabled: z.boolean().default(true),
  heatmapEnabled: z.boolean().default(true),
  formAnalyticsEnabled: z.boolean().default(true),
  sessionRecordingEnabled: z.boolean().default(false),
  errorTrackingEnabled: z.boolean().default(true),
  customScriptEnabled: z.boolean().default(false),
});

// Contact Form Schema (Frontend)
export const ContactFormSchema = z.object({
  name: NameSchema,
  email: EmailSchema,
  message: z.string()
    .min(10, 'Message must be at least 10 characters')
    .max(5000, 'Message must be less than 5000 characters')
    .trim(),
});

// Feedback Schema
export const FeedbackSchema = z.object({
  siteId: SiteIdSchema.optional(),
  type: z.enum(['bug', 'feature', 'improvement', 'other']),
  title: z.string()
    .min(5, 'Title must be at least 5 characters')
    .max(255, 'Title must be less than 255 characters'),
  description: z.string()
    .min(10, 'Description must be at least 10 characters')
    .max(5000, 'Description must be less than 5000 characters'),
  email: EmailSchema.optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
});

// Bulk Operations Schemas
export const BulkDeleteSchema = z.object({
  ids: z.array(UUIDSchema).min(1).max(1000),
  entityType: z.string(),
});

export const BulkUpdateSchema = z.object({
  ids: z.array(UUIDSchema).min(1).max(1000),
  updates: z.record(z.any()),
});

// Export types from schemas
export type SignUp = z.infer<typeof SignUpSchema>;
export type Login = z.infer<typeof LoginSchema>;
export type ResetPassword = z.infer<typeof ResetPasswordSchema>;
export type UpdatePassword = z.infer<typeof UpdatePasswordSchema>;

export type CreateCompany = z.infer<typeof CreateCompanySchema>;
export type UpdateCompany = z.infer<typeof UpdateCompanySchema>;
export type CreateSite = z.infer<typeof CreateSiteSchema>;
export type UpdateSite = z.infer<typeof UpdateSiteSchema>;

export type TrackingEvent = z.infer<typeof TrackingEventSchema>;
export type BatchTrackingEvent = z.infer<typeof BatchTrackingEventSchema>;

export type HeatmapEvent = z.infer<typeof HeatmapEventSchema>;
export type FormAnalyticsEvent = z.infer<typeof FormAnalyticsEventSchema>;

export type ABTest = z.infer<typeof ABTestSchema>;
export type UpdateABTest = z.infer<typeof UpdateABTestSchema>;
export type ABTestConversion = z.infer<typeof ABTestConversionSchema>;

export type ConsentPreferences = z.infer<typeof ConsentPreferencesSchema>;
export type DataRequest = z.infer<typeof DataRequestSchema>;
export type CookieBanner = z.infer<typeof CookieBannerSchema>;

export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>;
export type ReportGeneration = z.infer<typeof ReportGenerationSchema>;

export type GoogleAnalyticsIntegration = z.infer<typeof GoogleAnalyticsIntegrationSchema>;
export type BingWebmasterIntegration = z.infer<typeof BingWebmasterIntegrationSchema>;

export type UpdateUserProfile = z.infer<typeof UpdateUserProfileSchema>;
export type InviteUser = z.infer<typeof InviteUserSchema>;

export type DataRetentionSettings = z.infer<typeof DataRetentionSettingsSchema>;
export type TrackingSettings = z.infer<typeof TrackingSettingsSchema>;

export type ContactForm = z.infer<typeof ContactFormSchema>;
export type Feedback = z.infer<typeof FeedbackSchema>;

export type BulkDelete = z.infer<typeof BulkDeleteSchema>;
export type BulkUpdate = z.infer<typeof BulkUpdateSchema>;
