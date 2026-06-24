CREATE TABLE provenance_loops (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  closed_at TEXT,
  status TEXT NOT NULL,
  code_step_seconds INTEGER NOT NULL,
  verify_url TEXT NOT NULL
);

CREATE TABLE provenance_code_windows (
  id TEXT PRIMARY KEY,
  loop_id TEXT NOT NULL,
  code TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(loop_id) REFERENCES provenance_loops(id)
);

CREATE INDEX idx_provenance_loops_status
ON provenance_loops(status);

CREATE INDEX idx_provenance_loops_expires_at
ON provenance_loops(expires_at);

CREATE INDEX idx_provenance_code_windows_loop_start
ON provenance_code_windows(loop_id, window_start DESC);
