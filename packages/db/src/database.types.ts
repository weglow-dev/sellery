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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      brand_grade_tiers: {
        Row: {
          created_at: string
          fee_discount: number
          free_ref_per_month: number
          min_gmv: number
          name: string
          perk: string | null
          sort_order: number
          top_pct: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          fee_discount?: number
          free_ref_per_month?: number
          min_gmv: number
          name: string
          perk?: string | null
          sort_order: number
          top_pct: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          fee_discount?: number
          free_ref_per_month?: number
          min_gmv?: number
          name?: string
          perk?: string | null
          sort_order?: number
          top_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      brands: {
        Row: {
          active: boolean
          auto_propose: boolean
          bank_info: Json | null
          biz_doc_url: string | null
          biz_no: string | null
          category: string
          code: string | null
          created_at: string
          email: string | null
          free_ref_used: Json
          gmv_base: number
          grade: string | null
          id: string
          logo_url: string | null
          mail_order_no: string | null
          manager_name: string | null
          manager_phone: string | null
          name: string
          po_email: string | null
          po_enabled: boolean
          ref_code: string | null
          referred_by: string | null
          terms_agreed_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          auto_propose?: boolean
          bank_info?: Json | null
          biz_doc_url?: string | null
          biz_no?: string | null
          category?: string
          code?: string | null
          created_at?: string
          email?: string | null
          free_ref_used?: Json
          gmv_base?: number
          grade?: string | null
          id?: string
          logo_url?: string | null
          mail_order_no?: string | null
          manager_name?: string | null
          manager_phone?: string | null
          name: string
          po_email?: string | null
          po_enabled?: boolean
          ref_code?: string | null
          referred_by?: string | null
          terms_agreed_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          auto_propose?: boolean
          bank_info?: Json | null
          biz_doc_url?: string | null
          biz_no?: string | null
          category?: string
          code?: string | null
          created_at?: string
          email?: string | null
          free_ref_used?: Json
          gmv_base?: number
          grade?: string | null
          id?: string
          logo_url?: string | null
          mail_order_no?: string | null
          manager_name?: string | null
          manager_phone?: string | null
          name?: string
          po_email?: string | null
          po_enabled?: boolean
          ref_code?: string | null
          referred_by?: string | null
          terms_agreed_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brands_grade_fkey"
            columns: ["grade"]
            isOneToOne: false
            referencedRelation: "brand_grade_tiers"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "brands_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_events: {
        Row: {
          actor_role: string | null
          actor_user_id: string | null
          body: string
          campaign_id: string
          created_at: string
          event_type: string | null
          id: string
          kind: string
          leak_flag: boolean
          payload: Json
          sender: string
        }
        Insert: {
          actor_role?: string | null
          actor_user_id?: string | null
          body: string
          campaign_id: string
          created_at?: string
          event_type?: string | null
          id?: string
          kind: string
          leak_flag?: boolean
          payload?: Json
          sender?: string
        }
        Update: {
          actor_role?: string | null
          actor_user_id?: string | null
          body?: string
          campaign_id?: string
          created_at?: string
          event_type?: string | null
          id?: string
          kind?: string
          leak_flag?: boolean
          payload?: Json
          sender?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          auto_proposed: boolean
          brand_id: string
          cel_refunded: number
          cel_used: number
          code: string
          created_at: string
          decision_reason: string | null
          end_date: string | null
          home_featured_at: string | null
          id: string
          invited: boolean
          po_exported_at: string | null
          price_locked: number | null
          product_id: string
          proposed_end: string | null
          proposed_qty: number | null
          proposed_start: string | null
          purchased: boolean
          qty: number
          rate_locked: number | null
          received_at: string | null
          regongu: boolean
          sample_cash: number
          sample_cel: number
          sample_courier: string | null
          sample_method: string | null
          sample_price: number | null
          sample_refunded: boolean
          sample_shipped_at: string | null
          sample_shipping: Json | null
          seller_id: string
          settled_at: string | null
          sold_qty: number
          start_date: string | null
          status: string
          test_due: string | null
          tracking_no: string | null
          updated_at: string
        }
        Insert: {
          auto_proposed?: boolean
          brand_id: string
          cel_refunded?: number
          cel_used?: number
          code?: string
          created_at?: string
          decision_reason?: string | null
          end_date?: string | null
          home_featured_at?: string | null
          id?: string
          invited?: boolean
          po_exported_at?: string | null
          price_locked?: number | null
          product_id: string
          proposed_end?: string | null
          proposed_qty?: number | null
          proposed_start?: string | null
          purchased?: boolean
          qty?: number
          rate_locked?: number | null
          received_at?: string | null
          regongu?: boolean
          sample_cash?: number
          sample_cel?: number
          sample_courier?: string | null
          sample_method?: string | null
          sample_price?: number | null
          sample_refunded?: boolean
          sample_shipped_at?: string | null
          sample_shipping?: Json | null
          seller_id: string
          settled_at?: string | null
          sold_qty?: number
          start_date?: string | null
          status?: string
          test_due?: string | null
          tracking_no?: string | null
          updated_at?: string
        }
        Update: {
          auto_proposed?: boolean
          brand_id?: string
          cel_refunded?: number
          cel_used?: number
          code?: string
          created_at?: string
          decision_reason?: string | null
          end_date?: string | null
          home_featured_at?: string | null
          id?: string
          invited?: boolean
          po_exported_at?: string | null
          price_locked?: number | null
          product_id?: string
          proposed_end?: string | null
          proposed_qty?: number | null
          proposed_start?: string | null
          purchased?: boolean
          qty?: number
          rate_locked?: number | null
          received_at?: string | null
          regongu?: boolean
          sample_cash?: number
          sample_cel?: number
          sample_courier?: string | null
          sample_method?: string | null
          sample_price?: number | null
          sample_refunded?: boolean
          sample_shipped_at?: string | null
          sample_shipping?: Json | null
          seller_id?: string
          settled_at?: string | null
          sold_qty?: number
          start_date?: string | null
          status?: string
          test_due?: string | null
          tracking_no?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          examples: string | null
          group_name: string
          name: string
          name_en: string | null
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          examples?: string | null
          group_name: string
          name: string
          name_en?: string | null
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          examples?: string | null
          group_name?: string
          name?: string
          name_en?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      celery_ledger: {
        Row: {
          brand_id: string | null
          created_at: string
          delta: number
          id: string
          memo: string | null
          owner_type: string
          reason: string
          ref_id: string | null
          ref_type: string | null
          seller_id: string | null
          won: number | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          delta: number
          id?: string
          memo?: string | null
          owner_type: string
          reason: string
          ref_id?: string | null
          ref_type?: string | null
          seller_id?: string | null
          won?: number | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          delta?: number
          id?: string
          memo?: string | null
          owner_type?: string
          reason?: string
          ref_id?: string | null
          ref_type?: string | null
          seller_id?: string | null
          won?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "celery_ledger_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "celery_ledger_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      celery_purchases: {
        Row: {
          brand_id: string | null
          created_at: string
          expires_on: string | null
          id: string
          item_id: string
          ledger_id: string | null
          owner_type: string
          price_cel: number
          product_id: string | null
          purchased_on: string
          seller_id: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          expires_on?: string | null
          id?: string
          item_id: string
          ledger_id?: string | null
          owner_type: string
          price_cel: number
          product_id?: string | null
          purchased_on?: string
          seller_id?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          expires_on?: string | null
          id?: string
          item_id?: string
          ledger_id?: string | null
          owner_type?: string
          price_cel?: number
          product_id?: string | null
          purchased_on?: string
          seller_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "celery_purchases_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "celery_purchases_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "celery_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "celery_purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "celery_purchases_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_sessions: {
        Row: {
          amount: number | null
          approved_at: string | null
          buyer_email: string | null
          buyer_name: string
          buyer_phone: string | null
          campaign_id: string
          created_at: string
          customer_id: string | null
          expires_at: string
          fail_code: string | null
          fail_message: string | null
          id: string
          link_code: string | null
          option_index: number | null
          option_name: string
          order_name: string
          payment_key: string | null
          payment_method: string | null
          qty: number
          raw_payment: Json | null
          shipping: Json
          status: string
          toss_order_id: string
          unit_price: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          approved_at?: string | null
          buyer_email?: string | null
          buyer_name: string
          buyer_phone?: string | null
          campaign_id: string
          created_at?: string
          customer_id?: string | null
          expires_at?: string
          fail_code?: string | null
          fail_message?: string | null
          id?: string
          link_code?: string | null
          option_index?: number | null
          option_name: string
          order_name: string
          payment_key?: string | null
          payment_method?: string | null
          qty: number
          raw_payment?: Json | null
          shipping: Json
          status?: string
          toss_order_id: string
          unit_price: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          approved_at?: string | null
          buyer_email?: string | null
          buyer_name?: string
          buyer_phone?: string | null
          campaign_id?: string
          created_at?: string
          customer_id?: string | null
          expires_at?: string
          fail_code?: string | null
          fail_message?: string | null
          id?: string
          link_code?: string | null
          option_index?: number | null
          option_name?: string
          order_name?: string
          payment_key?: string | null
          payment_method?: string | null
          qty?: number
          raw_payment?: Json | null
          shipping?: Json
          status?: string
          toss_order_id?: string
          unit_price?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkout_sessions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_conversations: {
        Row: {
          brand_id: string
          buyer_name: string
          campaign_id: string
          client_token: string
          closed_at: string | null
          code: string
          created_at: string
          customer_id: string | null
          id: string
          last_message_at: string
          last_preview: string | null
          order_code: string | null
          order_id: string | null
          replied_at: string | null
          status: string
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          brand_id: string
          buyer_name?: string
          campaign_id: string
          client_token?: string
          closed_at?: string | null
          code?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          last_message_at?: string
          last_preview?: string | null
          order_code?: string | null
          order_id?: string | null
          replied_at?: string | null
          status?: string
          type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          brand_id?: string
          buyer_name?: string
          campaign_id?: string
          client_token?: string
          closed_at?: string | null
          code?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          last_message_at?: string
          last_preview?: string | null
          order_code?: string | null
          order_id?: string | null
          replied_at?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cs_conversations_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_conversations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_messages: {
        Row: {
          actor_role: string
          actor_user_id: string | null
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender: string
        }
        Insert: {
          actor_role: string
          actor_user_id?: string | null
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender: string
        }
        Update: {
          actor_role?: string
          actor_user_id?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cs_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: Json | null
          created_at: string
          email: string | null
          id: string
          name: string | null
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: Json | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: Json | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      data_views: {
        Row: {
          brand_id: string
          free: boolean
          id: string
          kind: string
          ledger_id: string | null
          price_cel: number
          seller_id: string
          viewed_at: string
        }
        Insert: {
          brand_id: string
          free?: boolean
          id?: string
          kind: string
          ledger_id?: string | null
          price_cel?: number
          seller_id: string
          viewed_at?: string
        }
        Update: {
          brand_id?: string
          free?: boolean
          id?: string
          kind?: string
          ledger_id?: string | null
          price_cel?: number
          seller_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_views_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_views_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "celery_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_views_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      exclusive_requests: {
        Row: {
          code: string | null
          created_at: string
          decided_at: string | null
          id: string
          product_id: string
          seller_id: string
          status: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          product_id: string
          seller_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          product_id?: string
          seller_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exclusive_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exclusive_requests_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_tiers: {
        Row: {
          bonus_pp: number
          created_at: string
          data_price_cel: number
          invite_cost_cel: number
          is_priority: boolean
          min_m3_sales: number
          name: string
          perk: string | null
          sample_quota: number
          sort_order: number
          top_pct: number
          updated_at: string
        }
        Insert: {
          bonus_pp?: number
          created_at?: string
          data_price_cel: number
          invite_cost_cel?: number
          is_priority?: boolean
          min_m3_sales: number
          name: string
          perk?: string | null
          sample_quota: number
          sort_order: number
          top_pct: number
          updated_at?: string
        }
        Update: {
          bonus_pp?: number
          created_at?: string
          data_price_cel?: number
          invite_cost_cel?: number
          is_priority?: boolean
          min_m3_sales?: number
          name?: string
          perk?: string | null
          sample_quota?: number
          sort_order?: number
          top_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount: number | null
          buyer_email: string | null
          buyer_name: string
          buyer_phone: string | null
          campaign_id: string
          checkout_session_id: string | null
          code: string
          courier: string | null
          created_at: string
          customer_id: string | null
          id: string
          is_sample: boolean
          option_name: string | null
          order_name: string | null
          paid_at: string
          payment_key: string | null
          payment_method: string | null
          qty: number
          raw_cancel: Json | null
          raw_payment: Json | null
          refund_actor: string | null
          refund_amount: number | null
          refund_reason: string | null
          refunded_at: string | null
          shipped_at: string | null
          shipping: Json | null
          status: string
          tracking_no: string | null
          unit_price: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          buyer_email?: string | null
          buyer_name: string
          buyer_phone?: string | null
          campaign_id: string
          checkout_session_id?: string | null
          code?: string
          courier?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          is_sample?: boolean
          option_name?: string | null
          order_name?: string | null
          paid_at?: string
          payment_key?: string | null
          payment_method?: string | null
          qty: number
          raw_cancel?: Json | null
          raw_payment?: Json | null
          refund_actor?: string | null
          refund_amount?: number | null
          refund_reason?: string | null
          refunded_at?: string | null
          shipped_at?: string | null
          shipping?: Json | null
          status?: string
          tracking_no?: string | null
          unit_price: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          buyer_email?: string | null
          buyer_name?: string
          buyer_phone?: string | null
          campaign_id?: string
          checkout_session_id?: string | null
          code?: string
          courier?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          is_sample?: boolean
          option_name?: string | null
          order_name?: string | null
          paid_at?: string
          payment_key?: string | null
          payment_method?: string | null
          qty?: number
          raw_cancel?: Json | null
          raw_payment?: Json | null
          refund_actor?: string | null
          refund_amount?: number | null
          refund_reason?: string | null
          refunded_at?: string | null
          shipped_at?: string | null
          shipping?: Json | null
          status?: string
          tracking_no?: string | null
          unit_price?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_checkout_session_id_fkey"
            columns: ["checkout_session_id"]
            isOneToOne: false
            referencedRelation: "checkout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_payments: {
        Row: {
          amount_cash: number
          amount_cel: number
          amount_total: number
          approved_at: string | null
          brand_id: string | null
          campaign_id: string | null
          cel_won: number
          created_at: string
          expires_at: string
          fail_code: string | null
          fail_message: string | null
          id: string
          kind: string
          order_name: string
          owner_type: string
          payment_key: string | null
          payment_method: string | null
          product_id: string | null
          quote: Json | null
          raw_cancel: Json | null
          raw_payment: Json | null
          refunded_at: string | null
          seller_id: string | null
          shipping: Json
          status: string
          toss_order_id: string
          updated_at: string
          use_cel: boolean
          user_id: string | null
        }
        Insert: {
          amount_cash: number
          amount_cel?: number
          amount_total: number
          approved_at?: string | null
          brand_id?: string | null
          campaign_id?: string | null
          cel_won?: number
          created_at?: string
          expires_at?: string
          fail_code?: string | null
          fail_message?: string | null
          id?: string
          kind?: string
          order_name: string
          owner_type?: string
          payment_key?: string | null
          payment_method?: string | null
          product_id?: string | null
          quote?: Json | null
          raw_cancel?: Json | null
          raw_payment?: Json | null
          refunded_at?: string | null
          seller_id?: string | null
          shipping: Json
          status?: string
          toss_order_id: string
          updated_at?: string
          use_cel?: boolean
          user_id?: string | null
        }
        Update: {
          amount_cash?: number
          amount_cel?: number
          amount_total?: number
          approved_at?: string | null
          brand_id?: string | null
          campaign_id?: string | null
          cel_won?: number
          created_at?: string
          expires_at?: string
          fail_code?: string | null
          fail_message?: string | null
          id?: string
          kind?: string
          order_name?: string
          owner_type?: string
          payment_key?: string | null
          payment_method?: string | null
          product_id?: string | null
          quote?: Json | null
          raw_cancel?: Json | null
          raw_payment?: Json | null
          refunded_at?: string | null
          seller_id?: string | null
          shipping?: Json
          status?: string
          toss_order_id?: string
          updated_at?: string
          use_cel?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_payments_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_payments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_payments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_payments_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          event_type: string | null
          handled: boolean
          id: string
          payload: Json
          payment_key: string | null
          received_at: string
          result: string | null
          source: string
          toss_order_id: string | null
        }
        Insert: {
          event_type?: string | null
          handled?: boolean
          id?: string
          payload: Json
          payment_key?: string | null
          received_at?: string
          result?: string | null
          source?: string
          toss_order_id?: string | null
        }
        Update: {
          event_type?: string | null
          handled?: boolean
          id?: string
          payload?: Json
          payment_key?: string | null
          received_at?: string
          result?: string | null
          source?: string
          toss_order_id?: string | null
        }
        Relationships: []
      }
      payouts: {
        Row: {
          amount: number
          bank_snapshot: Json | null
          brand_id: string | null
          created_at: string
          hold_reason: string | null
          id: string
          memo: string | null
          paid_at: string | null
          payee_type: string
          seller_id: string | null
          settlement_id: string
          status: string
          updated_at: string
          wht: number
        }
        Insert: {
          amount: number
          bank_snapshot?: Json | null
          brand_id?: string | null
          created_at?: string
          hold_reason?: string | null
          id?: string
          memo?: string | null
          paid_at?: string | null
          payee_type: string
          seller_id?: string | null
          settlement_id: string
          status?: string
          updated_at?: string
          wht?: number
        }
        Update: {
          amount?: number
          bank_snapshot?: Json | null
          brand_id?: string | null
          created_at?: string
          hold_reason?: string | null
          id?: string
          memo?: string | null
          paid_at?: string | null
          payee_type?: string
          seller_id?: string | null
          settlement_id?: string
          status?: string
          updated_at?: string
          wht?: number
        }
        Relationships: [
          {
            foreignKeyName: "payouts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      product_views: {
        Row: {
          id: string
          product_id: string
          seller_id: string
          viewed_at: string
        }
        Insert: {
          id?: string
          product_id: string
          seller_id: string
          viewed_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          seller_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_views_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_views_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          boosted_at: string | null
          brand_id: string
          category: string
          code: string | null
          commission_rate: number
          consumer_price: number
          created_at: string
          deleted_at: string | null
          description: string | null
          emoji: string
          exclusive_grade: string | null
          exclusive_label: string | null
          exclusive_seller_id: string | null
          id: string
          image_urls: string[]
          name: string
          options: Json
          reject_reason: string | null
          sale_price: number
          sample_buy_mode: string | null
          sample_fixed_price: number | null
          sample_free_grade: string | null
          sample_refund: boolean | null
          sample_text: string | null
          status: string
          stock: number
          thumb_url: string | null
          trend: Json | null
          updated_at: string
        }
        Insert: {
          boosted_at?: string | null
          brand_id: string
          category: string
          code?: string | null
          commission_rate: number
          consumer_price: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          emoji?: string
          exclusive_grade?: string | null
          exclusive_label?: string | null
          exclusive_seller_id?: string | null
          id?: string
          image_urls?: string[]
          name: string
          options?: Json
          reject_reason?: string | null
          sale_price: number
          sample_buy_mode?: string | null
          sample_fixed_price?: number | null
          sample_free_grade?: string | null
          sample_refund?: boolean | null
          sample_text?: string | null
          status?: string
          stock?: number
          thumb_url?: string | null
          trend?: Json | null
          updated_at?: string
        }
        Update: {
          boosted_at?: string | null
          brand_id?: string
          category?: string
          code?: string | null
          commission_rate?: number
          consumer_price?: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          emoji?: string
          exclusive_grade?: string | null
          exclusive_label?: string | null
          exclusive_seller_id?: string | null
          id?: string
          image_urls?: string[]
          name?: string
          options?: Json
          reject_reason?: string | null
          sale_price?: number
          sample_buy_mode?: string | null
          sample_fixed_price?: number | null
          sample_free_grade?: string | null
          sample_refund?: boolean | null
          sample_text?: string | null
          status?: string
          stock?: number
          thumb_url?: string | null
          trend?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "products_exclusive_grade_fkey"
            columns: ["exclusive_grade"]
            isOneToOne: false
            referencedRelation: "grade_tiers"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "products_exclusive_seller_id_fkey"
            columns: ["exclusive_seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_sample_free_grade_fkey"
            columns: ["sample_free_grade"]
            isOneToOne: false
            referencedRelation: "grade_tiers"
            referencedColumns: ["name"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      referral_earnings: {
        Row: {
          amount: number
          campaign_id: string | null
          created_at: string
          earned_on: string
          id: string
          memo: string | null
          rate: number
          referred_brand_id: string | null
          referred_seller_id: string | null
          referrer_brand_id: string | null
          referrer_seller_id: string | null
          settlement_id: string | null
          side: string
        }
        Insert: {
          amount: number
          campaign_id?: string | null
          created_at?: string
          earned_on?: string
          id?: string
          memo?: string | null
          rate: number
          referred_brand_id?: string | null
          referred_seller_id?: string | null
          referrer_brand_id?: string | null
          referrer_seller_id?: string | null
          settlement_id?: string | null
          side: string
        }
        Update: {
          amount?: number
          campaign_id?: string | null
          created_at?: string
          earned_on?: string
          id?: string
          memo?: string | null
          rate?: number
          referred_brand_id?: string | null
          referred_seller_id?: string | null
          referrer_brand_id?: string | null
          referrer_seller_id?: string | null
          settlement_id?: string | null
          side?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_earnings_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_earnings_referred_brand_id_fkey"
            columns: ["referred_brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_earnings_referred_seller_id_fkey"
            columns: ["referred_seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_earnings_referrer_brand_id_fkey"
            columns: ["referrer_brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_earnings_referrer_seller_id_fkey"
            columns: ["referrer_seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_earnings_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_channels: {
        Row: {
          code: string | null
          created_at: string
          followers: number
          handle: string
          id: string
          is_primary: boolean
          platform: string
          seller_id: string
          updated_at: string
          url: string | null
          vcode: string | null
          vcode_confirmed_at: string | null
          verified: boolean
        }
        Insert: {
          code?: string | null
          created_at?: string
          followers?: number
          handle: string
          id?: string
          is_primary?: boolean
          platform: string
          seller_id: string
          updated_at?: string
          url?: string | null
          vcode?: string | null
          vcode_confirmed_at?: string | null
          verified?: boolean
        }
        Update: {
          code?: string | null
          created_at?: string
          followers?: number
          handle?: string
          id?: string
          is_primary?: boolean
          platform?: string
          seller_id?: string
          updated_at?: string
          url?: string | null
          vcode?: string | null
          vcode_confirmed_at?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "seller_channels_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_external_sales: {
        Row: {
          brand_name: string | null
          created_at: string
          id: string
          price: number
          product_name: string
          seen_on: string
          seller_id: string
          source: string
        }
        Insert: {
          brand_name?: string | null
          created_at?: string
          id?: string
          price?: number
          product_name: string
          seen_on?: string
          seller_id: string
          source: string
        }
        Update: {
          brand_name?: string | null
          created_at?: string
          id?: string
          price?: number
          product_name?: string
          seen_on?: string
          seller_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_external_sales_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      sellers: {
        Row: {
          active: boolean
          avatar_url: string | null
          bank_info: Json | null
          biz_doc_url: string | null
          biz_no: string | null
          category: string | null
          code: string | null
          created_at: string
          email: string | null
          followers: number
          grade: string | null
          handle: string
          hidden: boolean
          id: string
          intro: string | null
          likes_avg: number
          m3_sales: number
          name: string
          platform: string
          recent_likes: number[]
          ref_code: string | null
          referred_by: string | null
          rrn_enc: string | null
          rrn_mask: string | null
          rrn_set_at: string | null
          sample_address: Json | null
          sample_extra: number
          settle_type: string | null
          tax_info: Json | null
          terms_agreed_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          bank_info?: Json | null
          biz_doc_url?: string | null
          biz_no?: string | null
          category?: string | null
          code?: string | null
          created_at?: string
          email?: string | null
          followers?: number
          grade?: string | null
          handle: string
          hidden?: boolean
          id?: string
          intro?: string | null
          likes_avg?: number
          m3_sales?: number
          name: string
          platform?: string
          recent_likes?: number[]
          ref_code?: string | null
          referred_by?: string | null
          rrn_enc?: string | null
          rrn_mask?: string | null
          rrn_set_at?: string | null
          sample_address?: Json | null
          sample_extra?: number
          settle_type?: string | null
          tax_info?: Json | null
          terms_agreed_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          bank_info?: Json | null
          biz_doc_url?: string | null
          biz_no?: string | null
          category?: string | null
          code?: string | null
          created_at?: string
          email?: string | null
          followers?: number
          grade?: string | null
          handle?: string
          hidden?: boolean
          id?: string
          intro?: string | null
          likes_avg?: number
          m3_sales?: number
          name?: string
          platform?: string
          recent_likes?: number[]
          ref_code?: string | null
          referred_by?: string | null
          rrn_enc?: string | null
          rrn_mask?: string | null
          rrn_set_at?: string | null
          sample_address?: Json | null
          sample_extra?: number
          settle_type?: string | null
          tax_info?: Json | null
          terms_agreed_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sellers_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "sellers_grade_fkey"
            columns: ["grade"]
            isOneToOne: false
            referencedRelation: "grade_tiers"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "sellers_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      sensitive_access_log: {
        Row: {
          actor: string
          at: string
          field: string
          id: number
          purpose: string
          seller_id: string | null
        }
        Insert: {
          actor: string
          at?: string
          field: string
          id?: never
          purpose: string
          seller_id?: string | null
        }
        Update: {
          actor?: string
          at?: string
          field?: string
          id?: never
          purpose?: string
          seller_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sensitive_access_log_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          brand_discount: number
          brand_discount_rate: number
          brand_grade: string | null
          brand_payout: number
          brand_ref_applied: boolean
          brand_ref_boost: number
          brand_ref_disc_rate: number
          brand_ref_reward: number
          brand_ref_reward_rate: number
          campaign_id: string
          created_at: string
          due_on: string | null
          gross: number
          hold_brand: boolean
          hold_seller: boolean
          id: string
          memo: string | null
          net: number
          paid_at: string | null
          paid_count: number
          pg_fee: number
          pg_rate: number
          platform_fee: number
          platform_fee_gross: number
          platform_net: number
          platform_rate: number
          ref_boost: number
          ref_boost_applied: boolean
          ref_boost_rate: number
          ref_reward: number
          ref_reward_rate: number
          refund_count: number
          refunds: number
          sample_cel_cover: number
          sample_net: number
          sample_refund_cash: number
          sample_refund_cel: number
          seller_bonus: number
          seller_bonus_pp: number
          seller_fee: number
          seller_fee_total: number
          seller_grade: string | null
          seller_payout: number
          seller_rate: number
          seller_wht: number
          settled_at: string
          status: string
          title: string | null
          updated_at: string
          vat: number
          wht_rate: number
        }
        Insert: {
          brand_discount?: number
          brand_discount_rate?: number
          brand_grade?: string | null
          brand_payout?: number
          brand_ref_applied?: boolean
          brand_ref_boost?: number
          brand_ref_disc_rate?: number
          brand_ref_reward?: number
          brand_ref_reward_rate?: number
          campaign_id: string
          created_at?: string
          due_on?: string | null
          gross?: number
          hold_brand?: boolean
          hold_seller?: boolean
          id?: string
          memo?: string | null
          net?: number
          paid_at?: string | null
          paid_count?: number
          pg_fee?: number
          pg_rate: number
          platform_fee?: number
          platform_fee_gross?: number
          platform_net?: number
          platform_rate: number
          ref_boost?: number
          ref_boost_applied?: boolean
          ref_boost_rate?: number
          ref_reward?: number
          ref_reward_rate?: number
          refund_count?: number
          refunds?: number
          sample_cel_cover?: number
          sample_net?: number
          sample_refund_cash?: number
          sample_refund_cel?: number
          seller_bonus?: number
          seller_bonus_pp?: number
          seller_fee?: number
          seller_fee_total?: number
          seller_grade?: string | null
          seller_payout?: number
          seller_rate: number
          seller_wht?: number
          settled_at?: string
          status?: string
          title?: string | null
          updated_at?: string
          vat?: number
          wht_rate?: number
        }
        Update: {
          brand_discount?: number
          brand_discount_rate?: number
          brand_grade?: string | null
          brand_payout?: number
          brand_ref_applied?: boolean
          brand_ref_boost?: number
          brand_ref_disc_rate?: number
          brand_ref_reward?: number
          brand_ref_reward_rate?: number
          campaign_id?: string
          created_at?: string
          due_on?: string | null
          gross?: number
          hold_brand?: boolean
          hold_seller?: boolean
          id?: string
          memo?: string | null
          net?: number
          paid_at?: string | null
          paid_count?: number
          pg_fee?: number
          pg_rate?: number
          platform_fee?: number
          platform_fee_gross?: number
          platform_net?: number
          platform_rate?: number
          ref_boost?: number
          ref_boost_applied?: boolean
          ref_boost_rate?: number
          ref_reward?: number
          ref_reward_rate?: number
          refund_count?: number
          refunds?: number
          sample_cel_cover?: number
          sample_net?: number
          sample_refund_cash?: number
          sample_refund_cel?: number
          seller_bonus?: number
          seller_bonus_pp?: number
          seller_fee?: number
          seller_fee_total?: number
          seller_grade?: string | null
          seller_payout?: number
          seller_rate?: number
          seller_wht?: number
          settled_at?: string
          status?: string
          title?: string | null
          updated_at?: string
          vat?: number
          wht_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "settlements_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      celery_balances: {
        Row: {
          balance: number | null
          brand_id: string | null
          last_entry_at: string | null
          owner_id: string | null
          owner_type: string | null
          seller_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "celery_ledger_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "celery_ledger_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      app_accept_invite: {
        Args: { p_campaign_id: string; p_seller_id: string; p_shipping?: Json }
        Returns: Json
      }
      app_admin_review_product: {
        Args: { p_decision: string; p_product_id: string; p_reason?: string }
        Returns: Json
      }
      app_brand_approve_sample: {
        Args: { p_brand_id: string; p_campaign_id: string }
        Returns: Json
      }
      app_brand_campaign: {
        Args: { p_brand_id: string; p_campaign_id: string }
        Returns: Json
      }
      app_brand_campaigns: { Args: { p_brand_id: string }; Returns: Json }
      app_brand_confirm_schedule: {
        Args: { p_brand_id: string; p_campaign_id: string }
        Returns: Json
      }
      app_brand_cs_close: {
        Args: { p_brand_id: string; p_conversation_id: string }
        Returns: Json
      }
      app_brand_cs_list: {
        Args: { p_brand_id: string; p_status?: string }
        Returns: Json
      }
      app_brand_cs_reply: {
        Args: {
          p_actor_user_id: string
          p_body: string
          p_brand_id: string
          p_conversation_id: string
        }
        Returns: Json
      }
      app_brand_cs_thread: {
        Args: { p_brand_id: string; p_conversation_id: string }
        Returns: Json
      }
      app_brand_delete_product: {
        Args: { p_brand_id: string; p_product_id: string }
        Returns: Json
      }
      app_brand_invite_candidates: {
        Args: { p_brand_id: string; p_product_id: string }
        Returns: Json
      }
      app_brand_invite_seller: {
        Args: {
          p_actor_user_id?: string
          p_brand_id: string
          p_message?: string
          p_product_id: string
          p_seller_id: string
        }
        Returns: Json
      }
      app_brand_orders: {
        Args: {
          p_brand_id: string
          p_campaign_id?: string
          p_filter?: string
          p_limit?: number
        }
        Returns: Json
      }
      app_brand_po_rows: {
        Args: { p_brand_id: string; p_campaign_id?: string }
        Returns: Json
      }
      app_brand_refund_precheck: {
        Args: { p_brand_id: string; p_order_id: string }
        Returns: Json
      }
      app_brand_reject_sample: {
        Args: { p_brand_id: string; p_campaign_id: string; p_reason?: string }
        Returns: Json
      }
      app_brand_reject_schedule: {
        Args: { p_brand_id: string; p_campaign_id: string; p_reason?: string }
        Returns: Json
      }
      app_brand_requests: {
        Args: { p_brand_id: string; p_statuses?: string[] }
        Returns: Json
      }
      app_brand_set_listing: {
        Args: { p_brand_id: string; p_listed: boolean; p_product_id: string }
        Returns: Json
      }
      app_brand_ship_order: {
        Args: {
          p_brand_id: string
          p_courier: string
          p_order_id: string
          p_tracking_no: string
        }
        Returns: Json
      }
      app_brand_ship_orders: {
        Args: { p_brand_id: string; p_rows: Json }
        Returns: Json
      }
      app_brand_ship_sample: {
        Args: {
          p_brand_id: string
          p_campaign_id: string
          p_courier: string
          p_tracking_no: string
        }
        Returns: Json
      }
      app_brand_upsert_product: {
        Args: { p_brand_id: string; p_input: Json; p_product_id: string }
        Returns: Json
      }
      app_campaign_chat: {
        Args: {
          p_actor_id: string
          p_actor_role: string
          p_actor_user_id: string
          p_body: string
          p_campaign_id: string
        }
        Returns: Json
      }
      app_campaign_tick: { Args: never; Returns: Json }
      app_campaign_tick_one: { Args: { p_campaign_id: string }; Returns: Json }
      app_checkout_reserved: {
        Args: { p_campaign_id: string }
        Returns: number
      }
      app_claim_checkout: {
        Args: {
          p_payment_key: string
          p_stale?: string
          p_toss_order_id: string
        }
        Returns: Json
      }
      app_confirm_checkout: {
        Args: {
          p_payment: Json
          p_payment_key: string
          p_recover?: boolean
          p_session_id: string
        }
        Returns: Json
      }
      app_cs_customer_reply: {
        Args: {
          p_body: string
          p_client_token: string
          p_conversation_code: string
          p_user_id: string
        }
        Returns: Json
      }
      app_cs_list_for_user: { Args: { p_user_id: string }; Returns: Json }
      app_cs_open: {
        Args: {
          p_body: string
          p_buyer_name: string
          p_campaign_id: string
          p_customer_id: string
          p_order_code?: string
          p_type: string
          p_user_id: string
        }
        Returns: Json
      }
      app_cs_thread: {
        Args: {
          p_client_token?: string
          p_conversation_code: string
          p_user_id?: string
        }
        Returns: Json
      }
      app_decline_invite: {
        Args: { p_campaign_id: string; p_reason?: string; p_seller_id: string }
        Returns: Json
      }
      app_partner_payment_cancel: {
        Args: { p_payment_id: string; p_reason?: string; p_seller_id?: string }
        Returns: Json
      }
      app_partner_payment_claim: {
        Args: {
          p_order_id?: string
          p_product_id: string
          p_seller_id: string
          p_shipping: Json
          p_use_cel: boolean
          p_user_id?: string
        }
        Returns: Json
      }
      app_partner_payment_confirm: {
        Args: {
          p_amount_cash: number
          p_payment_id: string
          p_seller_id: string
          p_toss: Json
        }
        Returns: Json
      }
      app_partner_payment_confirming: {
        Args: {
          p_payment_id: string
          p_payment_key: string
          p_seller_id: string
          p_stale?: string
        }
        Returns: Json
      }
      app_partner_payment_fail: {
        Args: {
          p_code: string
          p_message?: string
          p_payment_id: string
          p_raw?: Json
        }
        Returns: Json
      }
      app_partner_payment_refund: {
        Args: { p_payment_id: string; p_raw?: Json; p_reason?: string }
        Returns: Json
      }
      app_partner_payments_expire: {
        Args: { p_grace?: string }
        Returns: number
      }
      app_partner_payments_stale: {
        Args: { p_age?: string; p_limit?: number }
        Returns: Json[]
      }
      app_pass_campaign: {
        Args: { p_campaign_id: string; p_seller_id: string }
        Returns: Json
      }
      app_propose_schedule: {
        Args: {
          p_campaign_id: string
          p_end: string
          p_qty: number
          p_seller_id: string
          p_start: string
        }
        Returns: Json
      }
      app_receive_sample: {
        Args: { p_campaign_id: string; p_seller_id: string }
        Returns: Json
      }
      app_refund_precheck: {
        Args: { p_actor: string; p_order_id: string }
        Returns: Json
      }
      app_refund_record: {
        Args: {
          p_actor: string
          p_amount: number
          p_order_id: string
          p_partial?: boolean
          p_raw: Json
          p_reason: string
        }
        Returns: Json
      }
      app_request_free_sample: {
        Args: { p_product_id: string; p_seller_id: string; p_shipping: Json }
        Returns: Json
      }
      app_role: { Args: never; Returns: string }
      app_sample_quote: {
        Args: { p_product_id: string; p_seller_id: string; p_use_cel?: boolean }
        Returns: Json
      }
      app_sample_quotes: {
        Args: {
          p_product_ids: string[]
          p_seller_id: string
          p_use_cel?: boolean
        }
        Returns: Json
      }
      app_seller_rrn_decrypt: {
        Args: {
          p_actor: string
          p_key: string
          p_purpose: string
          p_seller_id: string
        }
        Returns: Json
      }
      app_seller_sales: { Args: { p_seller_id: string }; Returns: Json }
      app_seller_schedule_context: {
        Args: { p_campaign_id: string; p_seller_id: string }
        Returns: Json
      }
      app_seller_settle_info: { Args: { p_seller_id: string }; Returns: Json }
      app_seller_settlements: { Args: { p_seller_id: string }; Returns: Json }
      app_set_seller_rrn: {
        Args: {
          p_key: string
          p_rrn: string
          p_seller_id: string
          p_skip_checksum?: boolean
        }
        Returns: Json
      }
      app_set_settle_info: {
        Args: {
          p_bank: Json
          p_seller_id: string
          p_settle_type: string
          p_tax?: Json
        }
        Returns: Json
      }
      brand_campaign_json: {
        Args: { c: Database["public"]["Tables"]["campaigns"]["Row"] }
        Returns: Json
      }
      brand_gmv: { Args: { p_brand: string }; Returns: number }
      brand_grade_for_gmv: { Args: { p_gmv: number }; Returns: string }
      brand_order_json: {
        Args: { o: Database["public"]["Tables"]["orders"]["Row"] }
        Returns: Json
      }
      campaign_card: { Args: { p_code: string }; Returns: Json }
      campaign_event_json: {
        Args: { e: Database["public"]["Tables"]["campaign_events"]["Row"] }
        Returns: Json
      }
      campaign_leak_detected: { Args: { p_body: string }; Returns: boolean }
      campaign_normalize_shipping: { Args: { p_shipping: Json }; Returns: Json }
      campaign_period_block: {
        Args: {
          p_end: string
          p_except_campaign_id: string
          p_product_id: string
          p_seller_id: string
          p_start: string
        }
        Returns: Json
      }
      campaign_period_holders: {
        Args: {
          p_end: string
          p_except_campaign_id?: string
          p_product_id: string
          p_start: string
        }
        Returns: Json
      }
      campaign_post_chat: {
        Args: {
          p_actor_user_id: string
          p_body: string
          p_campaign_id: string
          p_role: string
        }
        Returns: Json
      }
      celery_spend: {
        Args: {
          p_delta: number
          p_memo?: string
          p_owner_id: string
          p_owner_type: string
          p_reason: string
          p_ref_id?: string
          p_ref_type?: string
        }
        Returns: number
      }
      checkout_session_brief: {
        Args: { s: Database["public"]["Tables"]["checkout_sessions"]["Row"] }
        Returns: Json
      }
      create_brand_from_signup: {
        Args: {
          p_biz_no: string
          p_category: string
          p_link_id?: string
          p_manager_name: string
          p_manager_phone: string
          p_name: string
          p_referral_code?: string
          p_terms_agreed_at?: string
          p_user_id: string
        }
        Returns: Json
      }
      create_seller_from_signup: {
        Args: {
          p_handle: string
          p_link_id?: string
          p_name: string
          p_platform: string
          p_referral_code?: string
          p_terms_agreed_at?: string
          p_user_id: string
        }
        Returns: Json
      }
      cs_conversation_json: {
        Args: { x: Database["public"]["Tables"]["cs_conversations"]["Row"] }
        Returns: Json
      }
      cs_find_for_customer: {
        Args: {
          p_client_token: string
          p_conversation_code: string
          p_user_id: string
        }
        Returns: {
          brand_id: string
          buyer_name: string
          campaign_id: string
          client_token: string
          closed_at: string | null
          code: string
          created_at: string
          customer_id: string | null
          id: string
          last_message_at: string
          last_preview: string | null
          order_code: string | null
          order_id: string | null
          replied_at: string | null
          status: string
          type: string
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "cs_conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cs_message_json: {
        Args: { m: Database["public"]["Tables"]["cs_messages"]["Row"] }
        Returns: Json
      }
      cs_normalize_body: { Args: { p_body: string }; Returns: string }
      cs_thread_json: {
        Args: { x: Database["public"]["Tables"]["cs_conversations"]["Row"] }
        Returns: Json
      }
      expire_checkout_sessions: { Args: { p_grace?: string }; Returns: number }
      grade_for_sales: { Args: { p_m3_sales: number }; Returns: string }
      partner_identity_confirmed: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      partner_mask_account: { Args: { p_account: string }; Returns: string }
      partner_mask_biz_no: { Args: { p_biz_no: string }; Returns: string }
      partner_mask_name: { Args: { p_name: string }; Returns: string }
      partner_normalize_shipping: { Args: { p_shipping: Json }; Returns: Json }
      partner_payment_brief: {
        Args: { p: Database["public"]["Tables"]["partner_payments"]["Row"] }
        Returns: Json
      }
      partner_random_code: {
        Args: { p_len?: number; p_prefix?: string }
        Returns: string
      }
      partner_rrn_valid: {
        Args: { p_rrn: string; p_skip_checksum?: boolean }
        Returns: boolean
      }
      period_len_max: { Args: never; Returns: number }
      platform_clear_days: { Args: never; Returns: number }
      product_allocated: {
        Args: { p_except_campaign_id?: string; p_product_id: string }
        Returns: number
      }
      product_is_locked: { Args: { p_product_id: string }; Returns: boolean }
      public_stats: { Args: never; Returns: Json }
      purge_checkout_pii: { Args: { p_older_than?: string }; Returns: number }
      recalc_campaign_sold_qty: {
        Args: { p_campaign: string }
        Returns: undefined
      }
      resolve_product_options: {
        Args: { p_options: Json; p_sale_price: number }
        Returns: Json
      }
      seller_invite_gated: { Args: { p_seller_id: string }; Returns: boolean }
      seller_is_priority: { Args: { p_seller_id: string }; Returns: boolean }
      seller_is_public: { Args: { p_seller: string }; Returns: boolean }
      stale_checkout_sessions: {
        Args: { p_age?: string; p_limit?: number }
        Returns: Json[]
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
