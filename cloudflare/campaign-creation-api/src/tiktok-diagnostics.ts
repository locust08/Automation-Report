import {z} from 'zod';

export const diagnosticFields=['advertiser_id','campaign_id','campaign_name','campaign_type','objective_type','budget','budget_mode','budget_optimize_on','operation_status','request_id','adgroup_id','adgroup_name','optimization_goal','billing_event','promotion_type','pixel_id','optimization_event','identity_id','identity_type','identity_authorized_bc_id','item_id','tiktok_item_id','video_id','ad_id','ad_name','creatives','schedule_start_time','location_ids'] as const;
export const tikTokDiagnosticSchema=z.object({
  endpoint:z.enum(['campaign/create','adgroup/create','ad/create','campaign/get','adgroup/get','ad/get']),
  step:z.enum(['campaign','adset','ad']),phase:z.enum(['creation','reconciliation']),
  timestamp:z.number().int().nonnegative(),duration_ms:z.number().int().nonnegative(),
  http_status:z.number().int().min(100).max(599).nullable(),native_code:z.number().int().safe().nullable(),
  provider_request_id:z.string().regex(/^[A-Za-z0-9_-]{1,256}$/).nullable(),
  classification:z.enum(['success','native_error','http_error','timeout','transport_error','invalid_json','oversized_response']),
  recognized_fields:z.array(z.enum(diagnosticFields)).max(diagnosticFields.length),
}).strict();
export type TikTokDiagnostic=z.infer<typeof tikTokDiagnosticSchema>;
