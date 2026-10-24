
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"details": Json | null,"entity": string | null,"entity_id": string | null,"id": number,"pharmacy_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"details"?: Json | null,"entity"?: string | null,"entity_id"?: string | null,"id"?: never,"pharmacy_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"details"?: Json | null,"entity"?: string | null,"entity_id"?: string | null,"id"?: never,"pharmacy_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_pharmacy_id_fkey"
      columns: ["pharmacy_id"]
isOneToOne: false
      referencedRelation: "pharmacies"
      referencedColumns: ["id"]
    }
                  ]
                },"branches": {
                  Row: {
                    "active": boolean,"address": string | null,"created_at": string,"id": string,"is_main": boolean,"name": string,"pharmacy_id": string,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"address"?: string | null,"created_at"?: string,"id"?: string,"is_main"?: boolean,"name": string,"pharmacy_id": string,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"address"?: string | null,"created_at"?: string,"id"?: string,"is_main"?: boolean,"name"?: string,"pharmacy_id"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "branches_pharmacy_id_fkey"
      columns: ["pharmacy_id"]
isOneToOne: false
      referencedRelation: "pharmacies"
      referencedColumns: ["id"]
    }
                  ]
                },"cash_movements": {
                  Row: {
                    "amount": number,"branch_id": string,"cash_session_id": string,"created_at": string,"created_by": string | null,"id": number,"pharmacy_id": string,"reason": string,"type": Database["public"]['Enums']["cash_movement_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"branch_id": string,"cash_session_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: never,"pharmacy_id": string,"reason": string,"type": Database["public"]['Enums']["cash_movement_type"]
                  }
                  Update: {
                    "amount"?: number,"branch_id"?: string,"cash_session_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: never,"pharmacy_id"?: string,"reason"?: string,"type"?: Database["public"]['Enums']["cash_movement_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "cash_movements_cash_session_id_fkey"
      columns: ["cash_session_id"]
isOneToOne: false
      referencedRelation: "cash_session_summary"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_movements_cash_session_id_fkey"
      columns: ["cash_session_id"]
isOneToOne: false
      referencedRelation: "cash_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_movements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_movements_pharmacy_id_branch_id_fkey"
      columns: ["pharmacy_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["pharmacy_id","id"]
    }
                  ]
                },"cash_sessions": {
                  Row: {
                    "branch_id": string,"closed_at": string | null,"closed_by": string | null,"counted_cash": number | null,"difference": number | null,"id": string,"notes": string | null,"opened_at": string,"opened_by": string | null,"opening_amount": number,"pharmacy_id": string,"status": Database["public"]['Enums']["cash_session_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"closed_at"?: string | null,"closed_by"?: string | null,"counted_cash"?: number | null,"difference"?: number | null,"id"?: string,"notes"?: string | null,"opened_at"?: string,"opened_by"?: string | null,"opening_amount": number,"pharmacy_id": string,"status"?: Database["public"]['Enums']["cash_session_status"]
                  }
                  Update: {
                    "branch_id"?: string,"closed_at"?: string | null,"closed_by"?: string | null,"counted_cash"?: number | null,"difference"?: number | null,"id"?: string,"notes"?: string | null,"opened_at"?: string,"opened_by"?: string | null,"opening_amount"?: number,"pharmacy_id"?: string,"status"?: Database["public"]['Enums']["cash_session_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "cash_sessions_closed_by_fkey"
      columns: ["closed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_sessions_opened_by_fkey"
      columns: ["opened_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_sessions_pharmacy_id_branch_id_fkey"
      columns: ["pharmacy_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["pharmacy_id","id"]
    },{
      foreignKeyName: "cash_sessions_pharmacy_id_fkey"
      columns: ["pharmacy_id"]
isOneToOne: false
      referencedRelation: "pharmacies"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"pharmacy_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"pharmacy_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"pharmacy_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_pharmacy_id_fkey"
      columns: ["pharmacy_id"]
isOneToOne: false
      referencedRelation: "pharmacies"
      referencedColumns: ["id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "created_at": string,"doc_number": string,"doc_type": Database["public"]['Enums']["customer_doc_type"],"id": string,"name": string,"pharmacy_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"doc_number": string,"doc_type": Database["public"]['Enums']["customer_doc_type"],"id"?: string,"name": string,"pharmacy_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"doc_number"?: string,"doc_type"?: Database["public"]['Enums']["customer_doc_type"],"id"?: string,"name"?: string,"pharmacy_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customers_pharmacy_id_fkey"
      columns: ["pharmacy_id"]
isOneToOne: false
      referencedRelation: "pharmacies"
      referencedColumns: ["id"]
    }
                  ]
                },"einvoice_sequences": {
                  Row: {
                    "last_number": number,"pharmacy_id": string,"series": string
                  }
                  ComputedFields: never
                  Insert: {
                    "last_number"?: number,"pharmacy_id": string,"series": string
                  }
                  Update: {
                    "last_number"?: number,"pharmacy_id"?: string,"series"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "einvoice_sequences_pharmacy_id_fkey"
      columns: ["pharmacy_id"]
isOneToOne: false
      referencedRelation: "pharmacies"
      referencedColumns: ["id"]
    }
                  ]
                },"einvoices": {
                  Row: {
                    "attempts": number,"cdr_xml": string | null,"created_at": string,"created_by": string | null,"doc_type": string,"environment": string,"hash": string | null,"id": string,"number": number,"pharmacy_id": string,"sale_id": string,"sent_at": string | null,"series": string,"status": Database["public"]['Enums']["einvoice_status"],"sunat_code": string | null,"sunat_description": string | null,"sunat_notes": (string)[],"updated_at": string,"xml": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"cdr_xml"?: string | null,"created_at"?: string,"created_by"?: string | null,"doc_type": string,"environment"?: string,"hash"?: string | null,"id"?: string,"number": number,"pharmacy_id": string,"sale_id": string,"sent_at"?: string | null,"series": string,"status"?: Database["public"]['Enums']["einvoice_status"],"sunat_code"?: string | null,"sunat_description"?: string | null,"sunat_notes"?: (string)[],"updated_at"?: string,"xml"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"cdr_xml"?: string | null,"created_at"?: string,"created_by"?: string | null,"doc_type"?: string,"environment"?: string,"hash"?: string | null,"id"?: string,"number"?: number,"pharmacy_id"?: string,"sale_id"?: string,"sent_at"?: string | null,"series"?: string,"status"?: Database["public"]['Enums']["einvoice_status"],"sunat_code"?: string | null,"sunat_description"?: string | null,"sunat_notes"?: (string)[],"updated_at"?: string,"xml"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "einvoices_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "einvoices_pharmacy_id_fkey"
      columns: ["pharmacy_id"]
isOneToOne: false
      referencedRelation: "pharmacies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "einvoices_pharmacy_id_sale_id_fkey"
      columns: ["pharmacy_id","sale_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["pharmacy_id","id"]
    }
                  ]
                },"environment_readings": {
                  Row: {
                    "area": Database["public"]['Enums']["environment_area"],"branch_id": string,"humidity": number | null,"id": number,"idempotency_key": string | null,"note": string | null,"out_of_range": boolean,"pharmacy_id": string,"recorded_at": string,"recorded_by": string | null,"recorded_on": string,"temperature": number
                  }
                  ComputedFields: never
                  Insert: {
                    "area": Database["public"]['Enums']["environment_area"],"branch_id": string,"humidity"?: number | null,"id"?: never,"idempotency_key"?: string | null,"note"?: string | null,"out_of_range": boolean,"pharmacy_id": string,"recorded_at"?: string,"recorded_by"?: string | null,"recorded_on": string,"temperature": number
                  }
                  Update: {
                    "area"?: Database["public"]['Enums']["environment_area"],"branch_id"?: string,"humidity"?: number | null,"id"?: never,"idempotency_key"?: string | null,"note"?: string | null,"out_of_range"?: boolean,"pharmacy_id"?: string,"recorded_at"?: string,"recorded_by"?: string | null,"recorded_on"?: string,"temperature"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "environment_readings_pharmacy_id_branch_id_fkey"
      columns: ["pharmacy_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["pharmacy_id","id"]
    },{
      foreignKeyName: "environment_readings_pharmacy_id_fkey"
      columns: ["pharmacy_id"]
isOneToOne: false
      referencedRelation: "pharmacies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "environment_readings_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"inventory_movements": {
                  Row: {
                    "branch_id": string,"created_at": string,"created_by": string | null,"id": number,"idempotency_key": string | null,"lot_id": string,"pharmacy_id": string,"product_id": string,"purchase_id": string | null,"quantity_after": number,"quantity_delta": number,"reason": string | null,"sale_id": string | null,"type": Database["public"]['Enums']["movement_type"],"unit_cost": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: never,"idempotency_key"?: string | null,"lot_id": string,"pharmacy_id": string,"product_id": string,"purchase_id"?: string | null,"quantity_after": number,"quantity_delta": number,"reason"?: string | null,"sale_id"?: string | null,"type": Database["public"]['Enums']["movement_type"],"unit_cost"?: number | null
                  }
                  Update: {
                    "branch_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: never,"idempotency_key"?: string | null,"lot_id"?: string,"pharmacy_id"?: string,"product_id"?: string,"purchase_id"?: string | null,"quantity_after"?: number,"quantity_delta"?: number,"reason"?: string | null,"sale_id"?: string | null,"type"?: Database["public"]['Enums']["movement_type"],"unit_cost"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_movements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_lot_id_fkey"
      columns: ["lot_id"]
isOneToOne: false
      referencedRelation: "lots"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_pharmacy_id_branch_id_fkey"
      columns: ["pharmacy_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["pharmacy_id","id"]
    },{
      foreignKeyName: "inventory_movements_pharmacy_id_fkey"
      columns: ["pharmacy_id"]
isOneToOne: false
      referencedRelation: "pharmacies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_pharmacy_id_product_id_fkey"
      columns: ["pharmacy_id","product_id"]
isOneToOne: false
      referencedRelation: "product_stock"
      referencedColumns: ["pharmacy_id","product_id"]
    },{
      foreignKeyName: "inventory_movements_pharmacy_id_product_id_fkey"
      columns: ["pharmacy_id","product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["pharmacy_id","id"]
    },{
      foreignKeyName: "inventory_movements_purchase_id_fkey"
      columns: ["purchase_id"]
isOneToOne: false
      referencedRelation: "purchases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_sale_id_fkey"
      columns: ["sale_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["id"]
    }
                  ]
                },"lots": {
                  Row: {
                    "branch_id": string,"created_at": string,"expiry_date": string | null,"id": string,"lot_code": string,"pharmacy_id": string,"product_id": string,"quantity": number,"unit_cost": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"created_at"?: string,"expiry_date"?: string | null,"id"?: string,"lot_code": string,"pharmacy_id": string,"product_id": string,"quantity": number,"unit_cost": number,"updated_at"?: string
                  }
                  Update: {
                    "branch_id"?: string,"created_at"?: string,"expiry_date"?: string | null,"id"?: string,"lot_code"?: string,"pharmacy_id"?: string,"product_id"?: string,"quantity"?: number,"unit_cost"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lots_pharmacy_id_branch_id_fkey"
      columns: ["pharmacy_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["pharmacy_id","id"]
    },{
      foreignKeyName: "lots_pharmacy_id_fkey"
      columns: ["pharmacy_id"]
isOneToOne: false
      referencedRelation: "pharmacies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lots_pharmacy_id_product_id_fkey"
      columns: ["pharmacy_id","product_id"]
isOneToOne: false
      referencedRelation: "product_stock"
      referencedColumns: ["pharmacy_id","product_id"]
    },{
      foreignKeyName: "lots_pharmacy_id_product_id_fkey"
      columns: ["pharmacy_id","product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["pharmacy_id","id"]
    }
                  ]
                },"pharmacies": {
                  Row: {
                    "charges_igv": boolean,"created_at": string,"einvoice_enabled": boolean,"fiscal_address": string | null,"id": string,"legal_name": string,"ruc": string | null,"status": Database["public"]['Enums']["pharmacy_status"],"trade_name": string | null,"ubigeo": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "charges_igv"?: boolean,"created_at"?: string,"einvoice_enabled"?: boolean,"fiscal_address"?: string | null,"id"?: string,"legal_name": string,"ruc"?: string | null,"status"?: Database["public"]['Enums']["pharmacy_status"],"trade_name"?: string | null,"ubigeo"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "charges_igv"?: boolean,"created_at"?: string,"einvoice_enabled"?: boolean,"fiscal_address"?: string | null,"id"?: string,"legal_name"?: string,"ruc"?: string | null,"status"?: Database["public"]['Enums']["pharmacy_status"],"trade_name"?: string | null,"ubigeo"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"pharmacy_members": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"pharmacy_id": string,"role": Database["public"]['Enums']["app_role"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"pharmacy_id": string,"role": Database["public"]['Enums']["app_role"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"pharmacy_id"?: string,"role"?: Database["public"]['Enums']["app_role"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pharmacy_members_pharmacy_id_fkey"
      columns: ["pharmacy_id"]
isOneToOne: false
      referencedRelation: "pharmacies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pharmacy_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "active": boolean,"barcode": string | null,"category_id": string | null,"concentration": string | null,"created_at": string,"digemid_code": string | null,"generic_name": string | null,"id": string,"laboratory": string | null,"min_stock": number,"name": string,"pharmacy_id": string,"price_blister": number | null,"price_box": number | null,"price_unit": number,"requires_prescription": boolean,"sanitary_registry": string | null,"tax_affectation": Database["public"]['Enums']["tax_affectation"],"unit_label": string,"units_per_blister": number | null,"units_per_box": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"barcode"?: string | null,"category_id"?: string | null,"concentration"?: string | null,"created_at"?: string,"digemid_code"?: string | null,"generic_name"?: string | null,"id"?: string,"laboratory"?: string | null,"min_stock"?: number,"name": string,"pharmacy_id": string,"price_blister"?: number | null,"price_box"?: number | null,"price_unit": number,"requires_prescription"?: boolean,"sanitary_registry"?: string | null,"tax_affectation"?: Database["public"]['Enums']["tax_affectation"],"unit_label"?: string,"units_per_blister"?: number | null,"units_per_box"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"barcode"?: string | null,"category_id"?: string | null,"concentration"?: string | null,"created_at"?: string,"digemid_code"?: string | null,"generic_name"?: string | null,"id"?: string,"laboratory"?: string | null,"min_stock"?: number,"name"?: string,"pharmacy_id"?: string,"price_blister"?: number | null,"price_box"?: number | null,"price_unit"?: number,"requires_prescription"?: boolean,"sanitary_registry"?: string | null,"tax_affectation"?: Database["public"]['Enums']["tax_affectation"],"unit_label"?: string,"units_per_blister"?: number | null,"units_per_box"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_pharmacy_id_category_id_fkey"
      columns: ["pharmacy_id","category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["pharmacy_id","id"]
    },{
      foreignKeyName: "products_pharmacy_id_fkey"
      columns: ["pharmacy_id"]
isOneToOne: false
      referencedRelation: "pharmacies"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string | null,"full_name": string | null,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string | null,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string | null,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"purchase_items": {
                  Row: {
                    "expiry_date": string | null,"id": number,"igv": number,"line_subtotal": number,"lot_code": string,"lot_id": string,"pharmacy_id": string,"product_id": string,"product_name": string,"purchase_id": string,"quantity": number,"unit_cost": number
                  }
                  ComputedFields: never
                  Insert: {
                    "expiry_date"?: string | null,"id"?: never,"igv": number,"line_subtotal": number,"lot_code": string,"lot_id": string,"pharmacy_id": string,"product_id": string,"product_name": string,"purchase_id": string,"quantity": number,"unit_cost": number
                  }
                  Update: {
                    "expiry_date"?: string | null,"id"?: never,"igv"?: number,"line_subtotal"?: number,"lot_code"?: string,"lot_id"?: string,"pharmacy_id"?: string,"product_id"?: string,"product_name"?: string,"purchase_id"?: string,"quantity"?: number,"unit_cost"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchase_items_lot_id_fkey"
      columns: ["lot_id"]
isOneToOne: false
      referencedRelation: "lots"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_items_pharmacy_id_product_id_fkey"
      columns: ["pharmacy_id","product_id"]
isOneToOne: false
      referencedRelation: "product_stock"
      referencedColumns: ["pharmacy_id","product_id"]
    },{
      foreignKeyName: "purchase_items_pharmacy_id_product_id_fkey"
      columns: ["pharmacy_id","product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["pharmacy_id","id"]
    },{
      foreignKeyName: "purchase_items_pharmacy_id_purchase_id_fkey"
      columns: ["pharmacy_id","purchase_id"]
isOneToOne: false
      referencedRelation: "purchases"
      referencedColumns: ["pharmacy_id","id"]
    }
                  ]
                },"purchases": {
                  Row: {
                    "branch_id": string,"created_at": string,"created_by": string | null,"doc_number": string,"doc_type": Database["public"]['Enums']["purchase_doc_type"],"id": string,"idempotency_key": string | null,"igv": number,"issue_date": string,"note": string | null,"pharmacy_id": string,"subtotal": number,"supplier_id": string,"total": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"created_at"?: string,"created_by"?: string | null,"doc_number": string,"doc_type": Database["public"]['Enums']["purchase_doc_type"],"id"?: string,"idempotency_key"?: string | null,"igv"?: number,"issue_date": string,"note"?: string | null,"pharmacy_id": string,"subtotal"?: number,"supplier_id": string,"total"?: never
                  }
                  Update: {
                    "branch_id"?: string,"created_at"?: string,"created_by"?: string | null,"doc_number"?: string,"doc_type"?: Database["public"]['Enums']["purchase_doc_type"],"id"?: string,"idempotency_key"?: string | null,"igv"?: number,"issue_date"?: string,"note"?: string | null,"pharmacy_id"?: string,"subtotal"?: number,"supplier_id"?: string,"total"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchases_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchases_pharmacy_id_branch_id_fkey"
      columns: ["pharmacy_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["pharmacy_id","id"]
    },{
      foreignKeyName: "purchases_pharmacy_id_fkey"
      columns: ["pharmacy_id"]
isOneToOne: false
      referencedRelation: "pharmacies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchases_pharmacy_id_supplier_id_fkey"
      columns: ["pharmacy_id","supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["pharmacy_id","id"]
    }
                  ]
                },"receipt_sequences": {
                  Row: {
                    "branch_id": string,"last_number": number,"pharmacy_id": string,"series": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"last_number"?: number,"pharmacy_id": string,"series"?: string
                  }
                  Update: {
                    "branch_id"?: string,"last_number"?: number,"pharmacy_id"?: string,"series"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "receipt_sequences_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: true
      referencedRelation: "branches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "receipt_sequences_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: true
      referencedRelation: "product_stock"
      referencedColumns: ["branch_id"]
    },{
      foreignKeyName: "receipt_sequences_pharmacy_id_fkey"
      columns: ["pharmacy_id"]
isOneToOne: false
      referencedRelation: "pharmacies"
      referencedColumns: ["id"]
    }
                  ]
                },"sale_item_lots": {
                  Row: {
                    "id": number,"lot_id": string,"pharmacy_id": string,"quantity": number,"sale_item_id": string,"unit_cost": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: never,"lot_id": string,"pharmacy_id": string,"quantity": number,"sale_item_id": string,"unit_cost": number
                  }
                  Update: {
                    "id"?: never,"lot_id"?: string,"pharmacy_id"?: string,"quantity"?: number,"sale_item_id"?: string,"unit_cost"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "sale_item_lots_lot_id_fkey"
      columns: ["lot_id"]
isOneToOne: false
      referencedRelation: "lots"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sale_item_lots_pharmacy_id_fkey"
      columns: ["pharmacy_id"]
isOneToOne: false
      referencedRelation: "pharmacies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sale_item_lots_sale_item_id_fkey"
      columns: ["sale_item_id"]
isOneToOne: false
      referencedRelation: "sale_items"
      referencedColumns: ["id"]
    }
                  ]
                },"sale_items": {
                  Row: {
                    "base_quantity": number,"id": string,"igv_amount": number,"igv_rate": number,"line_total": number,"pharmacy_id": string,"presentation": Database["public"]['Enums']["sale_presentation"],"product_id": string,"product_name": string,"quantity": number,"sale_id": string,"tax_affectation": Database["public"]['Enums']["tax_affectation"],"taxable_amount": number | null,"unit_price": number,"units_per_presentation": number
                  }
                  ComputedFields: never
                  Insert: {
                    "base_quantity": number,"id"?: string,"igv_amount"?: number,"igv_rate"?: number,"line_total": number,"pharmacy_id": string,"presentation": Database["public"]['Enums']["sale_presentation"],"product_id": string,"product_name": string,"quantity": number,"sale_id": string,"tax_affectation"?: Database["public"]['Enums']["tax_affectation"],"taxable_amount"?: never,"unit_price": number,"units_per_presentation": number
                  }
                  Update: {
                    "base_quantity"?: number,"id"?: string,"igv_amount"?: number,"igv_rate"?: number,"line_total"?: number,"pharmacy_id"?: string,"presentation"?: Database["public"]['Enums']["sale_presentation"],"product_id"?: string,"product_name"?: string,"quantity"?: number,"sale_id"?: string,"tax_affectation"?: Database["public"]['Enums']["tax_affectation"],"taxable_amount"?: never,"unit_price"?: number,"units_per_presentation"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "sale_items_pharmacy_id_product_id_fkey"
      columns: ["pharmacy_id","product_id"]
isOneToOne: false
      referencedRelation: "product_stock"
      referencedColumns: ["pharmacy_id","product_id"]
    },{
      foreignKeyName: "sale_items_pharmacy_id_product_id_fkey"
      columns: ["pharmacy_id","product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["pharmacy_id","id"]
    },{
      foreignKeyName: "sale_items_pharmacy_id_sale_id_fkey"
      columns: ["pharmacy_id","sale_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["pharmacy_id","id"]
    }
                  ]
                },"sales": {
                  Row: {
                    "amount_received": number,"branch_id": string,"cash_session_id": string,"change_given": number,"charges_igv": boolean,"created_at": string,"created_by": string | null,"customer_doc_number": string | null,"customer_doc_type": Database["public"]['Enums']["customer_doc_type"] | null,"customer_id": string | null,"customer_name": string | null,"id": string,"idempotency_key": string | null,"payment_method": Database["public"]['Enums']["payment_method"],"payment_reference": string | null,"pharmacy_id": string,"receipt_number": number,"receipt_series": string,"status": Database["public"]['Enums']["sale_status"],"total": number,"total_exonerado": number,"total_gravado": number,"total_igv": number,"total_inafecto": number,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_received"?: number,"branch_id": string,"cash_session_id": string,"change_given"?: number,"charges_igv"?: boolean,"created_at"?: string,"created_by"?: string | null,"customer_doc_number"?: string | null,"customer_doc_type"?: Database["public"]['Enums']["customer_doc_type"] | null,"customer_id"?: string | null,"customer_name"?: string | null,"id"?: string,"idempotency_key"?: string | null,"payment_method": Database["public"]['Enums']["payment_method"],"payment_reference"?: string | null,"pharmacy_id": string,"receipt_number": number,"receipt_series"?: string,"status"?: Database["public"]['Enums']["sale_status"],"total"?: number,"total_exonerado"?: number,"total_gravado"?: number,"total_igv"?: number,"total_inafecto"?: number,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "amount_received"?: number,"branch_id"?: string,"cash_session_id"?: string,"change_given"?: number,"charges_igv"?: boolean,"created_at"?: string,"created_by"?: string | null,"customer_doc_number"?: string | null,"customer_doc_type"?: Database["public"]['Enums']["customer_doc_type"] | null,"customer_id"?: string | null,"customer_name"?: string | null,"id"?: string,"idempotency_key"?: string | null,"payment_method"?: Database["public"]['Enums']["payment_method"],"payment_reference"?: string | null,"pharmacy_id"?: string,"receipt_number"?: number,"receipt_series"?: string,"status"?: Database["public"]['Enums']["sale_status"],"total"?: number,"total_exonerado"?: number,"total_gravado"?: number,"total_igv"?: number,"total_inafecto"?: number,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sales_cash_session_id_fkey"
      columns: ["cash_session_id"]
isOneToOne: false
      referencedRelation: "cash_session_summary"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_cash_session_id_fkey"
      columns: ["cash_session_id"]
isOneToOne: false
      referencedRelation: "cash_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_customer_fkey"
      columns: ["pharmacy_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["pharmacy_id","id"]
    },{
      foreignKeyName: "sales_pharmacy_id_branch_id_fkey"
      columns: ["pharmacy_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["pharmacy_id","id"]
    },{
      foreignKeyName: "sales_pharmacy_id_fkey"
      columns: ["pharmacy_id"]
isOneToOne: false
      referencedRelation: "pharmacies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"suppliers": {
                  Row: {
                    "active": boolean,"created_at": string,"email": string | null,"id": string,"name": string,"pharmacy_id": string,"phone": string | null,"ruc": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"email"?: string | null,"id"?: string,"name": string,"pharmacy_id": string,"phone"?: string | null,"ruc"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"email"?: string | null,"id"?: string,"name"?: string,"pharmacy_id"?: string,"phone"?: string | null,"ruc"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "suppliers_pharmacy_id_fkey"
      columns: ["pharmacy_id"]
isOneToOne: false
      referencedRelation: "pharmacies"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "cash_session_summary": {
                  Row: {
                    "branch_id": string | null,"card_sales": number | null,"cash_sales": number | null,"closed_at": string | null,"closed_by": string | null,"closed_by_name": string | null,"counted_cash": number | null,"difference": number | null,"expected_cash": number | null,"expense_total": number | null,"id": string | null,"income_total": number | null,"notes": string | null,"opened_at": string | null,"opened_by": string | null,"opened_by_name": string | null,"opening_amount": number | null,"pharmacy_id": string | null,"plin_sales": number | null,"sales_count": number | null,"status": Database["public"]['Enums']["cash_session_status"] | null,"voided_count": number | null,"yape_sales": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "cash_sessions_closed_by_fkey"
      columns: ["closed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_sessions_opened_by_fkey"
      columns: ["opened_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_sessions_pharmacy_id_branch_id_fkey"
      columns: ["pharmacy_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["pharmacy_id","id"]
    },{
      foreignKeyName: "cash_sessions_pharmacy_id_fkey"
      columns: ["pharmacy_id"]
isOneToOne: false
      referencedRelation: "pharmacies"
      referencedColumns: ["id"]
    }
                  ]
                },"product_stock": {
                  Row: {
                    "barcode": string | null,"branch_id": string | null,"category_id": string | null,"concentration": string | null,"expired_quantity": number | null,"generic_name": string | null,"is_low": boolean | null,"lot_count": number | null,"min_stock": number | null,"name": string | null,"next_expiry": string | null,"pharmacy_id": string | null,"price_blister": number | null,"price_box": number | null,"price_unit": number | null,"product_id": string | null,"requires_prescription": boolean | null,"sellable_quantity": number | null,"tax_affectation": Database["public"]['Enums']["tax_affectation"] | null,"total_quantity": number | null,"unit_label": string | null,"units_per_blister": number | null,"units_per_box": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "products_pharmacy_id_category_id_fkey"
      columns: ["pharmacy_id","category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["pharmacy_id","id"]
    },{
      foreignKeyName: "products_pharmacy_id_fkey"
      columns: ["pharmacy_id"]
isOneToOne: false
      referencedRelation: "pharmacies"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "add_cash_movement":
{ Args: { "p_amount": number,"p_reason": string,"p_session": string,"p_type": Database["public"]['Enums']["cash_movement_type"] }; Returns: number
                           },
"adjust_stock":
{ Args: { "p_delta": number,"p_idempotency_key"?: string,"p_lot": string,"p_reason": string,"p_type": Database["public"]['Enums']["movement_type"] }; Returns: number
                           },
"close_cash_session":
{ Args: { "p_counted_cash": number,"p_notes"?: string,"p_session": string }; Returns: Json
                           },
"create_sale":
{ Args: { "p_amount_received"?: number,"p_branch": string,"p_customer"?: Json,"p_idempotency_key"?: string,"p_items": Json,"p_payment_method": Database["public"]['Enums']["payment_method"],"p_payment_reference"?: string }; Returns: string
                           },
"environment_limits":
{ Args: Record<PropertyKey, never>; Returns: {
              "area": Database["public"]['Enums']["environment_area"],"humidity_max": number,"temp_max": number,"temp_min": number
            }[]
                           },
"get_my_memberships":
{ Args: Record<PropertyKey, never>; Returns: {
              "pharmacy_id": string,"pharmacy_name": string,"role": Database["public"]['Enums']["app_role"]
            }[]
                           },
"get_sales_summary":
{ Args: { "p_branch": string,"p_from": string,"p_to": string }; Returns: {
              "card": number,"cash": number,"plin": number,"sales_count": number,"total": number,"voided_count": number,"yape": number
            }[]
                           },
"open_cash_session":
{ Args: { "p_branch": string,"p_opening_amount": number }; Returns: string
                           },
"record_environment_reading":
{ Args: { "p_area": Database["public"]['Enums']["environment_area"],"p_branch": string,"p_humidity"?: number,"p_idempotency_key"?: string,"p_note"?: string,"p_temperature": number }; Returns: number
                           },
"register_pharmacy":
{ Args: { "p_legal_name": string,"p_ruc"?: string,"p_trade_name"?: string }; Returns: string
                           },
"register_purchase":
{ Args: { "p_branch": string,"p_doc_number": string,"p_doc_type": Database["public"]['Enums']["purchase_doc_type"],"p_idempotency_key"?: string,"p_issue_date": string,"p_items": Json,"p_note"?: string,"p_supplier": string }; Returns: string
                           },
"register_stock_entry":
{ Args: { "p_branch": string,"p_expiry": string,"p_idempotency_key"?: string,"p_lot_code": string,"p_product": string,"p_quantity": number,"p_reason"?: string,"p_unit_cost": number }; Returns: string
                           },
"report_inventory_value":
{ Args: { "p_branch": string }; Returns: {
              "expired_cost": number,"expiring_30_cost": number,"expiring_60_cost": number,"expiring_90_cost": number,"products_with_stock": number,"stock_cost": number,"stock_units": number
            }[]
                           },
"report_kardex":
{ Args: { "p_branch": string,"p_from": string,"p_product": string,"p_to": string }; Returns: {
              "balance_quantity": number,"balance_value": number,"created_by_name": string,"document": string,"kind": string,"lot_code": string,"moved_at": string,"quantity_in": number,"quantity_out": number,"unit_cost": number,"value_delta": number
            }[]
                           },
"report_sales_series":
{ Args: { "p_branch": string,"p_from": string,"p_granularity"?: string,"p_to": string }; Returns: {
              "card": number,"cash": number,"cost": number,"igv": number,"net": number,"period": string,"plin": number,"profit": number,"sales_count": number,"total": number,"yape": number
            }[]
                           },
"report_sales_summary":
{ Args: { "p_branch": string,"p_from": string,"p_to": string }; Returns: {
              "avg_ticket": number,"cost": number,"igv": number,"net": number,"profit": number,"sales_count": number,"total": number,"voided_count": number,"voided_total": number
            }[]
                           },
"report_slow_movers":
{ Args: { "p_branch": string,"p_days"?: number,"p_limit"?: number }; Returns: {
              "last_sale_at": string,"name": string,"product_id": string,"stock_cost": number,"stock_units": number,"unit_label": string,"units_sold": number
            }[]
                           },
"report_top_products":
{ Args: { "p_branch": string,"p_from": string,"p_limit"?: number,"p_order"?: string,"p_to": string }; Returns: {
              "cost": number,"margin": number,"name": string,"net": number,"product_id": string,"profit": number,"revenue": number,"units": number
            }[]
                           },
"reserve_einvoice":
{ Args: { "p_sale": string }; Returns: {
              "attempts": number,
"cdr_xml": string | null,
"created_at": string,
"created_by": string | null,
"doc_type": string,
"environment": string,
"hash": string | null,
"id": string,
"number": number,
"pharmacy_id": string,
"sale_id": string,
"sent_at": string | null,
"series": string,
"status": Database["public"]['Enums']["einvoice_status"],
"sunat_code": string | null,
"sunat_description": string | null,
"sunat_notes": (string)[],
"updated_at": string,
"xml": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "einvoices"
        isOneToOne: true
        isSetofReturn: false
      } },
"void_sale":
{ Args: { "p_reason": string,"p_sale": string }; Returns: undefined
                           }
          }
          Enums: {
            "app_role": "admin"|"cashier","cash_movement_type": "income"|"expense","cash_session_status": "open"|"closed","customer_doc_type": "dni"|"ruc"|"ce"|"passport","einvoice_status": "pending"|"accepted"|"observed"|"rejected"|"error","environment_area": "room"|"fridge","movement_type": "entry"|"adjustment"|"write_off"|"sale"|"sale_void","payment_method": "cash"|"yape"|"plin"|"card","pharmacy_status": "trial"|"active"|"suspended"|"cancelled","purchase_doc_type": "invoice"|"receipt"|"guide"|"other","sale_presentation": "unit"|"blister"|"box","sale_status": "completed"|"voided","tax_affectation": "gravado"|"exonerado"|"inafecto"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "app_role": ["admin", "cashier"],"cash_movement_type": ["income", "expense"],"cash_session_status": ["open", "closed"],"customer_doc_type": ["dni", "ruc", "ce", "passport"],"einvoice_status": ["pending", "accepted", "observed", "rejected", "error"],"environment_area": ["room", "fridge"],"movement_type": ["entry", "adjustment", "write_off", "sale", "sale_void"],"payment_method": ["cash", "yape", "plin", "card"],"pharmacy_status": ["trial", "active", "suspended", "cancelled"],"purchase_doc_type": ["invoice", "receipt", "guide", "other"],"sale_presentation": ["unit", "blister", "box"],"sale_status": ["completed", "voided"],"tax_affectation": ["gravado", "exonerado", "inafecto"]
          }
        }
} as const
