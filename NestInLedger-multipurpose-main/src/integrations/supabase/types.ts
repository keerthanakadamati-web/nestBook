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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      admin_active_society: {
        Row: {
          society_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          society_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          society_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_active_society_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string
          event_date: string
          event_time: string | null
          expires_on: string | null
          id: string
          location: string | null
          published: boolean
          society_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          description?: string
          event_date?: string
          event_time?: string | null
          expires_on?: string | null
          id?: string
          location?: string | null
          published?: boolean
          society_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          event_date?: string
          event_time?: string | null
          expires_on?: string | null
          id?: string
          location?: string | null
          published?: boolean
          society_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      change_audit: {
        Row: {
          actor_id: string
          comment: string | null
          event: string
          id: string
          occurred_at: string
          previous_values: Json | null
          proposal_id: string
          proposed_values: Json | null
        }
        Insert: {
          actor_id: string
          comment?: string | null
          event: string
          id?: string
          occurred_at?: string
          previous_values?: Json | null
          proposal_id: string
          proposed_values?: Json | null
        }
        Update: {
          actor_id?: string
          comment?: string | null
          event?: string
          id?: string
          occurred_at?: string
          previous_values?: Json | null
          proposal_id?: string
          proposed_values?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "change_audit_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "change_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      change_proposals: {
        Row: {
          action: string
          applied_values: Json | null
          id: string
          module: string
          previous_values: Json | null
          proposed_values: Json
          record_key: string
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          society_id: string | null
          status: string
          submitted_at: string
          submitted_by: string
          submitted_email: string
        }
        Insert: {
          action: string
          applied_values?: Json | null
          id?: string
          module: string
          previous_values?: Json | null
          proposed_values?: Json
          record_key: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          society_id?: string | null
          status?: string
          submitted_at?: string
          submitted_by: string
          submitted_email: string
        }
        Update: {
          action?: string
          applied_values?: Json | null
          id?: string
          module?: string
          previous_values?: Json | null
          proposed_values?: Json
          record_key?: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          society_id?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string
          submitted_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_proposals_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_events: {
        Row: {
          actor_id: string
          comment: string | null
          complaint_id: string
          event: string
          id: string
          occurred_at: string
          previous_values: Json | null
          proposal_id: string | null
          proposed_values: Json | null
          request_id: string | null
        }
        Insert: {
          actor_id: string
          comment?: string | null
          complaint_id: string
          event: string
          id?: string
          occurred_at?: string
          previous_values?: Json | null
          proposal_id?: string | null
          proposed_values?: Json | null
          request_id?: string | null
        }
        Update: {
          actor_id?: string
          comment?: string | null
          complaint_id?: string
          event?: string
          id?: string
          occurred_at?: string
          previous_values?: Json | null
          proposal_id?: string | null
          proposed_values?: Json | null
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "complaint_events_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_events_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "change_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_notifications: {
        Row: {
          created_at: string
          email_accepted_at: string | null
          email_error: string | null
          email_status: string
          event_id: string
          id: string
          message: string
          read_at: string | null
          recipient_id: string
        }
        Insert: {
          created_at?: string
          email_accepted_at?: string | null
          email_error?: string | null
          email_status?: string
          event_id: string
          id?: string
          message: string
          read_at?: string | null
          recipient_id: string
        }
        Update: {
          created_at?: string
          email_accepted_at?: string | null
          email_error?: string | null
          email_status?: string
          event_id?: string
          id?: string
          message?: string
          read_at?: string | null
          recipient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaint_notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "complaint_events"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          assigned_to: string | null
          category: string
          description: string
          due_on: string | null
          flat_id: string
          id: string
          owner_id: string
          priority: string
          progress_update: string | null
          reopen_requested: boolean
          request_id: string
          resolution_details: string | null
          status: string
          submitted_at: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          description: string
          due_on?: string | null
          flat_id: string
          id?: string
          owner_id: string
          priority?: string
          progress_update?: string | null
          reopen_requested?: boolean
          request_id: string
          resolution_details?: string | null
          status?: string
          submitted_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          description?: string
          due_on?: string | null
          flat_id?: string
          id?: string
          owner_id?: string
          priority?: string
          progress_update?: string | null
          reopen_requested?: boolean
          request_id?: string
          resolution_details?: string | null
          status?: string
          submitted_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "finance_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flat_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_service_logs: {
        Row: {
          created_at: string
          created_by: string | null
          equipment_id: string
          id: string
          next_service: string | null
          service_date: string
          technician: string | null
          work_done: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          equipment_id: string
          id?: string
          next_service?: string | null
          service_date?: string
          technician?: string | null
          work_done: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          equipment_id?: string
          id?: string
          next_service?: string | null
          service_date?: string
          technician?: string | null
          work_done?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_service_logs_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "society_equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_attachments: {
        Row: {
          created_at: string
          entry_id: string | null
          expense_id: string | null
          file_name: string
          file_path: string
          file_size: number
          id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          entry_id?: string | null
          expense_id?: string | null
          file_name: string
          file_path: string
          file_size: number
          id?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          entry_id?: string | null
          expense_id?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_attachments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "recurring_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_attachments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          expense_date: string
          expense_month: string | null
          id: string
          method: string
          notes: string | null
          paid_by: string
          recorded_by: string | null
          society_id: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          description?: string
          expense_date?: string
          expense_month?: string | null
          id?: string
          method?: string
          notes?: string | null
          paid_by?: string
          recorded_by?: string | null
          society_id?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          expense_date?: string
          expense_month?: string | null
          id?: string
          method?: string
          notes?: string | null
          paid_by?: string
          recorded_by?: string | null
          society_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_reports: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          generated_at: string
          id: string
          period_end: string
          period_start: string
          period_type: string
          prepared_by: string
          prepared_email: string
          president_reviewed_at: string | null
          president_reviewed_by: string | null
          secretary_reviewed_at: string | null
          secretary_reviewed_by: string | null
          snapshot: Json
          society_id: string | null
          status: string
          submitted_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          generated_at?: string
          id?: string
          period_end: string
          period_start: string
          period_type: string
          prepared_by: string
          prepared_email: string
          president_reviewed_at?: string | null
          president_reviewed_by?: string | null
          secretary_reviewed_at?: string | null
          secretary_reviewed_by?: string | null
          snapshot: Json
          society_id?: string | null
          status?: string
          submitted_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          generated_at?: string
          id?: string
          period_end?: string
          period_start?: string
          period_type?: string
          prepared_by?: string
          prepared_email?: string
          president_reviewed_at?: string | null
          president_reviewed_by?: string | null
          secretary_reviewed_at?: string | null
          secretary_reviewed_by?: string | null
          snapshot?: Json
          society_id?: string | null
          status?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_reports_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      flat_capacity: {
        Row: {
          id: boolean
          used: number
        }
        Insert: {
          id?: boolean
          used?: number
        }
        Update: {
          id?: boolean
          used?: number
        }
        Relationships: []
      }
      flat_registrations: {
        Row: {
          aadhaar_number: string
          created_at: string
          flat_number: string
          floor: string | null
          house_tax_number: string | null
          id: string
          mobile: string
          occupancy: string
          owner_email: string | null
          owner_name: string
          parking_slot: string | null
          society_id: string
          status: string
          tenant_name: string | null
          tenant_phone: string | null
          vehicle_numbers: string | null
          vehicle_type: string | null
        }
        Insert: {
          aadhaar_number: string
          created_at?: string
          flat_number: string
          floor?: string | null
          house_tax_number?: string | null
          id?: string
          mobile: string
          occupancy: string
          owner_email?: string | null
          owner_name: string
          parking_slot?: string | null
          society_id: string
          status?: string
          tenant_name?: string | null
          tenant_phone?: string | null
          vehicle_numbers?: string | null
          vehicle_type?: string | null
        }
        Update: {
          aadhaar_number?: string
          created_at?: string
          flat_number?: string
          floor?: string | null
          house_tax_number?: string | null
          id?: string
          mobile?: string
          occupancy?: string
          owner_email?: string | null
          owner_name?: string
          parking_slot?: string | null
          society_id?: string
          status?: string
          tenant_name?: string | null
          tenant_phone?: string | null
          vehicle_numbers?: string | null
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flat_registrations_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      flats: {
        Row: {
          aadhaar_number: string | null
          billing_start: string
          created_at: string
          flat_number: string
          floor: string | null
          house_tax_number: string | null
          id: string
          mobile: string
          occupancy: string
          parking_slot: string | null
          resident_name: string
          resident_user_id: string | null
          society_id: string | null
          tenant_email: string | null
          tenant_end: string | null
          tenant_name: string | null
          tenant_phone: string | null
          tenant_start: string | null
          vehicle_numbers: string | null
          vehicle_type: string | null
        }
        Insert: {
          aadhaar_number?: string | null
          billing_start?: string
          created_at?: string
          flat_number: string
          floor?: string | null
          house_tax_number?: string | null
          id?: string
          mobile: string
          occupancy?: string
          parking_slot?: string | null
          resident_name: string
          resident_user_id?: string | null
          society_id?: string | null
          tenant_email?: string | null
          tenant_end?: string | null
          tenant_name?: string | null
          tenant_phone?: string | null
          tenant_start?: string | null
          vehicle_numbers?: string | null
          vehicle_type?: string | null
        }
        Update: {
          aadhaar_number?: string | null
          billing_start?: string
          created_at?: string
          flat_number?: string
          floor?: string | null
          house_tax_number?: string | null
          id?: string
          mobile?: string
          occupancy?: string
          parking_slot?: string | null
          resident_name?: string
          resident_user_id?: string | null
          society_id?: string | null
          tenant_email?: string | null
          tenant_end?: string | null
          tenant_name?: string | null
          tenant_phone?: string | null
          tenant_start?: string | null
          vehicle_numbers?: string | null
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flats_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_years: {
        Row: {
          fy_start: number
          opening_balance: number
          updated_at: string
        }
        Insert: {
          fy_start: number
          opening_balance?: number
          updated_at?: string
        }
        Update: {
          fy_start?: number
          opening_balance?: number
          updated_at?: string
        }
        Relationships: []
      }
      gallery_albums: {
        Row: {
          association: string
          cover_photo_id: string | null
          created_at: string
          created_by: string
          deleted: boolean
          description: string
          event_date: string
          event_name: string
          id: string
          published: boolean
          society_id: string | null
        }
        Insert: {
          association?: string
          cover_photo_id?: string | null
          created_at?: string
          created_by?: string
          deleted?: boolean
          description?: string
          event_date: string
          event_name: string
          id?: string
          published?: boolean
          society_id?: string | null
        }
        Update: {
          association?: string
          cover_photo_id?: string | null
          created_at?: string
          created_by?: string
          deleted?: boolean
          description?: string
          event_date?: string
          event_name?: string
          id?: string
          published?: boolean
          society_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gallery_albums_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_budget: {
        Row: {
          budget_bytes: number
          generation: string
          id: string
          updated_at: string
        }
        Insert: {
          budget_bytes?: number
          generation?: string
          id?: string
          updated_at?: string
        }
        Update: {
          budget_bytes?: number
          generation?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      gallery_notifications: {
        Row: {
          budget_bytes: number
          created_at: string
          generation: string
          id: string
          read_at: string | null
          recipient_id: string
          threshold: number
          used_bytes: number
        }
        Insert: {
          budget_bytes: number
          created_at?: string
          generation: string
          id?: string
          read_at?: string | null
          recipient_id: string
          threshold: number
          used_bytes: number
        }
        Update: {
          budget_bytes?: number
          created_at?: string
          generation?: string
          id?: string
          read_at?: string | null
          recipient_id?: string
          threshold?: number
          used_bytes?: number
        }
        Relationships: []
      }
      gallery_photos: {
        Row: {
          album_id: string
          deleted: boolean
          file_name: string
          file_path: string
          file_size: number
          height: number
          id: string
          thumbnail_path: string
          thumbnail_size: number
          upload_id: string
          uploaded_at: string
          uploader: string | null
          width: number
        }
        Insert: {
          album_id: string
          deleted?: boolean
          file_name?: string
          file_path?: string
          file_size?: number
          height?: number
          id?: string
          thumbnail_path?: string
          thumbnail_size?: number
          upload_id: string
          uploaded_at?: string
          uploader?: string | null
          width?: number
        }
        Update: {
          album_id?: string
          deleted?: boolean
          file_name?: string
          file_path?: string
          file_size?: number
          height?: number
          id?: string
          thumbnail_path?: string
          thumbnail_size?: number
          upload_id?: string
          uploaded_at?: string
          uploader?: string | null
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "gallery_photos_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "gallery_albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_photos_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: true
            referencedRelation: "gallery_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_storage_history: {
        Row: {
          file_count: number
          id: string
          measured_at: string
          photo_count: number
          used_bytes: number
        }
        Insert: {
          file_count: number
          id?: string
          measured_at?: string
          photo_count: number
          used_bytes: number
        }
        Update: {
          file_count?: number
          id?: string
          measured_at?: string
          photo_count?: number
          used_bytes?: number
        }
        Relationships: []
      }
      gallery_uploads: {
        Row: {
          album_id: string
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          height: number | null
          id: string
          original_size: number | null
          state: string
          thumbnail_path: string
          thumbnail_size: number | null
          uploader: string
          width: number | null
        }
        Insert: {
          album_id: string
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          height?: number | null
          id?: string
          original_size?: number | null
          state?: string
          thumbnail_path: string
          thumbnail_size?: number | null
          uploader: string
          width?: number | null
        }
        Update: {
          album_id?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          height?: number | null
          id?: string
          original_size?: number | null
          state?: string
          thumbnail_path?: string
          thumbnail_size?: number | null
          uploader?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gallery_uploads_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "gallery_albums"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_tokens: {
        Row: {
          name: string
          token: string
        }
        Insert: {
          name: string
          token: string
        }
        Update: {
          name?: string
          token?: string
        }
        Relationships: []
      }
      legal_documents: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          id: string
          mime_type: string
          society_id: string
          title: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size: number
          id?: string
          mime_type: string
          society_id: string
          title: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          mime_type?: string
          society_id?: string
          title?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_documents_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      license_renewals: {
        Row: {
          id: string
          new_expires_on: string
          note: string | null
          old_expires_on: string
          renewed_at: string
          renewed_by: string
        }
        Insert: {
          id?: string
          new_expires_on: string
          note?: string | null
          old_expires_on: string
          renewed_at?: string
          renewed_by: string
        }
        Update: {
          id?: string
          new_expires_on?: string
          note?: string | null
          old_expires_on?: string
          renewed_at?: string
          renewed_by?: string
        }
        Relationships: []
      }
      maintenance_bills: {
        Row: {
          amount: number
          bill_month: string
          created_at: string
          due_date: string
          flat_id: string
          id: string
        }
        Insert: {
          amount: number
          bill_month: string
          created_at?: string
          due_date: string
          flat_id: string
          id?: string
        }
        Update: {
          amount?: number
          bill_month?: string
          created_at?: string
          due_date?: string
          flat_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_bills_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "finance_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_bills_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flat_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_bills_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_rates: {
        Row: {
          approved_by: string | null
          created_at: string
          due_day: number
          effective_month: string
          fy_start_month: number
          id: string
          monthly_amount: number
          society_id: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          due_day: number
          effective_month: string
          fy_start_month: number
          id?: string
          monthly_amount: number
          society_id?: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          due_day?: number
          effective_month?: string
          fy_start_month?: number
          id?: string
          monthly_amount?: number
          society_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_rates_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_reminders: {
        Row: {
          amount_due: number
          created_at: string
          email_error: string | null
          email_sent_at: string | null
          email_status: string | null
          email_to: string | null
          flat_id: string
          id: string
          reminder_date: string
          status: string
        }
        Insert: {
          amount_due: number
          created_at?: string
          email_error?: string | null
          email_sent_at?: string | null
          email_status?: string | null
          email_to?: string | null
          flat_id: string
          id?: string
          reminder_date: string
          status?: string
        }
        Update: {
          amount_due?: number
          created_at?: string
          email_error?: string | null
          email_sent_at?: string | null
          email_status?: string | null
          email_to?: string | null
          flat_id?: string
          id?: string
          reminder_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_reminders_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "finance_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_reminders_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flat_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_reminders_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_emails: {
        Row: {
          created_at: string
          email_error: string | null
          email_sent_at: string | null
          email_status: string
          email_to: string | null
          payment_id: string
        }
        Insert: {
          created_at?: string
          email_error?: string | null
          email_sent_at?: string | null
          email_status?: string
          email_to?: string | null
          payment_id: string
        }
        Update: {
          created_at?: string
          email_error?: string | null
          email_sent_at?: string | null
          email_status?: string
          email_to?: string | null
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_emails_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_requests: {
        Row: {
          actor_id: string
          cash_reviewed: boolean
          created_at: string
          payload: Json
          payment_id: string
          proposal_id: string | null
          request_id: string
        }
        Insert: {
          actor_id: string
          cash_reviewed?: boolean
          created_at?: string
          payload: Json
          payment_id: string
          proposal_id?: string | null
          request_id: string
        }
        Update: {
          actor_id?: string
          cash_reviewed?: boolean
          created_at?: string
          payload?: Json
          payment_id?: string
          proposal_id?: string | null
          request_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          flat_id: string
          id: string
          method: string
          month_covered: string
          notes: string | null
          paid_on: string
          receipt_no: string
          recorded_by: string | null
          reference: string | null
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          flat_id: string
          id?: string
          method: string
          month_covered?: string
          notes?: string | null
          paid_on?: string
          receipt_no?: string
          recorded_by?: string | null
          reference?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          flat_id?: string
          id?: string
          method?: string
          month_covered?: string
          notes?: string | null
          paid_on?: string
          receipt_no?: string
          recorded_by?: string | null
          reference?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "finance_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flat_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          full_name: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          full_name?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          full_name?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_delivery_logs: {
        Row: {
          accepted_at: string | null
          attempts: number
          created_at: string
          endpoint_hash: string
          error_message: string | null
          event_id: string
          event_type: string
          http_status: number | null
          id: string
          next_attempt_at: string | null
          payload: Json
          recipient_id: string
          status: string
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          attempts?: number
          created_at?: string
          endpoint_hash: string
          error_message?: string | null
          event_id: string
          event_type: string
          http_status?: number | null
          id?: string
          next_attempt_at?: string | null
          payload?: Json
          recipient_id: string
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          attempts?: number
          created_at?: string
          endpoint_hash?: string
          error_message?: string | null
          event_id?: string
          event_type?: string
          http_status?: number | null
          id?: string
          next_attempt_at?: string | null
          payload?: Json
          recipient_id?: string
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_delivery_logs_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          enabled: boolean
          endpoint: string
          id: string
          last_active_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          enabled?: boolean
          endpoint: string
          id?: string
          last_active_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          enabled?: boolean
          endpoint?: string
          id?: string
          last_active_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      recurring_entries: {
        Row: {
          actual_amount: number | null
          created_at: string
          created_by: string | null
          expected_amount: number
          expense_id: string | null
          id: string
          method: string | null
          notes: string | null
          paid_on: string | null
          payment_reference: string | null
          period: string
          recurring_id: string
          schedule_snapshot: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          actual_amount?: number | null
          created_at?: string
          created_by?: string | null
          expected_amount: number
          expense_id?: string | null
          id?: string
          method?: string | null
          notes?: string | null
          paid_on?: string | null
          payment_reference?: string | null
          period: string
          recurring_id: string
          schedule_snapshot?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          actual_amount?: number | null
          created_at?: string
          created_by?: string | null
          expected_amount?: number
          expense_id?: string | null
          id?: string
          method?: string | null
          notes?: string | null
          paid_on?: string | null
          payment_reference?: string | null
          period?: string
          recurring_id?: string
          schedule_snapshot?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_entries_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_entries_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_expense_events: {
        Row: {
          actor_id: string | null
          entry_id: string | null
          event: string
          id: string
          new_values: Json | null
          occurred_at: string
          previous_values: Json | null
          schedule_id: string | null
        }
        Insert: {
          actor_id?: string | null
          entry_id?: string | null
          event: string
          id?: string
          new_values?: Json | null
          occurred_at?: string
          previous_values?: Json | null
          schedule_id?: string | null
        }
        Update: {
          actor_id?: string | null
          entry_id?: string | null
          event?: string
          id?: string
          new_values?: Json | null
          occurred_at?: string
          previous_values?: Json | null
          schedule_id?: string | null
        }
        Relationships: []
      }
      recurring_expenses: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          due_day: number
          end_date: string | null
          expected_amount: number
          frequency: string
          id: string
          name: string
          notes: string | null
          requires_receipt: boolean
          society_id: string | null
          start_date: string
          status: string
          updated_at: string
          vendor: string | null
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          due_day: number
          end_date?: string | null
          expected_amount: number
          frequency?: string
          id?: string
          name: string
          notes?: string | null
          requires_receipt?: boolean
          society_id?: string | null
          start_date: string
          status?: string
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          due_day?: number
          end_date?: string | null
          expected_amount?: number
          frequency?: string
          id?: string
          name?: string
          notes?: string | null
          requires_receipt?: boolean
          society_id?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_runs: {
        Row: {
          error: string | null
          failed: number
          finished_at: string | null
          id: string
          recorded: number
          run_date: string
          sent: number
          started_at: string
          status: string
        }
        Insert: {
          error?: string | null
          failed?: number
          finished_at?: string | null
          id?: string
          recorded?: number
          run_date: string
          sent?: number
          started_at?: string
          status?: string
        }
        Update: {
          error?: string | null
          failed?: number
          finished_at?: string | null
          id?: string
          recorded?: number
          run_date?: string
          sent?: number
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      societies: {
        Row: {
          city: string | null
          code: string
          created_at: string
          id: string
          name: string
          president_email: string | null
          president_name: string | null
          slug: string
          status: string
          total_flats: number
          updated_at: string
        }
        Insert: {
          city?: string | null
          code: string
          created_at?: string
          id?: string
          name: string
          president_email?: string | null
          president_name?: string | null
          slug: string
          status?: string
          total_flats?: number
          updated_at?: string
        }
        Update: {
          city?: string | null
          code?: string
          created_at?: string
          id?: string
          name?: string
          president_email?: string | null
          president_name?: string | null
          slug?: string
          status?: string
          total_flats?: number
          updated_at?: string
        }
        Relationships: []
      }
      society_board: {
        Row: {
          association_name: string
          meeting_date: string | null
          members: Json
          office_address: string
          registration_details: string
          society_id: string
          term: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          association_name?: string
          meeting_date?: string | null
          members?: Json
          office_address?: string
          registration_details?: string
          society_id: string
          term?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          association_name?: string
          meeting_date?: string | null
          members?: Json
          office_address?: string
          registration_details?: string
          society_id?: string
          term?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "society_board_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: true
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      society_committee: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: string
          society_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          role: string
          society_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: string
          society_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "society_committee_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      society_directory: {
        Row: {
          availability: string
          category: string
          contract_no: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          phone: string
          role_note: string | null
          society_id: string | null
          updated_at: string
        }
        Insert: {
          availability?: string
          category: string
          contract_no?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          phone: string
          role_note?: string | null
          society_id?: string | null
          updated_at?: string
        }
        Update: {
          availability?: string
          category?: string
          contract_no?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          phone?: string
          role_note?: string | null
          society_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "society_directory_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      society_equipment: {
        Row: {
          amc_cost: number | null
          amc_end: string | null
          amc_start: string | null
          category: string
          created_at: string
          created_by: string | null
          id: string
          last_service: string | null
          name: string
          next_service: string | null
          notes: string | null
          society_id: string | null
          updated_at: string
          vendor_name: string | null
          vendor_phone: string | null
        }
        Insert: {
          amc_cost?: number | null
          amc_end?: string | null
          amc_start?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_service?: string | null
          name: string
          next_service?: string | null
          notes?: string | null
          society_id?: string | null
          updated_at?: string
          vendor_name?: string | null
          vendor_phone?: string | null
        }
        Update: {
          amc_cost?: number | null
          amc_end?: string | null
          amc_start?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_service?: string | null
          name?: string
          next_service?: string | null
          notes?: string | null
          society_id?: string | null
          updated_at?: string
          vendor_name?: string | null
          vendor_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "society_equipment_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      society_files: {
        Row: {
          category: string
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          id: string
          notes: string | null
          society_id: string | null
          title: string
          uploaded_by: string
          valid_until: string | null
          vendor: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          file_name: string
          file_path: string
          file_size: number
          id?: string
          notes?: string | null
          society_id?: string | null
          title: string
          uploaded_by?: string
          valid_until?: string | null
          vendor?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          notes?: string | null
          society_id?: string | null
          title?: string
          uploaded_by?: string
          valid_until?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "society_files_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      society_license: {
        Row: {
          expires_on: string
          id: boolean
          updated_at: string
        }
        Insert: {
          expires_on?: string
          id?: boolean
          updated_at?: string
        }
        Update: {
          expires_on?: string
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      society_poll_options: {
        Row: {
          id: string
          label: string
          poll_id: string
          sort_order: number
        }
        Insert: {
          id?: string
          label: string
          poll_id: string
          sort_order?: number
        }
        Update: {
          id?: string
          label?: string
          poll_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "society_poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "society_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      society_poll_votes: {
        Row: {
          created_at: string
          flat_id: string
          id: string
          option_id: string
          poll_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          flat_id: string
          id?: string
          option_id: string
          poll_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          flat_id?: string
          id?: string
          option_id?: string
          poll_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "society_poll_votes_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "finance_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "society_poll_votes_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flat_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "society_poll_votes_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "society_poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "society_poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "society_poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "society_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      society_polls: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          expires_at: string | null
          id: string
          society_id: string | null
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          society_id?: string | null
          status?: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          society_id?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "society_polls_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      society_settings: {
        Row: {
          due_day: number
          effective_month: string
          fy_start_month: number
          id: boolean
          monthly_amount: number
          payee_name: string
          payment_notifications: boolean
          reminder_frequency: string
          reminder_method: string
          reminder_start_day: number
          reminder_time: string
          reminder_timezone: string
          reminders_enabled: boolean
          society_id: string
          society_name: string
          updated_at: string
          upi_id: string
        }
        Insert: {
          due_day?: number
          effective_month?: string
          fy_start_month?: number
          id?: boolean
          monthly_amount?: number
          payee_name?: string
          payment_notifications?: boolean
          reminder_frequency?: string
          reminder_method?: string
          reminder_start_day?: number
          reminder_time?: string
          reminder_timezone?: string
          reminders_enabled?: boolean
          society_id: string
          society_name?: string
          updated_at?: string
          upi_id?: string
        }
        Update: {
          due_day?: number
          effective_month?: string
          fy_start_month?: number
          id?: boolean
          monthly_amount?: number
          payee_name?: string
          payment_notifications?: boolean
          reminder_frequency?: string
          reminder_method?: string
          reminder_start_day?: number
          reminder_time?: string
          reminder_timezone?: string
          reminders_enabled?: boolean
          society_id?: string
          society_name?: string
          updated_at?: string
          upi_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "society_settings_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: true
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          category: string
          created_at: string
          created_by: string
          created_email: string | null
          description: string
          id: string
          image_path: string | null
          resolved_at: string | null
          society_id: string | null
          status: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string
          created_email?: string | null
          description: string
          id?: string
          image_path?: string | null
          resolved_at?: string | null
          society_id?: string | null
          status?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          created_email?: string | null
          description?: string
          id?: string
          image_path?: string | null
          resolved_at?: string | null
          society_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_terms_acceptance: {
        Row: {
          accepted_at: string
          email: string
          society_id: string | null
          terms_hash: string
          terms_text: string
          terms_version: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          email: string
          society_id?: string | null
          terms_hash: string
          terms_text: string
          terms_version: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          email?: string
          society_id?: string | null
          terms_hash?: string
          terms_text?: string
          terms_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_terms_acceptance_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      finance_accounts: {
        Row: {
          advance_credit: number | null
          billing_start: string | null
          current_month_amount: number | null
          current_outstanding: number | null
          flat_number: string | null
          id: string | null
          outstanding: number | null
          resident_name: string | null
          status: string | null
        }
        Relationships: []
      }
      flat_accounts: {
        Row: {
          advance_credit: number | null
          billing_start: string | null
          current_month_amount: number | null
          current_outstanding: number | null
          flat_number: string | null
          id: string | null
          mobile: string | null
          months_billed: number | null
          outstanding: number | null
          previous_outstanding: number | null
          resident_name: string | null
          resident_user_id: string | null
          status: string | null
          total_charged: number | null
          total_paid: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_pilot_terms: {
        Args: { _acknowledged: boolean; _version: string }
        Returns: string
      }
      admin_platform_summary: {
        Args: never
        Returns: {
          open_tickets: number
          societies: number
        }[]
      }
      approval_fields: { Args: { _module: string }; Returns: string[] }
      bill_amount: { Args: { _flat: string; _month: string }; Returns: number }
      billed_total: {
        Args: { _end: string; _flat: string; _start: string }
        Returns: number
      }
      can_access_legal_documents: {
        Args: { _society: string; _write?: boolean }
        Returns: boolean
      }
      can_access_recurring_finance: { Args: never; Returns: boolean }
      can_decide_module: { Args: { _module: string }; Returns: boolean }
      can_manage_society_files: { Args: never; Returns: boolean }
      cast_poll_vote: {
        Args: { _flat: string; _option: string; _poll: string }
        Returns: undefined
      }
      claim_first_admin: { Args: never; Returns: boolean }
      clear_license_renewals: { Args: never; Returns: undefined }
      comment_on_complaint: {
        Args: {
          _comment: string
          _id: string
          _reopen: boolean
          _request: string
        }
        Returns: string
      }
      current_society: { Args: never; Returns: string }
      decide_change: {
        Args: {
          _approve: boolean
          _comment?: string
          _id: string
          _resolved_user?: string
        }
        Returns: undefined
      }
      decide_change_core: {
        Args: {
          _approve: boolean
          _comment?: string
          _id: string
          _resolved_user?: string
        }
        Returns: undefined
      }
      decide_flat_registration: {
        Args: { _id: string; _import: boolean }
        Returns: undefined
      }
      decide_payment: {
        Args: { _confirm: boolean; _id: string }
        Returns: undefined
      }
      delete_license_renewal: { Args: { _id: string }; Returns: undefined }
      export_pilot_acknowledgments: { Args: never; Returns: Json }
      financial_report_snapshot: {
        Args: { _end: string; _start: string }
        Returns: Json
      }
      financial_report_snapshot_legacy: {
        Args: { _end: string; _start: string }
        Returns: Json
      }
      flat_bill_position: {
        Args: { _asof?: string; _flat: string; _month: string }
        Returns: {
          account_status: string
          billed: number
          charged: number
          credit: number
          current_due: number
          paid: number
          previous_due: number
        }[]
      }
      flat_in_current_society: { Args: { _flat: string }; Returns: boolean }
      freeze_monthly_bills: { Args: never; Returns: number }
      gallery_object_readable: { Args: { _path: string }; Returns: boolean }
      generate_recurring_entries: { Args: { _month: string }; Returns: number }
      has_permission: { Args: { _permission: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_society_flats: {
        Args: { _rows: Json; _society: string }
        Returns: Json
      }
      in_primary_society: { Args: never; Returns: boolean }
      is_society_member: { Args: never; Returns: boolean }
      legal_document_object_access: {
        Args: { _path: string; _write?: boolean }
        Returns: boolean
      }
      maintenance_due_date: {
        Args: { _day: number; _month: string }
        Returns: string
      }
      maintenance_rate:
        | {
            Args: { _month: string }
            Returns: {
              approved_by: string | null
              created_at: string
              due_day: number
              effective_month: string
              fy_start_month: number
              id: string
              monthly_amount: number
              society_id: string
            }
            SetofOptions: {
              from: "*"
              to: "maintenance_rates"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { _month: string; _society?: string }
            Returns: {
              approved_by: string | null
              created_at: string
              due_day: number
              effective_month: string
              fy_start_month: number
              id: string
              monthly_amount: number
              society_id: string
            }
            SetofOptions: {
              from: "*"
              to: "maintenance_rates"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      measure_gallery_storage: { Args: never; Returns: Json }
      my_society: {
        Args: never
        Returns: {
          code: string
          id: string
          name: string
          slug: string
        }[]
      }
      pay_recurring_entry: {
        Args: {
          _amount: number
          _entry: string
          _method: string
          _notes: string
          _paid_on: string
          _reference: string
        }
        Returns: undefined
      }
      pilot_terms_document: { Args: never; Returns: Json }
      pilot_terms_status: { Args: never; Returns: Json }
      poll_eligible_flats: { Args: never; Returns: number }
      poll_vote_counts: {
        Args: never
        Returns: {
          option_id: string
          poll_id: string
          votes: number
        }[]
      }
      prepare_financial_report: {
        Args: { _start: string; _type: string }
        Returns: string
      }
      president_flat_register: {
        Args: never
        Returns: {
          aadhaar_number: string
          flat_number: string
          floor: string
          house_tax_number: string
          id: string
          mobile: string
          occupancy: string
          owner_email: string
          parking_slot: string
          resident_name: string
          tenant_email: string
          tenant_name: string
          tenant_phone: string
          vehicle_numbers: string
          vehicle_type: string
        }[]
      }
      proposal_snapshot: {
        Args: { _key: string; _module: string }
        Returns: Json
      }
      queue_complaint_notification: {
        Args: { _event: string; _message: string; _recipient: string }
        Returns: undefined
      }
      queue_push_event: {
        Args: { _id: string; _kind: string }
        Returns: undefined
      }
      read_complaint_notifications: { Args: never; Returns: undefined }
      read_gallery_notifications: { Args: never; Returns: undefined }
      record_and_email_reminders: { Args: never; Returns: number }
      record_maintenance_reminders: { Args: never; Returns: number }
      recurring_pending_entries: { Args: never; Returns: string[] }
      register_legal_document: {
        Args: { _name: string; _path: string; _title: string }
        Returns: string
      }
      reminder_is_due:
        | { Args: { _at: string }; Returns: boolean }
        | { Args: { _at: string; _society?: string }; Returns: boolean }
      renew_license: {
        Args: { _new_date: string; _note?: string }
        Returns: undefined
      }
      set_active_society: { Args: { _society: string }; Returns: undefined }
      set_committee_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      set_payment_configuration: {
        Args: { _payee_name: string; _upi_id: string }
        Returns: undefined
      }
      society_flat_counts: {
        Args: never
        Returns: {
          flats: number
          society_id: string
        }[]
      }
      society_public_info: {
        Args: { _slug: string }
        Returns: {
          city: string
          code: string
          name: string
          slug: string
        }[]
      }
      society_public_name: { Args: { _slug: string }; Returns: string }
      submit_change: {
        Args: { _action: string; _key: string; _module: string; _values?: Json }
        Returns: string
      }
      submit_change_bounded_legacy: {
        Args: { _action: string; _key: string; _module: string; _values?: Json }
        Returns: string
      }
      submit_complaint: {
        Args: {
          _category: string
          _description: string
          _flat: string
          _request: string
          _title: string
        }
        Returns: string
      }
      submit_flat_registration: {
        Args: { _slug: string; _v: Json }
        Returns: undefined
      }
      submit_payment: {
        Args: { _cash_reviewed?: boolean; _request: string; _values: Json }
        Returns: Json
      }
      transition_financial_report: {
        Args: { _action: string; _id: string }
        Returns: undefined
      }
      update_my_flat_details: {
        Args: {
          _flat_id: string
          _floor: string
          _house_tax_number: string
          _mobile: string
          _parking_slot: string
          _vehicle_numbers: string
          _vehicle_type: string
        }
        Returns: undefined
      }
      update_my_flat_tenant: {
        Args: {
          _flat_id: string
          _occupancy: string
          _tenant_email: string
          _tenant_name: string
          _tenant_phone: string
        }
        Returns: undefined
      }
      update_my_tenant: {
        Args: {
          _occupancy: string
          _tenant_email: string
          _tenant_name: string
          _tenant_phone: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "resident" | "president" | "secretary" | "treasurer"
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
      app_role: ["admin", "resident", "president", "secretary", "treasurer"],
    },
  },
} as const
