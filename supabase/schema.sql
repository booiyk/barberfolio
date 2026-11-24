-- Barberfolio — skema produksi (Supabase / PostgreSQL)
-- Diadaptasi dari Lampiran A spek v1.0 (19 halaman).
-- Jalankan di Supabase SQL Editor. Kolom audit created_at/updated_at
-- dan policy RLS rinci ditambahkan mengikuti Bab 8 spek.
-- Catatan: versi standalone di repo ini memakai localStorage dengan
-- struktur yang sama; transaction_items di sini tabel terpisah,
-- sedangkan di versi localStorage item disimpan di dalam transaksi.

create table branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  address text,
  city text,
  phone text,
  timezone text not null default 'Asia/Jakarta',
  opened_at date,
  rent_monthly bigint,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  full_name text not null,
  phone text,
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table branch_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  branch_id uuid not null references branches(id),
  role text not null check (role in ('owner', 'branch_admin', 'barber')),
  barber_id uuid references barbers(id),
  unique (user_id, branch_id, role),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table services (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  name text not null,
  category text not null check (category in ('service', 'product')),
  price bigint not null check (price >= 0),
  duration_minutes integer,
  commission_percent numeric(5,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table barbers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  full_name text not null,
  phone text,
  commission_scheme text not null default 'percent',
  commission_percent numeric(5,2),
  base_salary_monthly bigint,
  joined_at date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  phone text,
  notes text,
  first_visit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  customer_id uuid references customers(id),
  served_by_barber_id uuid references barbers(id),
  transacted_at timestamptz not null default now(),
  discount_amount bigint not null default 0,
  tip_amount bigint not null default 0,
  payment_method text not null check (payment_method in ('cash', 'qris', 'transfer', 'card', 'ewallet')),
  payment_ref text,
  source text not null default 'manual',
  status text not null default 'completed' check (status in ('completed', 'void', 'refunded')),
  created_by uuid not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id),
  service_id uuid not null references services(id),
  barber_id uuid not null references barbers(id),
  qty integer not null default 1 check (qty > 0),
  unit_price bigint not null,
  commission_percent numeric(5,2) not null default 0,
  commission_amount bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  expense_date date not null,
  category text not null,
  description text not null,
  amount bigint not null check (amount >= 0),
  is_recurring boolean not null default false,
  receipt_url text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table daily_closings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  closing_date date not null,
  total_transactions integer not null default 0,
  total_customers integer not null default 0,
  gross_revenue bigint not null default 0,
  discount_total bigint not null default 0,
  net_revenue bigint not null default 0,
  commission_total bigint not null default 0,
  expense_total bigint not null default 0,
  tip_total bigint not null default 0,
  cash_expected bigint not null default 0,
  cash_actual bigint,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'locked')),
  submitted_by uuid,
  locked_by uuid,
  unique (branch_id, closing_date),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_tx_branch_time on transactions(branch_id, transacted_at);
create index idx_exp_branch_date on expenses(branch_id, expense_date);
create index idx_items_barber on transaction_items(barber_id);
