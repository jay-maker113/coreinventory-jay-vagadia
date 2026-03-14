create extension if not exists "uuid-ossp";

create table warehouses (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  short_code text not null unique,
  address text,
  created_at timestamptz default now()
);

create table locations (
  id uuid primary key default uuid_generate_v4(),
  warehouse_id uuid references warehouses(id) on delete cascade,
  name text not null,
  short_code text,
  created_at timestamptz default now()
);

create table categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  created_at timestamptz default now()
);

create table products (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  sku text not null unique,
  category_id uuid references categories(id) on delete set null,
  unit_of_measure text not null default 'pcs',
  reorder_point numeric default 0,
  created_at timestamptz default now()
);

create table stock_ledger (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid references products(id) on delete cascade,
  location_id uuid references locations(id) on delete cascade,
  quantity_change numeric not null,
  reference text,
  operation_type text not null,
  note text,
  created_at timestamptz default now()
);

create view stock_levels as
  select
    p.id as product_id,
    p.name as product_name,
    p.sku,
    p.unit_of_measure,
    p.reorder_point,
    c.name as category,
    l.id as location_id,
    l.name as location_name,
    w.id as warehouse_id,
    w.name as warehouse_name,
    coalesce(sum(sl.quantity_change), 0) as quantity_on_hand
  from products p
  left join categories c on c.id = p.category_id
  left join stock_ledger sl on sl.product_id = p.id
  left join locations l on l.id = sl.location_id
  left join warehouses w on w.id = l.warehouse_id
  group by p.id, p.name, p.sku, p.unit_of_measure, p.reorder_point,
           c.name, l.id, l.name, w.id, w.name;

create table receipts (
  id uuid primary key default uuid_generate_v4(),
  reference text not null unique,
  supplier text,
  location_id uuid references locations(id),
  status text not null default 'draft',
  scheduled_date date,
  created_at timestamptz default now(),
  validated_at timestamptz
);

create table receipt_lines (
  id uuid primary key default uuid_generate_v4(),
  receipt_id uuid references receipts(id) on delete cascade,
  product_id uuid references products(id),
  quantity_expected numeric not null default 0,
  quantity_received numeric not null default 0
);

create table deliveries (
  id uuid primary key default uuid_generate_v4(),
  reference text not null unique,
  customer text,
  location_id uuid references locations(id),
  status text not null default 'draft',
  scheduled_date date,
  created_at timestamptz default now(),
  validated_at timestamptz
);

create table delivery_lines (
  id uuid primary key default uuid_generate_v4(),
  delivery_id uuid references deliveries(id) on delete cascade,
  product_id uuid references products(id),
  quantity_demanded numeric not null default 0,
  quantity_done numeric not null default 0
);

create table transfers (
  id uuid primary key default uuid_generate_v4(),
  reference text not null unique,
  from_location_id uuid references locations(id),
  to_location_id uuid references locations(id),
  status text not null default 'draft',
  scheduled_date date,
  created_at timestamptz default now(),
  validated_at timestamptz
);

create table transfer_lines (
  id uuid primary key default uuid_generate_v4(),
  transfer_id uuid references transfers(id) on delete cascade,
  product_id uuid references products(id),
  quantity numeric not null default 0
);

create table adjustments (
  id uuid primary key default uuid_generate_v4(),
  reference text not null unique,
  location_id uuid references locations(id),
  status text not null default 'draft',
  note text,
  created_at timestamptz default now(),
  validated_at timestamptz
);

create table adjustment_lines (
  id uuid primary key default uuid_generate_v4(),
  adjustment_id uuid references adjustments(id) on delete cascade,
  product_id uuid references products(id),
  quantity_counted numeric not null default 0,
  quantity_difference numeric not null default 0
);

-- Default seed data
insert into warehouses (name, short_code, address)
values ('Main Warehouse', 'WH-MAIN', 'Default Location');

insert into locations (warehouse_id, name, short_code)
values (
  (select id from warehouses where short_code = 'WH-MAIN'),
  'Main Store', 'LOC-MAIN'
);

insert into categories (name)
values ('General'), ('Raw Materials'), ('Finished Goods');