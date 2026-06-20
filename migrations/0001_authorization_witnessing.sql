CREATE TABLE authorization_offers (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  event_type TEXT NOT NULL,
  issuer_name TEXT NOT NULL,
  issuer_origin TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_label TEXT,
  declared_roles_json TEXT NOT NULL,
  consent_prompt TEXT NOT NULL,
  consent_prompt_hash TEXT NOT NULL,
  storage_policy_json TEXT NOT NULL,
  claims_policy_json TEXT NOT NULL,
  return_url TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE authorization_events (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL,
  loop_id TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  event_type TEXT NOT NULL,
  issuer_name TEXT NOT NULL,
  issuer_origin TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  participant_app TEXT,
  participant_ref TEXT,
  participant_role TEXT,
  declared_roles_json TEXT NOT NULL,
  consent_prompt_hash TEXT NOT NULL,
  storage_policy_json TEXT NOT NULL,
  claims_policy_json TEXT NOT NULL,
  receipt_json TEXT NOT NULL,
  receipt_signature TEXT NOT NULL,
  verification_url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  status TEXT NOT NULL,
  FOREIGN KEY(offer_id) REFERENCES authorization_offers(id)
);

CREATE INDEX idx_authorization_offers_status
ON authorization_offers(status);

CREATE INDEX idx_authorization_offers_expires_at
ON authorization_offers(expires_at);

CREATE INDEX idx_authorization_events_offer_id
ON authorization_events(offer_id);

CREATE INDEX idx_authorization_events_payload_hash
ON authorization_events(payload_hash);
