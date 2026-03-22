-- SoulCheck MVP - Database Schema

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions (each analysis request)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  phone TEXT NOT NULL,
  user_name TEXT,
  target_name TEXT,
  birth_date TEXT,
  state TEXT NOT NULL DEFAULT 'WELCOME',
  partial_response TEXT,
  full_response TEXT,
  payment_status TEXT DEFAULT 'pending',
  stripe_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments log
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  phone TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'brl',
  provider TEXT NOT NULL,
  provider_id TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sessions_phone ON sessions(phone);
CREATE INDEX idx_sessions_state ON sessions(state);
CREATE INDEX idx_payments_session ON payments(session_id);
CREATE INDEX idx_payments_provider_id ON payments(provider_id);
