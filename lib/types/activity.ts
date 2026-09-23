export type ActivityEventType =
  | "project_created"
  | "application_accepted"
  | "role_filled"
  | "project_stale";

export type ActivityEventMetadata = {
  project_name?: string;
  role_title?: string;
  category?: string;
  slug?: string;
  positions?: number;
  [key: string]: unknown;
};

export type ActivityEvent = {
  id: string;
  event_type: ActivityEventType;
  project_id: string | null;
  actor_user_id: string | null;
  metadata: ActivityEventMetadata;
  created_at: string;
};

