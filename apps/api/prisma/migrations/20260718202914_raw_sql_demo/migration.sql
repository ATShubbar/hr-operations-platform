-- Hand-written SQL migration: demonstrates the raw-SQL escape hatch the
-- RLS policies (WS-13, ADR-001) will use. Prisma applies this file verbatim.
CREATE INDEX ws11_check_note_idx ON ws11_check (note);
