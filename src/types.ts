export interface Env {
  DB: D1Database;
  API_BASE_URL: string;
  WITNESSKEY_VERIFY_BASE_URL: string;
  ABRACADOO_ACCEPT_WITNESS_BASE_URL: string;
  ALLOWED_ORIGINS: string;
  RECEIPT_SIGNING_SECRET?: string;
}

export interface JsonError {
  error: {
    code: string;
    message: string;
  };
}
