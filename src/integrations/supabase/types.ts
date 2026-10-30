export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ab_test_assignments: {
        Row: {
          assigned_at: string
          id: string
          session_id: string
          site_id: string
          test_id: string
          user_identifier: string | null
          variant_id: string
        }
        Insert: {
          assigned_at?: string
          id?: string
          session_id: string
          site_id: string
          test_id: string
          user_identifier?: string | null
          variant_id: string
        }
        Update: {
          assigned_at?: string
          id?: string
          session_id?: string
          site_id?: string
          test_id?: string
          user_identifier?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_ab_test_assignments_test_id"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "ab_tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ab_test_assignments_variant_id"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "ab_test_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      ab_test_results: {
        Row: {
          calculated_at: string
          confidence_interval_lower: number | null
          confidence_interval_upper: number | null
          conversion_rate: number
          conversions: number
          date: string
          id: string
          p_value: number | null
          revenue: number | null
          sessions: number
          site_id: string
          statistical_significance: number | null
          test_id: string
          variant_id: string
        }
        Insert: {
          calculated_at?: string
          confidence_interval_lower?: number | null
          confidence_interval_upper?: number | null
          conversion_rate?: number
          conversions?: number
          date?: string
          id?: string
          p_value?: number | null
          revenue?: number | null
          sessions?: number
          site_id: string
          statistical_significance?: number | null
          test_id: string
          variant_id: string
        }
        Update: {
          calculated_at?: string
          confidence_interval_lower?: number | null
          confidence_interval_upper?: number | null
          conversion_rate?: number
          conversions?: number
          date?: string
          id?: string
          p_value?: number | null
          revenue?: number | null
          sessions?: number
          site_id?: string
          statistical_significance?: number | null
          test_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_ab_test_results_test_id"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "ab_tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ab_test_results_variant_id"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "ab_test_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      ab_test_variants: {
        Row: {
          created_at: string
          id: string
          is_control: boolean
          test_id: string
          traffic_percentage: number
          variant_config: Json | null
          variant_description: string | null
          variant_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_control?: boolean
          test_id: string
          traffic_percentage?: number
          variant_config?: Json | null
          variant_description?: string | null
          variant_name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_control?: boolean
          test_id?: string
          traffic_percentage?: number
          variant_config?: Json | null
          variant_description?: string | null
          variant_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_ab_test_variants_test_id"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "ab_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      ab_tests: {
        Row: {
          baseline_value: number | null
          confidence_level: number
          conversion_goal: string
          conversion_metric: string
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          minimum_sample_size: number | null
          site_id: string
          start_date: string | null
          target_lift: number | null
          test_description: string | null
          test_name: string
          test_status: string
          test_type: string
          traffic_allocation: Json
          updated_at: string
        }
        Insert: {
          baseline_value?: number | null
          confidence_level?: number
          conversion_goal: string
          conversion_metric?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          minimum_sample_size?: number | null
          site_id: string
          start_date?: string | null
          target_lift?: number | null
          test_description?: string | null
          test_name: string
          test_status?: string
          test_type?: string
          traffic_allocation?: Json
          updated_at?: string
        }
        Update: {
          baseline_value?: number | null
          confidence_level?: number
          conversion_goal?: string
          conversion_metric?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          minimum_sample_size?: number | null
          site_id?: string
          start_date?: string | null
          target_lift?: number | null
          test_description?: string | null
          test_name?: string
          test_status?: string
          test_type?: string
          traffic_allocation?: Json
          updated_at?: string
        }
        Relationships: []
      }
      agent_activity_log: {
        Row: {
          activity_type: string
          agent_id: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          request_method: string | null
          response_status: number | null
          response_time_ms: number | null
          site_id: string
          url: string | null
        }
        Insert: {
          activity_type: string
          agent_id?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          request_method?: string | null
          response_status?: number | null
          response_time_ms?: number | null
          site_id: string
          url?: string | null
        }
        Update: {
          activity_type?: string
          agent_id?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          request_method?: string | null
          response_status?: number | null
          response_time_ms?: number | null
          site_id?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_activity_log_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_activity_log_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_macros: {
        Row: {
          config: Json
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          macro_type: string
          name: string
          site_id: string
          updated_at: string | null
        }
        Insert: {
          config?: Json
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          macro_type: string
          name: string
          site_id: string
          updated_at?: string | null
        }
        Update: {
          config?: Json
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          macro_type?: string
          name?: string
          site_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_macros_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_registry: {
        Row: {
          agent_name: string
          agent_type: string
          api_key_hint: string | null
          created_at: string | null
          description: string | null
          endpoint_url: string | null
          id: string
          ip_range: string | null
          is_active: boolean | null
          last_seen_at: string | null
          organization_id: string | null
          site_id: string
          total_requests: number | null
          updated_at: string | null
          user_agent_pattern: string | null
        }
        Insert: {
          agent_name: string
          agent_type?: string
          api_key_hint?: string | null
          created_at?: string | null
          description?: string | null
          endpoint_url?: string | null
          id?: string
          ip_range?: string | null
          is_active?: boolean | null
          last_seen_at?: string | null
          organization_id?: string | null
          site_id: string
          total_requests?: number | null
          updated_at?: string | null
          user_agent_pattern?: string | null
        }
        Update: {
          agent_name?: string
          agent_type?: string
          api_key_hint?: string | null
          created_at?: string | null
          description?: string | null
          endpoint_url?: string | null
          id?: string
          ip_range?: string | null
          is_active?: boolean | null
          last_seen_at?: string | null
          organization_id?: string | null
          site_id?: string
          total_requests?: number | null
          updated_at?: string | null
          user_agent_pattern?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_registry_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_registry_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          completed_at: string | null
          data_snapshot: Json | null
          duration_ms: number | null
          error_message: string | null
          function_name: string
          id: string
          input_tokens: number | null
          model: string | null
          output: Json | null
          output_tokens: number | null
          prompt: string | null
          queries_run: Json | null
          site_id: string
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          data_snapshot?: Json | null
          duration_ms?: number | null
          error_message?: string | null
          function_name: string
          id?: string
          input_tokens?: number | null
          model?: string | null
          output?: Json | null
          output_tokens?: number | null
          prompt?: string | null
          queries_run?: Json | null
          site_id: string
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          data_snapshot?: Json | null
          duration_ms?: number | null
          error_message?: string | null
          function_name?: string
          id?: string
          input_tokens?: number | null
          model?: string | null
          output?: Json | null
          output_tokens?: number | null
          prompt?: string | null
          queries_run?: Json | null
          site_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      aggregate_conversions_daily: {
        Row: {
          conversions: number
          day: string
          goal_id: string
          goal_name: string
          referrer_domain: string
          site_id: string
          utm_campaign: string
          utm_medium: string
          utm_source: string
          value: number
        }
        Insert: {
          conversions?: number
          day: string
          goal_id: string
          goal_name: string
          referrer_domain?: string
          site_id: string
          utm_campaign?: string
          utm_medium?: string
          utm_source?: string
          value?: number
        }
        Update: {
          conversions?: number
          day?: string
          goal_id?: string
          goal_name?: string
          referrer_domain?: string
          site_id?: string
          utm_campaign?: string
          utm_medium?: string
          utm_source?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "aggregate_conversions_daily_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      aggregate_pages_daily: {
        Row: {
          day: string
          entries: number
          pageviews: number
          path: string
          site_id: string
        }
        Insert: {
          day: string
          entries?: number
          pageviews?: number
          path: string
          site_id: string
        }
        Update: {
          day?: string
          entries?: number
          pageviews?: number
          path?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aggregate_pages_daily_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      aggregate_salts: {
        Row: {
          day: string
          salt: string
        }
        Insert: {
          day: string
          salt: string
        }
        Update: {
          day?: string
          salt?: string
        }
        Relationships: []
      }
      aggregate_sources_daily: {
        Row: {
          day: string
          device: string
          referrer_domain: string
          site_id: string
          utm_campaign: string
          utm_medium: string
          utm_source: string
          visitors: number
          visits: number
        }
        Insert: {
          day: string
          device?: string
          referrer_domain?: string
          site_id: string
          utm_campaign?: string
          utm_medium?: string
          utm_source?: string
          visitors?: number
          visits?: number
        }
        Update: {
          day?: string
          device?: string
          referrer_domain?: string
          site_id?: string
          utm_campaign?: string
          utm_medium?: string
          utm_source?: string
          visitors?: number
          visits?: number
        }
        Relationships: [
          {
            foreignKeyName: "aggregate_sources_daily_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      aggregate_visitors: {
        Row: {
          day: string
          device: string
          goals_hit: string[]
          last_seen_at: string
          referrer_domain: string
          site_id: string
          utm_campaign: string
          utm_medium: string
          utm_source: string
          visit_started_at: string
          visitor_hash: string
        }
        Insert: {
          day: string
          device?: string
          goals_hit?: string[]
          last_seen_at: string
          referrer_domain?: string
          site_id: string
          utm_campaign?: string
          utm_medium?: string
          utm_source?: string
          visit_started_at: string
          visitor_hash: string
        }
        Update: {
          day?: string
          device?: string
          goals_hit?: string[]
          last_seen_at?: string
          referrer_domain?: string
          site_id?: string
          utm_campaign?: string
          utm_medium?: string
          utm_source?: string
          visit_started_at?: string
          visitor_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "aggregate_visitors_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_journey_steps: {
        Row: {
          asset_type: string | null
          created_at: string | null
          id: string
          page_type: string | null
          previous_url: string | null
          referrer: string | null
          request_type: string | null
          response_time_ms: number | null
          session_id: string
          site_id: string
          status_code: number | null
          step_number: number
          time_on_page_ms: number | null
          url: string
        }
        Insert: {
          asset_type?: string | null
          created_at?: string | null
          id?: string
          page_type?: string | null
          previous_url?: string | null
          referrer?: string | null
          request_type?: string | null
          response_time_ms?: number | null
          session_id: string
          site_id: string
          status_code?: number | null
          step_number: number
          time_on_page_ms?: number | null
          url: string
        }
        Update: {
          asset_type?: string | null
          created_at?: string | null
          id?: string
          page_type?: string | null
          previous_url?: string | null
          referrer?: string | null
          request_type?: string | null
          response_time_ms?: number | null
          session_id?: string
          site_id?: string
          status_code?: number | null
          step_number?: number
          time_on_page_ms?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_journey_steps_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_journey_steps_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_sessions: {
        Row: {
          bot_name: string | null
          bot_type: string
          browser_type: string | null
          conversion_at: string | null
          conversion_page: string | null
          cookies_accepted: boolean | null
          created_at: string | null
          device_fingerprint: string | null
          exit_page: string | null
          id: string
          is_visual_browser: boolean | null
          last_activity_at: string | null
          reached_conversion: boolean | null
          session_id: string
          site_id: string
          started_at: string | null
          total_assets_loaded: number | null
          total_pages_viewed: number | null
          total_requests: number | null
        }
        Insert: {
          bot_name?: string | null
          bot_type: string
          browser_type?: string | null
          conversion_at?: string | null
          conversion_page?: string | null
          cookies_accepted?: boolean | null
          created_at?: string | null
          device_fingerprint?: string | null
          exit_page?: string | null
          id?: string
          is_visual_browser?: boolean | null
          last_activity_at?: string | null
          reached_conversion?: boolean | null
          session_id: string
          site_id: string
          started_at?: string | null
          total_assets_loaded?: number | null
          total_pages_viewed?: number | null
          total_requests?: number | null
        }
        Update: {
          bot_name?: string | null
          bot_type?: string
          browser_type?: string | null
          conversion_at?: string | null
          conversion_page?: string | null
          cookies_accepted?: boolean | null
          created_at?: string | null
          device_fingerprint?: string | null
          exit_page?: string | null
          id?: string
          is_visual_browser?: boolean | null
          last_activity_at?: string | null
          reached_conversion?: boolean | null
          session_id?: string
          site_id?: string
          started_at?: string | null
          total_assets_loaded?: number | null
          total_pages_viewed?: number | null
          total_requests?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_sessions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_bot_analysis: {
        Row: {
          ai_analysis: string | null
          analysis_period_days: number
          bot_breakdown: Json | null
          created_at: string | null
          id: string
          recommendations_generated: boolean | null
          site_id: string
          threat_indicators: Json | null
          threat_score: number
          total_visits: number
          unique_bots: number
          updated_at: string | null
        }
        Insert: {
          ai_analysis?: string | null
          analysis_period_days?: number
          bot_breakdown?: Json | null
          created_at?: string | null
          id?: string
          recommendations_generated?: boolean | null
          site_id: string
          threat_indicators?: Json | null
          threat_score?: number
          total_visits?: number
          unique_bots?: number
          updated_at?: string | null
        }
        Update: {
          ai_analysis?: string | null
          analysis_period_days?: number
          bot_breakdown?: Json | null
          created_at?: string | null
          id?: string
          recommendations_generated?: boolean | null
          site_id?: string
          threat_indicators?: Json | null
          threat_score?: number
          total_visits?: number
          unique_bots?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_bot_analysis_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_bot_probe_signals: {
        Row: {
          automation_signals: Json | null
          browser_signals: Json | null
          created_at: string
          execution_time_ms: number | null
          headless_detected: boolean | null
          id: string
          probe_version: string | null
          site_id: string
          traffic_id: string | null
          triggered_at: string
          webdriver_detected: boolean | null
        }
        Insert: {
          automation_signals?: Json | null
          browser_signals?: Json | null
          created_at?: string
          execution_time_ms?: number | null
          headless_detected?: boolean | null
          id?: string
          probe_version?: string | null
          site_id: string
          traffic_id?: string | null
          triggered_at?: string
          webdriver_detected?: boolean | null
        }
        Update: {
          automation_signals?: Json | null
          browser_signals?: Json | null
          created_at?: string
          execution_time_ms?: number | null
          headless_detected?: boolean | null
          id?: string
          probe_version?: string | null
          site_id?: string
          traffic_id?: string | null
          triggered_at?: string
          webdriver_detected?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_bot_probe_signals_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_bot_probe_signals_traffic_id_fkey"
            columns: ["traffic_id"]
            isOneToOne: false
            referencedRelation: "ai_bot_traffic"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_bot_traffic: {
        Row: {
          bot_category: string | null
          bot_name: string | null
          bot_type: string
          created_at: string
          detected_at: string
          device_type: string | null
          id: string
          ip_address: string | null
          js_executed: boolean | null
          probe_triggered: boolean | null
          referrer: string | null
          request_type: string | null
          requests_markdown_format: boolean | null
          server_signal: string | null
          session_id: string | null
          site_id: string
          source: string
          url: string
          user_agent: string | null
        }
        Insert: {
          bot_category?: string | null
          bot_name?: string | null
          bot_type: string
          created_at?: string
          detected_at?: string
          device_type?: string | null
          id?: string
          ip_address?: string | null
          js_executed?: boolean | null
          probe_triggered?: boolean | null
          referrer?: string | null
          request_type?: string | null
          requests_markdown_format?: boolean | null
          server_signal?: string | null
          session_id?: string | null
          site_id: string
          source?: string
          url: string
          user_agent?: string | null
        }
        Update: {
          bot_category?: string | null
          bot_name?: string | null
          bot_type?: string
          created_at?: string
          detected_at?: string
          device_type?: string | null
          id?: string
          ip_address?: string | null
          js_executed?: boolean | null
          probe_triggered?: boolean | null
          referrer?: string | null
          request_type?: string | null
          requests_markdown_format?: boolean | null
          server_signal?: string | null
          session_id?: string | null
          site_id?: string
          source?: string
          url?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_bot_traffic_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_citations: {
        Row: {
          citation_context: string | null
          cited_url: string
          clicked: boolean | null
          clicked_at: string | null
          created_at: string
          id: string
          site_id: string
          traffic_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          citation_context?: string | null
          cited_url: string
          clicked?: boolean | null
          clicked_at?: string | null
          created_at?: string
          id?: string
          site_id: string
          traffic_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          citation_context?: string | null
          cited_url?: string
          clicked?: boolean | null
          clicked_at?: string | null
          created_at?: string
          id?: string
          site_id?: string
          traffic_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_citations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_citations_traffic_id_fkey"
            columns: ["traffic_id"]
            isOneToOne: false
            referencedRelation: "ai_bot_traffic"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversion_goals: {
        Row: {
          created_at: string | null
          goal_name: string
          goal_type: string
          id: string
          is_active: boolean | null
          is_regex: boolean | null
          site_id: string
          updated_at: string | null
          url_pattern: string
          value: number | null
        }
        Insert: {
          created_at?: string | null
          goal_name: string
          goal_type: string
          id?: string
          is_active?: boolean | null
          is_regex?: boolean | null
          site_id: string
          updated_at?: string | null
          url_pattern: string
          value?: number | null
        }
        Update: {
          created_at?: string | null
          goal_name?: string
          goal_type?: string
          id?: string
          is_active?: boolean | null
          is_regex?: boolean | null
          site_id?: string
          updated_at?: string | null
          url_pattern?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversion_goals_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_search_traffic: {
        Row: {
          ai_platform: string
          bounce: boolean | null
          browser: string | null
          city: string | null
          conversions: number | null
          country: string | null
          created_at: string
          device_type: string | null
          engaged: boolean | null
          id: string
          landed_at: string
          operating_system: string | null
          page_title: string | null
          pages_viewed: number | null
          referrer: string | null
          revenue: number | null
          session_duration: number | null
          session_id: string
          site_id: string
          url: string
          user_agent: string | null
          user_hash: string | null
        }
        Insert: {
          ai_platform: string
          bounce?: boolean | null
          browser?: string | null
          city?: string | null
          conversions?: number | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          engaged?: boolean | null
          id?: string
          landed_at?: string
          operating_system?: string | null
          page_title?: string | null
          pages_viewed?: number | null
          referrer?: string | null
          revenue?: number | null
          session_duration?: number | null
          session_id: string
          site_id: string
          url: string
          user_agent?: string | null
          user_hash?: string | null
        }
        Update: {
          ai_platform?: string
          bounce?: boolean | null
          browser?: string | null
          city?: string | null
          conversions?: number | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          engaged?: boolean | null
          id?: string
          landed_at?: string
          operating_system?: string | null
          page_title?: string | null
          pages_viewed?: number | null
          referrer?: string | null
          revenue?: number | null
          session_duration?: number | null
          session_id?: string
          site_id?: string
          url?: string
          user_agent?: string | null
          user_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_search_traffic_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          company_id: string
          created_at: string
          est_cost_usd: number
          function_name: string
          id: string
          input_tokens: number
          model: string | null
          output_tokens: number
          site_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          est_cost_usd?: number
          function_name: string
          id?: string
          input_tokens?: number
          model?: string | null
          output_tokens?: number
          site_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          est_cost_usd?: number
          function_name?: string
          id?: string
          input_tokens?: number
          model?: string | null
          output_tokens?: number
          site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_summary: {
        Row: {
          clicks: number | null
          company_id: string
          content_id: string
          content_type: string
          conversions: number | null
          created_at: string
          date: string
          id: string
          platform: string | null
          submissions: number | null
          updated_at: string
          views: number | null
        }
        Insert: {
          clicks?: number | null
          company_id: string
          content_id: string
          content_type: string
          conversions?: number | null
          created_at?: string
          date: string
          id?: string
          platform?: string | null
          submissions?: number | null
          updated_at?: string
          views?: number | null
        }
        Update: {
          clicks?: number | null
          company_id?: string
          content_id?: string
          content_type?: string
          conversions?: number | null
          created_at?: string
          date?: string
          id?: string
          platform?: string | null
          submissions?: number | null
          updated_at?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_summary_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      api_key_usage: {
        Row: {
          api_key_id: string | null
          created_at: string | null
          endpoint: string
          id: number
          method: string
          request_ip: string | null
          response_time_ms: number | null
          status_code: number | null
          user_agent: string | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string | null
          endpoint: string
          id?: number
          method: string
          request_ip?: string | null
          response_time_ms?: number | null
          status_code?: number | null
          user_agent?: string | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string | null
          endpoint?: string
          id?: number
          method?: string
          request_ip?: string | null
          response_time_ms?: number | null
          status_code?: number | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_key_usage_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          permissions: string[] | null
          rate_limit: number | null
          site_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          permissions?: string[] | null
          rate_limit?: number | null
          site_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          permissions?: string[] | null
          rate_limit?: number | null
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      backtest_results: {
        Row: {
          alpha: number | null
          annual_return: number | null
          avg_loss: number | null
          avg_win: number | null
          backtest_date: string
          beta: number | null
          calmar_ratio: number | null
          created_at: string | null
          end_date: string
          equity_curve: Json | null
          id: string
          max_drawdown: number | null
          n_trades: number | null
          profit_factor: number | null
          sharpe_ratio: number | null
          sortino_ratio: number | null
          start_date: string
          strategy_name: string
          strategy_params: Json | null
          total_return: number | null
          trades_log: Json | null
          var_95: number | null
          volatility: number | null
          win_rate: number | null
        }
        Insert: {
          alpha?: number | null
          annual_return?: number | null
          avg_loss?: number | null
          avg_win?: number | null
          backtest_date: string
          beta?: number | null
          calmar_ratio?: number | null
          created_at?: string | null
          end_date: string
          equity_curve?: Json | null
          id?: string
          max_drawdown?: number | null
          n_trades?: number | null
          profit_factor?: number | null
          sharpe_ratio?: number | null
          sortino_ratio?: number | null
          start_date: string
          strategy_name: string
          strategy_params?: Json | null
          total_return?: number | null
          trades_log?: Json | null
          var_95?: number | null
          volatility?: number | null
          win_rate?: number | null
        }
        Update: {
          alpha?: number | null
          annual_return?: number | null
          avg_loss?: number | null
          avg_win?: number | null
          backtest_date?: string
          beta?: number | null
          calmar_ratio?: number | null
          created_at?: string | null
          end_date?: string
          equity_curve?: Json | null
          id?: string
          max_drawdown?: number | null
          n_trades?: number | null
          profit_factor?: number | null
          sharpe_ratio?: number | null
          sortino_ratio?: number | null
          start_date?: string
          strategy_name?: string
          strategy_params?: Json | null
          total_return?: number | null
          trades_log?: Json | null
          var_95?: number | null
          volatility?: number | null
          win_rate?: number | null
        }
        Relationships: []
      }
      bank_stress_overrides: {
        Row: {
          id: string
          npl_extra: number | null
          roe_extra: number | null
          scenario_id: string
          tag: string | null
          ticker: string
        }
        Insert: {
          id?: string
          npl_extra?: number | null
          roe_extra?: number | null
          scenario_id: string
          tag?: string | null
          ticker: string
        }
        Update: {
          id?: string
          npl_extra?: number | null
          roe_extra?: number | null
          scenario_id?: string
          tag?: string | null
          ticker?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_stress_overrides_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "stress_scenarios"
            referencedColumns: ["scenario_id"]
          },
        ]
      }
      banks: {
        Row: {
          alpha_vantage_ticker: string | null
          baltic_exposure: number | null
          cet1_ratio: number
          country: string
          created_at: string | null
          data_source: string | null
          dividend_yield: number
          flag: string
          forward_pe: number | null
          id: string
          last_updated: string | null
          loan_to_deposit: number
          name: string
          nim: number
          npl_ratio: number
          pb_ratio: number
          pe_ratio: number
          property_exposure: number | null
          roe: number
          ticker: string
          trading_currency: string
          underlying_currency: string
        }
        Insert: {
          alpha_vantage_ticker?: string | null
          baltic_exposure?: number | null
          cet1_ratio: number
          country: string
          created_at?: string | null
          data_source?: string | null
          dividend_yield: number
          flag: string
          forward_pe?: number | null
          id?: string
          last_updated?: string | null
          loan_to_deposit: number
          name: string
          nim: number
          npl_ratio: number
          pb_ratio: number
          pe_ratio: number
          property_exposure?: number | null
          roe: number
          ticker: string
          trading_currency: string
          underlying_currency: string
        }
        Update: {
          alpha_vantage_ticker?: string | null
          baltic_exposure?: number | null
          cet1_ratio?: number
          country?: string
          created_at?: string | null
          data_source?: string | null
          dividend_yield?: number
          flag?: string
          forward_pe?: number | null
          id?: string
          last_updated?: string | null
          loan_to_deposit?: number
          name?: string
          nim?: number
          npl_ratio?: number
          pb_ratio?: number
          pe_ratio?: number
          property_exposure?: number | null
          roe?: number
          ticker?: string
          trading_currency?: string
          underlying_currency?: string
        }
        Relationships: []
      }
      behavioral_alerts: {
        Row: {
          alert_description: string | null
          alert_name: string
          alert_type: string
          created_at: string
          id: string
          is_active: boolean
          notification_settings: Json | null
          severity: string
          site_id: string
          threshold_config: Json
          updated_at: string
        }
        Insert: {
          alert_description?: string | null
          alert_name: string
          alert_type: string
          created_at?: string
          id?: string
          is_active?: boolean
          notification_settings?: Json | null
          severity?: string
          site_id: string
          threshold_config?: Json
          updated_at?: string
        }
        Update: {
          alert_description?: string | null
          alert_name?: string
          alert_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          notification_settings?: Json | null
          severity?: string
          site_id?: string
          threshold_config?: Json
          updated_at?: string
        }
        Relationships: []
      }
      behavioral_incidents: {
        Row: {
          alert_id: string
          created_at: string
          detected_at: string
          id: string
          incident_data: Json
          incident_type: string
          notes: string | null
          resolved_at: string | null
          severity: string
          site_id: string
          status: string
          updated_at: string
        }
        Insert: {
          alert_id: string
          created_at?: string
          detected_at?: string
          id?: string
          incident_data?: Json
          incident_type: string
          notes?: string | null
          resolved_at?: string | null
          severity: string
          site_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          alert_id?: string
          created_at?: string
          detected_at?: string
          id?: string
          incident_data?: Json
          incident_type?: string
          notes?: string | null
          resolved_at?: string | null
          severity?: string
          site_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      bot_catalog: {
        Row: {
          category: string
          created_at: string
          description: string | null
          display_name: string
          id: string
          ip_ranges: string[]
          is_active: boolean
          name: string
          ua_patterns: string[]
          vendor: string | null
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          ip_ranges?: string[]
          is_active?: boolean
          name: string
          ua_patterns?: string[]
          vendor?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          ip_ranges?: string[]
          is_active?: boolean
          name?: string
          ua_patterns?: string[]
          vendor?: string | null
        }
        Relationships: []
      }
      bot_detections: {
        Row: {
          bot_catalog_id: string | null
          bot_category: string
          bot_name: string
          company_id: string
          confidence: number
          country: string | null
          detected_at: string
          detection_method: string
          id: string
          ip_anon: string | null
          page_url: string | null
          pipeline_mode: string
          raw_user_agent: string | null
          referrer: string | null
          ua_category: string | null
        }
        Insert: {
          bot_catalog_id?: string | null
          bot_category: string
          bot_name: string
          company_id: string
          confidence?: number
          country?: string | null
          detected_at?: string
          detection_method: string
          id?: string
          ip_anon?: string | null
          page_url?: string | null
          pipeline_mode?: string
          raw_user_agent?: string | null
          referrer?: string | null
          ua_category?: string | null
        }
        Update: {
          bot_catalog_id?: string | null
          bot_category?: string
          bot_name?: string
          company_id?: string
          confidence?: number
          country?: string | null
          detected_at?: string
          detection_method?: string
          id?: string
          ip_anon?: string | null
          page_url?: string | null
          pipeline_mode?: string
          raw_user_agent?: string | null
          referrer?: string | null
          ua_category?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_detections_bot_catalog_id_fkey"
            columns: ["bot_catalog_id"]
            isOneToOne: false
            referencedRelation: "bot_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_detections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_hourly_stats: {
        Row: {
          bot_category: string
          bot_name: string
          company_id: string
          hour: string
          request_count: number
        }
        Insert: {
          bot_category: string
          bot_name: string
          company_id: string
          hour: string
          request_count?: number
        }
        Update: {
          bot_category?: string
          bot_name?: string
          company_id?: string
          hour?: string
          request_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "bot_hourly_stats_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_performance: {
        Row: {
          conversion_rate: number | null
          conversions: number | null
          date: string
          id: string
          pageviews: number | null
          revenue: number | null
          sessions: number | null
          site_id: string | null
          unique_visitors: number | null
          updated_at: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          conversion_rate?: number | null
          conversions?: number | null
          date: string
          id?: string
          pageviews?: number | null
          revenue?: number | null
          sessions?: number | null
          site_id?: string | null
          unique_visitors?: number | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          conversion_rate?: number | null
          conversions?: number | null
          date?: string
          id?: string
          pageviews?: number | null
          revenue?: number | null
          sessions?: number | null
          site_id?: string | null
          unique_visitors?: number | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_performance_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      cloudflare_analytics: {
        Row: {
          bytes: number
          cached_requests: number
          day: string
          id: string
          page_views: number
          requests: number
          site_id: string
          top_countries: Json
          unique_visitors: number
          updated_at: string
        }
        Insert: {
          bytes?: number
          cached_requests?: number
          day: string
          id?: string
          page_views?: number
          requests?: number
          site_id: string
          top_countries?: Json
          unique_visitors?: number
          updated_at?: string
        }
        Update: {
          bytes?: number
          cached_requests?: number
          day?: string
          id?: string
          page_views?: number
          requests?: number
          site_id?: string
          top_countries?: Json
          unique_visitors?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cloudflare_analytics_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      cloudflare_traffic: {
        Row: {
          asset_type: string | null
          bot_name: string | null
          country: string | null
          created_at: string
          id: string
          ip_subnet: string | null
          is_asset: boolean
          method: string
          ray_id: string | null
          referrer: string | null
          site_id: string
          status_code: number | null
          url_path: string
          user_agent: string | null
          visitor_type: string
        }
        Insert: {
          asset_type?: string | null
          bot_name?: string | null
          country?: string | null
          created_at?: string
          id?: string
          ip_subnet?: string | null
          is_asset?: boolean
          method?: string
          ray_id?: string | null
          referrer?: string | null
          site_id: string
          status_code?: number | null
          url_path?: string
          user_agent?: string | null
          visitor_type?: string
        }
        Update: {
          asset_type?: string | null
          bot_name?: string | null
          country?: string | null
          created_at?: string
          id?: string
          ip_subnet?: string | null
          is_asset?: boolean
          method?: string
          ray_id?: string | null
          referrer?: string | null
          site_id?: string
          status_code?: number | null
          url_path?: string
          user_agent?: string | null
          visitor_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cloudflare_traffic_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_members: {
        Row: {
          cohort_id: string | null
          created_at: string | null
          first_seen: string | null
          id: string
          last_seen: string | null
          session_count: number | null
          visitor_hash: string | null
        }
        Insert: {
          cohort_id?: string | null
          created_at?: string | null
          first_seen?: string | null
          id?: string
          last_seen?: string | null
          session_count?: number | null
          visitor_hash?: string | null
        }
        Update: {
          cohort_id?: string | null
          created_at?: string | null
          first_seen?: string | null
          id?: string
          last_seen?: string | null
          session_count?: number | null
          visitor_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cohort_members_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_retention: {
        Row: {
          cohort_id: string | null
          created_at: string | null
          id: string
          retention_rate: number | null
          returning_users: number | null
          total_users: number | null
          week: number | null
        }
        Insert: {
          cohort_id?: string | null
          created_at?: string | null
          id?: string
          retention_rate?: number | null
          returning_users?: number | null
          total_users?: number | null
          week?: number | null
        }
        Update: {
          cohort_id?: string | null
          created_at?: string | null
          id?: string
          retention_rate?: number | null
          returning_users?: number | null
          total_users?: number | null
          week?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cohort_retention_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      cohorts: {
        Row: {
          created_at: string | null
          definition: Json | null
          description: string | null
          end_date: string | null
          id: string
          name: string
          site_id: string | null
          start_date: string | null
          user_count: number | null
        }
        Insert: {
          created_at?: string | null
          definition?: Json | null
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          site_id?: string | null
          start_date?: string | null
          user_count?: number | null
        }
        Update: {
          created_at?: string | null
          definition?: Json | null
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          site_id?: string | null
          start_date?: string | null
          user_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cohorts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      commodities: {
        Row: {
          api_symbol: string | null
          category: string
          change_24h: number | null
          change_percent: number | null
          created_at: string | null
          demand_index: number | null
          eu_critical: boolean | null
          id: string
          last_updated: string | null
          market_cap: number | null
          name: string
          price: number | null
          price_unit: string | null
          strategic: boolean | null
          symbol: string
          updated_at: string | null
          volume_24h: number | null
        }
        Insert: {
          api_symbol?: string | null
          category: string
          change_24h?: number | null
          change_percent?: number | null
          created_at?: string | null
          demand_index?: number | null
          eu_critical?: boolean | null
          id?: string
          last_updated?: string | null
          market_cap?: number | null
          name: string
          price?: number | null
          price_unit?: string | null
          strategic?: boolean | null
          symbol: string
          updated_at?: string | null
          volume_24h?: number | null
        }
        Update: {
          api_symbol?: string | null
          category?: string
          change_24h?: number | null
          change_percent?: number | null
          created_at?: string | null
          demand_index?: number | null
          eu_critical?: boolean | null
          id?: string
          last_updated?: string | null
          market_cap?: number | null
          name?: string
          price?: number | null
          price_unit?: string | null
          strategic?: boolean | null
          symbol?: string
          updated_at?: string | null
          volume_24h?: number | null
        }
        Relationships: []
      }
      commodity_price_history: {
        Row: {
          commodity_id: string | null
          company_id: string | null
          id: string
          item_type: string
          price: number
          timestamp: string
          volume: number | null
        }
        Insert: {
          commodity_id?: string | null
          company_id?: string | null
          id?: string
          item_type: string
          price: number
          timestamp: string
          volume?: number | null
        }
        Update: {
          commodity_id?: string | null
          company_id?: string | null
          id?: string
          item_type?: string
          price?: number
          timestamp?: string
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commodity_price_history_commodity_id_fkey"
            columns: ["commodity_id"]
            isOneToOne: false
            referencedRelation: "commodities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commodity_price_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "mining_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          ai_monthly_cost_cap: number | null
          api_key: string
          auto_eu_geo_override: boolean
          consent_settings: Json | null
          created_at: string
          id: string
          is_active: boolean | null
          jurisdiction: string
          name: string
          updated_at: string
        }
        Insert: {
          ai_monthly_cost_cap?: number | null
          api_key?: string
          auto_eu_geo_override?: boolean
          consent_settings?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          jurisdiction?: string
          name: string
          updated_at?: string
        }
        Update: {
          ai_monthly_cost_cap?: number | null
          api_key?: string
          auto_eu_geo_override?: boolean
          consent_settings?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          jurisdiction?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      companies_enriched: {
        Row: {
          avanza_orderbook_id: string | null
          avg_volume_30d: number | null
          beta: number | null
          created_at: string | null
          current_price: number | null
          distance_from_high: number | null
          distance_from_low: number | null
          dividend_yield: number | null
          enrichment_source: string | null
          exchange: string | null
          id: string
          industry: string | null
          isin: string | null
          last_enriched_at: string | null
          liquidity_score: number | null
          market_cap: number | null
          market_segment: string | null
          name: string
          pb_ratio: number | null
          pe_ratio: number | null
          sector: string | null
          ticker: string | null
          updated_at: string | null
          week_52_high: number | null
          week_52_low: number | null
        }
        Insert: {
          avanza_orderbook_id?: string | null
          avg_volume_30d?: number | null
          beta?: number | null
          created_at?: string | null
          current_price?: number | null
          distance_from_high?: number | null
          distance_from_low?: number | null
          dividend_yield?: number | null
          enrichment_source?: string | null
          exchange?: string | null
          id?: string
          industry?: string | null
          isin?: string | null
          last_enriched_at?: string | null
          liquidity_score?: number | null
          market_cap?: number | null
          market_segment?: string | null
          name: string
          pb_ratio?: number | null
          pe_ratio?: number | null
          sector?: string | null
          ticker?: string | null
          updated_at?: string | null
          week_52_high?: number | null
          week_52_low?: number | null
        }
        Update: {
          avanza_orderbook_id?: string | null
          avg_volume_30d?: number | null
          beta?: number | null
          created_at?: string | null
          current_price?: number | null
          distance_from_high?: number | null
          distance_from_low?: number | null
          dividend_yield?: number | null
          enrichment_source?: string | null
          exchange?: string | null
          id?: string
          industry?: string | null
          isin?: string | null
          last_enriched_at?: string | null
          liquidity_score?: number | null
          market_cap?: number | null
          market_segment?: string | null
          name?: string
          pb_ratio?: number | null
          pe_ratio?: number | null
          sector?: string | null
          ticker?: string | null
          updated_at?: string | null
          week_52_high?: number | null
          week_52_low?: number | null
        }
        Relationships: []
      }
      company_commodities: {
        Row: {
          commodity_id: string | null
          company_id: string | null
          created_at: string | null
          id: string
          primary_commodity: boolean | null
          production_share: number | null
        }
        Insert: {
          commodity_id?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          primary_commodity?: boolean | null
          production_share?: number | null
        }
        Update: {
          commodity_id?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          primary_commodity?: boolean | null
          production_share?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "company_commodities_commodity_id_fkey"
            columns: ["commodity_id"]
            isOneToOne: false
            referencedRelation: "commodities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_commodities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "mining_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_integrations: {
        Row: {
          account_metadata: Json
          company_id: string
          created_at: string
          created_by: string | null
          credentials: Json
          error_message: string | null
          id: string
          integration_type: string
          last_synced_at: string | null
          oauth_access_token: string | null
          oauth_refresh_token: string | null
          oauth_scopes: string[] | null
          status: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          account_metadata?: Json
          company_id: string
          created_at?: string
          created_by?: string | null
          credentials?: Json
          error_message?: string | null
          id?: string
          integration_type: string
          last_synced_at?: string | null
          oauth_access_token?: string | null
          oauth_refresh_token?: string | null
          oauth_scopes?: string[] | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          account_metadata?: Json
          company_id?: string
          created_at?: string
          created_by?: string | null
          credentials?: Json
          error_message?: string | null
          id?: string
          integration_type?: string
          last_synced_at?: string | null
          oauth_access_token?: string | null
          oauth_refresh_token?: string | null
          oauth_scopes?: string[] | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_secrets: {
        Row: {
          ai_model: string | null
          ai_provider: string
          anthropic_api_key: string | null
          company_id: string
          updated_at: string
        }
        Insert: {
          ai_model?: string | null
          ai_provider?: string
          anthropic_api_key?: string | null
          company_id: string
          updated_at?: string
        }
        Update: {
          ai_model?: string | null
          ai_provider?: string
          anthropic_api_key?: string | null
          company_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_secrets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_validations: {
        Row: {
          allowed_calls: Json | null
          blocked_calls: Json | null
          consent_status: Json
          created_at: string | null
          id: string
          ip_address: string | null
          session_id: string
          site_id: string
          user_agent: string | null
          validation_timestamp: string | null
        }
        Insert: {
          allowed_calls?: Json | null
          blocked_calls?: Json | null
          consent_status: Json
          created_at?: string | null
          id?: string
          ip_address?: string | null
          session_id: string
          site_id: string
          user_agent?: string | null
          validation_timestamp?: string | null
        }
        Update: {
          allowed_calls?: Json | null
          blocked_calls?: Json | null
          consent_status?: Json
          created_at?: string | null
          id?: string
          ip_address?: string | null
          session_id?: string
          site_id?: string
          user_agent?: string | null
          validation_timestamp?: string | null
        }
        Relationships: []
      }
      content_elements: {
        Row: {
          content_type: string | null
          created_at: string | null
          element_id: string
          element_selector: string | null
          element_text: string | null
          element_type: string
          id: string
          is_tracked: boolean | null
          page_title: string | null
          page_url: string
          priority: number | null
          section_name: string | null
          site_id: string | null
          tracking_started_at: string | null
          updated_at: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string | null
          element_id: string
          element_selector?: string | null
          element_text?: string | null
          element_type: string
          id?: string
          is_tracked?: boolean | null
          page_title?: string | null
          page_url: string
          priority?: number | null
          section_name?: string | null
          site_id?: string | null
          tracking_started_at?: string | null
          updated_at?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string | null
          element_id?: string
          element_selector?: string | null
          element_text?: string | null
          element_type?: string
          id?: string
          is_tracked?: boolean | null
          page_title?: string | null
          page_url?: string
          priority?: number | null
          section_name?: string | null
          site_id?: string | null
          tracking_started_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_elements_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      content_heatmap_points: {
        Row: {
          count: number | null
          date: string
          id: string
          intensity: number | null
          interaction_type: string
          page_url: string
          site_id: string | null
          updated_at: string | null
          x_coordinate: number | null
          y_coordinate: number | null
        }
        Insert: {
          count?: number | null
          date: string
          id?: string
          intensity?: number | null
          interaction_type: string
          page_url: string
          site_id?: string | null
          updated_at?: string | null
          x_coordinate?: number | null
          y_coordinate?: number | null
        }
        Update: {
          count?: number | null
          date?: string
          id?: string
          intensity?: number | null
          interaction_type?: string
          page_url?: string
          site_id?: string | null
          updated_at?: string | null
          x_coordinate?: number | null
          y_coordinate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_heatmap_points_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      content_interactions: {
        Row: {
          content_id: string
          content_name: string | null
          content_type: string | null
          content_url: string | null
          created_at: string | null
          device_type: string | null
          id: number
          interaction_type: string
          page_url: string
          position_x: number | null
          position_y: number | null
          session_id: string | null
          site_id: string | null
          viewport_height: number | null
          viewport_width: number | null
          visitor_hash: string
        }
        Insert: {
          content_id: string
          content_name?: string | null
          content_type?: string | null
          content_url?: string | null
          created_at?: string | null
          device_type?: string | null
          id?: number
          interaction_type: string
          page_url: string
          position_x?: number | null
          position_y?: number | null
          session_id?: string | null
          site_id?: string | null
          viewport_height?: number | null
          viewport_width?: number | null
          visitor_hash: string
        }
        Update: {
          content_id?: string
          content_name?: string | null
          content_type?: string | null
          content_url?: string | null
          created_at?: string | null
          device_type?: string | null
          id?: number
          interaction_type?: string
          page_url?: string
          position_x?: number | null
          position_y?: number | null
          session_id?: string | null
          site_id?: string | null
          viewport_height?: number | null
          viewport_width?: number | null
          visitor_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_interactions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "tracking_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_interactions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      content_performance: {
        Row: {
          clicks: number | null
          content_id: string
          content_name: string | null
          content_type: string | null
          ctr: number | null
          date: string
          hovers: number | null
          id: string
          impressions: number | null
          site_id: string | null
          updated_at: string | null
        }
        Insert: {
          clicks?: number | null
          content_id: string
          content_name?: string | null
          content_type?: string | null
          ctr?: number | null
          date: string
          hovers?: number | null
          id?: string
          impressions?: number | null
          site_id?: string | null
          updated_at?: string | null
        }
        Update: {
          clicks?: number | null
          content_id?: string
          content_name?: string | null
          content_type?: string | null
          ctr?: number | null
          date?: string
          hovers?: number | null
          id?: string
          impressions?: number | null
          site_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_performance_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      content_recommendations: {
        Row: {
          clicks: number | null
          ctr: number | null
          date: string
          id: string
          impressions: number | null
          recommendation_id: string | null
          recommendation_type: string | null
          site_id: string | null
          source_page: string | null
          target_page: string | null
          updated_at: string | null
        }
        Insert: {
          clicks?: number | null
          ctr?: number | null
          date: string
          id?: string
          impressions?: number | null
          recommendation_id?: string | null
          recommendation_type?: string | null
          site_id?: string | null
          source_page?: string | null
          target_page?: string | null
          updated_at?: string | null
        }
        Update: {
          clicks?: number | null
          ctr?: number | null
          date?: string
          id?: string
          impressions?: number | null
          recommendation_id?: string | null
          recommendation_type?: string | null
          site_id?: string | null
          source_page?: string | null
          target_page?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_recommendations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      conversion_events: {
        Row: {
          click_id_consent_given: boolean
          created_at: string
          element_selector: string | null
          event_name: string
          event_type: string
          event_value: number | null
          form_data: Json | null
          gclid: string | null
          hashed_email: string | null
          id: string
          lead_quality: string | null
          page_view_id: string | null
          quality_classified_at: string | null
          quality_value: number | null
          session_id: string | null
          site_id: string
          upload_claimed_at: string | null
          upload_status: string | null
          uploaded_to_ads_at: string | null
        }
        Insert: {
          click_id_consent_given?: boolean
          created_at?: string
          element_selector?: string | null
          event_name: string
          event_type: string
          event_value?: number | null
          form_data?: Json | null
          gclid?: string | null
          hashed_email?: string | null
          id?: string
          lead_quality?: string | null
          page_view_id?: string | null
          quality_classified_at?: string | null
          quality_value?: number | null
          session_id?: string | null
          site_id: string
          upload_claimed_at?: string | null
          upload_status?: string | null
          uploaded_to_ads_at?: string | null
        }
        Update: {
          click_id_consent_given?: boolean
          created_at?: string
          element_selector?: string | null
          event_name?: string
          event_type?: string
          event_value?: number | null
          form_data?: Json | null
          gclid?: string | null
          hashed_email?: string | null
          id?: string
          lead_quality?: string | null
          page_view_id?: string | null
          quality_classified_at?: string | null
          quality_value?: number | null
          session_id?: string | null
          site_id?: string
          upload_claimed_at?: string | null
          upload_status?: string | null
          uploaded_to_ads_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversion_events_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      cookie_consents: {
        Row: {
          consent_given: boolean
          consent_types: Json
          created_at: string
          expires_at: string
          geo_country: string | null
          gpc_signal: boolean | null
          id: string
          ip_address: string | null
          locale: string | null
          policy_version: string | null
          session_id: string
          site_id: string
          source: string | null
          updated_at: string | null
          user_agent: string | null
        }
        Insert: {
          consent_given?: boolean
          consent_types?: Json
          created_at?: string
          expires_at?: string
          geo_country?: string | null
          gpc_signal?: boolean | null
          id?: string
          ip_address?: string | null
          locale?: string | null
          policy_version?: string | null
          session_id: string
          site_id: string
          source?: string | null
          updated_at?: string | null
          user_agent?: string | null
        }
        Update: {
          consent_given?: boolean
          consent_types?: Json
          created_at?: string
          expires_at?: string
          geo_country?: string | null
          gpc_signal?: boolean | null
          id?: string
          ip_address?: string | null
          locale?: string | null
          policy_version?: string | null
          session_id?: string
          site_id?: string
          source?: string | null
          updated_at?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      cookie_definitions: {
        Row: {
          category_key: string
          cookie_name: string
          created_at: string | null
          data_stored: string | null
          description: string | null
          detection_confidence: string
          detection_method: string
          expiry: string | null
          id: number
          is_active: boolean | null
          path: string | null
          provider_name: string | null
          purpose: string | null
          security_level: string | null
          size_bytes: number | null
          updated_at: string | null
        }
        Insert: {
          category_key: string
          cookie_name: string
          created_at?: string | null
          data_stored?: string | null
          description?: string | null
          detection_confidence?: string
          detection_method?: string
          expiry?: string | null
          id?: number
          is_active?: boolean | null
          path?: string | null
          provider_name?: string | null
          purpose?: string | null
          security_level?: string | null
          size_bytes?: number | null
          updated_at?: string | null
        }
        Update: {
          category_key?: string
          cookie_name?: string
          created_at?: string | null
          data_stored?: string | null
          description?: string | null
          detection_confidence?: string
          detection_method?: string
          expiry?: string | null
          id?: number
          is_active?: boolean | null
          path?: string | null
          provider_name?: string | null
          purpose?: string | null
          security_level?: string | null
          size_bytes?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      country_macro: {
        Row: {
          color_code: string | null
          country: string
          credit_to_gdp: number
          id: string
          inflation_rate: number
          policy_rate: number
          regulatory_minimum: number
          sovereign_rating: string
          updated_at: string | null
        }
        Insert: {
          color_code?: string | null
          country: string
          credit_to_gdp: number
          id?: string
          inflation_rate: number
          policy_rate: number
          regulatory_minimum: number
          sovereign_rating: string
          updated_at?: string | null
        }
        Update: {
          color_code?: string | null
          country?: string
          credit_to_gdp?: number
          id?: string
          inflation_rate?: number
          policy_rate?: number
          regulatory_minimum?: number
          sovereign_rating?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      credential_audit: {
        Row: {
          created_at: string
          id: string
          key_name: string
          max_age_days: number
          notes: string | null
          rotated_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_name: string
          max_age_days?: number
          notes?: string | null
          rotated_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          key_name?: string
          max_age_days?: number
          notes?: string | null
          rotated_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      custom_reports: {
        Row: {
          company_id: string | null
          config: Json
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_public: boolean | null
          last_sent_at: string | null
          name: string
          next_send_at: string | null
          recipients: string[] | null
          schedule: string | null
          shared_with: string[] | null
          site_id: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          config: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          last_sent_at?: string | null
          name: string
          next_send_at?: string | null
          recipients?: string[] | null
          schedule?: string | null
          shared_with?: string[] | null
          site_id?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          config?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          last_sent_at?: string | null
          name?: string
          next_send_at?: string | null
          recipients?: string[] | null
          schedule?: string | null
          shared_with?: string[] | null
          site_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_reports_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_site_stats: {
        Row: {
          ai_agent_pageviews: number | null
          ai_agent_sessions: number | null
          avg_session_duration: number | null
          bounce_rate: number | null
          date: string
          id: string
          site_id: string | null
          total_events: number | null
          total_pageviews: number | null
          total_sessions: number | null
          unique_visitors: number | null
          updated_at: string | null
        }
        Insert: {
          ai_agent_pageviews?: number | null
          ai_agent_sessions?: number | null
          avg_session_duration?: number | null
          bounce_rate?: number | null
          date: string
          id?: string
          site_id?: string | null
          total_events?: number | null
          total_pageviews?: number | null
          total_sessions?: number | null
          unique_visitors?: number | null
          updated_at?: string | null
        }
        Update: {
          ai_agent_pageviews?: number | null
          ai_agent_sessions?: number | null
          avg_session_duration?: number | null
          bounce_rate?: number | null
          date?: string
          id?: string
          site_id?: string | null
          total_events?: number | null
          total_pageviews?: number | null
          total_sessions?: number | null
          unique_visitors?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_site_stats_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_insights: {
        Row: {
          action_items: Json | null
          confidence_score: number | null
          created_at: string
          data_points: Json | null
          description: string
          expires_at: string | null
          id: string
          insight_type: string
          is_dismissed: boolean | null
          priority: string
          run_id: string | null
          site_id: string
          title: string
          updated_at: string
        }
        Insert: {
          action_items?: Json | null
          confidence_score?: number | null
          created_at?: string
          data_points?: Json | null
          description: string
          expires_at?: string | null
          id?: string
          insight_type: string
          is_dismissed?: boolean | null
          priority?: string
          run_id?: string | null
          site_id: string
          title: string
          updated_at?: string
        }
        Update: {
          action_items?: Json | null
          confidence_score?: number | null
          created_at?: string
          data_points?: Json | null
          description?: string
          expires_at?: string | null
          id?: string
          insight_type?: string
          is_dismissed?: boolean | null
          priority?: string
          run_id?: string | null
          site_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_insights_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_saved_filters: {
        Row: {
          created_at: string
          filters: Json
          id: string
          name: string
          site_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          name: string
          site_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_saved_filters_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      data_requests: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          processed_at: string | null
          request_data: Json | null
          request_type: string
          site_id: string
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          processed_at?: string | null
          request_data?: Json | null
          request_type: string
          site_id: string
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          processed_at?: string | null
          request_data?: Json | null
          request_type?: string
          site_id?: string
          status?: string
        }
        Relationships: []
      }
      defense_companies: {
        Row: {
          beta: number | null
          change_percent: number | null
          company_name: string
          country: string | null
          created_at: string | null
          dividend_yield: number | null
          exchange: string | null
          id: string
          last_updated: string | null
          market_cap: number | null
          pe_ratio: number | null
          price: number | null
          sector: string | null
          ticker: string
          updated_at: string | null
        }
        Insert: {
          beta?: number | null
          change_percent?: number | null
          company_name: string
          country?: string | null
          created_at?: string | null
          dividend_yield?: number | null
          exchange?: string | null
          id?: string
          last_updated?: string | null
          market_cap?: number | null
          pe_ratio?: number | null
          price?: number | null
          sector?: string | null
          ticker: string
          updated_at?: string | null
        }
        Update: {
          beta?: number | null
          change_percent?: number | null
          company_name?: string
          country?: string | null
          created_at?: string | null
          dividend_yield?: number | null
          exchange?: string | null
          id?: string
          last_updated?: string | null
          market_cap?: number | null
          pe_ratio?: number | null
          price?: number | null
          sector?: string | null
          ticker?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      detected_cookies: {
        Row: {
          cookie_category: string
          cookie_domain: string | null
          cookie_expiry: string | null
          cookie_name: string
          cookie_provider: string | null
          cookie_purpose: string | null
          created_at: string | null
          detection_method: string | null
          id: string
          is_third_party: boolean | null
          plugin_name: string | null
          script_source: string | null
          site_id: string
          updated_at: string | null
        }
        Insert: {
          cookie_category: string
          cookie_domain?: string | null
          cookie_expiry?: string | null
          cookie_name: string
          cookie_provider?: string | null
          cookie_purpose?: string | null
          created_at?: string | null
          detection_method?: string | null
          id?: string
          is_third_party?: boolean | null
          plugin_name?: string | null
          script_source?: string | null
          site_id: string
          updated_at?: string | null
        }
        Update: {
          cookie_category?: string
          cookie_domain?: string | null
          cookie_expiry?: string | null
          cookie_name?: string
          cookie_provider?: string | null
          cookie_purpose?: string | null
          created_at?: string | null
          detection_method?: string | null
          id?: string
          is_third_party?: boolean | null
          plugin_name?: string | null
          script_source?: string | null
          site_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      detected_scripts: {
        Row: {
          category: string
          created_at: string | null
          detected_cookies: string[] | null
          detection_date: string | null
          id: string
          is_active: boolean | null
          last_seen: string | null
          provider: string | null
          purpose: string | null
          script_name: string
          script_type: string
          script_url: string | null
          site_id: string
        }
        Insert: {
          category: string
          created_at?: string | null
          detected_cookies?: string[] | null
          detection_date?: string | null
          id?: string
          is_active?: boolean | null
          last_seen?: string | null
          provider?: string | null
          purpose?: string | null
          script_name: string
          script_type: string
          script_url?: string | null
          site_id: string
        }
        Update: {
          category?: string
          created_at?: string | null
          detected_cookies?: string[] | null
          detection_date?: string | null
          id?: string
          is_active?: boolean | null
          last_seen?: string | null
          provider?: string | null
          purpose?: string | null
          script_name?: string
          script_type?: string
          script_url?: string | null
          site_id?: string
        }
        Relationships: []
      }
      ecommerce_events: {
        Row: {
          consent_granted: boolean | null
          created_at: string | null
          currency: string | null
          event_type: string
          id: string
          price: number | null
          product_brand: string | null
          product_category: string | null
          product_id: string | null
          product_name: string | null
          product_variant: string | null
          quantity: number | null
          revenue: number | null
          session_id: string
          shipping: number | null
          site_id: string
          tax: number | null
          transaction_id: string | null
          user_id: string | null
        }
        Insert: {
          consent_granted?: boolean | null
          created_at?: string | null
          currency?: string | null
          event_type: string
          id?: string
          price?: number | null
          product_brand?: string | null
          product_category?: string | null
          product_id?: string | null
          product_name?: string | null
          product_variant?: string | null
          quantity?: number | null
          revenue?: number | null
          session_id: string
          shipping?: number | null
          site_id: string
          tax?: number | null
          transaction_id?: string | null
          user_id?: string | null
        }
        Update: {
          consent_granted?: boolean | null
          created_at?: string | null
          currency?: string | null
          event_type?: string
          id?: string
          price?: number | null
          product_brand?: string | null
          product_category?: string | null
          product_id?: string | null
          product_name?: string | null
          product_variant?: string | null
          quantity?: number | null
          revenue?: number | null
          session_id?: string
          shipping?: number | null
          site_id?: string
          tax?: number | null
          transaction_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ecommerce_events_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      event_debug_log: {
        Row: {
          consent_status: Json | null
          created_at: string | null
          device_type: string | null
          event_name: string
          event_params: Json | null
          id: string
          ip_address: string | null
          session_id: string | null
          site_id: string
          user_agent: string | null
        }
        Insert: {
          consent_status?: Json | null
          created_at?: string | null
          device_type?: string | null
          event_name: string
          event_params?: Json | null
          id?: string
          ip_address?: string | null
          session_id?: string | null
          site_id: string
          user_agent?: string | null
        }
        Update: {
          consent_status?: Json | null
          created_at?: string | null
          device_type?: string | null
          event_name?: string
          event_params?: Json | null
          id?: string
          ip_address?: string | null
          session_id?: string | null
          site_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_debug_log_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      event_queue: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_data: Json
          id: number
          processed_at: string | null
          retry_count: number | null
          site_id: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_data: Json
          id?: number
          processed_at?: string | null
          retry_count?: number | null
          site_id?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_data?: Json
          id?: number
          processed_at?: string | null
          retry_count?: number | null
          site_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_queue_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      export_jobs: {
        Row: {
          company_id: string | null
          completed_at: string | null
          created_at: string | null
          download_url: string | null
          error_message: string | null
          expires_at: string | null
          file_path: string | null
          format: string
          id: string
          report_type: string
          row_count: number
          status: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          download_url?: string | null
          error_message?: string | null
          expires_at?: string | null
          file_path?: string | null
          format: string
          id?: string
          report_type: string
          row_count: number
          status?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          download_url?: string | null
          error_message?: string | null
          expires_at?: string | null
          file_path?: string | null
          format?: string
          id?: string
          report_type?: string
          row_count?: number
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "export_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      form_analytics: {
        Row: {
          avg_completion_time: number | null
          conversion_rate: number | null
          created_at: string
          form_id: string
          form_name: string | null
          form_type: string
          id: string
          site_id: string
          total_abandons: number | null
          total_completions: number | null
          total_starts: number | null
          updated_at: string
        }
        Insert: {
          avg_completion_time?: number | null
          conversion_rate?: number | null
          created_at?: string
          form_id: string
          form_name?: string | null
          form_type: string
          id?: string
          site_id: string
          total_abandons?: number | null
          total_completions?: number | null
          total_starts?: number | null
          updated_at?: string
        }
        Update: {
          avg_completion_time?: number | null
          conversion_rate?: number | null
          created_at?: string
          form_id?: string
          form_name?: string | null
          form_type?: string
          id?: string
          site_id?: string
          total_abandons?: number | null
          total_completions?: number | null
          total_starts?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      form_field_analytics: {
        Row: {
          avg_focus_time: number | null
          created_at: string
          error_rate: number | null
          field_label: string | null
          field_name: string
          field_position: number | null
          field_type: string | null
          form_id: string
          id: string
          site_id: string
          skip_rate: number | null
          total_errors: number | null
          total_interactions: number | null
          total_skips: number | null
          updated_at: string
        }
        Insert: {
          avg_focus_time?: number | null
          created_at?: string
          error_rate?: number | null
          field_label?: string | null
          field_name: string
          field_position?: number | null
          field_type?: string | null
          form_id: string
          id?: string
          site_id: string
          skip_rate?: number | null
          total_errors?: number | null
          total_interactions?: number | null
          total_skips?: number | null
          updated_at?: string
        }
        Update: {
          avg_focus_time?: number | null
          created_at?: string
          error_rate?: number | null
          field_label?: string | null
          field_name?: string
          field_position?: number | null
          field_type?: string | null
          form_id?: string
          id?: string
          site_id?: string
          skip_rate?: number | null
          total_errors?: number | null
          total_interactions?: number | null
          total_skips?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      form_field_interactions: {
        Row: {
          created_at: string
          field_name: string
          field_position: number | null
          focus_time: number | null
          form_id: string
          form_session_id: string | null
          id: string
          interaction_type: string
          interaction_value: string | null
          session_id: string
          site_id: string
          timestamp_ms: number
        }
        Insert: {
          created_at?: string
          field_name: string
          field_position?: number | null
          focus_time?: number | null
          form_id: string
          form_session_id?: string | null
          id?: string
          interaction_type: string
          interaction_value?: string | null
          session_id: string
          site_id: string
          timestamp_ms: number
        }
        Update: {
          created_at?: string
          field_name?: string
          field_position?: number | null
          focus_time?: number | null
          form_id?: string
          form_session_id?: string | null
          id?: string
          interaction_type?: string
          interaction_value?: string | null
          session_id?: string
          site_id?: string
          timestamp_ms?: number
        }
        Relationships: []
      }
      form_registry: {
        Row: {
          conversion_goal_id: string | null
          created_at: string | null
          detected_at: string | null
          detected_url: string | null
          form_guid: string
          form_label: string | null
          form_type: string
          id: string
          is_primary_conversion: boolean | null
          last_seen_at: string | null
          site_id: string
        }
        Insert: {
          conversion_goal_id?: string | null
          created_at?: string | null
          detected_at?: string | null
          detected_url?: string | null
          form_guid: string
          form_label?: string | null
          form_type?: string
          id?: string
          is_primary_conversion?: boolean | null
          last_seen_at?: string | null
          site_id: string
        }
        Update: {
          conversion_goal_id?: string | null
          created_at?: string | null
          detected_at?: string | null
          detected_url?: string | null
          form_guid?: string
          form_label?: string | null
          form_type?: string
          id?: string
          is_primary_conversion?: boolean | null
          last_seen_at?: string | null
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_registry_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      form_sessions: {
        Row: {
          abandoned_at: string | null
          completed_at: string | null
          completion_time: number | null
          created_at: string
          device_type: string | null
          error_count: number | null
          fields_completed: number | null
          form_id: string
          form_type: string
          id: string
          ip_address: string | null
          session_id: string
          site_id: string
          started_at: string
          total_fields: number | null
          user_agent: string | null
        }
        Insert: {
          abandoned_at?: string | null
          completed_at?: string | null
          completion_time?: number | null
          created_at?: string
          device_type?: string | null
          error_count?: number | null
          fields_completed?: number | null
          form_id: string
          form_type: string
          id?: string
          ip_address?: string | null
          session_id: string
          site_id: string
          started_at?: string
          total_fields?: number | null
          user_agent?: string | null
        }
        Update: {
          abandoned_at?: string | null
          completed_at?: string | null
          completion_time?: number | null
          created_at?: string
          device_type?: string | null
          error_count?: number | null
          fields_completed?: number | null
          form_id?: string
          form_type?: string
          id?: string
          ip_address?: string | null
          session_id?: string
          site_id?: string
          started_at?: string
          total_fields?: number | null
          user_agent?: string | null
        }
        Relationships: []
      }
      formats: {
        Row: {
          aspect_ratio: string
          created_at: string | null
          height: number
          id: string
          label: string
          name: string
          platform: string
          width: number
        }
        Insert: {
          aspect_ratio: string
          created_at?: string | null
          height: number
          id?: string
          label: string
          name: string
          platform: string
          width: number
        }
        Update: {
          aspect_ratio?: string
          created_at?: string | null
          height?: number
          id?: string
          label?: string
          name?: string
          platform?: string
          width?: number
        }
        Relationships: []
      }
      funnel_analytics: {
        Row: {
          created_at: string | null
          date: string
          drop_off_rate: number | null
          funnel_id: string
          id: string
          sessions_completed: number | null
          sessions_entered: number | null
          site_id: string
          step_index: number
          step_name: string
        }
        Insert: {
          created_at?: string | null
          date?: string
          drop_off_rate?: number | null
          funnel_id: string
          id?: string
          sessions_completed?: number | null
          sessions_entered?: number | null
          site_id: string
          step_index: number
          step_name: string
        }
        Update: {
          created_at?: string | null
          date?: string
          drop_off_rate?: number | null
          funnel_id?: string
          id?: string
          sessions_completed?: number | null
          sessions_entered?: number | null
          site_id?: string
          step_index?: number
          step_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_analytics_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "funnels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_analytics_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      funnels: {
        Row: {
          created_at: string | null
          funnel_name: string
          id: string
          is_active: boolean | null
          site_id: string
          steps: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          funnel_name: string
          id?: string
          is_active?: boolean | null
          site_id: string
          steps: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          funnel_name?: string
          id?: string
          is_active?: boolean | null
          site_id?: string
          steps?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funnels_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      gdpr_settings: {
        Row: {
          anonymize_ip: boolean
          click_to_load_enabled: boolean | null
          contact_email: string | null
          cookie_consent_enabled: boolean
          cookiefree_method: string | null
          cookiefree_mode: boolean | null
          created_at: string
          data_retention_days: number
          dpo_email: string | null
          heatmap_tracking_enabled: boolean | null
          id: string
          legal_basis: Json
          policy_version: string | null
          privacy_policy_url: string | null
          site_id: string
          support_gpc: boolean | null
          updated_at: string
        }
        Insert: {
          anonymize_ip?: boolean
          click_to_load_enabled?: boolean | null
          contact_email?: string | null
          cookie_consent_enabled?: boolean
          cookiefree_method?: string | null
          cookiefree_mode?: boolean | null
          created_at?: string
          data_retention_days?: number
          dpo_email?: string | null
          heatmap_tracking_enabled?: boolean | null
          id?: string
          legal_basis?: Json
          policy_version?: string | null
          privacy_policy_url?: string | null
          site_id: string
          support_gpc?: boolean | null
          updated_at?: string
        }
        Update: {
          anonymize_ip?: boolean
          click_to_load_enabled?: boolean | null
          contact_email?: string | null
          cookie_consent_enabled?: boolean
          cookiefree_method?: string | null
          cookiefree_mode?: boolean | null
          created_at?: string
          data_retention_days?: number
          dpo_email?: string | null
          heatmap_tracking_enabled?: boolean | null
          id?: string
          legal_basis?: Json
          policy_version?: string | null
          privacy_policy_url?: string | null
          site_id?: string
          support_gpc?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      geo_audits: {
        Row: {
          audit_duration_ms: number | null
          citability_analysis: string | null
          citability_details: Json | null
          citability_score: number | null
          content_score: number
          crawler_access: Json
          crawler_score: number
          created_at: string
          findings: Json
          freshness_score: number
          has_llms_txt: boolean
          id: string
          overall_score: number
          page_last_modified: string | null
          recommendations: Json
          schema_score: number
          schema_types: Json
          score_version: number
          site_id: string
          technical_score: number
          url: string
        }
        Insert: {
          audit_duration_ms?: number | null
          citability_analysis?: string | null
          citability_details?: Json | null
          citability_score?: number | null
          content_score?: number
          crawler_access?: Json
          crawler_score?: number
          created_at?: string
          findings?: Json
          freshness_score?: number
          has_llms_txt?: boolean
          id?: string
          overall_score?: number
          page_last_modified?: string | null
          recommendations?: Json
          schema_score?: number
          schema_types?: Json
          score_version?: number
          site_id: string
          technical_score?: number
          url: string
        }
        Update: {
          audit_duration_ms?: number | null
          citability_analysis?: string | null
          citability_details?: Json | null
          citability_score?: number | null
          content_score?: number
          crawler_access?: Json
          crawler_score?: number
          created_at?: string
          findings?: Json
          freshness_score?: number
          has_llms_txt?: boolean
          id?: string
          overall_score?: number
          page_last_modified?: string | null
          recommendations?: Json
          schema_score?: number
          schema_types?: Json
          score_version?: number
          site_id?: string
          technical_score?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "geo_audits_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_risk: {
        Row: {
          country: string
          id: string
          notes: string | null
          risk_label: string
          risk_score: number
          updated_at: string | null
        }
        Insert: {
          country: string
          id?: string
          notes?: string | null
          risk_label: string
          risk_score: number
          updated_at?: string | null
        }
        Update: {
          country?: string
          id?: string
          notes?: string | null
          risk_label?: string
          risk_score?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      geoheatmap_density: {
        Row: {
          date: string
          hour: number | null
          id: string
          intensity: number | null
          latitude: number
          longitude: number
          site_id: string | null
          updated_at: string | null
        }
        Insert: {
          date: string
          hour?: number | null
          id?: string
          intensity?: number | null
          latitude: number
          longitude: number
          site_id?: string | null
          updated_at?: string | null
        }
        Update: {
          date?: string
          hour?: number | null
          id?: string
          intensity?: number | null
          latitude?: number
          longitude?: number
          site_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "geoheatmap_density_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      geolocation_aggregates: {
        Row: {
          avg_session_duration: number | null
          bounce_rate: number | null
          city_name: string | null
          conversion_rate: number | null
          conversions: number | null
          country_code: string | null
          country_name: string | null
          date: string
          id: string
          latitude: number | null
          longitude: number | null
          pageviews: number | null
          region_code: string | null
          region_name: string | null
          sessions: number | null
          site_id: string | null
          unique_visitors: number | null
          updated_at: string | null
        }
        Insert: {
          avg_session_duration?: number | null
          bounce_rate?: number | null
          city_name?: string | null
          conversion_rate?: number | null
          conversions?: number | null
          country_code?: string | null
          country_name?: string | null
          date: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          pageviews?: number | null
          region_code?: string | null
          region_name?: string | null
          sessions?: number | null
          site_id?: string | null
          unique_visitors?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_session_duration?: number | null
          bounce_rate?: number | null
          city_name?: string | null
          conversion_rate?: number | null
          conversions?: number | null
          country_code?: string | null
          country_name?: string | null
          date?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          pageviews?: number | null
          region_code?: string | null
          region_name?: string | null
          sessions?: number | null
          site_id?: string | null
          unique_visitors?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "geolocation_aggregates_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      geolocation_clusters: {
        Row: {
          conversions: number | null
          date: string
          id: string
          latitude: number
          longitude: number
          sessions: number | null
          site_id: string | null
          unique_visitors: number | null
          updated_at: string | null
          zoom_level: number
        }
        Insert: {
          conversions?: number | null
          date: string
          id?: string
          latitude: number
          longitude: number
          sessions?: number | null
          site_id?: string | null
          unique_visitors?: number | null
          updated_at?: string | null
          zoom_level: number
        }
        Update: {
          conversions?: number | null
          date?: string
          id?: string
          latitude?: number
          longitude?: number
          sessions?: number | null
          site_id?: string | null
          unique_visitors?: number | null
          updated_at?: string | null
          zoom_level?: number
        }
        Relationships: [
          {
            foreignKeyName: "geolocation_clusters_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      geolocation_hierarchy: {
        Row: {
          city_name: string | null
          country_code: string
          country_name: string
          created_at: string | null
          id: string
          latitude: number | null
          level: string
          longitude: number | null
          parent_id: string | null
          region_code: string | null
          region_name: string | null
          updated_at: string | null
        }
        Insert: {
          city_name?: string | null
          country_code: string
          country_name: string
          created_at?: string | null
          id?: string
          latitude?: number | null
          level: string
          longitude?: number | null
          parent_id?: string | null
          region_code?: string | null
          region_name?: string | null
          updated_at?: string | null
        }
        Update: {
          city_name?: string | null
          country_code?: string
          country_name?: string
          created_at?: string | null
          id?: string
          latitude?: number | null
          level?: string
          longitude?: number | null
          parent_id?: string | null
          region_code?: string | null
          region_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "geolocation_hierarchy_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "geolocation_hierarchy"
            referencedColumns: ["id"]
          },
        ]
      }
      gsc_ai_data: {
        Row: {
          created_at: string
          dimension: string
          id: string
          impressions: number
          period_end: string
          period_start: string
          search_type: string
          site_id: string
          value: string
        }
        Insert: {
          created_at?: string
          dimension: string
          id?: string
          impressions?: number
          period_end: string
          period_start: string
          search_type: string
          site_id: string
          value: string
        }
        Update: {
          created_at?: string
          dimension?: string
          id?: string
          impressions?: number
          period_end?: string
          period_start?: string
          search_type?: string
          site_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "gsc_ai_data_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      gsc_data: {
        Row: {
          clicks: number | null
          ctr: number | null
          dimension: string
          id: string
          impressions: number | null
          period_end: string
          period_start: string
          position: number | null
          site_id: string
          synced_at: string | null
          value: string
        }
        Insert: {
          clicks?: number | null
          ctr?: number | null
          dimension: string
          id?: string
          impressions?: number | null
          period_end: string
          period_start: string
          position?: number | null
          site_id: string
          synced_at?: string | null
          value: string
        }
        Update: {
          clicks?: number | null
          ctr?: number | null
          dimension?: string
          id?: string
          impressions?: number | null
          period_end?: string
          period_start?: string
          position?: number | null
          site_id?: string
          synced_at?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "gsc_data_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      heatmap_data: {
        Row: {
          browser: string | null
          created_at: string
          date: string
          device_type: string
          element_selector: string | null
          element_text: string | null
          form_name: string | null
          grid_x: number | null
          grid_y: number | null
          id: string
          intensity: number | null
          interaction_type: string
          ip_address: string | null
          is_touch_device: boolean | null
          mobile_device_brand: string | null
          mobile_device_model: string | null
          operating_system: string | null
          operating_system_version: string | null
          parent_form_id: string | null
          site_id: string
          touch_force: number | null
          touch_radius: number | null
          url: string
          viewport_height: number | null
          viewport_width: number | null
          x_coordinate: number
          y_coordinate: number
        }
        Insert: {
          browser?: string | null
          created_at?: string
          date?: string
          device_type: string
          element_selector?: string | null
          element_text?: string | null
          form_name?: string | null
          grid_x?: number | null
          grid_y?: number | null
          id?: string
          intensity?: number | null
          interaction_type: string
          ip_address?: string | null
          is_touch_device?: boolean | null
          mobile_device_brand?: string | null
          mobile_device_model?: string | null
          operating_system?: string | null
          operating_system_version?: string | null
          parent_form_id?: string | null
          site_id: string
          touch_force?: number | null
          touch_radius?: number | null
          url: string
          viewport_height?: number | null
          viewport_width?: number | null
          x_coordinate: number
          y_coordinate: number
        }
        Update: {
          browser?: string | null
          created_at?: string
          date?: string
          device_type?: string
          element_selector?: string | null
          element_text?: string | null
          form_name?: string | null
          grid_x?: number | null
          grid_y?: number | null
          id?: string
          intensity?: number | null
          interaction_type?: string
          ip_address?: string | null
          is_touch_device?: boolean | null
          mobile_device_brand?: string | null
          mobile_device_model?: string | null
          operating_system?: string | null
          operating_system_version?: string | null
          parent_form_id?: string | null
          site_id?: string
          touch_force?: number | null
          touch_radius?: number | null
          url?: string
          viewport_height?: number | null
          viewport_width?: number | null
          x_coordinate?: number
          y_coordinate?: number
        }
        Relationships: [
          {
            foreignKeyName: "heatmap_data_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      insynshandel_transactions: {
        Row: {
          avanza_id: string | null
          befattning: string | null
          created_at: string | null
          enhet: string | null
          fi_anmalan_id: string | null
          id: string
          instrumentnamn: string | null
          instrumenttyp: string | null
          is_revised: boolean | null
          isin: string | null
          kopplad_transaktion: boolean | null
          lei_kod: string | null
          pdr_person: boolean | null
          person_ledning: string
          pris: number | null
          pris_num: number | null
          publiceringsdatum: string
          source_url: string | null
          status: string | null
          transaktionsdatum: string | null
          transaktionstyp: string | null
          updated_at: string | null
          utgivare: string
          value_sek: number | null
          valuta: string | null
          varde: number | null
          vol_num: number | null
          volym: number | null
        }
        Insert: {
          avanza_id?: string | null
          befattning?: string | null
          created_at?: string | null
          enhet?: string | null
          fi_anmalan_id?: string | null
          id?: string
          instrumentnamn?: string | null
          instrumenttyp?: string | null
          is_revised?: boolean | null
          isin?: string | null
          kopplad_transaktion?: boolean | null
          lei_kod?: string | null
          pdr_person?: boolean | null
          person_ledning: string
          pris?: number | null
          pris_num?: number | null
          publiceringsdatum: string
          source_url?: string | null
          status?: string | null
          transaktionsdatum?: string | null
          transaktionstyp?: string | null
          updated_at?: string | null
          utgivare: string
          value_sek?: number | null
          valuta?: string | null
          varde?: number | null
          vol_num?: number | null
          volym?: number | null
        }
        Update: {
          avanza_id?: string | null
          befattning?: string | null
          created_at?: string | null
          enhet?: string | null
          fi_anmalan_id?: string | null
          id?: string
          instrumentnamn?: string | null
          instrumenttyp?: string | null
          is_revised?: boolean | null
          isin?: string | null
          kopplad_transaktion?: boolean | null
          lei_kod?: string | null
          pdr_person?: boolean | null
          person_ledning?: string
          pris?: number | null
          pris_num?: number | null
          publiceringsdatum?: string
          source_url?: string | null
          status?: string | null
          transaktionsdatum?: string | null
          transaktionstyp?: string | null
          updated_at?: string | null
          utgivare?: string
          value_sek?: number | null
          valuta?: string | null
          varde?: number | null
          vol_num?: number | null
          volym?: number | null
        }
        Relationships: []
      }
      ip_segments: {
        Row: {
          category: string
          color: string
          company_id: string
          created_at: string
          description: string | null
          id: string
          intranet_mode: boolean
          ip_ranges: string[]
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category?: string
          color?: string
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          intranet_mode?: boolean
          ip_ranges: string[]
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category?: string
          color?: string
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          intranet_mode?: boolean
          ip_ranges?: string[]
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ip_segments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_ai_insights: {
        Row: {
          generated_at: string
          id: string
          insights_json: Json
          run_id: string | null
          site_id: string
          year: number
        }
        Insert: {
          generated_at?: string
          id?: string
          insights_json?: Json
          run_id?: string | null
          site_id: string
          year: number
        }
        Update: {
          generated_at?: string
          id?: string
          insights_json?: Json
          run_id?: string | null
          site_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "kpi_ai_insights_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_ai_insights_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_comments: {
        Row: {
          author: string | null
          comment: string
          created_at: string
          id: string
          month: number
          section: string
          site_id: string
          updated_at: string
          year: number
        }
        Insert: {
          author?: string | null
          comment: string
          created_at?: string
          id?: string
          month: number
          section: string
          site_id: string
          updated_at?: string
          year: number
        }
        Update: {
          author?: string | null
          comment?: string
          created_at?: string
          id?: string
          month?: number
          section?: string
          site_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "kpi_comments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company: string | null
          created_at: string
          email: string
          id: string
          lead_type: string | null
          message: string
          name: string
          phone: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          id?: string
          lead_type?: string | null
          message: string
          name: string
          phone?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          lead_type?: string | null
          message?: string
          name?: string
          phone?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      link_click_counts: {
        Row: {
          click_count: number
          created_at: string
          day: string
          device_type: string
          id: string
          link_key: string
          link_kind: string
          link_label: string | null
          page_path: string
          site_id: string
          updated_at: string
        }
        Insert: {
          click_count?: number
          created_at?: string
          day?: string
          device_type?: string
          id?: string
          link_key: string
          link_kind: string
          link_label?: string | null
          page_path: string
          site_id: string
          updated_at?: string
        }
        Update: {
          click_count?: number
          created_at?: string
          day?: string
          device_type?: string
          id?: string
          link_key?: string
          link_kind?: string
          link_label?: string | null
          page_path?: string
          site_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_click_counts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      market_regimes: {
        Row: {
          correlation_level: number | null
          created_at: string | null
          date: string
          expected_return: number | null
          expected_volatility: number | null
          id: string
          model_version: string | null
          omx30_return_20d: number | null
          omx30_volatility_20d: number | null
          prob_stay_same: number | null
          prob_to_bear: number | null
          prob_to_bull: number | null
          prob_to_sideways: number | null
          regime: string
          regime_probability: number
          updated_at: string | null
          vix_equivalent: number | null
        }
        Insert: {
          correlation_level?: number | null
          created_at?: string | null
          date: string
          expected_return?: number | null
          expected_volatility?: number | null
          id?: string
          model_version?: string | null
          omx30_return_20d?: number | null
          omx30_volatility_20d?: number | null
          prob_stay_same?: number | null
          prob_to_bear?: number | null
          prob_to_bull?: number | null
          prob_to_sideways?: number | null
          regime: string
          regime_probability: number
          updated_at?: string | null
          vix_equivalent?: number | null
        }
        Update: {
          correlation_level?: number | null
          created_at?: string | null
          date?: string
          expected_return?: number | null
          expected_volatility?: number | null
          id?: string
          model_version?: string | null
          omx30_return_20d?: number | null
          omx30_volatility_20d?: number | null
          prob_stay_same?: number | null
          prob_to_bear?: number | null
          prob_to_bull?: number | null
          prob_to_sideways?: number | null
          regime?: string
          regime_probability?: number
          updated_at?: string | null
          vix_equivalent?: number | null
        }
        Relationships: []
      }
      mineral_watchlists: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      mining_companies: {
        Row: {
          api_symbol: string | null
          beta: number | null
          change_percent: number | null
          country: string | null
          created_at: string | null
          debt_equity: number | null
          exchange: string
          id: string
          isin: string | null
          last_updated: string | null
          market_cap: number | null
          name: string
          pe_ratio: number | null
          price: number | null
          risk_level: string | null
          ticker: string
          updated_at: string | null
        }
        Insert: {
          api_symbol?: string | null
          beta?: number | null
          change_percent?: number | null
          country?: string | null
          created_at?: string | null
          debt_equity?: number | null
          exchange: string
          id?: string
          isin?: string | null
          last_updated?: string | null
          market_cap?: number | null
          name: string
          pe_ratio?: number | null
          price?: number | null
          risk_level?: string | null
          ticker: string
          updated_at?: string | null
        }
        Update: {
          api_symbol?: string | null
          beta?: number | null
          change_percent?: number | null
          country?: string | null
          created_at?: string | null
          debt_equity?: number | null
          exchange?: string
          id?: string
          isin?: string | null
          last_updated?: string | null
          market_cap?: number | null
          name?: string
          pe_ratio?: number | null
          price?: number | null
          risk_level?: string | null
          ticker?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      model_performance: {
        Row: {
          accuracy: number | null
          calibration_slope: number | null
          created_at: string | null
          evaluation_date: string
          evaluation_period_end: string | null
          evaluation_period_start: string | null
          f1_score: number | null
          id: string
          information_coefficient: number | null
          mae: number | null
          max_drawdown: number | null
          model_version: string
          n_correct_direction: number | null
          n_predictions: number | null
          precision: number | null
          prediction_bias: number | null
          r_squared: number | null
          recall: number | null
          rmse: number | null
          sharpe_ratio: number | null
          total_return: number | null
        }
        Insert: {
          accuracy?: number | null
          calibration_slope?: number | null
          created_at?: string | null
          evaluation_date: string
          evaluation_period_end?: string | null
          evaluation_period_start?: string | null
          f1_score?: number | null
          id?: string
          information_coefficient?: number | null
          mae?: number | null
          max_drawdown?: number | null
          model_version: string
          n_correct_direction?: number | null
          n_predictions?: number | null
          precision?: number | null
          prediction_bias?: number | null
          r_squared?: number | null
          recall?: number | null
          rmse?: number | null
          sharpe_ratio?: number | null
          total_return?: number | null
        }
        Update: {
          accuracy?: number | null
          calibration_slope?: number | null
          created_at?: string | null
          evaluation_date?: string
          evaluation_period_end?: string | null
          evaluation_period_start?: string | null
          f1_score?: number | null
          id?: string
          information_coefficient?: number | null
          mae?: number | null
          max_drawdown?: number | null
          model_version?: string
          n_correct_direction?: number | null
          n_predictions?: number | null
          precision?: number | null
          prediction_bias?: number | null
          r_squared?: number | null
          recall?: number | null
          rmse?: number | null
          sharpe_ratio?: number | null
          total_return?: number | null
        }
        Relationships: []
      }
      navigation_analytics: {
        Row: {
          click_count: number | null
          created_at: string
          date: string
          device_type: string | null
          id: string
          menu_item_id: number
          menu_title: string
          menu_url: string
          site_id: string
          updated_at: string
        }
        Insert: {
          click_count?: number | null
          created_at?: string
          date?: string
          device_type?: string | null
          id?: string
          menu_item_id: number
          menu_title: string
          menu_url: string
          site_id: string
          updated_at?: string
        }
        Update: {
          click_count?: number | null
          created_at?: string
          date?: string
          device_type?: string | null
          id?: string
          menu_item_id?: number
          menu_title?: string
          menu_url?: string
          site_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      navigation_menus: {
        Row: {
          created_at: string
          css_classes: string[] | null
          id: string
          is_active: boolean | null
          menu_item_id: number
          menu_location: string | null
          menu_order: number | null
          menu_title: string
          menu_url: string
          parent_id: number | null
          site_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          css_classes?: string[] | null
          id?: string
          is_active?: boolean | null
          menu_item_id: number
          menu_location?: string | null
          menu_order?: number | null
          menu_title: string
          menu_url: string
          parent_id?: number | null
          site_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          css_classes?: string[] | null
          id?: string
          is_active?: boolean | null
          menu_item_id?: number
          menu_location?: string | null
          menu_order?: number | null
          menu_title?: string
          menu_url?: string
          parent_id?: number | null
          site_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_channels: {
        Row: {
          channel: string
          config: Json
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          site_id: string
        }
        Insert: {
          channel: string
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          site_id: string
        }
        Update: {
          channel?: string
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_channels_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          id: string
          invited_at: string | null
          invited_by: string | null
          joined_at: string | null
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          billing_email: string | null
          created_at: string | null
          id: string
          logo_url: string | null
          name: string
          plan: string | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          billing_email?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          plan?: string | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          billing_email?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          plan?: string | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      page_views: {
        Row: {
          exit_page: boolean | null
          id: string
          is_conversion_page: boolean | null
          referrer: string | null
          scroll_depth: number | null
          session_id: string
          site_id: string
          time_on_page: number | null
          title: string | null
          url: string
          viewed_at: string
        }
        Insert: {
          exit_page?: boolean | null
          id?: string
          is_conversion_page?: boolean | null
          referrer?: string | null
          scroll_depth?: number | null
          session_id: string
          site_id: string
          time_on_page?: number | null
          title?: string | null
          url: string
          viewed_at?: string
        }
        Update: {
          exit_page?: boolean | null
          id?: string
          is_conversion_page?: boolean | null
          referrer?: string | null
          scroll_depth?: number | null
          session_id?: string
          site_id?: string
          time_on_page?: number | null
          title?: string | null
          url?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_views_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "tracking_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_views_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      polymarket_markets: {
        Row: {
          category: string | null
          created_at: string | null
          current_no_price: number | null
          current_yes_price: number | null
          description: string | null
          end_date: string | null
          id: string
          last_updated_at: string | null
          market_id: string
          question: string
          status: string | null
          total_volume_usd: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          current_no_price?: number | null
          current_yes_price?: number | null
          description?: string | null
          end_date?: string | null
          id?: string
          last_updated_at?: string | null
          market_id: string
          question: string
          status?: string | null
          total_volume_usd?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          current_no_price?: number | null
          current_yes_price?: number | null
          description?: string | null
          end_date?: string | null
          id?: string
          last_updated_at?: string | null
          market_id?: string
          question?: string
          status?: string | null
          total_volume_usd?: number | null
        }
        Relationships: []
      }
      polymarket_positions: {
        Row: {
          avg_entry_price: number | null
          created_at: string | null
          id: string
          last_updated_at: string | null
          market_id: string
          outcome: string
          shares_owned: number
          trader_id: string
          unrealized_pnl_usd: number | null
        }
        Insert: {
          avg_entry_price?: number | null
          created_at?: string | null
          id?: string
          last_updated_at?: string | null
          market_id: string
          outcome: string
          shares_owned?: number
          trader_id: string
          unrealized_pnl_usd?: number | null
        }
        Update: {
          avg_entry_price?: number | null
          created_at?: string | null
          id?: string
          last_updated_at?: string | null
          market_id?: string
          outcome?: string
          shares_owned?: number
          trader_id?: string
          unrealized_pnl_usd?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "polymarket_positions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "polymarket_markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polymarket_positions_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "polymarket_traders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polymarket_positions_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "v_top_traders"
            referencedColumns: ["id"]
          },
        ]
      }
      polymarket_signals: {
        Row: {
          contributing_traders: Json | null
          created_at: string | null
          description: string | null
          direction: string
          expires_at: string | null
          id: string
          market_id: string
          signal_type: string
          strength: number | null
        }
        Insert: {
          contributing_traders?: Json | null
          created_at?: string | null
          description?: string | null
          direction: string
          expires_at?: string | null
          id?: string
          market_id: string
          signal_type: string
          strength?: number | null
        }
        Update: {
          contributing_traders?: Json | null
          created_at?: string | null
          description?: string | null
          direction?: string
          expires_at?: string | null
          id?: string
          market_id?: string
          signal_type?: string
          strength?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "polymarket_signals_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "polymarket_markets"
            referencedColumns: ["id"]
          },
        ]
      }
      polymarket_traders: {
        Row: {
          created_at: string | null
          display_name: string | null
          first_seen_at: string | null
          id: string
          is_tracked: boolean | null
          last_updated_at: string | null
          profile_image_url: string | null
          total_trades: number | null
          total_volume_usd: number | null
          trader_tier: string | null
          username: string | null
          wallet_address: string
          win_rate: number | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          first_seen_at?: string | null
          id?: string
          is_tracked?: boolean | null
          last_updated_at?: string | null
          profile_image_url?: string | null
          total_trades?: number | null
          total_volume_usd?: number | null
          trader_tier?: string | null
          username?: string | null
          wallet_address: string
          win_rate?: number | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          first_seen_at?: string | null
          id?: string
          is_tracked?: boolean | null
          last_updated_at?: string | null
          profile_image_url?: string | null
          total_trades?: number | null
          total_volume_usd?: number | null
          trader_tier?: string | null
          username?: string | null
          wallet_address?: string
          win_rate?: number | null
        }
        Relationships: []
      }
      polymarket_trades: {
        Row: {
          amount_usd: number
          created_at: string | null
          id: string
          is_significant: boolean | null
          market_id: string
          outcome: string
          price: number
          shares: number
          side: string
          trade_id: string
          trader_id: string
        }
        Insert: {
          amount_usd: number
          created_at?: string | null
          id?: string
          is_significant?: boolean | null
          market_id: string
          outcome: string
          price: number
          shares: number
          side: string
          trade_id: string
          trader_id: string
        }
        Update: {
          amount_usd?: number
          created_at?: string | null
          id?: string
          is_significant?: boolean | null
          market_id?: string
          outcome?: string
          price?: number
          shares?: number
          side?: string
          trade_id?: string
          trader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "polymarket_trades_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "polymarket_markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polymarket_trades_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "polymarket_traders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polymarket_trades_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "v_top_traders"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_allocations: {
        Row: {
          actual_return_1m: number | null
          actual_return_1w: number | null
          actual_sharpe: number | null
          allocation_date: string
          conditional_var: number | null
          created_at: string | null
          expected_return: number | null
          expected_volatility: number | null
          holdings: Json
          id: string
          market_regime: string | null
          max_drawdown: number | null
          max_position_size: number | null
          risk_free_rate: number | null
          sector_constraints: Json | null
          sharpe_ratio: number | null
          strategy_name: string
          target_return: number | null
          turnover_limit: number | null
          updated_at: string | null
          value_at_risk_95: number | null
        }
        Insert: {
          actual_return_1m?: number | null
          actual_return_1w?: number | null
          actual_sharpe?: number | null
          allocation_date: string
          conditional_var?: number | null
          created_at?: string | null
          expected_return?: number | null
          expected_volatility?: number | null
          holdings: Json
          id?: string
          market_regime?: string | null
          max_drawdown?: number | null
          max_position_size?: number | null
          risk_free_rate?: number | null
          sector_constraints?: Json | null
          sharpe_ratio?: number | null
          strategy_name: string
          target_return?: number | null
          turnover_limit?: number | null
          updated_at?: string | null
          value_at_risk_95?: number | null
        }
        Update: {
          actual_return_1m?: number | null
          actual_return_1w?: number | null
          actual_sharpe?: number | null
          allocation_date?: string
          conditional_var?: number | null
          created_at?: string | null
          expected_return?: number | null
          expected_volatility?: number | null
          holdings?: Json
          id?: string
          market_regime?: string | null
          max_drawdown?: number | null
          max_position_size?: number | null
          risk_free_rate?: number | null
          sector_constraints?: Json | null
          sharpe_ratio?: number | null
          strategy_name?: string
          target_return?: number | null
          turnover_limit?: number | null
          updated_at?: string | null
          value_at_risk_95?: number | null
        }
        Relationships: []
      }
      portfolio_holdings: {
        Row: {
          avg_purchase_price: number
          company_name: string
          created_at: string | null
          current_price: number | null
          current_value: number | null
          first_purchase_date: string | null
          id: string
          isin: string | null
          last_updated_at: string | null
          notes: string | null
          portfolio_id: string
          portfolio_weight_pct: number | null
          quantity: number
          ticker: string
          total_cost: number | null
          unrealized_gain_loss: number | null
          unrealized_gain_loss_pct: number | null
          updated_at: string | null
        }
        Insert: {
          avg_purchase_price: number
          company_name: string
          created_at?: string | null
          current_price?: number | null
          current_value?: number | null
          first_purchase_date?: string | null
          id?: string
          isin?: string | null
          last_updated_at?: string | null
          notes?: string | null
          portfolio_id: string
          portfolio_weight_pct?: number | null
          quantity: number
          ticker: string
          total_cost?: number | null
          unrealized_gain_loss?: number | null
          unrealized_gain_loss_pct?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_purchase_price?: number
          company_name?: string
          created_at?: string | null
          current_price?: number | null
          current_value?: number | null
          first_purchase_date?: string | null
          id?: string
          isin?: string | null
          last_updated_at?: string | null
          notes?: string | null
          portfolio_id?: string
          portfolio_weight_pct?: number | null
          quantity?: number
          ticker?: string
          total_cost?: number | null
          unrealized_gain_loss?: number | null
          unrealized_gain_loss_pct?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_holdings_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "user_portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      price_alerts: {
        Row: {
          active: boolean | null
          alert_type: string
          commodity_id: string | null
          company_id: string | null
          created_at: string | null
          current_value: number | null
          id: string
          item_type: string
          threshold_value: number
          triggered: boolean | null
          triggered_at: string | null
          user_id: string | null
        }
        Insert: {
          active?: boolean | null
          alert_type: string
          commodity_id?: string | null
          company_id?: string | null
          created_at?: string | null
          current_value?: number | null
          id?: string
          item_type: string
          threshold_value: number
          triggered?: boolean | null
          triggered_at?: string | null
          user_id?: string | null
        }
        Update: {
          active?: boolean | null
          alert_type?: string
          commodity_id?: string | null
          company_id?: string | null
          created_at?: string | null
          current_value?: number | null
          id?: string
          item_type?: string
          threshold_value?: number
          triggered?: boolean | null
          triggered_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_alerts_commodity_id_fkey"
            columns: ["commodity_id"]
            isOneToOne: false
            referencedRelation: "commodities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_alerts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "mining_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_countries: {
        Row: {
          annual_production: number | null
          commodity_id: string | null
          country: string
          country_code: string | null
          created_at: string | null
          flag_emoji: string | null
          id: string
          notes: string | null
          production_share: number
          production_unit: string | null
          updated_at: string | null
        }
        Insert: {
          annual_production?: number | null
          commodity_id?: string | null
          country: string
          country_code?: string | null
          created_at?: string | null
          flag_emoji?: string | null
          id?: string
          notes?: string | null
          production_share: number
          production_unit?: string | null
          updated_at?: string | null
        }
        Update: {
          annual_production?: number | null
          commodity_id?: string | null
          country?: string
          country_code?: string | null
          created_at?: string | null
          flag_emoji?: string | null
          id?: string
          notes?: string | null
          production_share?: number
          production_unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "producer_countries_commodity_id_fkey"
            columns: ["commodity_id"]
            isOneToOne: false
            referencedRelation: "commodities"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      quant_factors: {
        Row: {
          combined_rank: number | null
          created_at: string | null
          date: string
          id: string
          momentum_rank: number | null
          returns_1d: number | null
          returns_20d: number | null
          ticker: string
          volatility_20d: number | null
        }
        Insert: {
          combined_rank?: number | null
          created_at?: string | null
          date: string
          id?: string
          momentum_rank?: number | null
          returns_1d?: number | null
          returns_20d?: number | null
          ticker: string
          volatility_20d?: number | null
        }
        Update: {
          combined_rank?: number | null
          created_at?: string | null
          date?: string
          id?: string
          momentum_rank?: number | null
          returns_1d?: number | null
          returns_20d?: number | null
          ticker?: string
          volatility_20d?: number | null
        }
        Relationships: []
      }
      quant_predictions: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          id: string
          model_version: string
          predicted_return_5d: number | null
          prediction_date: string
          signal_score: number | null
          signal_strength: string | null
          ticker: string
          top_factors: Json | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          model_version?: string
          predicted_return_5d?: number | null
          prediction_date: string
          signal_score?: number | null
          signal_strength?: string | null
          ticker: string
          top_factors?: Json | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          model_version?: string
          predicted_return_5d?: number | null
          prediction_date?: string
          signal_score?: number | null
          signal_strength?: string | null
          ticker?: string
          top_factors?: Json | null
        }
        Relationships: []
      }
      rate_limit_buckets: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start?: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      remarketing_settings: {
        Row: {
          created_at: string
          google_ads_conversion_action_id: string | null
          google_ads_customer_id: string | null
          google_ads_enabled: boolean | null
          id: string
          meta_access_token: string | null
          meta_enabled: boolean | null
          meta_pixel_id: string | null
          require_marketing_consent: boolean | null
          site_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          google_ads_conversion_action_id?: string | null
          google_ads_customer_id?: string | null
          google_ads_enabled?: boolean | null
          id?: string
          meta_access_token?: string | null
          meta_enabled?: boolean | null
          meta_pixel_id?: string | null
          require_marketing_consent?: boolean | null
          site_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          google_ads_conversion_action_id?: string | null
          google_ads_customer_id?: string | null
          google_ads_enabled?: boolean | null
          id?: string
          meta_access_token?: string | null
          meta_enabled?: boolean | null
          meta_pixel_id?: string | null
          require_marketing_consent?: boolean | null
          site_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "remarketing_settings_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: true
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      saml_configurations: {
        Row: {
          attribute_mappings: Json | null
          certificate: string | null
          company_id: string | null
          created_at: string | null
          entity_id: string
          id: string
          is_enabled: boolean | null
          sso_url: string
        }
        Insert: {
          attribute_mappings?: Json | null
          certificate?: string | null
          company_id?: string | null
          created_at?: string | null
          entity_id: string
          id?: string
          is_enabled?: boolean | null
          sso_url: string
        }
        Update: {
          attribute_mappings?: Json | null
          certificate?: string | null
          company_id?: string | null
          created_at?: string | null
          entity_id?: string
          id?: string
          is_enabled?: boolean | null
          sso_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "saml_configurations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      saml_sessions: {
        Row: {
          company_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          saml_name_id: string | null
          session_index: string | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          saml_name_id?: string | null
          session_index?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          saml_name_id?: string | null
          session_index?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saml_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_reports: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by: string | null
          custom_message: string | null
          custom_report_id: string | null
          day_of_month: number | null
          day_of_week: number | null
          format: string | null
          frequency: string
          id: string
          include_chart: boolean | null
          include_logo: boolean | null
          include_table: boolean | null
          is_active: boolean | null
          last_sent_at: string | null
          next_send_at: string | null
          recipients: string[]
          time_of_day: string
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_message?: string | null
          custom_report_id?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          format?: string | null
          frequency: string
          id?: string
          include_chart?: boolean | null
          include_logo?: boolean | null
          include_table?: boolean | null
          is_active?: boolean | null
          last_sent_at?: string | null
          next_send_at?: string | null
          recipients: string[]
          time_of_day?: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_message?: string | null
          custom_report_id?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          format?: string | null
          frequency?: string
          id?: string
          include_chart?: boolean | null
          include_logo?: boolean | null
          include_table?: boolean | null
          is_active?: boolean | null
          last_sent_at?: string | null
          next_send_at?: string | null
          recipients?: string[]
          time_of_day?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_reports_custom_report_id_fkey"
            columns: ["custom_report_id"]
            isOneToOne: false
            referencedRelation: "custom_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      scroll_depth: {
        Row: {
          created_at: string | null
          id: string
          max_scroll_depth: number | null
          page_url: string
          scroll_events: number | null
          session_date: string
          session_id: string | null
          site_id: string | null
          time_on_page: number | null
          total_scroll_distance: number | null
          visitor_hash: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          max_scroll_depth?: number | null
          page_url: string
          scroll_events?: number | null
          session_date: string
          session_id?: string | null
          site_id?: string | null
          time_on_page?: number | null
          total_scroll_distance?: number | null
          visitor_hash?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          max_scroll_depth?: number | null
          page_url?: string
          scroll_events?: number | null
          session_date?: string
          session_id?: string | null
          site_id?: string | null
          time_on_page?: number | null
          total_scroll_distance?: number | null
          visitor_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scroll_depth_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: string | null
          resource_id: string | null
          resource_type: string
          severity: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type: string
          severity?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type?: string
          severity?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      segment_members: {
        Row: {
          created_at: string | null
          id: string
          segment_id: string | null
          visitor_hash: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          segment_id?: string | null
          visitor_hash?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          segment_id?: string | null
          visitor_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "segment_members_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
        ]
      }
      segment_performance: {
        Row: {
          avg_session_duration: number | null
          conversion_rate: number | null
          conversions: number | null
          date: string | null
          id: string
          pageviews: number | null
          segment_id: string | null
          sessions: number | null
          updated_at: string | null
        }
        Insert: {
          avg_session_duration?: number | null
          conversion_rate?: number | null
          conversions?: number | null
          date?: string | null
          id?: string
          pageviews?: number | null
          segment_id?: string | null
          sessions?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_session_duration?: number | null
          conversion_rate?: number | null
          conversions?: number | null
          date?: string | null
          id?: string
          pageviews?: number | null
          segment_id?: string | null
          sessions?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "segment_performance_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
        ]
      }
      segments: {
        Row: {
          combine_with: string | null
          created_at: string | null
          description: string | null
          id: string
          last_calculated_at: string | null
          name: string
          rules: Json
          site_id: string | null
          user_count: number | null
        }
        Insert: {
          combine_with?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          last_calculated_at?: string | null
          name: string
          rules: Json
          site_id?: string | null
          user_count?: number | null
        }
        Update: {
          combine_with?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          last_calculated_at?: string | null
          name?: string
          rules?: Json
          site_id?: string | null
          user_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "segments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      server_log_analytics: {
        Row: {
          avg_load_time_ms: number | null
          browser: string | null
          country_code: string | null
          created_at: string | null
          date: string
          device_type: string | null
          id: string
          page_views: number | null
          referrer_domain: string | null
          site_id: string
          status_2xx: number | null
          status_3xx: number | null
          status_4xx: number | null
          status_5xx: number | null
          unique_visitors: number | null
          updated_at: string | null
          url: string
        }
        Insert: {
          avg_load_time_ms?: number | null
          browser?: string | null
          country_code?: string | null
          created_at?: string | null
          date: string
          device_type?: string | null
          id?: string
          page_views?: number | null
          referrer_domain?: string | null
          site_id: string
          status_2xx?: number | null
          status_3xx?: number | null
          status_4xx?: number | null
          status_5xx?: number | null
          unique_visitors?: number | null
          updated_at?: string | null
          url: string
        }
        Update: {
          avg_load_time_ms?: number | null
          browser?: string | null
          country_code?: string | null
          created_at?: string | null
          date?: string
          device_type?: string | null
          id?: string
          page_views?: number | null
          referrer_domain?: string | null
          site_id?: string
          status_2xx?: number | null
          status_3xx?: number | null
          status_4xx?: number | null
          status_5xx?: number | null
          unique_visitors?: number | null
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_log_analytics_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      server_log_imports: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          failed_lines: number | null
          filename: string
          id: string
          log_format: string
          processed_lines: number | null
          site_id: string
          status: string | null
          total_lines: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          failed_lines?: number | null
          filename: string
          id?: string
          log_format: string
          processed_lines?: number | null
          site_id: string
          status?: string | null
          total_lines?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          failed_lines?: number | null
          filename?: string
          id?: string
          log_format?: string
          processed_lines?: number | null
          site_id?: string
          status?: string | null
          total_lines?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "server_log_imports_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      session_recording_events: {
        Row: {
          created_at: string | null
          event_data: Json
          event_type: string
          id: number
          recording_id: string | null
          timestamp_ms: number
        }
        Insert: {
          created_at?: string | null
          event_data: Json
          event_type: string
          id?: number
          recording_id?: string | null
          timestamp_ms: number
        }
        Update: {
          created_at?: string | null
          event_data?: Json
          event_type?: string
          id?: number
          recording_id?: string | null
          timestamp_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "session_recording_events_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "session_recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      session_recording_settings: {
        Row: {
          created_at: string | null
          enabled: boolean | null
          exclude_paths: string[] | null
          id: string
          ignored_elements: string[] | null
          mask_all_inputs: boolean | null
          mask_all_text: boolean | null
          max_duration_ms: number | null
          max_file_size_mb: number | null
          record_only_paths: string[] | null
          retention_days: number | null
          sample_ai_agents: boolean | null
          sampling_rate: number | null
          site_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean | null
          exclude_paths?: string[] | null
          id?: string
          ignored_elements?: string[] | null
          mask_all_inputs?: boolean | null
          mask_all_text?: boolean | null
          max_duration_ms?: number | null
          max_file_size_mb?: number | null
          record_only_paths?: string[] | null
          retention_days?: number | null
          sample_ai_agents?: boolean | null
          sampling_rate?: number | null
          site_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          enabled?: boolean | null
          exclude_paths?: string[] | null
          id?: string
          ignored_elements?: string[] | null
          mask_all_inputs?: boolean | null
          mask_all_text?: boolean | null
          max_duration_ms?: number | null
          max_file_size_mb?: number | null
          record_only_paths?: string[] | null
          retention_days?: number | null
          sample_ai_agents?: boolean | null
          sampling_rate?: number | null
          site_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_recording_settings_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: true
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      session_recordings: {
        Row: {
          agent_type: string | null
          browser: string | null
          compressed: boolean | null
          created_at: string | null
          device_type: string | null
          duration_ms: number
          ended_at: string
          expires_at: string | null
          file_size_bytes: number | null
          has_masked_data: boolean | null
          id: string
          is_ai_agent: boolean | null
          os: string | null
          page_title: string | null
          page_url: string
          processed: boolean | null
          recording_url: string | null
          sampling_rate: number | null
          session_id: string | null
          site_id: string | null
          started_at: string
          viewport_height: number | null
          viewport_width: number | null
          visitor_hash: string
        }
        Insert: {
          agent_type?: string | null
          browser?: string | null
          compressed?: boolean | null
          created_at?: string | null
          device_type?: string | null
          duration_ms: number
          ended_at: string
          expires_at?: string | null
          file_size_bytes?: number | null
          has_masked_data?: boolean | null
          id?: string
          is_ai_agent?: boolean | null
          os?: string | null
          page_title?: string | null
          page_url: string
          processed?: boolean | null
          recording_url?: string | null
          sampling_rate?: number | null
          session_id?: string | null
          site_id?: string | null
          started_at: string
          viewport_height?: number | null
          viewport_width?: number | null
          visitor_hash: string
        }
        Update: {
          agent_type?: string | null
          browser?: string | null
          compressed?: boolean | null
          created_at?: string | null
          device_type?: string | null
          duration_ms?: number
          ended_at?: string
          expires_at?: string | null
          file_size_bytes?: number | null
          has_masked_data?: boolean | null
          id?: string
          is_ai_agent?: boolean | null
          os?: string | null
          page_title?: string | null
          page_url?: string
          processed?: boolean | null
          recording_url?: string | null
          sampling_rate?: number | null
          session_id?: string | null
          site_id?: string | null
          started_at?: string
          viewport_height?: number | null
          viewport_width?: number | null
          visitor_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_recordings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "tracking_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_recordings_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_google_credentials: {
        Row: {
          access_token: string | null
          brand_keywords: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          last_token_refresh_at: string | null
          property_url: string
          refresh_token: string
          site_id: string
          token_expires_at: string | null
        }
        Insert: {
          access_token?: string | null
          brand_keywords?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          last_token_refresh_at?: string | null
          property_url: string
          refresh_token: string
          site_id: string
          token_expires_at?: string | null
        }
        Update: {
          access_token?: string | null
          brand_keywords?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          last_token_refresh_at?: string | null
          property_url?: string
          refresh_token?: string
          site_id?: string
          token_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_google_credentials_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_integrations: {
        Row: {
          created_at: string
          encrypted_credentials: string
          id: string
          integration_type: string
          is_active: boolean | null
          site_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          encrypted_credentials: string
          id?: string
          integration_type: string
          is_active?: boolean | null
          site_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          encrypted_credentials?: string
          id?: string
          integration_type?: string
          is_active?: boolean | null
          site_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_integrations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          activecampaign_account: string | null
          activecampaign_enabled: boolean | null
          adobe_container_id: string | null
          adobe_tag_manager_enabled: boolean | null
          agent_config: Json | null
          aggregate_measurement: boolean
          auto_categorize_cookies: boolean | null
          cloudflare_enabled: boolean
          cloudflare_zone_id: string | null
          conversion_goals: Json | null
          cookie_scanning_enabled: boolean | null
          created_at: string
          domain: string
          excluded_ips: string[] | null
          facebook_pixel_enabled: boolean | null
          facebook_pixel_id: string | null
          fingerprint_salt: string | null
          form_tracking_config: Json | null
          ga_enhanced_ecommerce: boolean | null
          ga_integration_enabled: boolean | null
          ga_measurement_id: string | null
          ga_property_id: string | null
          ga_sync_events: string[] | null
          gcm_container_id: string | null
          gcm_enabled: boolean | null
          gcm_measurement_id: string | null
          google_ads_access_token: string | null
          google_ads_conversion_id: string | null
          google_ads_customer_id: string | null
          google_ads_enabled: boolean | null
          gtm_container_id: string | null
          gtm_enabled: boolean | null
          heatmap_tracking_enabled: boolean | null
          hotjar_enabled: boolean | null
          hotjar_site_id: string | null
          hubspot_enabled: boolean | null
          hubspot_hub_id: string | null
          hubspot_lead_webhook_enabled: boolean | null
          hubspot_quality_property: string | null
          hubspot_webhook_secret: string | null
          id: string
          ip_exclusion_enabled: boolean | null
          is_active: boolean
          last_cookie_scan: string | null
          linkedin_insight_enabled: boolean | null
          linkedin_partner_id: string | null
          marketo_enabled: boolean | null
          marketo_munchkin_id: string | null
          microsoft_clarity_enabled: boolean | null
          microsoft_clarity_project_id: string | null
          mixpanel_enabled: boolean | null
          mixpanel_token: string | null
          navigation_config: Json | null
          oracle_eloqua_enabled: boolean | null
          oracle_site_id: string | null
          organization_id: string | null
          salesforce_account_id: string | null
          salesforce_pardot_enabled: boolean | null
          screenshot_urls: Json | null
          server_side_tracking_config: Json | null
          site_name: string
          tiktok_pixel_enabled: boolean | null
          tiktok_pixel_id: string | null
          tracking_id: string
          tracking_mode: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activecampaign_account?: string | null
          activecampaign_enabled?: boolean | null
          adobe_container_id?: string | null
          adobe_tag_manager_enabled?: boolean | null
          agent_config?: Json | null
          aggregate_measurement?: boolean
          auto_categorize_cookies?: boolean | null
          cloudflare_enabled?: boolean
          cloudflare_zone_id?: string | null
          conversion_goals?: Json | null
          cookie_scanning_enabled?: boolean | null
          created_at?: string
          domain: string
          excluded_ips?: string[] | null
          facebook_pixel_enabled?: boolean | null
          facebook_pixel_id?: string | null
          fingerprint_salt?: string | null
          form_tracking_config?: Json | null
          ga_enhanced_ecommerce?: boolean | null
          ga_integration_enabled?: boolean | null
          ga_measurement_id?: string | null
          ga_property_id?: string | null
          ga_sync_events?: string[] | null
          gcm_container_id?: string | null
          gcm_enabled?: boolean | null
          gcm_measurement_id?: string | null
          google_ads_access_token?: string | null
          google_ads_conversion_id?: string | null
          google_ads_customer_id?: string | null
          google_ads_enabled?: boolean | null
          gtm_container_id?: string | null
          gtm_enabled?: boolean | null
          heatmap_tracking_enabled?: boolean | null
          hotjar_enabled?: boolean | null
          hotjar_site_id?: string | null
          hubspot_enabled?: boolean | null
          hubspot_hub_id?: string | null
          hubspot_lead_webhook_enabled?: boolean | null
          hubspot_quality_property?: string | null
          hubspot_webhook_secret?: string | null
          id?: string
          ip_exclusion_enabled?: boolean | null
          is_active?: boolean
          last_cookie_scan?: string | null
          linkedin_insight_enabled?: boolean | null
          linkedin_partner_id?: string | null
          marketo_enabled?: boolean | null
          marketo_munchkin_id?: string | null
          microsoft_clarity_enabled?: boolean | null
          microsoft_clarity_project_id?: string | null
          mixpanel_enabled?: boolean | null
          mixpanel_token?: string | null
          navigation_config?: Json | null
          oracle_eloqua_enabled?: boolean | null
          oracle_site_id?: string | null
          organization_id?: string | null
          salesforce_account_id?: string | null
          salesforce_pardot_enabled?: boolean | null
          screenshot_urls?: Json | null
          server_side_tracking_config?: Json | null
          site_name: string
          tiktok_pixel_enabled?: boolean | null
          tiktok_pixel_id?: string | null
          tracking_id: string
          tracking_mode?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activecampaign_account?: string | null
          activecampaign_enabled?: boolean | null
          adobe_container_id?: string | null
          adobe_tag_manager_enabled?: boolean | null
          agent_config?: Json | null
          aggregate_measurement?: boolean
          auto_categorize_cookies?: boolean | null
          cloudflare_enabled?: boolean
          cloudflare_zone_id?: string | null
          conversion_goals?: Json | null
          cookie_scanning_enabled?: boolean | null
          created_at?: string
          domain?: string
          excluded_ips?: string[] | null
          facebook_pixel_enabled?: boolean | null
          facebook_pixel_id?: string | null
          fingerprint_salt?: string | null
          form_tracking_config?: Json | null
          ga_enhanced_ecommerce?: boolean | null
          ga_integration_enabled?: boolean | null
          ga_measurement_id?: string | null
          ga_property_id?: string | null
          ga_sync_events?: string[] | null
          gcm_container_id?: string | null
          gcm_enabled?: boolean | null
          gcm_measurement_id?: string | null
          google_ads_access_token?: string | null
          google_ads_conversion_id?: string | null
          google_ads_customer_id?: string | null
          google_ads_enabled?: boolean | null
          gtm_container_id?: string | null
          gtm_enabled?: boolean | null
          heatmap_tracking_enabled?: boolean | null
          hotjar_enabled?: boolean | null
          hotjar_site_id?: string | null
          hubspot_enabled?: boolean | null
          hubspot_hub_id?: string | null
          hubspot_lead_webhook_enabled?: boolean | null
          hubspot_quality_property?: string | null
          hubspot_webhook_secret?: string | null
          id?: string
          ip_exclusion_enabled?: boolean | null
          is_active?: boolean
          last_cookie_scan?: string | null
          linkedin_insight_enabled?: boolean | null
          linkedin_partner_id?: string | null
          marketo_enabled?: boolean | null
          marketo_munchkin_id?: string | null
          microsoft_clarity_enabled?: boolean | null
          microsoft_clarity_project_id?: string | null
          mixpanel_enabled?: boolean | null
          mixpanel_token?: string | null
          navigation_config?: Json | null
          oracle_eloqua_enabled?: boolean | null
          oracle_site_id?: string | null
          organization_id?: string | null
          salesforce_account_id?: string | null
          salesforce_pardot_enabled?: boolean | null
          screenshot_urls?: Json | null
          server_side_tracking_config?: Json | null
          site_name?: string
          tiktok_pixel_enabled?: boolean | null
          tiktok_pixel_id?: string | null
          tracking_id?: string
          tracking_mode?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stress_parameters: {
        Row: {
          brl_usd_effect: number | null
          country: string
          eur_sek_effect: number | null
          id: string
          jpy_sek_effect: number | null
          nim_multiplier: number | null
          note: string | null
          npl_addition: number | null
          pe_multiplier: number | null
          roe_multiplier: number | null
          scenario_id: string
          usd_sek_effect: number | null
        }
        Insert: {
          brl_usd_effect?: number | null
          country: string
          eur_sek_effect?: number | null
          id?: string
          jpy_sek_effect?: number | null
          nim_multiplier?: number | null
          note?: string | null
          npl_addition?: number | null
          pe_multiplier?: number | null
          roe_multiplier?: number | null
          scenario_id: string
          usd_sek_effect?: number | null
        }
        Update: {
          brl_usd_effect?: number | null
          country?: string
          eur_sek_effect?: number | null
          id?: string
          jpy_sek_effect?: number | null
          nim_multiplier?: number | null
          note?: string | null
          npl_addition?: number | null
          pe_multiplier?: number | null
          roe_multiplier?: number | null
          scenario_id?: string
          usd_sek_effect?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stress_parameters_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "stress_scenarios"
            referencedColumns: ["scenario_id"]
          },
        ]
      }
      stress_scenarios: {
        Row: {
          background: string
          border_color: string
          color: string
          created_at: string | null
          description: string
          id: string
          is_active: boolean | null
          scenario_id: string
          scenario_name: string
        }
        Insert: {
          background: string
          border_color: string
          color: string
          created_at?: string | null
          description: string
          id?: string
          is_active?: boolean | null
          scenario_id: string
          scenario_name: string
        }
        Update: {
          background?: string
          border_color?: string
          color?: string
          created_at?: string | null
          description?: string
          id?: string
          is_active?: boolean | null
          scenario_id?: string
          scenario_name?: string
        }
        Relationships: []
      }
      subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          stripe_customer_id: string | null
          subscribed: boolean
          subscription_end: string | null
          subscription_tier: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          stripe_customer_id?: string | null
          subscribed?: boolean
          subscription_end?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          stripe_customer_id?: string | null
          subscribed?: boolean
          subscription_end?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      tag_audit_log: {
        Row: {
          action: string
          changes: Json | null
          created_at: string | null
          id: string
          notes: string | null
          performed_by: string | null
          tag_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
          tag_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
          tag_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tag_audit_log_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_data_layer: {
        Row: {
          created_at: string | null
          default_value: Json | null
          description: string | null
          id: string
          is_enabled: boolean | null
          scope: string | null
          site_id: string | null
          updated_at: string | null
          variable_name: string
          variable_type: string | null
        }
        Insert: {
          created_at?: string | null
          default_value?: Json | null
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          scope?: string | null
          site_id?: string | null
          updated_at?: string | null
          variable_name: string
          variable_type?: string | null
        }
        Update: {
          created_at?: string | null
          default_value?: Json | null
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          scope?: string | null
          site_id?: string | null
          updated_at?: string | null
          variable_name?: string
          variable_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tag_data_layer_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_firing_rules: {
        Row: {
          created_at: string | null
          exception_conditions: Json | null
          id: string
          is_enabled: boolean | null
          require_all_conditions: boolean | null
          rule_name: string
          rule_order: number | null
          rule_type: string
          tag_id: string | null
          trigger_conditions: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          exception_conditions?: Json | null
          id?: string
          is_enabled?: boolean | null
          require_all_conditions?: boolean | null
          rule_name: string
          rule_order?: number | null
          rule_type: string
          tag_id?: string | null
          trigger_conditions?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          exception_conditions?: Json | null
          id?: string
          is_enabled?: boolean | null
          require_all_conditions?: boolean | null
          rule_name?: string
          rule_order?: number | null
          rule_type?: string
          tag_id?: string | null
          trigger_conditions?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tag_firing_rules_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_publications: {
        Row: {
          id: string
          notes: string | null
          published_at: string
          published_by: string | null
          published_to_production: boolean | null
          published_to_staging: boolean | null
          status: string | null
          tag_id: string | null
          version: number
        }
        Insert: {
          id?: string
          notes?: string | null
          published_at: string
          published_by?: string | null
          published_to_production?: boolean | null
          published_to_staging?: boolean | null
          status?: string | null
          tag_id?: string | null
          version: number
        }
        Update: {
          id?: string
          notes?: string | null
          published_at?: string
          published_by?: string | null
          published_to_production?: boolean | null
          published_to_staging?: boolean | null
          status?: string | null
          tag_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tag_publications_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_templates: {
        Row: {
          category: string | null
          created_at: string | null
          default_config: Json | null
          description: string | null
          icon_url: string | null
          id: string
          is_premium: boolean | null
          name: string
          optional_fields: Json | null
          provider_name: string | null
          required_fields: Json | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          default_config?: Json | null
          description?: string | null
          icon_url?: string | null
          id?: string
          is_premium?: boolean | null
          name: string
          optional_fields?: Json | null
          provider_name?: string | null
          required_fields?: Json | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          default_config?: Json | null
          description?: string | null
          icon_url?: string | null
          id?: string
          is_premium?: boolean | null
          name?: string
          optional_fields?: Json | null
          provider_name?: string | null
          required_fields?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      tag_test_results: {
        Row: {
          errors: Json | null
          fire_time_ms: number | null
          fired: boolean | null
          id: string
          payload: Json | null
          tag_id: string | null
          test_timestamp: string | null
          test_type: string | null
          tested_by: string | null
          tested_on_url: string | null
        }
        Insert: {
          errors?: Json | null
          fire_time_ms?: number | null
          fired?: boolean | null
          id?: string
          payload?: Json | null
          tag_id?: string | null
          test_timestamp?: string | null
          test_type?: string | null
          tested_by?: string | null
          tested_on_url?: string | null
        }
        Update: {
          errors?: Json | null
          fire_time_ms?: number | null
          fired?: boolean | null
          id?: string
          payload?: Json | null
          tag_id?: string | null
          test_timestamp?: string | null
          test_type?: string | null
          tested_by?: string | null
          tested_on_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tag_test_results_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_versions: {
        Row: {
          change_description: string | null
          config: Json
          created_at: string | null
          created_by: string | null
          id: string
          tag_id: string | null
          version: number
        }
        Insert: {
          change_description?: string | null
          config: Json
          created_at?: string | null
          created_by?: string | null
          id?: string
          tag_id?: string | null
          version: number
        }
        Update: {
          change_description?: string | null
          config?: Json
          created_at?: string | null
          created_by?: string | null
          id?: string
          tag_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tag_versions_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          config: Json
          created_at: string | null
          description: string | null
          id: string
          is_enabled: boolean | null
          is_paused: boolean | null
          last_published_at: string | null
          name: string
          site_id: string | null
          type: string
          updated_at: string | null
          version: number | null
        }
        Insert: {
          config: Json
          created_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          is_paused?: boolean | null
          last_published_at?: string | null
          name: string
          site_id?: string | null
          type: string
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          config?: Json
          created_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          is_paused?: boolean | null
          last_published_at?: string | null
          name?: string
          site_id?: string | null
          type?: string
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tags_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_check_findings: {
        Row: {
          check_key: string
          evidence: Json
          explanation: string
          fix: string
          id: string
          priority: string | null
          run_id: string
          scope: string
          sort_order: number
          status: string
          title: string
          typical_owner: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          check_key: string
          evidence?: Json
          explanation?: string
          fix?: string
          id?: string
          priority?: string | null
          run_id: string
          scope: string
          sort_order: number
          status: string
          title: string
          typical_owner?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          check_key?: string
          evidence?: Json
          explanation?: string
          fix?: string
          id?: string
          priority?: string | null
          run_id?: string
          scope?: string
          sort_order?: number
          status?: string
          title?: string
          typical_owner?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracking_check_findings_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "tracking_check_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_check_observations: {
        Row: {
          created_at: string
          data: Json
          id: string
          run_id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          data: Json
          id?: string
          run_id: string
          task_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          run_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_check_observations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "tracking_check_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_check_observations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "tracking_check_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_check_runs: {
        Row: {
          assessing_at: string | null
          auth_ciphertext: string | null
          auth_expires_at: string | null
          baseline_url: string | null
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          mode: string
          pages: Json
          policy: Json | null
          share_expires_at: string | null
          share_token: string | null
          status: string
          summary: Json | null
          target_url: string
          user_id: string
        }
        Insert: {
          assessing_at?: string | null
          auth_ciphertext?: string | null
          auth_expires_at?: string | null
          baseline_url?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          mode: string
          pages?: Json
          policy?: Json | null
          share_expires_at?: string | null
          share_token?: string | null
          status?: string
          summary?: Json | null
          target_url: string
          user_id: string
        }
        Update: {
          assessing_at?: string | null
          auth_ciphertext?: string | null
          auth_expires_at?: string | null
          baseline_url?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          mode?: string
          pages?: Json
          policy?: Json | null
          share_expires_at?: string | null
          share_token?: string | null
          status?: string
          summary?: Json | null
          target_url?: string
          user_id?: string
        }
        Relationships: []
      }
      tracking_check_tasks: {
        Row: {
          attempts: number
          claimed_at: string | null
          created_at: string
          error: string | null
          id: string
          kind: string
          legacy: boolean
          path: string
          run_id: string
          site_role: string
          status: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          legacy?: boolean
          path: string
          run_id: string
          site_role: string
          status?: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          legacy?: boolean
          path?: string
          run_id?: string
          site_role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_check_tasks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "tracking_check_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_events: {
        Row: {
          company_id: string
          content_id: string
          content_type: string
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          platform: string | null
          session_id: string
          timestamp: string
        }
        Insert: {
          company_id: string
          content_id: string
          content_type: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          platform?: string | null
          session_id: string
          timestamp?: string
        }
        Update: {
          company_id?: string
          content_id?: string
          content_type?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          platform?: string | null
          session_id?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_sessions: {
        Row: {
          browser: string | null
          country_code: string | null
          device_type: string | null
          duration_seconds: number | null
          id: string
          ip_address: string | null
          last_activity: string
          last_rotation: string | null
          os: string | null
          page_views: number | null
          referrer: string | null
          referrer_url: string | null
          screen_height: number | null
          screen_width: number | null
          session_id: string
          session_rotation_count: number | null
          site_id: string
          started_at: string
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          viewport_height: number | null
          viewport_width: number | null
        }
        Insert: {
          browser?: string | null
          country_code?: string | null
          device_type?: string | null
          duration_seconds?: number | null
          id?: string
          ip_address?: string | null
          last_activity?: string
          last_rotation?: string | null
          os?: string | null
          page_views?: number | null
          referrer?: string | null
          referrer_url?: string | null
          screen_height?: number | null
          screen_width?: number | null
          session_id: string
          session_rotation_count?: number | null
          site_id: string
          started_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          viewport_height?: number | null
          viewport_width?: number | null
        }
        Update: {
          browser?: string | null
          country_code?: string | null
          device_type?: string | null
          duration_seconds?: number | null
          id?: string
          ip_address?: string | null
          last_activity?: string
          last_rotation?: string | null
          os?: string | null
          page_views?: number | null
          referrer?: string | null
          referrer_url?: string | null
          screen_height?: number | null
          screen_width?: number | null
          session_id?: string
          session_rotation_count?: number | null
          site_id?: string
          started_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          viewport_height?: number | null
          viewport_width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tracking_sessions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      unified_visitors: {
        Row: {
          ai_agent_metadata: Json | null
          ai_agent_type: string | null
          avg_pages_per_session: number | null
          avg_session_duration_seconds: number | null
          click_id_consent_given: boolean | null
          confidence_score: number | null
          conversion_probability: number | null
          country_code: string | null
          created_at: string
          engagement_score: number | null
          fbclid: string | null
          first_conversion_at: string | null
          first_referrer: string | null
          first_seen_at: string
          first_session_id: string | null
          first_utm_campaign: string | null
          first_utm_medium: string | null
          first_utm_source: string | null
          frequency_score: number | null
          gclid: string | null
          id: string
          is_verified_human: boolean | null
          last_conversion_at: string | null
          last_referrer: string | null
          last_seen_at: string
          last_utm_medium: string | null
          last_utm_source: string | null
          li_fat_id: string | null
          lifetime_value: number | null
          msclkid: string | null
          primary_browser: string | null
          primary_device_type: string | null
          primary_os: string | null
          primary_segment: string | null
          recency_score: number | null
          region: string | null
          rfm_segment: string | null
          segments: string[] | null
          site_id: string
          total_ai_agent_sessions: number | null
          total_conversions: number | null
          total_events: number | null
          total_human_sessions: number | null
          total_pageviews: number | null
          total_sessions: number | null
          total_time_on_site_seconds: number | null
          ttclid: string | null
          updated_at: string
          visitor_fingerprint: string
          visitor_type: string
        }
        Insert: {
          ai_agent_metadata?: Json | null
          ai_agent_type?: string | null
          avg_pages_per_session?: number | null
          avg_session_duration_seconds?: number | null
          click_id_consent_given?: boolean | null
          confidence_score?: number | null
          conversion_probability?: number | null
          country_code?: string | null
          created_at?: string
          engagement_score?: number | null
          fbclid?: string | null
          first_conversion_at?: string | null
          first_referrer?: string | null
          first_seen_at?: string
          first_session_id?: string | null
          first_utm_campaign?: string | null
          first_utm_medium?: string | null
          first_utm_source?: string | null
          frequency_score?: number | null
          gclid?: string | null
          id?: string
          is_verified_human?: boolean | null
          last_conversion_at?: string | null
          last_referrer?: string | null
          last_seen_at?: string
          last_utm_medium?: string | null
          last_utm_source?: string | null
          li_fat_id?: string | null
          lifetime_value?: number | null
          msclkid?: string | null
          primary_browser?: string | null
          primary_device_type?: string | null
          primary_os?: string | null
          primary_segment?: string | null
          recency_score?: number | null
          region?: string | null
          rfm_segment?: string | null
          segments?: string[] | null
          site_id: string
          total_ai_agent_sessions?: number | null
          total_conversions?: number | null
          total_events?: number | null
          total_human_sessions?: number | null
          total_pageviews?: number | null
          total_sessions?: number | null
          total_time_on_site_seconds?: number | null
          ttclid?: string | null
          updated_at?: string
          visitor_fingerprint: string
          visitor_type?: string
        }
        Update: {
          ai_agent_metadata?: Json | null
          ai_agent_type?: string | null
          avg_pages_per_session?: number | null
          avg_session_duration_seconds?: number | null
          click_id_consent_given?: boolean | null
          confidence_score?: number | null
          conversion_probability?: number | null
          country_code?: string | null
          created_at?: string
          engagement_score?: number | null
          fbclid?: string | null
          first_conversion_at?: string | null
          first_referrer?: string | null
          first_seen_at?: string
          first_session_id?: string | null
          first_utm_campaign?: string | null
          first_utm_medium?: string | null
          first_utm_source?: string | null
          frequency_score?: number | null
          gclid?: string | null
          id?: string
          is_verified_human?: boolean | null
          last_conversion_at?: string | null
          last_referrer?: string | null
          last_seen_at?: string
          last_utm_medium?: string | null
          last_utm_source?: string | null
          li_fat_id?: string | null
          lifetime_value?: number | null
          msclkid?: string | null
          primary_browser?: string | null
          primary_device_type?: string | null
          primary_os?: string | null
          primary_segment?: string | null
          recency_score?: number | null
          region?: string | null
          rfm_segment?: string | null
          segments?: string[] | null
          site_id?: string
          total_ai_agent_sessions?: number | null
          total_conversions?: number | null
          total_events?: number | null
          total_human_sessions?: number | null
          total_pageviews?: number | null
          total_sessions?: number | null
          total_time_on_site_seconds?: number | null
          ttclid?: string | null
          updated_at?: string
          visitor_fingerprint?: string
          visitor_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "unified_visitors_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      usa_companies: {
        Row: {
          cik: string | null
          company_name: string
          created_at: string | null
          id: string
          industry: string | null
          market_cap: number | null
          sector: string | null
          ticker: string
          updated_at: string | null
        }
        Insert: {
          cik?: string | null
          company_name: string
          created_at?: string | null
          id?: string
          industry?: string | null
          market_cap?: number | null
          sector?: string | null
          ticker: string
          updated_at?: string | null
        }
        Update: {
          cik?: string | null
          company_name?: string
          created_at?: string | null
          id?: string
          industry?: string | null
          market_cap?: number | null
          sector?: string | null
          ticker?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      usa_insider_transactions: {
        Row: {
          company_id: string | null
          created_at: string | null
          filing_date: string | null
          form_type: string | null
          id: string
          ownership_type: string | null
          price_per_share: number | null
          sec_url: string | null
          shares: number | null
          total_value: number | null
          transaction_code: string | null
          transaction_date: string | null
          transaction_type: string | null
          updated_at: string | null
          vip_insider_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          filing_date?: string | null
          form_type?: string | null
          id?: string
          ownership_type?: string | null
          price_per_share?: number | null
          sec_url?: string | null
          shares?: number | null
          total_value?: number | null
          transaction_code?: string | null
          transaction_date?: string | null
          transaction_type?: string | null
          updated_at?: string | null
          vip_insider_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          filing_date?: string | null
          form_type?: string | null
          id?: string
          ownership_type?: string | null
          price_per_share?: number | null
          sec_url?: string | null
          shares?: number | null
          total_value?: number | null
          transaction_code?: string | null
          transaction_date?: string | null
          transaction_type?: string | null
          updated_at?: string | null
          vip_insider_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usa_insider_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "usa_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usa_insider_transactions_vip_insider_id_fkey"
            columns: ["vip_insider_id"]
            isOneToOne: false
            referencedRelation: "usa_vip_insiders"
            referencedColumns: ["id"]
          },
        ]
      }
      usa_vip_insiders: {
        Row: {
          bio: string | null
          category: string | null
          cik: string | null
          created_at: string | null
          id: string
          name: string
          party: string | null
          photo_url: string | null
          risk_level: number | null
          state: string | null
          subcategory: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          bio?: string | null
          category?: string | null
          cik?: string | null
          created_at?: string | null
          id?: string
          name: string
          party?: string | null
          photo_url?: string | null
          risk_level?: number | null
          state?: string | null
          subcategory?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          bio?: string | null
          category?: string | null
          cik?: string | null
          created_at?: string | null
          id?: string
          name?: string
          party?: string | null
          photo_url?: string | null
          risk_level?: number | null
          state?: string | null
          subcategory?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_identities: {
        Row: {
          consent_granted: boolean | null
          created_at: string | null
          device_ids: string[] | null
          first_seen: string | null
          id: string
          last_seen: string | null
          session_ids: string[] | null
          site_id: string
          total_revenue: number | null
          total_sessions: number | null
          user_hash: string
        }
        Insert: {
          consent_granted?: boolean | null
          created_at?: string | null
          device_ids?: string[] | null
          first_seen?: string | null
          id?: string
          last_seen?: string | null
          session_ids?: string[] | null
          site_id: string
          total_revenue?: number | null
          total_sessions?: number | null
          user_hash: string
        }
        Update: {
          consent_granted?: boolean | null
          created_at?: string | null
          device_ids?: string[] | null
          first_seen?: string | null
          id?: string
          last_seen?: string | null
          session_ids?: string[] | null
          site_id?: string
          total_revenue?: number | null
          total_sessions?: number | null
          user_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_identities_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      user_interactions: {
        Row: {
          created_at: string
          element_class: string | null
          element_id: string | null
          element_tag: string | null
          element_text: string | null
          id: string
          interaction_type: string
          page_view_id: string
          scroll_position: number | null
          session_id: string
          timestamp_ms: number
          x_coordinate: number | null
          y_coordinate: number | null
        }
        Insert: {
          created_at?: string
          element_class?: string | null
          element_id?: string | null
          element_tag?: string | null
          element_text?: string | null
          id?: string
          interaction_type: string
          page_view_id: string
          scroll_position?: number | null
          session_id: string
          timestamp_ms: number
          x_coordinate?: number | null
          y_coordinate?: number | null
        }
        Update: {
          created_at?: string
          element_class?: string | null
          element_id?: string | null
          element_tag?: string | null
          element_text?: string | null
          id?: string
          interaction_type?: string
          page_view_id?: string
          scroll_position?: number | null
          session_id?: string
          timestamp_ms?: number
          x_coordinate?: number | null
          y_coordinate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_interactions_page_view_id_fkey"
            columns: ["page_view_id"]
            isOneToOne: false
            referencedRelation: "page_views"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_interactions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "tracking_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_photos: {
        Row: {
          created_at: string | null
          file_path: string | null
          format_id: string | null
          format_name: string
          id: string
          photo_url: string
          updated_at: string | null
          user_email: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          file_path?: string | null
          format_id?: string | null
          format_name: string
          id?: string
          photo_url: string
          updated_at?: string | null
          user_email: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          file_path?: string | null
          format_id?: string | null
          format_name?: string
          id?: string
          photo_url?: string
          updated_at?: string | null
          user_email?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_photos_format_id_fkey"
            columns: ["format_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["id"]
          },
        ]
      }
      user_portfolios: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          total_value_sek: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          total_value_sek?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          total_value_sek?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          dashboard_layout: Json | null
          favorite_tabs: Json | null
          id: string
          notification_settings: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dashboard_layout?: Json | null
          favorite_tabs?: Json | null
          id?: string
          notification_settings?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dashboard_layout?: Json | null
          favorite_tabs?: Json | null
          id?: string
          notification_settings?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_watchlist: {
        Row: {
          added_at: string | null
          alert_on_insider_buy: boolean | null
          alert_on_insider_sell: boolean | null
          alert_on_pattern: boolean | null
          alert_on_signal: boolean | null
          company_name: string
          id: string
          isin: string | null
          min_signal_strength: string | null
          notes: string | null
          ticker: string
          user_id: string
        }
        Insert: {
          added_at?: string | null
          alert_on_insider_buy?: boolean | null
          alert_on_insider_sell?: boolean | null
          alert_on_pattern?: boolean | null
          alert_on_signal?: boolean | null
          company_name: string
          id?: string
          isin?: string | null
          min_signal_strength?: string | null
          notes?: string | null
          ticker: string
          user_id: string
        }
        Update: {
          added_at?: string | null
          alert_on_insider_buy?: boolean | null
          alert_on_insider_sell?: boolean | null
          alert_on_pattern?: boolean | null
          alert_on_signal?: boolean | null
          company_name?: string
          id?: string
          isin?: string | null
          min_signal_strength?: string | null
          notes?: string | null
          ticker?: string
          user_id?: string
        }
        Relationships: []
      }
      utm_segments: {
        Row: {
          color: string
          created_at: string
          filters: Json
          id: string
          is_pinned: boolean
          name: string
          site_id: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          filters?: Json
          id?: string
          is_pinned?: boolean
          name: string
          site_id: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          filters?: Json
          id?: string
          is_pinned?: boolean
          name?: string
          site_id?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "utm_segments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      video_order_images: {
        Row: {
          created_at: string
          id: string
          image_url: string
          order_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          order_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_order_images_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "video_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      video_orders: {
        Row: {
          address: string
          area: string | null
          company: string | null
          created_at: string
          description: string
          email: string
          expedited_delivery: boolean
          format: string
          id: string
          image_count: number
          include_logo: boolean
          name: string
          phone: string | null
          price: string
          rooms: string
          status: string
          text_position: string
          updated_at: string | null
          webhook_sent: boolean
        }
        Insert: {
          address: string
          area?: string | null
          company?: string | null
          created_at?: string
          description: string
          email: string
          expedited_delivery?: boolean
          format: string
          id?: string
          image_count: number
          include_logo?: boolean
          name: string
          phone?: string | null
          price: string
          rooms: string
          status?: string
          text_position: string
          updated_at?: string | null
          webhook_sent?: boolean
        }
        Update: {
          address?: string
          area?: string | null
          company?: string | null
          created_at?: string
          description?: string
          email?: string
          expedited_delivery?: boolean
          format?: string
          id?: string
          image_count?: number
          include_logo?: boolean
          name?: string
          phone?: string | null
          price?: string
          rooms?: string
          status?: string
          text_position?: string
          updated_at?: string | null
          webhook_sent?: boolean
        }
        Relationships: []
      }
      visitor_events: {
        Row: {
          created_at: string
          element_selector: string | null
          event_category: string | null
          event_type: string
          id: string
          metadata: Json | null
          occurred_at: string
          page_url: string | null
          session_id: string | null
          session_type: string
          site_id: string
          visitor_id: string
        }
        Insert: {
          created_at?: string
          element_selector?: string | null
          event_category?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          occurred_at?: string
          page_url?: string | null
          session_id?: string | null
          session_type: string
          site_id: string
          visitor_id: string
        }
        Update: {
          created_at?: string
          element_selector?: string | null
          event_category?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          occurred_at?: string
          page_url?: string | null
          session_id?: string | null
          session_type?: string
          site_id?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visitor_events_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitor_events_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "unified_visitors"
            referencedColumns: ["id"]
          },
        ]
      }
      visitor_segment_definitions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          priority: number | null
          rules: Json
          segment_key: string
          segment_name: string
          site_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          priority?: number | null
          rules: Json
          segment_key: string
          segment_name: string
          site_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          priority?: number | null
          rules?: Json
          segment_key?: string
          segment_name?: string
          site_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visitor_segment_definitions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      visitor_session_links: {
        Row: {
          ai_agent_session_id: string | null
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          events: number | null
          had_conversion: boolean | null
          human_session_id: string | null
          id: string
          pageviews: number | null
          session_type: string
          site_id: string
          started_at: string
          visitor_id: string
        }
        Insert: {
          ai_agent_session_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          events?: number | null
          had_conversion?: boolean | null
          human_session_id?: string | null
          id?: string
          pageviews?: number | null
          session_type: string
          site_id: string
          started_at: string
          visitor_id: string
        }
        Update: {
          ai_agent_session_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          events?: number | null
          had_conversion?: boolean | null
          human_session_id?: string | null
          id?: string
          pageviews?: number | null
          session_type?: string
          site_id?: string
          started_at?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visitor_session_links_ai_agent_session_id_fkey"
            columns: ["ai_agent_session_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitor_session_links_human_session_id_fkey"
            columns: ["human_session_id"]
            isOneToOne: false
            referencedRelation: "tracking_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitor_session_links_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitor_session_links_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "unified_visitors"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          company: string | null
          created_at: string
          email: string
          id: string
          message: string | null
          name: string | null
          notes: string | null
          phone: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          id?: string
          message?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: []
      }
      warehouse_audit_log: {
        Row: {
          action: string
          action_by: string | null
          changes: Json | null
          connector_id: string | null
          created_at: string | null
          description: string | null
          id: string
        }
        Insert: {
          action: string
          action_by?: string | null
          changes?: Json | null
          connector_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
        }
        Update: {
          action?: string
          action_by?: string | null
          changes?: Json | null
          connector_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_audit_log_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "warehouse_connectors"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_connectors: {
        Row: {
          company_id: string | null
          connection_tested_at: string | null
          created_at: string | null
          credentials: Json
          description: string | null
          error_message: string | null
          id: string
          last_sync_at: string | null
          name: string
          next_sync_at: string | null
          schema_name: string | null
          settings: Json | null
          site_id: string | null
          status: string | null
          sync_enabled: boolean | null
          sync_frequency: string | null
          table_prefix: string | null
          updated_at: string | null
          warehouse_type: string
        }
        Insert: {
          company_id?: string | null
          connection_tested_at?: string | null
          created_at?: string | null
          credentials: Json
          description?: string | null
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          name: string
          next_sync_at?: string | null
          schema_name?: string | null
          settings?: Json | null
          site_id?: string | null
          status?: string | null
          sync_enabled?: boolean | null
          sync_frequency?: string | null
          table_prefix?: string | null
          updated_at?: string | null
          warehouse_type: string
        }
        Update: {
          company_id?: string | null
          connection_tested_at?: string | null
          created_at?: string | null
          credentials?: Json
          description?: string | null
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          name?: string
          next_sync_at?: string | null
          schema_name?: string | null
          settings?: Json | null
          site_id?: string | null
          status?: string | null
          sync_enabled?: boolean | null
          sync_frequency?: string | null
          table_prefix?: string | null
          updated_at?: string | null
          warehouse_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_connectors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_connectors_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_data_quality: {
        Row: {
          connector_id: string | null
          created_at: string | null
          date: string
          duplicate_records: number | null
          id: string
          invalid_records: number | null
          latest_data_timestamp: string | null
          null_records: number | null
          staleness_hours: number | null
          sync_success_rate: number | null
          total_records: number | null
        }
        Insert: {
          connector_id?: string | null
          created_at?: string | null
          date: string
          duplicate_records?: number | null
          id?: string
          invalid_records?: number | null
          latest_data_timestamp?: string | null
          null_records?: number | null
          staleness_hours?: number | null
          sync_success_rate?: number | null
          total_records?: number | null
        }
        Update: {
          connector_id?: string | null
          created_at?: string | null
          date?: string
          duplicate_records?: number | null
          id?: string
          invalid_records?: number | null
          latest_data_timestamp?: string | null
          null_records?: number | null
          staleness_hours?: number | null
          sync_success_rate?: number | null
          total_records?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_data_quality_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "warehouse_connectors"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_sync_jobs: {
        Row: {
          bytes_transferred: number | null
          completed_at: string | null
          connector_id: string | null
          created_at: string | null
          duration_seconds: number | null
          error_details: Json | null
          error_message: string | null
          id: string
          job_type: string
          progress_percentage: number | null
          rows_failed: number | null
          rows_synced: number | null
          started_at: string | null
          status: string
          sync_from: string | null
          sync_to: string | null
          total_rows: number | null
        }
        Insert: {
          bytes_transferred?: number | null
          completed_at?: string | null
          connector_id?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          job_type: string
          progress_percentage?: number | null
          rows_failed?: number | null
          rows_synced?: number | null
          started_at?: string | null
          status?: string
          sync_from?: string | null
          sync_to?: string | null
          total_rows?: number | null
        }
        Update: {
          bytes_transferred?: number | null
          completed_at?: string | null
          connector_id?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          job_type?: string
          progress_percentage?: number | null
          rows_failed?: number | null
          rows_synced?: number | null
          started_at?: string | null
          status?: string
          sync_from?: string | null
          sync_to?: string | null
          total_rows?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_sync_jobs_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "warehouse_connectors"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_table_schemas: {
        Row: {
          auto_sync: boolean | null
          columns: Json
          connector_id: string | null
          created_at: string | null
          description: string | null
          display_name: string | null
          id: string
          indexes: Json | null
          partition_column: string | null
          partition_interval: string | null
          primary_keys: string[] | null
          table_name: string
          updated_at: string | null
        }
        Insert: {
          auto_sync?: boolean | null
          columns: Json
          connector_id?: string | null
          created_at?: string | null
          description?: string | null
          display_name?: string | null
          id?: string
          indexes?: Json | null
          partition_column?: string | null
          partition_interval?: string | null
          primary_keys?: string[] | null
          table_name: string
          updated_at?: string | null
        }
        Update: {
          auto_sync?: boolean | null
          columns?: Json
          connector_id?: string | null
          created_at?: string | null
          description?: string | null
          display_name?: string | null
          id?: string
          indexes?: Json | null
          partition_column?: string | null
          partition_interval?: string | null
          primary_keys?: string[] | null
          table_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_table_schemas_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "warehouse_connectors"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist_items: {
        Row: {
          added_at: string | null
          commodity_id: string | null
          company_id: string | null
          id: string
          item_type: string
          notes: string | null
          watchlist_id: string | null
        }
        Insert: {
          added_at?: string | null
          commodity_id?: string | null
          company_id?: string | null
          id?: string
          item_type: string
          notes?: string | null
          watchlist_id?: string | null
        }
        Update: {
          added_at?: string | null
          commodity_id?: string | null
          company_id?: string | null
          id?: string
          item_type?: string
          notes?: string | null
          watchlist_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_items_commodity_id_fkey"
            columns: ["commodity_id"]
            isOneToOne: false
            referencedRelation: "commodities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlist_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "mining_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlist_items_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "mineral_watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      web_vitals: {
        Row: {
          cls: number | null
          connection_type: string | null
          device_type: string | null
          fcp: number | null
          fid: number | null
          id: string
          inp: number | null
          lcp: number | null
          measured_at: string | null
          page_url: string | null
          session_id: string | null
          site_id: string | null
          ttfb: number | null
        }
        Insert: {
          cls?: number | null
          connection_type?: string | null
          device_type?: string | null
          fcp?: number | null
          fid?: number | null
          id?: string
          inp?: number | null
          lcp?: number | null
          measured_at?: string | null
          page_url?: string | null
          session_id?: string | null
          site_id?: string | null
          ttfb?: number | null
        }
        Update: {
          cls?: number | null
          connection_type?: string | null
          device_type?: string | null
          fcp?: number | null
          fid?: number | null
          id?: string
          inp?: number | null
          lcp?: number | null
          measured_at?: string | null
          page_url?: string | null
          session_id?: string | null
          site_id?: string | null
          ttfb?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "web_vitals_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      web_vitals_aggregates: {
        Row: {
          avg_cls: number | null
          avg_fcp: number | null
          avg_fid: number | null
          avg_inp: number | null
          avg_lcp: number | null
          avg_ttfb: number | null
          date: string | null
          id: string
          p75_inp: number | null
          performance_score: number | null
          seo_score: number | null
          site_id: string | null
          updated_at: string | null
        }
        Insert: {
          avg_cls?: number | null
          avg_fcp?: number | null
          avg_fid?: number | null
          avg_inp?: number | null
          avg_lcp?: number | null
          avg_ttfb?: number | null
          date?: string | null
          id?: string
          p75_inp?: number | null
          performance_score?: number | null
          seo_score?: number | null
          site_id?: string | null
          updated_at?: string | null
        }
        Update: {
          avg_cls?: number | null
          avg_fcp?: number | null
          avg_fid?: number | null
          avg_inp?: number | null
          avg_lcp?: number | null
          avg_ttfb?: number | null
          date?: string | null
          id?: string
          p75_inp?: number | null
          performance_score?: number | null
          seo_score?: number | null
          site_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "web_vitals_aggregates_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempt_count: number
          channel_id: string
          delivered_at: string
          event_type: string
          http_status: number | null
          id: string
          payload: Json
          response_body: string | null
          site_id: string
          status: string
        }
        Insert: {
          attempt_count?: number
          channel_id: string
          delivered_at?: string
          event_type: string
          http_status?: number | null
          id?: string
          payload?: Json
          response_body?: string | null
          site_id: string
          status?: string
        }
        Update: {
          attempt_count?: number
          channel_id?: string
          delivered_at?: string
          event_type?: string
          http_status?: number | null
          id?: string
          payload?: Json
          response_body?: string | null
          site_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "notification_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      white_label_settings: {
        Row: {
          company_id: string | null
          company_name: string | null
          custom_domain: string | null
          custom_domain_verified: boolean | null
          custom_footer_text: string | null
          favicon_url: string | null
          id: string
          logo_url: string | null
          primary_color: string | null
          secondary_color: string | null
          show_cortiq_branding: boolean | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          company_name?: string | null
          custom_domain?: string | null
          custom_domain_verified?: boolean | null
          custom_footer_text?: string | null
          favicon_url?: string | null
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          show_cortiq_branding?: boolean | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          company_name?: string | null
          custom_domain?: string | null
          custom_domain_verified?: boolean | null
          custom_footer_text?: string | null
          favicon_url?: string | null
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          show_cortiq_branding?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "white_label_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      geo_latest_audits: {
        Row: {
          audit_duration_ms: number | null
          citability_analysis: string | null
          content_score: number | null
          crawler_access: Json | null
          crawler_score: number | null
          created_at: string | null
          findings: Json | null
          has_llms_txt: boolean | null
          id: string | null
          overall_score: number | null
          recommendations: Json | null
          schema_score: number | null
          schema_types: Json | null
          site_id: string | null
          technical_score: number | null
          url: string | null
        }
        Relationships: [
          {
            foreignKeyName: "geo_audits_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_top_pages: {
        Row: {
          avg_time_on_page: number | null
          page_title: string | null
          page_url: string | null
          site_id: string | null
          unique_sessions: number | null
          views: number | null
        }
        Relationships: [
          {
            foreignKeyName: "page_views_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      v_banks_enriched: {
        Row: {
          alpha_vantage_ticker: string | null
          baltic_exposure: number | null
          capital_buffer: number | null
          capital_efficiency: number | null
          cet1_ratio: number | null
          country: string | null
          country_color: string | null
          created_at: string | null
          credit_to_gdp: number | null
          data_age_days: number | null
          data_freshness_status: string | null
          data_source: string | null
          dividend_yield: number | null
          earnings_yield: number | null
          flag: string | null
          forward_pe: number | null
          freshness_emoji: string | null
          id: string | null
          inflation_rate: number | null
          last_updated: string | null
          loan_to_deposit: number | null
          name: string | null
          nim: number | null
          npl_ratio: number | null
          pb_ratio: number | null
          pe_ratio: number | null
          policy_rate: number | null
          property_exposure: number | null
          regulatory_minimum: number | null
          risk_label: string | null
          risk_notes: string | null
          risk_score: number | null
          roe: number | null
          sovereign_rating: string | null
          ticker: string | null
          trading_currency: string | null
          underlying_currency: string | null
        }
        Relationships: []
      }
      v_top_traders: {
        Row: {
          display_name: string | null
          id: string | null
          last_updated_at: string | null
          profile_image_url: string | null
          total_trades: number | null
          total_volume_usd: number | null
          trader_tier: string | null
          trades_24h: number | null
          username: string | null
          volume_24h: number | null
          wallet_address: string | null
          win_rate: number | null
        }
        Relationships: []
      }
      v_whale_positions: {
        Row: {
          avg_entry_price: number | null
          category: string | null
          current_no_price: number | null
          current_yes_price: number | null
          display_name: string | null
          id: string | null
          last_updated_at: string | null
          outcome: string | null
          question: string | null
          shares_owned: number | null
          unrealized_pnl_usd: number | null
          wallet_address: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _ai_price_per_mtok: {
        Args: { p_model: string }
        Returns: {
          input_price: number
          output_price: number
        }[]
      }
      _norm_host: { Args: { u: string }; Returns: string }
      _url_param: { Args: { p_key: string; p_url: string }; Returns: string }
      aggregate_campaign_stats: {
        Args: { p_date?: string }
        Returns: undefined
      }
      aggregate_daily_salt: { Args: { p_now?: string }; Returns: string }
      aggregate_daily_stats: { Args: { p_date?: string }; Returns: undefined }
      aggregate_geo_clusters: {
        Args: { p_date: string; p_site_id: string; p_zoom: number }
        Returns: undefined
      }
      aggregate_geolocation_stats: {
        Args: { p_date?: string }
        Returns: undefined
      }
      aggregate_retention: { Args: { p_now?: string }; Returns: undefined }
      aggregate_tracking_events: { Args: never; Returns: undefined }
      anonymize_ip: { Args: { ip_address: string }; Returns: string }
      assistant_avg_engagement: {
        Args: {
          p_limit: number
          p_since: string
          p_site_id: string
          p_until: string
          p_url_prefix?: string
        }
        Returns: Json
      }
      assistant_top_exit_pages: {
        Args: {
          p_limit: number
          p_since: string
          p_site_id: string
          p_until: string
        }
        Returns: Json
      }
      assistant_top_pages: {
        Args: {
          p_limit: number
          p_since: string
          p_site_id: string
          p_until: string
          p_url_prefix?: string
        }
        Returns: Json
      }
      assistant_web_vitals: {
        Args: {
          p_limit: number
          p_since: string
          p_site_id: string
          p_until: string
        }
        Returns: Json
      }
      calculate_cohort_retention: { Args: never; Returns: undefined }
      calculate_data_age: { Args: { last_updated: string }; Returns: number }
      calculate_engagement_score: {
        Args: { p_visitor_id: string }
        Returns: number
      }
      calculate_ic: {
        Args: { end_dt: string; model_ver: string; start_dt: string }
        Returns: number
      }
      calculate_next_send_time: {
        Args: {
          p_day_of_month: number
          p_day_of_week: number
          p_frequency: string
          p_time_of_day: string
        }
        Returns: string
      }
      calculate_rfm_scores: {
        Args: { p_visitor_id: string }
        Returns: {
          frequency_score: number
          monetary_score: number
          recency_score: number
          rfm_segment: string
        }[]
      }
      calculate_web_vitals_aggregates: {
        Args: { p_date?: string }
        Returns: undefined
      }
      check_ai_budget: { Args: { p_company_id: string }; Returns: boolean }
      check_rate_limit:
        | {
            Args: { p_api_key_id: string; p_rate_limit: number }
            Returns: boolean
          }
        | {
            Args: { p_key: string; p_max_count: number; p_window_sec?: number }
            Returns: boolean
          }
      classify_trader_tier: { Args: { volume_usd: number }; Returns: string }
      classify_visitor_segments: {
        Args: { p_visitor_id: string }
        Returns: string[]
      }
      cleanup_debug_logs: { Args: never; Returns: undefined }
      cleanup_expired_recordings: { Args: never; Returns: undefined }
      cleanup_old_polymarket_trades: {
        Args: never
        Returns: {
          deleted_count: number
          remaining_count: number
        }[]
      }
      cleanup_old_tracking_data: { Args: never; Returns: undefined }
      cleanup_rate_limit_buckets: { Args: never; Returns: undefined }
      effective_pipeline_mode: {
        Args: { p_company_id: string; p_visitor_country?: string }
        Returns: string
      }
      generate_geoheatmap_density: {
        Args: { p_date: string; p_site_id: string }
        Returns: undefined
      }
      generate_tracking_id: { Args: never; Returns: string }
      get_aggregate_summary: {
        Args: { p_from: string; p_site_id: string; p_to: string }
        Returns: Json
      }
      get_ai_agent_funnel: {
        Args: { p_end_date: string; p_site_id: string; p_start_date: string }
        Returns: {
          drop_off_rate: number
          page_type: string
          sessions_count: number
        }[]
      }
      get_ai_bot_source_breakdown: {
        Args: { p_days?: number; p_site_id: string }
        Returns: Json
      }
      get_ai_bot_tracking:
        | { Args: { p_days?: number; p_site_id: string }; Returns: Json }
        | {
            Args: { p_from: string; p_site_id: string; p_to: string }
            Returns: Json
          }
      get_ai_search_summary: {
        Args: { p_end_date: string; p_site_id: string; p_start_date: string }
        Returns: {
          ai_platform: string
          avg_session_duration: number
          bounce_rate: number
          total_conversions: number
          total_pageviews: number
          total_sessions: number
        }[]
      }
      get_analytics_summary: {
        Args: { p_from: string; p_site_id: string; p_to: string }
        Returns: Json
      }
      get_attribution_gap: {
        Args: { p_days?: number; p_site_id: string }
        Returns: {
          classified_count: number
          cortiq_conversions: number
          hubspot_mqls: number
          pending_upload: number
          unclassified_count: number
          uploaded: number
        }[]
      }
      get_bot_overview: {
        Args: { p_company_id: string; p_from?: string; p_to?: string }
        Returns: {
          avg_confidence: number
          bot_category: string
          bot_name: string
          last_seen: string
          top_countries: Json
          top_pages: Json
          total_requests: number
        }[]
      }
      get_campaign_breakdown: {
        Args: { p_from: string; p_site_id: string; p_to: string }
        Returns: Json
      }
      get_cloudflare_traffic_summary: {
        Args: { p_days?: number; p_site_id: string }
        Returns: Json
      }
      get_content_performance: {
        Args: { p_from: string; p_site_id: string; p_to: string }
        Returns: Json
      }
      get_freshness_emoji: { Args: { last_updated: string }; Returns: string }
      get_freshness_status: { Args: { last_updated: string }; Returns: string }
      get_geo_breakdown: {
        Args: { p_from: string; p_site_id: string; p_to: string }
        Returns: Json
      }
      get_gsc_aggregated: {
        Args: { p_dimension: string; p_limit?: number; p_site_id: string }
        Returns: Json
      }
      get_gsc_monthly: {
        Args: { p_site_id: string; p_year: number }
        Returns: Json
      }
      get_ip_segment_stats: {
        Args: { p_company_id: string; p_from?: string; p_to?: string }
        Returns: {
          conversions: number
          page_views: number
          segment_category: string
          segment_color: string
          segment_name: string
          top_pages: Json
          total_events: number
          unique_sessions: number
        }[]
      }
      get_kpi_monthly:
        | {
            Args: { p_from: string; p_site_id: string; p_to: string }
            Returns: {
              avg_duration: number
              month: string
              page_views: number
              sessions: number
              unique_users: number
            }[]
          }
        | {
            Args: { p_site_id: string; p_year: number }
            Returns: {
              avg_duration: number
              channels: Json
              month: string
              page_views: number
              sessions: number
              unique_users: number
            }[]
          }
      get_latest_predictions: {
        Args: { limit_count?: number }
        Returns: {
          confidence_score: number
          predicted_return_5d: number
          prediction_date: string
          signal_score: number
          signal_strength: string
          ticker: string
          top_factors: Json
        }[]
      }
      get_lead_quality_pipeline: {
        Args: { p_days?: number; p_site_id: string }
        Returns: {
          challenge_count: number
          failed: number
          last_upload_at: string
          pending: number
          priority_count: number
          qualified_count: number
          skipped_no_consent: number
          skipped_no_gclid: number
          total_classified: number
          uploaded: number
        }[]
      }
      get_navigation_flow: {
        Args: { p_from: string; p_site_id: string; p_to: string }
        Returns: Json
      }
      get_overview_metrics: {
        Args: {
          p_from: string
          p_path?: string
          p_segment?: Json
          p_site_id: string
          p_to: string
        }
        Returns: Json
      }
      get_realtime_stats: { Args: { p_site_id: string }; Returns: Json }
      get_segment_visitors: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_segment_key: string
          p_site_id: string
        }
        Returns: {
          engagement_score: number
          last_seen_at: string
          total_conversions: number
          total_sessions: number
          visitor_id: string
          visitor_type: string
        }[]
      }
      get_sentrisk_dashboard: {
        Args: { p_from: string; p_site_id: string; p_to: string }
        Returns: Json
      }
      get_site_cookie_summary: {
        Args: { p_site_id: string }
        Returns: {
          category: string
          cookie_count: number
          script_count: number
        }[]
      }
      get_social_daily: {
        Args: { p_from: string; p_site_id: string; p_to: string }
        Returns: Json
      }
      get_social_monthly: {
        Args: { p_site_id: string; p_year: number }
        Returns: {
          avg_duration: number
          bounces: number
          month: string
          page_views: number
          referrer: string
          sessions: number
          unique_users: number
          utm_campaign: string
          utm_medium: string
          utm_source: string
        }[]
      }
      get_top_pages: {
        Args: { p_limit?: number; p_site_id: string }
        Returns: Json
      }
      get_visitor_profile: {
        Args: { p_visitor_id: string }
        Returns: {
          ai_agent_type: string
          country_code: string
          engagement_score: number
          first_referrer: string
          first_seen_at: string
          first_utm_source: string
          frequency_score: number
          last_referrer: string
          last_seen_at: string
          primary_browser: string
          primary_device_type: string
          primary_segment: string
          recency_score: number
          rfm_segment: string
          segments: string[]
          site_id: string
          total_conversions: number
          total_pageviews: number
          total_sessions: number
          visitor_fingerprint: string
          visitor_id: string
          visitor_type: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_heatmap_grid_intensity: {
        Args: {
          p_date: string
          p_device_type: string
          p_grid_x: number
          p_grid_y: number
          p_site_id: string
          p_type: string
          p_url: string
          p_viewport_height?: number
          p_viewport_width?: number
        }
        Returns: undefined
      }
      increment_heatmap_intensity: {
        Args: {
          p_date: string
          p_device_type: string
          p_site_id: string
          p_type: string
          p_url: string
          p_x: number
          p_y: number
        }
        Returns: undefined
      }
      increment_link_click: {
        Args: {
          p_day: string
          p_device_type: string
          p_link_key: string
          p_link_kind: string
          p_link_label: string
          p_page_path: string
          p_site_id: string
        }
        Returns: undefined
      }
      increment_navigation_clicks: {
        Args: {
          p_date: string
          p_device_type: string
          p_menu_item_id: number
          p_menu_title: string
          p_menu_url: string
          p_site_id: string
        }
        Returns: undefined
      }
      increment_server_log_analytics: {
        Args: {
          p_browser: string
          p_country_code: string
          p_date: string
          p_device_type: string
          p_load_time_ms: number
          p_referrer_domain: string
          p_site_id: string
          p_status_code: number
          p_url: string
        }
        Returns: undefined
      }
      ingest_aggregate_hit: {
        Args: {
          p_device: string
          p_goal_id: string
          p_goal_name: string
          p_hash: string
          p_kind: string
          p_now?: string
          p_path: string
          p_referrer_domain: string
          p_site_id: string
          p_utm_campaign: string
          p_utm_medium: string
          p_utm_source: string
          p_value: number
        }
        Returns: boolean
      }
      ingest_pageview: {
        Args: {
          p_country?: string
          p_device: string
          p_referrer: string
          p_session: string
          p_url: string
          p_viewed_at: string
        }
        Returns: undefined
      }
      is_org_admin: { Args: { org_id: string }; Returns: boolean }
      is_org_member: {
        Args: {
          min_role?: Database["public"]["Enums"]["org_role"]
          org_id: string
        }
        Returns: boolean
      }
      link_session_to_visitor: {
        Args: {
          p_duration_seconds?: number
          p_events?: number
          p_had_conversion?: boolean
          p_pageviews?: number
          p_session_id: string
          p_session_type: string
          p_site_id: string
          p_visitor_id: string
        }
        Returns: string
      }
      log_api_usage: {
        Args: {
          p_api_key_id: string
          p_endpoint: string
          p_method: string
          p_request_ip: string
          p_response_time_ms: number
          p_status_code: number
          p_user_agent: string
        }
        Returns: undefined
      }
      log_security_event: {
        Args: {
          p_action: string
          p_details?: Json
          p_resource_id?: string
          p_resource_type: string
          p_severity?: string
        }
        Returns: undefined
      }
      log_warehouse_audit: {
        Args: {
          p_action: string
          p_changes?: Json
          p_connector_id: string
          p_description: string
        }
        Returns: undefined
      }
      match_bot: {
        Args: { p_ip?: string; p_user_agent?: string }
        Returns: {
          bot_catalog_id: string
          bot_category: string
          bot_display_name: string
          bot_name: string
          confidence: number
          detection_method: string
        }[]
      }
      match_ip_segment: {
        Args: { p_company_id: string; p_ip: string }
        Returns: {
          intranet_mode: boolean
          segment_category: string
          segment_color: string
          segment_id: string
          segment_name: string
        }[]
      }
      record_ai_usage: {
        Args: {
          p_company_id: string
          p_est_cost_usd?: number
          p_function: string
          p_input_tokens: number
          p_model: string
          p_output_tokens: number
          p_site_id: string
        }
        Returns: undefined
      }
      record_content_metrics: {
        Args: { p_items: Json; p_site_id: string }
        Returns: number
      }
      record_conversion_event: {
        Args: {
          p_event_name: string
          p_event_type: string
          p_selector: string
          p_session: string
          p_site_id: string
          p_value: number
        }
        Returns: boolean
      }
      record_form_session: {
        Args: {
          p_device_type: string
          p_duration_seconds: number
          p_error_count: number
          p_fields_completed: number
          p_form_id: string
          p_form_name: string
          p_form_type: string
          p_session_id: string
          p_site_id: string
          p_status: string
          p_total_fields: number
        }
        Returns: undefined
      }
      refresh_analytics_views: { Args: never; Returns: undefined }
      resolve_site_by_domain: { Args: { p_url: string }; Returns: string }
      run_bot_detection_retention: { Args: never; Returns: Json }
      run_canary_retention: { Args: never; Returns: Json }
      run_data_retention: { Args: never; Returns: Json }
      schedule_warehouse_sync: {
        Args: {
          p_connector_id: string
          p_job_type: string
          p_sync_from?: string
          p_sync_to?: string
        }
        Returns: string
      }
      should_rotate_session: {
        Args: { p_session_id: string; p_site_id: string }
        Returns: boolean
      }
      test_warehouse_connection: {
        Args: { p_connector_id: string }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      tracking_check_claim_tasks: {
        Args: { p_kind: string; p_limit: number }
        Returns: {
          attempts: number
          claimed_at: string | null
          created_at: string
          error: string | null
          id: string
          kind: string
          legacy: boolean
          path: string
          run_id: string
          site_role: string
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tracking_check_tasks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      tracking_check_recover_stale: {
        Args: { p_seconds: number }
        Returns: undefined
      }
      tracking_check_retention: { Args: never; Returns: undefined }
      tracking_check_runs_to_finalize: { Args: never; Returns: string[] }
      update_content_performance: { Args: never; Returns: undefined }
      update_visitor_metrics: {
        Args: { p_visitor_id: string }
        Returns: undefined
      }
      upsert_ai_agent_session: {
        Args: {
          p_asset_type?: string
          p_bot_name: string
          p_bot_type: string
          p_is_asset?: boolean
          p_is_visual_browser?: boolean
          p_session_id: string
          p_site_id: string
          p_url: string
        }
        Returns: string
      }
      upsert_bot_hourly_stats: {
        Args: {
          p_bot_category: string
          p_bot_name: string
          p_company_id: string
        }
        Returns: undefined
      }
      upsert_unified_visitor: {
        Args: {
          p_ai_agent_type?: string
          p_browser?: string
          p_country_code?: string
          p_device_type?: string
          p_os?: string
          p_referrer?: string
          p_session_id: string
          p_site_id: string
          p_utm_campaign?: string
          p_utm_medium?: string
          p_utm_source?: string
          p_visitor_fingerprint: string
          p_visitor_type?: string
        }
        Returns: string
      }
      upsert_user_identity: {
        Args: {
          p_revenue: number
          p_session_id: string
          p_site_id: string
          p_user_hash: string
        }
        Returns: undefined
      }
      validate_api_key: {
        Args: { p_key_hash: string }
        Returns: {
          api_key_id: string
          company_id: string
          permissions: string[]
          rate_limit: number
          site_id: string
        }[]
      }
      validate_consent_for_tracking: {
        Args: {
          p_consent_type: string
          p_session_id: string
          p_site_id: string
        }
        Returns: boolean
      }
      validate_email: { Args: { email_input: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      org_role: "owner" | "admin" | "member" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      org_role: ["owner", "admin", "member", "viewer"],
    },
  },
} as const
