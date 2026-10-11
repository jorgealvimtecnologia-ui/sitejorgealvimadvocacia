-- AUD-15: agendamento online de consulta.
-- booking_settings: configuração (horários, duração, antecedência) guardada como JSON em key='config'.
-- booking_appointments: cada marcação feita pelo visitante, ligada ao lead (funil) e ao evento da agenda.
-- O link de gerenciamento (cancelar/remarcar) é enviado por e-mail; aqui fica só o HASH do token.
CREATE TABLE IF NOT EXISTS booking_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS booking_appointments (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  start_datetime TEXT NOT NULL,
  end_datetime TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  area TEXT,
  message TEXT,
  lead_id TEXT,
  event_id TEXT,
  status TEXT NOT NULL DEFAULT 'confirmado',  -- confirmado | cancelado | realizado
  reminder_sent INTEGER NOT NULL DEFAULT 0,
  reschedule_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  cancelled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_booking_start ON booking_appointments(start_datetime);
CREATE INDEX IF NOT EXISTS idx_booking_status ON booking_appointments(status);
