-- ============================================================================
-- Kurly x TBS ERP — Unified Postgres / Supabase schema (books of record)
-- Replaces Microsoft Dynamics GP. Single legal entity, currency = IDR.
--
-- House conventions (matching the existing Cookie Doh SQL files):
--   * Idempotent DDL: create table if not exists / create index if not exists.
--   * RLS enabled on every business table; NO anon/authenticated policies on
--     control surfaces. Service-role API routes + SECURITY DEFINER RPCs are the
--     only writers of balances/ledgers.
--   * Money is whole IDR. IDR has no minor unit in practice. GL amounts use
--     numeric(18,2) for exact tax rounding; high-volume POS amounts use bigint
--     whole rupiah. Quantities use numeric(18,3/4) for split-pack precision.
--   * Append-only ledgers (inventory + GL + tax + budget + audit): no UPDATE,
--     no DELETE. Corrections are REVERSING rows/journals/transfers — the
--     unifying rule, never edits/deletes.
--   * Two-state document lifecycle: SAVE = deletable draft (no ledger effect);
--     POST = immutable + recorded. ONE deliberate exception: a store->DC
--     transfer deducts store on-hand AT SAVE and LOCKS the doc (still 'saved',
--     just non-deletable — NOT 'posted'; see the inventory section).
--
-- Posting-RPC signatures are given as COMMENTED STUBS at the end of each module
-- (and consolidated in the RPC section). The app NEVER mutates balances, ledger
-- rows, GL lines, open_amount or budget directly — it calls the RPCs.
--
-- Scale target: ~50k-SKU catalog, ~7k stocked SKUs, high retail/POS volume.
-- Hot sets use partial indexes; time columns are BRIN/partition candidates.
--
-- Tax model is INDONESIAN: PPN (VAT) 11%->12% rate-DATED per document (never
-- hardcoded), e-Faktur output/input NSFP numbering, faktur retur on returns,
-- PPh withholding with e-Bupot at PAYMENT time, monthly SPT Masa PPN. This is
-- NOT US sales tax / 1099.
--
-- Run order matters (FKs): roles/locations -> GL core -> tax -> inventory ->
-- purchasing/AP -> sales/AR -> bank -> migration. The file is ordered that way.
-- ============================================================================


-- ############################################################################
-- SECTION 0. ROLES / SECURITY / AUDIT (identity, locations, RLS keys, audit)
-- ############################################################################
--
-- RLS design (sketched; example policies follow each table):
--   * Store isolation by location_id. A store user SELECTs/INSERTs only rows
--     for its own location(s). Location comes from a SERVER-SET JWT claim
--     (auth.jwt()->>'location_id') or, more richly, from user_location_role
--     resolved via auth.uid() -> app_user -> grants. Never client-trusted.
--   * DC read-all. A DC operator (app_user.is_dc) bypasses the location filter
--     for SELECT only; writes are still scoped to DC.
--   * Helper functions below centralize the predicate so every policy reuses it.

create table if not exists public.app_user (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique not null,          -- FK-by-convention to auth.users
  full_name     text not null,
  email         text,
  is_dc         boolean not null default false, -- DC operator => read-all visibility
  is_active     boolean not null default true,
  gp_userid     text,                           -- legacy GP USERID for traceability
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists app_user_gp_userid_idx
  on public.app_user (gp_userid) where gp_userid is not null;
create index if not exists app_user_email_idx on public.app_user (lower(email));

-- Hub-and-spoke topology as DATA (replaces code-only locations). Exactly one DC
-- (hub) + N stores (spokes); every store's parent is the DC. The single-DC rule
-- is a partial unique index; store->DC->store routing is enforced in transfer
-- RPCs + the transfer CHECK trigger (see inventory section).
create table if not exists public.location (
  id                  text primary key,         -- 'dc','kemang','tbs-rcv','tbs-ktr','tbs-xmas'
  name                text not null,
  kind                text not null default 'store' check (kind in ('dc','store')),
  parent_location_id  text references public.location(id),  -- stores -> 'dc'; dc null
  gp_locncode         text,                      -- legacy GP LOCNCODE
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);
-- Single DC guarantee.
create unique index if not exists location_one_dc_idx
  on public.location (kind) where kind = 'dc';

-- Core of RLS + segregation of duties. Which locations a user can touch and at
-- what authority. can_post (POST authority, distinct from create/SAVE) and
-- can_override_budget (AP monthly-budget supervisor override) are cached from
-- role for fast RLS. Soft-revoke (revoked_at) — never delete, for audit.
create table if not exists public.user_location_role (
  id                   uuid primary key default gen_random_uuid(),
  app_user_id          uuid not null references public.app_user(id),
  location_id          text not null references public.location(id),
  role                 text not null check (role in
                         ('VIEWER','CASHIER','CLERK','BUYER','AP_CLERK',
                          'POSTER','SUPERVISOR','ADMIN')),
  can_post             boolean not null default false,
  can_override_budget  boolean not null default false,
  granted_by           uuid references public.app_user(id),
  granted_at           timestamptz not null default now(),
  revoked_at           timestamptz,
  -- Only SUPERVISOR/ADMIN may carry budget-override authority.
  constraint user_location_role_override_chk
    check (can_override_budget = false or role in ('SUPERVISOR','ADMIN'))
);
create unique index if not exists user_location_role_unique_idx
  on public.user_location_role (app_user_id, location_id, role)
  where revoked_at is null;
create index if not exists user_location_role_user_idx  on public.user_location_role (app_user_id);
create index if not exists user_location_role_loc_idx   on public.user_location_role (location_id);
-- SoD note: the same (user,location) creating AND posting the same AP voucher is
-- BLOCKED inside the post RPC (created_by <> posted_by), not by a table CHECK.

-- ---- RLS helper functions (centralized predicate) --------------------------
-- Resolve the calling auth user to an app_user id.
create or replace function public.current_app_user_id()
returns uuid language sql stable as $$
  select id from public.app_user where auth_user_id = auth.uid();
$$;

-- True if the caller is a DC operator (read-all).
create or replace function public.current_is_dc()
returns boolean language sql stable as $$
  select coalesce(
    (select is_dc from public.app_user where auth_user_id = auth.uid()),
    false);
$$;

-- The set of locations the calling user currently has an active grant for.
-- Every store-scoped policy compares row.location_id to this set (or allows all
-- when current_is_dc()). Falls back to the server-set JWT location claim if
-- grants are not used for a given deployment.
create or replace function public.current_locations()
returns setof text language sql stable as $$
  select ulr.location_id
    from public.user_location_role ulr
    join public.app_user au on au.id = ulr.app_user_id
   where au.auth_user_id = auth.uid()
     and ulr.revoked_at is null
  union
  select nullif(auth.jwt()->>'location_id','');
$$;

-- APPEND-ONLY, hash-chained audit trail. Written ONLY from inside SECURITY
-- DEFINER RPCs so the app cannot forge or skip entries. Covers SAVE/POST/
-- ACCEPT/OVERRIDE/role grant-revoke/period close/migration load.
create table if not exists public.audit_log (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  app_user_id  uuid references public.app_user(id),     -- acting user (auth.uid resolved)
  location_id  text references public.location(id),
  action       text not null,   -- 'AP_POST','TRANSFER_ACCEPT','BUDGET_OVERRIDE','ROLE_GRANT','MIGRATION_LOAD','PERIOD_CLOSE',...
  entity_type  text not null,   -- 'ap_voucher','inv_document','gl_journal','user_location_role',...
  entity_id    text not null,
  before_json  jsonb,
  after_json   jsonb,
  reason       text,            -- mandatory for overrides/reversals (asserted in RPC)
  prev_hash    bytea,           -- hash of previous audit row
  row_hash     bytea not null,  -- sha256(prev_hash || canonical(this row)) — tamper evidence
  source       text not null default 'app' check (source in ('app','migration','system'))
);
create index if not exists audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index if not exists audit_log_occurred_brin_idx
  on public.audit_log using brin (occurred_at);
-- At scale: PARTITION BY RANGE (occurred_at) monthly. A scheduled job verifies
-- the row_hash chain (each row_hash = sha256(prev_hash||canonical(row))).

-- ---- RLS enable + example policies (Section 0) -----------------------------
alter table public.app_user           enable row level security;
alter table public.location           enable row level security;
alter table public.user_location_role enable row level security;
alter table public.audit_log          enable row level security;

-- app_user: a user reads only their own row; DC/admin read all. Service role
-- (used by API routes) bypasses RLS entirely.
drop policy if exists app_user_self_read on public.app_user;
create policy app_user_self_read on public.app_user
  for select using (auth_user_id = auth.uid() or public.current_is_dc());

-- location: topology is not sensitive — everyone authenticated may read it.
-- Only ADMIN writes (enforced in RPC/service role; no write policy here).
drop policy if exists location_read_all on public.location;
create policy location_read_all on public.location
  for select using (auth.uid() is not null);

-- user_location_role: a user reads only their own grants; DC/admin read all.
drop policy if exists ulr_self_read on public.user_location_role;
create policy ulr_self_read on public.user_location_role
  for select using (app_user_id = public.current_app_user_id() or public.current_is_dc());

-- audit_log: store users see only their own location's entries; DC sees all.
-- No UPDATE/DELETE policy at all (append-only); INSERT only via definer RPC.
drop policy if exists audit_log_scoped_read on public.audit_log;
create policy audit_log_scoped_read on public.audit_log
  for select using (
    public.current_is_dc()
    or location_id in (select public.current_locations())
  );


-- ############################################################################
-- SECTION 1. GENERAL LEDGER (segmented COA, fiscal periods, double-entry
--            journals with a DB-ENFORCED debits=credits guarantee)
-- ############################################################################
--
-- DEBITS = CREDITS GUARANTEE (the central correctness control). We use THREE
-- layers, the third of which is the genuine DB enforcement the spec demands:
--
--   (1) Per-line CHECK: a line is one-sided and non-zero
--       (debit>=0 AND credit>=0 AND NOT (debit>0 AND credit>0) AND (debit>0 OR credit>0)).
--   (2) Header CHECK backstop: status<>'posted' OR (total_debit=total_credit
--       AND total_debit>0). Fast, but only validates the trigger-maintained
--       header totals, which could in principle drift — so it is a BACKSTOP.
--   (3) ***DEFERRED CONSTRAINT TRIGGER (INITIALLY DEFERRED)*** on gl_journal_line:
--       at COMMIT it re-SUMs the actual lines per journal and RAISEs if a journal
--       whose status='posted' has SUM(debit) <> SUM(credit) (or zero total).
--       Because it runs at the transaction boundary against the REAL lines, it
--       cannot be defeated by bypassing the per-line trigger, by COPY, or by a
--       definer insert that sets the header wrong. THIS is the DB guarantee.
--
--   The post_journal RPC ALSO recomputes SUM(debit)/SUM(credit) and sets the
--   header itself as defense-in-depth — but it is NOT the primary control.

create table if not exists public.gl_account (
  id                uuid primary key default gen_random_uuid(),
  code              text not null,             -- natural account, e.g. '1-1300'
  name              text not null,
  name_id           text,                      -- Bahasa label
  account_type      text not null check (account_type in
                      ('asset','liability','equity','revenue','cogs','expense','contra_asset')),
  normal_balance    text not null check (normal_balance in ('debit','credit')),
  parent_id         uuid references public.gl_account(id),  -- roll-up hierarchy
  is_postable       boolean not null default true,          -- header/parent rows not postable
  location_id       text references public.location(id),    -- null = entity-wide (shared)
  requires_location boolean not null default false,         -- inventory/COGS must carry a segment
  is_control        boolean not null default false,         -- AR/AP/Inventory/tax — only owning RPC posts
  subledger         text check (subledger in ('ar','ap','bank','tax_out','tax_in','pph','inventory')),
  currency          char(3) not null default 'IDR' check (currency = 'IDR'),
  gp_actindx        integer,                   -- legacy GP ACTINDX for journal remap
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);
-- One row per natural account per location segment (null = an entity-wide segment).
create unique index if not exists gl_account_code_loc_idx
  on public.gl_account (code, coalesce(location_id, '*entity*'));
create unique index if not exists gl_account_gp_actindx_idx
  on public.gl_account (gp_actindx) where gp_actindx is not null;
create index if not exists gl_account_postable_idx
  on public.gl_account (code, location_id) where is_postable and is_active;
create index if not exists gl_account_type_idx on public.gl_account (account_type);
create index if not exists gl_account_control_idx on public.gl_account (is_control) where is_control;

create table if not exists public.gl_fiscal_year (
  id         uuid primary key default gen_random_uuid(),
  year       integer not null unique,          -- e.g. 2026
  starts_on  date not null,
  ends_on    date not null,
  status     text not null default 'open' check (status in ('open','closed')),
  closed_at  timestamptz,
  created_at timestamptz not null default now(),
  constraint gl_fiscal_year_range_chk check (ends_on > starts_on)
);

-- Monthly accounting/tax periods. Posting is allowed ONLY into status='open'.
-- 'closed' rejects new postings (re-openable by supervisor); 'locked' is sealed
-- after the SPT Masa PPN is filed. The POST RPC checks this gate + journal_date
-- within bounds. Aligns to calendar month (Indonesian PPN). period_no 13 is the
-- adjustment/opening period for migration + year-end.
create table if not exists public.gl_period (
  id            text primary key,               -- 'YYYY-MM' (or 'YYYY-13' adjustment)
  fiscal_year_id uuid not null references public.gl_fiscal_year(id),
  period_no     smallint not null check (period_no between 1 and 13),
  starts_on     date not null,
  ends_on       date not null,
  status        text not null default 'open' check (status in ('open','closed','locked')),
  ppn_filed     boolean not null default false,
  ppn_filed_at  timestamptz,
  closed_by     uuid references public.app_user(id),
  closed_at     timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists gl_period_year_no_idx
  on public.gl_period (fiscal_year_id, period_no);
-- Periods within a year must not overlap. Enforced via a daterange exclusion
-- constraint (requires btree_gist). Added idempotently:
create extension if not exists btree_gist;
do $$
begin
  alter table public.gl_period
    add constraint gl_period_no_overlap
    exclude using gist (
      fiscal_year_id with =,
      daterange(starts_on, ends_on, '[]') with &&
    );
exception
  when duplicate_object then null;
  when duplicate_table then null;
end$$;

-- Journal header — the SAVE(draft)/POST(immutable) document. source_module +
-- source_doc_id make every subledger posting traceable and IDEMPOTENT (a unique
-- partial index so a webhook/transfer-accept retry can't double-post). reverses_
-- / reversed_by_ link a reversal to the journal it cancels.
create table if not exists public.gl_journal (
  id                    uuid primary key default gen_random_uuid(),
  journal_no            text,                   -- assigned at POST from a per-period sequence; null while draft
  period_id             text not null references public.gl_period(id),
  journal_date          date not null,          -- must fall within the period
  source_module         text not null,          -- inventory|receiving|transfer|ap|ar_sales|pos|bank|tax|opening|yearend|manual
  source_doc_type       text not null default '',
  source_doc_id         uuid,                   -- originating subledger doc
  memo                  text,
  status                text not null default 'draft' check (status in ('draft','posted','reversed')),
  reverses_journal_id   uuid references public.gl_journal(id),
  reversed_by_journal_id uuid references public.gl_journal(id),
  location_id           text references public.location(id),  -- primary RLS context; lines may touch DC + store
  total_debit           numeric(18,2) not null default 0,     -- maintained by line trigger; header backstop
  total_credit          numeric(18,2) not null default 0,
  created_by            uuid references public.app_user(id),
  posted_by             uuid references public.app_user(id),
  posted_at             timestamptz,
  created_at            timestamptz not null default now(),
  -- Header backstop (layer 2 of the balance guarantee).
  constraint gl_journal_balanced_chk    check (status <> 'posted' or total_debit = total_credit),
  constraint gl_journal_nonempty_chk    check (status <> 'posted' or total_debit > 0)
);
-- Idempotent subledger posting (partial unique).
create unique index if not exists gl_journal_source_idx
  on public.gl_journal (source_module, source_doc_type, source_doc_id)
  where source_doc_id is not null;
create unique index if not exists gl_journal_no_idx
  on public.gl_journal (journal_no) where journal_no is not null;
create index if not exists gl_journal_period_status_idx on public.gl_journal (period_id, status);
create index if not exists gl_journal_source_lookup_idx on public.gl_journal (source_module, source_doc_id);

-- Journal detail lines. Each line is a single-sided debit OR credit against one
-- postable, segmented account. on delete cascade only ever fires for DRAFT
-- headers (the immutability trigger below blocks deleting posted headers first).
create table if not exists public.gl_journal_line (
  id            uuid primary key default gen_random_uuid(),
  journal_id    uuid not null references public.gl_journal(id) on delete cascade,
  line_no       smallint not null,
  account_id    uuid not null references public.gl_account(id),
  location_id   text references public.location(id),  -- redundant segment copy for fast per-location P&L
  debit         numeric(18,2) not null default 0,
  credit        numeric(18,2) not null default 0,
  description   text,
  -- Control-account discipline: a line to an AR/AP/bank/tax control account MUST
  -- carry a party/subledger ref so subledgers reconcile to GL. Asserted in RPC.
  party_type    text check (party_type in ('customer','vendor','bank')),
  party_id      uuid,
  subledger_ref uuid,                            -- AP voucher / AR invoice / item movement drill-down
  tax_invoice_id uuid,                           -- FK added after tax_invoice exists (see ALTER below)
  constraint gl_line_signs_chk    check (debit >= 0 and credit >= 0),
  constraint gl_line_onesided_chk check (not (debit > 0 and credit > 0)),
  constraint gl_line_nonzero_chk  check (debit > 0 or credit > 0),
  constraint gl_line_lineno_uq    unique (journal_id, line_no)
);
create index if not exists gl_journal_line_account_idx on public.gl_journal_line (account_id);
create index if not exists gl_journal_line_journal_idx on public.gl_journal_line (journal_id);
create index if not exists gl_journal_line_party_idx
  on public.gl_journal_line (party_type, party_id) where party_id is not null;

-- Optional materialized period balance per (account, location, period). A
-- derivable PERFORMANCE CACHE maintained incrementally by the POST RPC; the
-- single source of truth remains gl_journal_line. A verify RPC rebuilds + asserts.
create table if not exists public.gl_account_balance (
  account_id      uuid not null references public.gl_account(id),
  location_id     text not null default '*entity*',  -- sentinel for entity-wide accounts
  period_id       text not null references public.gl_period(id),
  opening_balance numeric(18,2) not null default 0,
  period_debit    numeric(18,2) not null default 0,
  period_credit   numeric(18,2) not null default 0,
  closing_balance numeric(18,2) not null default 0,
  updated_at      timestamptz not null default now(),
  primary key (account_id, location_id, period_id)
);
create index if not exists gl_account_balance_period_idx on public.gl_account_balance (period_id);

-- ---- Balance-maintenance + immutability triggers ---------------------------

-- Layer 1/2 helper: keep gl_journal.total_debit/total_credit in sync as lines
-- change. (A convenience/backstop; layer 3 below is the real guarantee.)
create or replace function public.gl_journal_line_rollup()
returns trigger language plpgsql as $$
declare v_journal uuid;
begin
  v_journal := coalesce(new.journal_id, old.journal_id);
  update public.gl_journal j
     set total_debit  = coalesce((select sum(l.debit)  from public.gl_journal_line l where l.journal_id = v_journal), 0),
         total_credit = coalesce((select sum(l.credit) from public.gl_journal_line l where l.journal_id = v_journal), 0)
   where j.id = v_journal;
  return null;
end$$;

drop trigger if exists gl_journal_line_rollup_trg on public.gl_journal_line;
create trigger gl_journal_line_rollup_trg
  after insert or update or delete on public.gl_journal_line
  for each row execute function public.gl_journal_line_rollup();

-- Layer 3 (THE DB GUARANTEE): deferred constraint trigger. Fires at COMMIT and
-- re-sums the ACTUAL lines. Any posted journal that is unbalanced or empty
-- aborts the whole transaction, regardless of how the rows got there.
create or replace function public.gl_journal_assert_balanced()
returns trigger language plpgsql as $$
declare
  v_journal uuid := coalesce(new.journal_id, old.journal_id);
  v_status  text;
  v_dr      numeric(18,2);
  v_cr      numeric(18,2);
begin
  select status into v_status from public.gl_journal where id = v_journal;
  if v_status is null or v_status <> 'posted' then
    return null;  -- drafts may be unbalanced while being built
  end if;
  select coalesce(sum(debit),0), coalesce(sum(credit),0)
    into v_dr, v_cr
    from public.gl_journal_line where journal_id = v_journal;
  if v_dr <> v_cr then
    raise exception 'gl_journal % is unbalanced: debit % <> credit %', v_journal, v_dr, v_cr;
  end if;
  if v_dr <= 0 then
    raise exception 'gl_journal % is posted but empty/zero', v_journal;
  end if;
  return null;
end$$;

drop trigger if exists gl_journal_assert_balanced_trg on public.gl_journal_line;
create constraint trigger gl_journal_assert_balanced_trg
  after insert or update or delete on public.gl_journal_line
  deferrable initially deferred
  for each row execute function public.gl_journal_assert_balanced();

-- Immutability: a posted/reversed journal cannot be UPDATEd or DELETEd, EXCEPT
-- the controlled status->'reversed' + reversed_by_journal_id link written by the
-- reversal RPC. Posted headers can never be deleted, so the gl_journal_line
-- ON DELETE CASCADE only ever removes DRAFT lines.
create or replace function public.gl_journal_immutable()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('posted','reversed') then
      raise exception 'gl_journal % is posted/reversed and cannot be deleted (reverse it instead)', old.id;
    end if;
    return old;
  end if;
  -- UPDATE
  if old.status in ('posted','reversed') then
    -- allow only the reversal-link columns to change
    if (new.status is distinct from old.status
        and not (old.status = 'posted' and new.status = 'reversed'))
       or new.id is distinct from old.id
       or new.period_id is distinct from old.period_id
       or new.journal_date is distinct from old.journal_date
       or new.total_debit is distinct from old.total_debit
       or new.total_credit is distinct from old.total_credit then
      raise exception 'gl_journal % is immutable once posted', old.id;
    end if;
  end if;
  return new;
end$$;

drop trigger if exists gl_journal_immutable_trg on public.gl_journal;
create trigger gl_journal_immutable_trg
  before update or delete on public.gl_journal
  for each row execute function public.gl_journal_immutable();

-- ---- RLS enable + example policies (GL) ------------------------------------
alter table public.gl_account         enable row level security;
alter table public.gl_fiscal_year     enable row level security;
alter table public.gl_period          enable row level security;
alter table public.gl_journal         enable row level security;
alter table public.gl_journal_line    enable row level security;
alter table public.gl_account_balance enable row level security;

-- COA + periods: finance/DC read; writes via ADMIN/RPC only.
drop policy if exists gl_account_read on public.gl_account;
create policy gl_account_read on public.gl_account for select using (auth.uid() is not null);
drop policy if exists gl_period_read on public.gl_period;
create policy gl_period_read on public.gl_period for select using (auth.uid() is not null);

-- Journals: a store reads journals whose location context is its own; DC reads
-- all. Entity-wide control journals (location_id null) are DC-owned and NOT
-- visible to stores (the null-segment rule made explicit per the critique).
drop policy if exists gl_journal_scoped_read on public.gl_journal;
create policy gl_journal_scoped_read on public.gl_journal
  for select using (
    public.current_is_dc()
    or (location_id is not null and location_id in (select public.current_locations()))
  );

-- Journal lines: same store-isolation, evaluated on the line's own segment.
-- Lines with a null segment (entity-wide control accounts) are DC-only.
drop policy if exists gl_journal_line_scoped_read on public.gl_journal_line;
create policy gl_journal_line_scoped_read on public.gl_journal_line
  for select using (
    public.current_is_dc()
    or (location_id is not null and location_id in (select public.current_locations()))
  );


-- ############################################################################
-- SECTION 2. TAX / PPN (e-Faktur output/input NSFP, faktur retur, PPh/e-Bupot,
--            SPT Masa PPN basis)
-- ############################################################################
--
-- PPN rate is RATE-DATED per document (0.11 historic, 0.12 current), never
-- hardcoded. Retail prices are PPN-INCLUSIVE (Indonesian consumer convention):
-- DPP = round(gross*100/(100+rate*100)), PPN = gross - DPP (computed in RPCs).
-- One tax_invoice ledger feeds SPT Masa PPN: payable = output - creditable input.

-- Managed eFaktur OUTPUT serial-number ranges (NSFP) granted by DJP. Allocation
-- RPC advances next_no under a row lock so output numbers are sequential,
-- gap-free, non-duplicated; exhaustion flips a flag + alerts.
create table if not exists public.efaktur_nsfp (
  id          uuid primary key default gen_random_uuid(),
  range_start text not null,
  range_end   text not null,
  next_no     text not null,
  year        integer not null,
  granted_at  date not null,
  exhausted   boolean not null default false
);
create unique index if not exists efaktur_nsfp_range_idx on public.efaktur_nsfp (range_start);

-- eFaktur output & input register + PPh/e-Bupot basis. One ledger. Output rows
-- consume exactly one NSFP before status='reported'. Faktur retur rows reference
-- the original (reverses) and reduce the CURRENT period's PPN output.
create table if not exists public.tax_invoice (
  id               uuid primary key default gen_random_uuid(),
  direction        text not null check (direction in ('output','input','output_retur','input_retur')),
  efaktur_no       text,                          -- 16-digit NSFP (output) / vendor's number (input)
  nsfp_id          uuid references public.efaktur_nsfp(id),  -- output only
  doc_type         text not null,                 -- ar_invoice|pos_zbatch|credit_note|ap_voucher
  doc_id           uuid not null,
  counterparty_npwp text,
  counterparty_name text,
  tax_date         date not null,                 -- drives SPT period
  dpp              numeric(18,2) not null,
  ppn              numeric(18,2) not null,
  ppn_rate         numeric(5,4) not null,         -- 0.11 / 0.12 (rate-dated)
  is_creditable    boolean not null default true, -- input only: non-creditable is expensed, excluded from SPT credit
  status           text not null default 'issued' check (status in ('draft','issued','reported','replaced','canceled')),
  reverses         uuid references public.tax_invoice(id),    -- faktur retur link
  spt_period_id    text references public.gl_period(id),
  created_at       timestamptz not null default now(),
  -- ppn must equal round(dpp*rate) within ±1 IDR tolerance.
  constraint tax_invoice_ppn_chk check (abs(ppn - round(dpp * ppn_rate)) <= 1)
);
create unique index if not exists tax_invoice_efaktur_idx
  on public.tax_invoice (direction, efaktur_no) where efaktur_no is not null;
create index if not exists tax_invoice_spt_idx on public.tax_invoice (spt_period_id, direction);
create index if not exists tax_invoice_doc_idx on public.tax_invoice (doc_type, doc_id);

-- Now that tax_invoice exists, wire the GL line FK (idempotent).
do $$
begin
  alter table public.gl_journal_line
    add constraint gl_journal_line_tax_invoice_fk
    foreign key (tax_invoice_id) references public.tax_invoice(id);
exception when duplicate_object then null;
end$$;

-- PPh withholding register (e-Bupot basis). Created when the BANK module pays a
-- vendor NET of withholding (PPh is withheld at PAYMENT, not at AP). Records the
-- article, rate, base, amount and bukti potong number.
create table if not exists public.pph_withholding (
  id           uuid primary key default gen_random_uuid(),
  bupot_no     text,                              -- official e-Bupot slip number
  pph_article  text not null check (pph_article in ('23','4_2','21','26','22')),
  vendor_id    uuid not null,                     -- FK-by-convention to ap_vendor
  payment_id   uuid,                              -- references bank_txn (added below)
  ap_voucher_id uuid,                             -- the Tukar Faktur being settled
  object_code  text not null,                     -- jenis penghasilan
  base         numeric(18,2) not null,            -- DPP for withholding
  rate         numeric(6,4) not null,
  amount       numeric(18,2) not null,            -- withheld
  tax_date     date not null,
  spt_period_id text references public.gl_period(id),
  status       text not null default 'withheld' check (status in ('withheld','reported','paid_to_state')),
  created_at   timestamptz not null default now(),
  constraint pph_withholding_amt_chk check (abs(amount - round(base * rate)) <= 1)
);
create unique index if not exists pph_withholding_bupot_idx
  on public.pph_withholding (bupot_no) where bupot_no is not null;
create index if not exists pph_withholding_vendor_period_idx
  on public.pph_withholding (vendor_id, spt_period_id);

alter table public.efaktur_nsfp    enable row level security;
alter table public.tax_invoice     enable row level security;
alter table public.pph_withholding enable row level security;
-- Tax surface is DC/finance-owned. DC read-all; no store/anon policies.
drop policy if exists tax_invoice_dc_read on public.tax_invoice;
create policy tax_invoice_dc_read on public.tax_invoice
  for select using (public.current_is_dc());


-- ############################################################################
-- SECTION 3. INVENTORY & MULTI-LOCATION MOVEMENT ENGINE
--            (append-only ledger = source of truth; derived on-hand/in-transit;
--             moving-average cost; SAVE/POST/ACCEPT lifecycle; hub-and-spoke)
-- ############################################################################
--
-- inv_ledger is THE SOURCE OF TRUTH: one immutable signed row per stock event,
-- never UPDATEd/DELETEd. On-hand = SUM(qty) WHERE status='onhand'; in-transit =
-- SUM(qty) WHERE status='in_transit', per (item,location). inv_onhand is a
-- transactionally-maintained derived cache for O(1) POS reads, always rebuildable.
-- Costing = MOVING-AVERAGE per (item,location) in inv_cost_state (O(1)/move; an
-- optional FIFO inv_cost_layer is provided as a per-SKU alternative).

create table if not exists public.inv_item (
  id              text primary key,              -- SKU code (text-id house convention)
  name            text not null,
  barcode         text unique,
  category_id     text,
  uom             text not null default 'each',
  is_stocked      boolean not null default true, -- ~7K true at any time (hot set)
  track_cost      boolean not null default true, -- false = untracked/unlimited (today's stock IS NULL)
  is_consignment  boolean not null default false,-- store-only; AP generated monthly on sale (pay-on-sale)
  ppn_taxable     boolean not null default true, -- VAT applicability
  valuation_method text not null default 'AVERAGE' check (valuation_method in ('AVERAGE','FIFO')),
  default_vendor_id text,
  gp_itemnmbr     text,                          -- legacy GP ITEMNMBR
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists inv_item_stocked_idx  on public.inv_item (id) where is_stocked;       -- hot ~7K
create index if not exists inv_item_category_idx on public.inv_item (category_id) where active;
create index if not exists inv_item_barcode_idx  on public.inv_item (barcode) where barcode is not null;  -- POS scan
create unique index if not exists inv_item_gp_idx on public.inv_item (gp_itemnmbr) where gp_itemnmbr is not null;

-- Header for every stock event under the SAVE/POST/ACCEPT lifecycle. status is
-- the state machine. 'locked' marks the deliberate store->DC SAVE exception:
-- on-hand is deducted at save, the doc is non-deletable, BUT it stays
-- status='draft' (NOT 'posted') until the DC posts to receive — the critique's
-- fix to avoid conflating SAVE with POST.
create table if not exists public.inv_document (
  id               uuid primary key default gen_random_uuid(),
  doc_type         text not null check (doc_type in ('po_receipt','transfer','adjustment','variance','vendor_return')),
  doc_no           text unique,
  from_location_id text references public.location(id),  -- transfer source; null for receipt
  to_location_id   text references public.location(id),  -- transfer dest / event location
  -- draft           = deletable draft, no ledger (except store->DC save: locked=true)
  -- in_transit      = DC->store posted; units in store's in_transit, awaiting accept
  -- accepted        = store accepted a DC->store delivery (owns stock)
  -- received        = DC posted a PO receipt OR received a store->DC transfer
  -- posted          = adjustment/variance/vendor_return recorded
  -- reversed        = corrected by a reversing document
  status           text not null default 'draft'
                     check (status in ('draft','in_transit','accepted','received','posted','reversed')),
  locked           boolean not null default false,       -- true once store->DC save deducted store on-hand
  direction        text check (direction in ('dc_to_store','store_to_dc')),
  reverses_doc_id  uuid references public.inv_document(id),
  vendor_id        text,
  note             text,
  created_by       uuid references public.app_user(id),
  created_at       timestamptz not null default now(),
  posted_by        uuid references public.app_user(id),
  posted_at        timestamptz,
  accepted_by      uuid references public.app_user(id),
  accepted_at      timestamptz,
  -- VENDOR RETURNS FROM DC ONLY.
  constraint inv_doc_vendor_return_chk
    check (doc_type <> 'vendor_return' or from_location_id = 'dc')
);
-- Store inbound to-post (DC->store awaiting accept).
create index if not exists inv_doc_topost_store_idx
  on public.inv_document (to_location_id) where status = 'in_transit';
-- DC inbound to-post (store->DC locked-at-save awaiting DC receive). Per the
-- critique, this keys on direction + locked + not-yet-received, NOT status='posted'.
create index if not exists inv_doc_topost_dc_idx
  on public.inv_document (to_location_id)
  where doc_type = 'transfer' and direction = 'store_to_dc' and locked and status = 'draft';
create index if not exists inv_doc_draft_idx
  on public.inv_document (to_location_id, doc_type) where status = 'draft';

-- HUB-AND-SPOKE enforced by a TRIGGER that consults location.kind='dc' (per the
-- critique: more robust than a hardcoded 'dc' literal — survives a DC rename and
-- prevents a silent second-DC bug). Every transfer must have THE DC as exactly
-- one endpoint; store<->store is impossible.
create or replace function public.inv_document_hub_spoke()
returns trigger language plpgsql as $$
declare
  v_from_kind text;
  v_to_kind   text;
begin
  if new.doc_type <> 'transfer' then
    return new;
  end if;
  if new.from_location_id is null or new.to_location_id is null then
    raise exception 'transfer requires both from and to locations';
  end if;
  select kind into v_from_kind from public.location where id = new.from_location_id;
  select kind into v_to_kind   from public.location where id = new.to_location_id;
  if not ((v_from_kind = 'dc') <> (v_to_kind = 'dc')) then
    raise exception 'hub-and-spoke: a transfer must have the DC as exactly one endpoint (got % -> %)',
      new.from_location_id, new.to_location_id;
  end if;
  -- Derive direction from endpoints.
  new.direction := case when v_from_kind = 'dc' then 'dc_to_store' else 'store_to_dc' end;
  return new;
end$$;

drop trigger if exists inv_document_hub_spoke_trg on public.inv_document;
create trigger inv_document_hub_spoke_trg
  before insert or update on public.inv_document
  for each row execute function public.inv_document_hub_spoke();

create table if not exists public.inv_document_line (
  id           uuid primary key default gen_random_uuid(),
  doc_id       uuid not null references public.inv_document(id) on delete cascade,  -- cascade only on deletable drafts
  item_id      text not null references public.inv_item(id),
  qty          numeric(18,3) not null check (qty > 0),
  unit_cost    numeric(18,4),                    -- supplied on receipt; else resolved from inv_cost_state at post
  counted_qty  numeric(18,3),                    -- variance/opname only
  line_no      integer
);
create index if not exists inv_document_line_doc_idx on public.inv_document_line (doc_id);

-- THE SOURCE OF TRUTH. Append-only, immutable, signed-quantity journal of every
-- stock movement. status 'onhand' (owned, sellable) vs 'in_transit' (DC-posted,
-- store not yet accepted). Never UPDATEd/DELETEd — corrections are NEW reversing
-- rows (reverses_ledger_id -> original, qty negated, same cost).
--
-- IN-TRANSIT OWNERSHIP (critique blocker, resolved): in-transit value is held in
-- a NEUTRAL clearing dimension, NOT the destination store, so the inventory
-- subledger and the GL Goods-In-Transit clearing account (1-1400) RECONCILE for
-- every unaccepted delivery. The in_transit row is tagged location_id='in_transit'
-- (a synthetic clearing "location" seeded in the location table as kind='store'
-- is intentionally avoided; instead 'in_transit' is reserved and excluded from
-- store on-hand and store RLS by convention — see inv_onhand below).
create table if not exists public.inv_ledger (
  id                bigint generated always as identity primary key,
  item_id           text not null references public.inv_item(id),
  location_id       text not null references public.location(id),
  status            text not null default 'onhand' check (status in ('onhand','in_transit')),
  qty               numeric(18,3) not null check (qty <> 0),   -- SIGNED: +receipt/+accept, -issue/-sale/-write-off
  unit_cost         numeric(18,4) not null default 0,          -- moving-avg cost at event time (IDR)
  ext_cost          numeric(18,4) not null default 0,          -- qty*unit_cost, signed; drives GL valuation & COGS
  event_type        text not null check (event_type in
                      ('po_receipt','transfer_out','transfer_in_transit','transfer_accept',
                       'transfer_dc_receive','adjustment','variance','sale','vendor_return',
                       'consignment_sale','reversal','migration_opening')),
  doc_id            uuid references public.inv_document(id),
  doc_line_id       uuid,
  reverses_ledger_id bigint references public.inv_ledger(id),
  posted_at         timestamptz not null default now(),
  posted_by         uuid not null
);
create index if not exists inv_ledger_balance_idx on public.inv_ledger (item_id, location_id, status);
create index if not exists inv_ledger_doc_idx     on public.inv_ledger (doc_id);
create index if not exists inv_ledger_posted_brin_idx on public.inv_ledger using brin (posted_at);
-- At scale: PARTITION BY RANGE (posted_at) monthly, aligned to the SPT close.

-- APPEND-ONLY ENFORCEMENT: revoke write + BEFORE UPDATE/DELETE trigger that raises.
revoke update, delete on public.inv_ledger from public;
create or replace function public.inv_ledger_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'inv_ledger is append-only (corrections are reversing rows)';
end$$;
drop trigger if exists inv_ledger_immutable_trg on public.inv_ledger;
create trigger inv_ledger_immutable_trg
  before update or delete on public.inv_ledger
  for each row execute function public.inv_ledger_immutable();

-- DERIVED snapshot / read cache. One row per (item,location,status). Maintained
-- transactionally by the posting RPCs alongside every ledger append; rebuildable
-- from inv_ledger. The ONLY table the app reads for on-hand.
-- CHECK(qty>=0) on owned on-hand is a BACKSTOP; the primary non-negativity guard
-- is a 'raise before append' inside the issue/transfer RPC (and is skipped for
-- track_cost=false unlimited items).
create table if not exists public.inv_onhand (
  item_id     text not null references public.inv_item(id),
  location_id text not null references public.location(id),
  status      text not null default 'onhand' check (status in ('onhand','in_transit')),
  qty         numeric(18,3) not null default 0,
  sold_out    boolean not null default false,    -- manual override, preserved from location_stock
  updated_at  timestamptz not null default now(),
  primary key (item_id, location_id, status),
  -- Owned on-hand must never go negative; in_transit may net through edges so the
  -- guard is scoped to status='onhand'.
  constraint inv_onhand_nonneg_chk check (status <> 'onhand' or qty >= 0)
);
create index if not exists inv_onhand_loc_idx on public.inv_onhand (location_id) where status = 'onhand';
-- INVARIANT: SUM(inv_ledger.qty) GROUP BY (item,location,status) == inv_onhand.qty
-- (inv_rebuild_snapshot() recomputes from the ledger; inv_assert_consistency()
-- asserts equality as a nightly cron + monthly-close gate).

-- MOVING-AVERAGE cost engine. One running row per costed (item,location):
-- unit_cost = total_value/NULLIF(qty,0). O(1) per movement.
create table if not exists public.inv_cost_state (
  item_id     text not null references public.inv_item(id),
  location_id text not null references public.location(id),
  qty         numeric(18,3) not null default 0 check (qty >= 0),
  total_value numeric(18,4) not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (item_id, location_id)
);

-- OPTIONAL FIFO alternative for SKUs needing true layers (inv_item.valuation_method
-- = 'FIFO'). Consume oldest-first in the issue RPC. Partial index keeps the
-- consumption query small at ~7K active SKUs. Default engine is moving-average.
create table if not exists public.inv_cost_layer (
  id           bigint generated always as identity primary key,
  item_id      text not null references public.inv_item(id),
  location_id  text not null references public.location(id),
  qty_received numeric(18,4) not null,
  qty_remaining numeric(18,4) not null,
  unit_cost    numeric(18,4) not null,
  received_at  timestamptz not null,
  source_doc_id uuid,
  constraint inv_cost_layer_remaining_chk check (qty_remaining >= 0 and qty_remaining <= qty_received)
);
create index if not exists inv_cost_layer_consume_idx
  on public.inv_cost_layer (item_id, location_id, received_at) where qty_remaining > 0;

alter table public.inv_item          enable row level security;
alter table public.inv_document      enable row level security;
alter table public.inv_document_line enable row level security;
alter table public.inv_ledger        enable row level security;
alter table public.inv_onhand        enable row level security;
alter table public.inv_cost_state    enable row level security;
alter table public.inv_cost_layer    enable row level security;

-- Item master is shared reference data — readable by any authenticated user.
drop policy if exists inv_item_read on public.inv_item;
create policy inv_item_read on public.inv_item for select using (auth.uid() is not null);

-- A store sees ledger/on-hand rows ONLY for its own location; DC reads all.
-- The synthetic 'in_transit' clearing rows are DC-only (not a store's location).
drop policy if exists inv_ledger_scoped_read on public.inv_ledger;
create policy inv_ledger_scoped_read on public.inv_ledger
  for select using (
    public.current_is_dc()
    or location_id in (select public.current_locations())
  );

drop policy if exists inv_onhand_scoped_read on public.inv_onhand;
create policy inv_onhand_scoped_read on public.inv_onhand
  for select using (
    public.current_is_dc()
    or location_id in (select public.current_locations())
  );

-- Documents: store sees transfers/events where it is an endpoint; DC sees all.
drop policy if exists inv_document_scoped_read on public.inv_document;
create policy inv_document_scoped_read on public.inv_document
  for select using (
    public.current_is_dc()
    or from_location_id in (select public.current_locations())
    or to_location_id   in (select public.current_locations())
  );


-- ############################################################################
-- SECTION 4. PURCHASING / AP / TUKAR FAKTUR / CONSIGNMENT
--            (DC PO -> Receiving -> Tukar Faktur AP voucher; monthly AP budget
--             gate with supervisor override; consignment monthly settlement)
-- ############################################################################
--
-- All DC-only (location_id='dc'); stores have no access (RLS). Receiving creates
-- DC on-hand (via the inventory RPC) and accrues GR/IR; PPN lands later with the
-- vendor's tax invoice at Tukar Faktur. AP DUE DATE is entered MANUALLY (never
-- derived from terms). AP control is credited at GROSS (DPP + input PPN); PPh is
-- withheld at PAYMENT (bank module), per the critique's standardization.

create table if not exists public.ap_vendor (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null,
  name              text not null,
  npwp              text,                          -- 15/16-digit tax id (null for non-PKP/individual)
  is_pkp            boolean not null default true, -- PPN-collectible; drives input-PPN creditability
  vendor_type       text not null default 'purchase' check (vendor_type in ('purchase','consignment','both')),
  pph_article       text,                          -- 'pph23','pph21','pph4_2','none' default withholding regime
  pph_rate          numeric(6,4) not null default 0 check (pph_rate >= 0 and pph_rate < 1),
  default_term_days integer,                       -- ADVISORY UI prefill only — due date is manual
  bank_name         text,
  bank_account      text,
  bank_account_name text,
  payable_gl_account text,                          -- AP control account this vendor posts to
  gp_vendorid       text,                           -- legacy GP VENDORID
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists ap_vendor_type_idx on public.ap_vendor (vendor_type) where active;
create unique index if not exists ap_vendor_gp_idx on public.ap_vendor (gp_vendorid) where gp_vendorid is not null;

-- DC Purchase Order header. SAVE=draft/deletable; POST=committed (locks, opens
-- for receiving). A PO does NOT post to GL and does NOT touch the AP budget.
create table if not exists public.ap_purchase_order (
  id          uuid primary key default gen_random_uuid(),
  doc_no      text unique not null,               -- gapless per-type sequence
  vendor_id   uuid not null references public.ap_vendor(id),
  location_id text not null default 'dc',
  status      text not null default 'draft' check (status in ('draft','posted','closed','cancelled')),
  order_date  date not null,
  expected_date date,
  ppn_rate    numeric(5,4) not null,              -- snapshot of PPN rate in effect
  currency    text not null default 'IDR' check (currency = 'IDR'),
  subtotal    numeric(18,2) not null default 0,
  ppn_amount  numeric(18,2) not null default 0,
  total       numeric(18,2) not null default 0,
  notes       text,
  created_by  uuid references public.app_user(id),
  posted_by   uuid references public.app_user(id),
  posted_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists ap_po_vendor_status_idx on public.ap_purchase_order (vendor_id, status);
create index if not exists ap_po_open_idx on public.ap_purchase_order (status) where status = 'posted';

create table if not exists public.ap_purchase_order_line (
  id            uuid primary key default gen_random_uuid(),
  po_id         uuid not null references public.ap_purchase_order(id) on delete cascade,
  line_no       integer not null,
  sku_id        text not null references public.inv_item(id),
  description   text,
  qty_ordered   numeric(18,3) not null check (qty_ordered > 0),
  qty_received  numeric(18,3) not null default 0,
  unit_cost     numeric(18,2) not null,
  line_subtotal numeric(18,2) not null,
  expense_or_inventory_gl text,                    -- usually the DC inventory asset account
  constraint ap_po_line_uq unique (po_id, line_no)
);
create index if not exists ap_po_line_po_idx  on public.ap_purchase_order_line (po_id);
create index if not exists ap_po_line_sku_idx on public.ap_purchase_order_line (sku_id);

-- DC goods receipt header (Receiving). POST creates DC on-hand (delegated to the
-- inventory RPC) AND accrues GR/IR: Dr Inventory, Cr GR/IR clearing. No PPN here.
-- A receipt is NOT an AP and does NOT touch the budget. tukar_faktur_id is set
-- once an AP voucher consumes it (3-way match).
create table if not exists public.ap_receipt (
  id              uuid primary key default gen_random_uuid(),
  doc_no          text unique not null,
  po_id           uuid references public.ap_purchase_order(id),  -- nullable: direct receipts allowed
  vendor_id       uuid not null references public.ap_vendor(id),
  location_id     text not null default 'dc',
  status          text not null default 'draft' check (status in ('draft','posted')),
  receipt_date    date not null,
  grir_gl_account text,                            -- GR/IR clearing control account
  total_cost      numeric(18,2) not null default 0,
  tukar_faktur_id uuid,                            -- references ap_voucher (added below); 3-way match
  created_by      uuid references public.app_user(id),
  posted_by       uuid references public.app_user(id),
  posted_at       timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists ap_receipt_vendor_idx on public.ap_receipt (vendor_id, status);
create index if not exists ap_receipt_po_idx on public.ap_receipt (po_id);
-- Receipts awaiting invoice (GR/IR open) — standing reconciliation report.
create index if not exists ap_receipt_grir_open_idx
  on public.ap_receipt (status) where status = 'posted' and tukar_faktur_id is null;

create table if not exists public.ap_receipt_line (
  id           uuid primary key default gen_random_uuid(),
  receipt_id   uuid not null references public.ap_receipt(id) on delete cascade,
  po_line_id   uuid references public.ap_purchase_order_line(id),
  line_no      integer not null,
  sku_id       text not null references public.inv_item(id),
  qty_received numeric(18,3) not null check (qty_received > 0),
  unit_cost    numeric(18,2) not null,
  line_cost    numeric(18,2) not null,
  constraint ap_receipt_line_uq unique (receipt_id, line_no)
);
create index if not exists ap_receipt_line_receipt_idx on public.ap_receipt_line (receipt_id);
create index if not exists ap_receipt_line_sku_idx on public.ap_receipt_line (sku_id);

-- THE TUKAR FAKTUR AP VOUCHER. Admin generates this on receipt of the vendor's
-- ORIGINAL invoice. due_date is MANUAL. POST runs the monthly budget gate (may
-- require supervisor override) and posts: Dr GR/IR (matched) or Expense, Dr
-- Input PPN (if is_pkp_input); Cr AP control at GROSS. PPh is NOT netted here.
create table if not exists public.ap_voucher (
  id                uuid primary key default gen_random_uuid(),
  doc_no            text unique not null,         -- internal Tukar Faktur voucher no (gapless)
  doc_type          text not null default 'purchase' check (doc_type in ('purchase','consignment','credit_memo')),
  vendor_id         uuid not null references public.ap_vendor(id),
  location_id       text not null default 'dc',
  status            text not null default 'draft' check (status in ('draft','posted','paid','void','reversed')),
  invoice_date      date not null,                -- date on the vendor's original invoice
  received_date     date not null default current_date,
  due_date          date not null,                -- MANUAL entry by admin
  efaktur_no        text,                          -- vendor's official input e-Faktur number
  is_pkp_input      boolean not null default true, -- whether input PPN is claimable
  ppn_rate          numeric(5,4) not null,
  currency          text not null default 'IDR' check (currency = 'IDR'),
  subtotal          numeric(18,2) not null default 0,   -- DPP (PPN tax base)
  ppn_amount        numeric(18,2) not null default 0,   -- input PPN
  pph_article       text,                          -- captured default; APPLIED AT PAYMENT
  pph_rate          numeric(6,4) not null default 0,
  pph_base          numeric(18,2) not null default 0,
  gross_amount      numeric(18,2) not null default 0,   -- subtotal + ppn_amount = AP control credit (GROSS)
  open_amount       numeric(18,2) not null default 0,   -- gross less payments; 0 = settled
  ap_gl_account     text,                          -- AP control
  input_ppn_gl_account text,
  budget_period     text references public.gl_period(id),  -- period charged for the budget gate
  override_authorization_id uuid,                  -- references ap_budget_override (added below)
  consignment_period text,                         -- YYYY-MM of sales settled (consignment vouchers)
  gl_journal_id     uuid references public.gl_journal(id),
  notes             text,
  created_by        uuid references public.app_user(id),
  posted_by         uuid references public.app_user(id),
  posted_at         timestamptz,
  voided_by         uuid references public.app_user(id),
  created_at        timestamptz not null default now(),
  -- GROSS = DPP + input PPN. PPh is withheld at PAYMENT, never netted into the
  -- posted AP liability (critique standardization).
  constraint ap_voucher_gross_chk check (gross_amount = subtotal + ppn_amount)
);
create unique index if not exists ap_voucher_invoice_uq on public.ap_voucher (vendor_id, efaktur_no) where efaktur_no is not null;
create index if not exists ap_voucher_vendor_status_idx on public.ap_voucher (vendor_id, status);
-- AP aging + payment run.
create index if not exists ap_voucher_open_idx
  on public.ap_voucher (status, due_date) where status = 'posted' and open_amount > 0;
create index if not exists ap_voucher_budget_idx
  on public.ap_voucher (budget_period) where status = 'posted';
create index if not exists ap_voucher_consign_idx on public.ap_voucher (doc_type, consignment_period);

-- Wire ap_receipt.tukar_faktur_id FK now that ap_voucher exists.
do $$
begin
  alter table public.ap_receipt
    add constraint ap_receipt_tukar_faktur_fk
    foreign key (tukar_faktur_id) references public.ap_voucher(id);
exception when duplicate_object then null;
end$$;

create table if not exists public.ap_voucher_line (
  id             uuid primary key default gen_random_uuid(),
  voucher_id     uuid not null references public.ap_voucher(id) on delete cascade,
  line_no        integer not null,
  receipt_line_id uuid references public.ap_receipt_line(id),  -- null for expense/consignment lines
  sku_id         text references public.inv_item(id),
  description    text,
  qty            numeric(18,3),
  unit_cost      numeric(18,2),
  line_amount    numeric(18,2) not null,
  gl_account     text,                            -- GR/IR (matched) else expense/COGS account
  constraint ap_voucher_line_uq unique (voucher_id, line_no)
);
create index if not exists ap_voucher_line_voucher_idx on public.ap_voucher_line (voucher_id);
-- A received line is invoiced once (single-use), so GR/IR can't be cleared twice.
create unique index if not exists ap_voucher_line_receipt_uq
  on public.ap_voucher_line (receipt_line_id) where receipt_line_id is not null;

-- Monthly AP budget cap per (period, location). Authority for the over-budget
-- check at Tukar Faktur POST. Manual; supervisor/finance-editable.
create table if not exists public.ap_budget (
  id            uuid primary key default gen_random_uuid(),
  period_id     text not null references public.gl_period(id),  -- YYYY-MM
  location_id   text references public.location(id),            -- null = entity-wide; default 'dc'
  budget_amount numeric(18,2) not null check (budget_amount >= 0),
  notes         text,
  set_by        uuid references public.app_user(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists ap_budget_period_loc_idx
  on public.ap_budget (period_id, coalesce(location_id, '*entity*'));

-- APPEND-ONLY ledger of budget consumption. Each posted voucher writes +gross;
-- a void/credit-memo writes a reversing (-) row. Consumed-to-date = SUM(amount).
-- The over-budget gate compares (consumed + this voucher) against ap_budget.
create table if not exists public.ap_budget_ledger (
  id          uuid primary key default gen_random_uuid(),
  period_id   text not null references public.gl_period(id),
  location_id text references public.location(id),
  voucher_id  uuid not null references public.ap_voucher(id),
  amount      numeric(18,2) not null,             -- + consume, - release on void
  was_over_budget boolean not null default false,
  override_authorization_id uuid,                 -- references ap_budget_override (added below)
  created_by  uuid references public.app_user(id),
  created_at  timestamptz not null default now()
);
create index if not exists ap_budget_ledger_period_idx on public.ap_budget_ledger (period_id, location_id);
create index if not exists ap_budget_ledger_voucher_idx on public.ap_budget_ledger (voucher_id);

-- Immutable authorization + audit for a SUPERVISOR OVERRIDE letting an over-budget
-- voucher POST. Created at POST when the gate fires. authorized_by must hold the
-- supervisor role (asserted in RPC) and be distinct from the creator. The override
-- + over-budget delta are ALSO written to audit_log (action='BUDGET_OVERRIDE').
create table if not exists public.ap_budget_override (
  id              uuid primary key default gen_random_uuid(),
  period_id       text not null references public.gl_period(id),
  location_id     text references public.location(id),
  voucher_id      uuid not null references public.ap_voucher(id),
  budget_amount   numeric(18,2) not null,         -- snapshot
  consumed_before numeric(18,2) not null,         -- snapshot
  requested_amount numeric(18,2) not null,        -- the voucher gross
  overage_amount  numeric(18,2) not null check (overage_amount > 0),
  reason          text not null,
  authorized_by   uuid not null references public.app_user(id),
  authorized_at   timestamptz not null default now()
);
create unique index if not exists ap_budget_override_voucher_uq on public.ap_budget_override (voucher_id);
create index if not exists ap_budget_override_period_idx on public.ap_budget_override (period_id, location_id);

-- Wire the override FK on the voucher + ledger now that the table exists.
do $$
begin
  alter table public.ap_voucher
    add constraint ap_voucher_override_fk
    foreign key (override_authorization_id) references public.ap_budget_override(id);
exception when duplicate_object then null;
end$$;
do $$
begin
  alter table public.ap_budget_ledger
    add constraint ap_budget_ledger_override_fk
    foreign key (override_authorization_id) references public.ap_budget_override(id);
exception when duplicate_object then null;
end$$;

-- Payment run / disbursement. POST computes PPh WITHHOLDING (per voucher article/
-- rate), posts Dr AP control (gross applied), Cr Bank (net), Cr PPh-payable
-- (withheld), reduces each allocated voucher's open_amount, issues e-Bupot.
create table if not exists public.ap_payment (
  id              uuid primary key default gen_random_uuid(),
  doc_no          text unique not null,
  vendor_id       uuid not null references public.ap_vendor(id),
  location_id     text not null default 'dc',
  status          text not null default 'draft' check (status in ('draft','posted','void')),
  payment_date    date not null,
  payment_method  text not null check (payment_method in ('bank_transfer','cash','giro')),
  bank_gl_account text,                            -- credited
  pph_payable_gl_account text,
  gross_paid      numeric(18,2) not null default 0,  -- sum of allocated voucher amounts
  pph_withheld    numeric(18,2) not null default 0,
  net_disbursed   numeric(18,2) not null default 0,  -- gross_paid - pph_withheld
  gl_journal_id   uuid references public.gl_journal(id),
  created_by      uuid references public.app_user(id),
  posted_by       uuid references public.app_user(id),
  posted_at       timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists ap_payment_vendor_idx on public.ap_payment (vendor_id, status);
create index if not exists ap_payment_date_idx on public.ap_payment (payment_date);

create table if not exists public.ap_payment_alloc (
  id            uuid primary key default gen_random_uuid(),
  payment_id    uuid not null references public.ap_payment(id) on delete cascade,
  voucher_id    uuid not null references public.ap_voucher(id),
  amount_applied numeric(18,2) not null check (amount_applied > 0),  -- against gross/open_amount
  pph_base      numeric(18,2) not null default 0,
  pph_rate      numeric(6,4) not null default 0,
  pph_withheld  numeric(18,2) not null default 0,
  ebupot_no     text,                              -- official e-Bupot slip number
  net_paid      numeric(18,2) not null
);
create index if not exists ap_payment_alloc_payment_idx on public.ap_payment_alloc (payment_id);
create index if not exists ap_payment_alloc_voucher_idx on public.ap_payment_alloc (voucher_id);
create unique index if not exists ap_payment_alloc_ebupot_uq
  on public.ap_payment_alloc (ebupot_no) where ebupot_no is not null;

-- Wire pph_withholding.payment_id FK now that ap_payment exists.
do $$
begin
  alter table public.pph_withholding
    add constraint pph_withholding_payment_fk
    foreign key (payment_id) references public.ap_payment(id);
exception when duplicate_object then null;
end$$;

-- ---- Consignment ----------------------------------------------------------
-- Consigned stock is physically at STORES ONLY; delivery creates NO receiving
-- invoice, NO GR/IR, NO owned inventory. COGS is recognized ONLY at monthly
-- settlement together with the AP liability (critique: do NOT book COGS at the
-- POS sale for consignment SKUs — inv_sale_issue branches on is_consignment and
-- skips the cost/on-hand decrement).
create table if not exists public.consignment_agreement (
  id              uuid primary key default gen_random_uuid(),
  vendor_id       uuid not null references public.ap_vendor(id),
  sku_id          text not null references public.inv_item(id),
  unit_cost       numeric(18,2) not null,          -- what we owe the consignor per unit sold
  commission_basis text not null default 'cost' check (commission_basis in ('cost','margin')),
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);
create unique index if not exists consignment_agreement_uq
  on public.consignment_agreement (vendor_id, sku_id) where active;
create index if not exists consignment_agreement_sku_idx on public.consignment_agreement (sku_id) where active;

-- APPEND-ONLY snapshot of consigned-SKU SALES pulled from the store sales ledger
-- by the monthly job. Idempotent per period. settled_voucher_id stamps consumed
-- sales so a period is never double-billed.
create table if not exists public.consignment_sale (
  id              uuid primary key default gen_random_uuid(),
  period          text not null,                   -- YYYY-MM of the sale
  vendor_id       uuid not null references public.ap_vendor(id),
  location_id     text not null references public.location(id),  -- the store where it sold
  sku_id          text not null references public.inv_item(id),
  qty_sold        numeric(18,3) not null,
  unit_cost       numeric(18,2) not null,
  line_cost       numeric(18,2) not null,
  source_sale_ref text,                            -- POS order/line reference
  settled_voucher_id uuid references public.ap_voucher(id),
  created_at      timestamptz not null default now()
);
-- Idempotent pull (no double count).
create unique index if not exists consignment_sale_uq
  on public.consignment_sale (period, location_id, sku_id, source_sale_ref);
create index if not exists consignment_sale_unsettled_idx
  on public.consignment_sale (period, vendor_id) where settled_voucher_id is null;
create index if not exists consignment_sale_settled_idx on public.consignment_sale (settled_voucher_id);

alter table public.ap_vendor             enable row level security;
alter table public.ap_purchase_order     enable row level security;
alter table public.ap_purchase_order_line enable row level security;
alter table public.ap_receipt            enable row level security;
alter table public.ap_receipt_line       enable row level security;
alter table public.ap_voucher            enable row level security;
alter table public.ap_voucher_line       enable row level security;
alter table public.ap_budget             enable row level security;
alter table public.ap_budget_ledger      enable row level security;
alter table public.ap_budget_override    enable row level security;
alter table public.ap_payment            enable row level security;
alter table public.ap_payment_alloc      enable row level security;
alter table public.consignment_agreement enable row level security;
alter table public.consignment_sale      enable row level security;

-- Procurement/AP is DC-only: DC read-all, stores have NO access (no store policy).
drop policy if exists ap_voucher_dc_read on public.ap_voucher;
create policy ap_voucher_dc_read on public.ap_voucher for select using (public.current_is_dc());
drop policy if exists ap_vendor_dc_read on public.ap_vendor;
create policy ap_vendor_dc_read on public.ap_vendor for select using (public.current_is_dc());

-- Consignment: DC read-all; a store reads only its own location's sale rows.
drop policy if exists consignment_sale_scoped_read on public.consignment_sale;
create policy consignment_sale_scoped_read on public.consignment_sale
  for select using (
    public.current_is_dc()
    or location_id in (select public.current_locations())
  );


-- ############################################################################
-- SECTION 5. SALES / AR (retail POS EOD summary posting; B2B per-invoice AR)
-- ############################################################################
--
-- POS GL POSTING BASIS = END-OF-DAY SUMMARY (one gl_journal per store per
-- business_date per tender mix), NOT per ticket — per-ticket GL would explode
-- the journal at retail volume with no accounting benefit; immutable per-ticket
-- detail lives in pos_sale for audit/returns/loyalty. AR is THE EXCEPTION:
-- B2B/credit invoices post per-invoice (dunnable open item + its own e-Faktur).
-- Retail e-Faktur uses the consumer AGGREGATION rule (no per-ticket NSFP); an
-- NSFP is consumed only for B2B/AR or a per-request NIK/NPWP consumer faktur.

create table if not exists public.customer (
  id                  uuid primary key default gen_random_uuid(),
  code                text unique not null,
  name                text not null,
  is_credit           boolean not null default false,
  credit_limit        bigint not null default 0,   -- IDR whole rupiah
  payment_term_days   integer not null default 0,
  npwp                text,                          -- 15/16-digit; null = non-PKP/consumer
  nik                 text,                          -- NIK-as-NPWP consumer invoices
  is_pkp              boolean not null default false,
  price_tax_inclusive boolean not null default true,
  address             text,
  gp_custnmbr         text,                          -- legacy GP CUSTNMBR
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);
create index if not exists customer_name_idx on public.customer (lower(name));
create unique index if not exists customer_gp_idx on public.customer (gp_custnmbr) where gp_custnmbr is not null;

-- End-of-day Z-report batch = the unit that posts ONE summary gl_journal per
-- store per business_date.
create table if not exists public.pos_z_batch (
  id            uuid primary key default gen_random_uuid(),
  location_id   text not null references public.location(id),
  business_date date not null,
  gross_total   bigint not null default 0,
  dpp_total     bigint not null default 0,
  ppn_total     bigint not null default 0,
  cash_total    bigint not null default 0,
  qris_total    bigint not null default 0,
  card_total    bigint not null default 0,
  other_total   bigint not null default 0,
  sale_count    integer not null default 0,
  status        text not null default 'open' check (status in ('open','closed','posted')),
  gl_journal_id uuid references public.gl_journal(id),
  closed_at     timestamptz,
  posted_at     timestamptz
);
create unique index if not exists pos_z_batch_loc_date_idx on public.pos_z_batch (location_id, business_date);

-- Immutable per-transaction retail sale capture (the high-volume table). POST
-- writes the ticket permanently (the audit/returns/loyalty source of truth); GL
-- impact is deferred to the EOD Z-batch. PARTITION BY RANGE(business_date)
-- monthly at scale. Voids are a new reversing pos_sale, never a delete.
create table if not exists public.pos_sale (
  id            uuid primary key default gen_random_uuid(),
  sale_no       text unique not null,
  location_id   text not null references public.location(id),
  business_date date not null,                     -- Z-report day (may differ from clock)
  sold_at       timestamptz not null default now(),
  customer_id   uuid references public.customer(id),  -- null = anonymous walk-in
  gross_total   bigint not null,                   -- IDR, PPN-inclusive
  dpp_total     bigint not null,
  ppn_total     bigint not null,
  rounding      bigint not null default 0,
  tender_cash   bigint not null default 0,
  tender_qris   bigint not null default 0,
  tender_card   bigint not null default 0,
  tender_other  bigint not null default 0,
  status        text not null default 'final' check (status in ('final','voided')),
  void_of       uuid references public.pos_sale(id),
  z_batch_id    uuid references public.pos_z_batch(id),  -- set when summarized
  created_at    timestamptz not null default now()
);
create index if not exists pos_sale_loc_date_idx on public.pos_sale (location_id, business_date);
-- The un-summarized queue (awaiting the EOD Z-batch).
create index if not exists pos_sale_unbatched_idx on public.pos_sale (location_id) where z_batch_id is null;

create table if not exists public.pos_sale_line (
  sale_id          uuid not null references public.pos_sale(id),
  line_no          integer not null,
  item_id          text not null references public.inv_item(id),
  qty              numeric(18,3) not null check (qty > 0),
  unit_price_gross bigint not null,                -- PPN-inclusive
  line_gross       bigint not null,
  line_dpp         bigint not null,
  line_ppn         bigint not null,
  is_free          boolean not null default false, -- loyalty/promo, zero-revenue
  discount         bigint not null default 0,
  tax_code         text not null default 'PPN',    -- 'PPN' | 'EXEMPT' (per product PPN applicability)
  primary key (sale_id, line_no)
);
create index if not exists pos_sale_line_item_idx on public.pos_sale_line (item_id);

-- B2B / credit-sale invoice = the AR EXCEPTION (per-invoice GL posting). Each is
-- a dunnable open item with its own e-Faktur. Credit-limit gate at POST mirrors
-- the AP budget gate (supervisor override).
create table if not exists public.ar_invoice (
  id                uuid primary key default gen_random_uuid(),
  invoice_no        text unique not null,
  customer_id       uuid not null references public.customer(id),
  location_id       text not null references public.location(id),
  invoice_date      date not null,
  due_date          date not null,                 -- manual or term-derived
  dpp_total         bigint not null,
  ppn_total         bigint not null,
  gross_total       bigint not null,
  amount_settled    bigint not null default 0,
  status            text not null default 'draft' check (status in ('draft','posted','part_paid','paid','void')),
  tax_invoice_id    uuid references public.tax_invoice(id),  -- e-Faktur output
  gl_journal_id     uuid references public.gl_journal(id),
  source_pos_sale_id uuid references public.pos_sale(id),    -- if converted from a ticket
  created_by        uuid references public.app_user(id),
  posted_at         timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists ar_invoice_customer_idx on public.ar_invoice (customer_id, status);
-- AR aging / dunning.
create index if not exists ar_invoice_aging_idx
  on public.ar_invoice (due_date) where status in ('posted','part_paid');

create table if not exists public.ar_invoice_line (
  invoice_id        uuid not null references public.ar_invoice(id),
  line_no           integer not null,
  item_id           text references public.inv_item(id),
  description       text not null,
  qty               numeric(18,3) not null check (qty > 0),
  unit_price        bigint not null,
  line_dpp          bigint not null,
  line_ppn          bigint not null,
  tax_code          text not null default 'PPN',
  revenue_account_id uuid references public.gl_account(id),
  primary key (invoice_id, line_no)
);
create index if not exists ar_invoice_line_item_idx on public.ar_invoice_line (item_id);

-- Returns / sales credit note. Retail -> links pos_sale; B2B -> links ar_invoice.
-- Triggers a faktur retur (PPN output reversal) when the original carried a tax
-- invoice. Append-only correction; never edits the original.
create table if not exists public.credit_note (
  id               uuid primary key default gen_random_uuid(),
  cn_no            text unique not null,
  cn_type          text not null check (cn_type in ('pos_return','ar_credit')),
  location_id      text not null references public.location(id),
  customer_id      uuid references public.customer(id),
  orig_pos_sale_id uuid references public.pos_sale(id),
  orig_ar_invoice_id uuid references public.ar_invoice(id),
  cn_date          date not null,
  dpp_total        bigint not null,
  ppn_total        bigint not null,
  gross_total      bigint not null,
  refund_tender    text check (refund_tender in ('cash','qris','card','ar_offset')),
  faktur_retur_id  uuid references public.tax_invoice(id),
  status           text not null default 'draft' check (status in ('draft','posted')),
  gl_journal_id    uuid references public.gl_journal(id),
  posted_at        timestamptz,
  -- exactly one origin.
  constraint credit_note_one_origin_chk
    check ((orig_pos_sale_id is not null) <> (orig_ar_invoice_id is not null))
);
create index if not exists credit_note_orig_ar_idx on public.credit_note (orig_ar_invoice_id);

alter table public.customer        enable row level security;
alter table public.pos_z_batch     enable row level security;
alter table public.pos_sale        enable row level security;
alter table public.pos_sale_line   enable row level security;
alter table public.ar_invoice      enable row level security;
alter table public.ar_invoice_line enable row level security;
alter table public.credit_note     enable row level security;

-- Stores see/control ONLY their own POS sales; DC reads all.
drop policy if exists pos_sale_scoped_read on public.pos_sale;
create policy pos_sale_scoped_read on public.pos_sale
  for select using (
    public.current_is_dc()
    or location_id in (select public.current_locations())
  );

drop policy if exists pos_z_batch_scoped_read on public.pos_z_batch;
create policy pos_z_batch_scoped_read on public.pos_z_batch
  for select using (
    public.current_is_dc()
    or location_id in (select public.current_locations())
  );

-- Customers: stores see customers they transact with (modeled here as DC read-all
-- + the store reading via its sales joins at the app layer); AR control is DC-owned.
drop policy if exists customer_dc_read on public.customer;
create policy customer_dc_read on public.customer
  for select using (public.current_is_dc() or auth.uid() is not null);


-- ############################################################################
-- SECTION 6. BANK / CASH GENERAL JOURNAL (full JE engine; AR/AP settlement;
--            transfers; reconciliation; PPh withholding at payment)
-- ############################################################################
--
-- Bank/Cash is a FULL general-journal subledger: a bank_txn with txn_type=
-- 'journal' accepts arbitrary balanced Dr/Cr to ANY postable account, not just
-- cash in/out. It posts one gl_journal like any subledger and can settle AR/AP
-- open items, transfer between accounts, and book bank charges/accruals.

create table if not exists public.bank_account (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null,
  name              text not null,
  kind              text not null check (kind in ('bank','cash')),
  gl_account_id     uuid not null references public.gl_account(id),
  location_id       text references public.location(id),  -- cash drawer store; null = central bank (DC)
  currency          char(3) not null default 'IDR' check (currency = 'IDR'),
  statement_balance bigint not null default 0,
  last_reconciled_at timestamptz,
  is_active         boolean not null default true
);

-- Bank/cash module document = a full general journal voucher. SAVE=draft/
-- deletable, POST=immutable (void = reversing voucher).
create table if not exists public.bank_txn (
  id              uuid primary key default gen_random_uuid(),
  voucher_no      text unique not null,
  bank_account_id uuid references public.bank_account(id),  -- null for pure non-cash JE
  txn_type        text not null check (txn_type in
                    ('receipt','payment','transfer','journal','ar_settle','ap_settle')),
  txn_date        date not null,
  memo            text,
  total           bigint not null default 0,       -- IDR
  status          text not null default 'draft' check (status in ('draft','posted','void')),
  reconciled      boolean not null default false,
  statement_ref   text,
  gl_journal_id   uuid references public.gl_journal(id),
  created_by      uuid references public.app_user(id),
  posted_by       uuid references public.app_user(id),
  posted_at       timestamptz
);
create index if not exists bank_txn_acct_date_idx on public.bank_txn (bank_account_id, txn_date);
-- Reconciliation queue.
create index if not exists bank_txn_recon_idx
  on public.bank_txn (reconciled) where reconciled = false and status = 'posted';

-- General-journal lines: free debit/credit to any postable account, optional
-- AR/AP open-item settlement target. This is what makes Bank/Cash a full JE engine.
create table if not exists public.bank_txn_line (
  voucher_id      uuid not null references public.bank_txn(id),
  line_no         integer not null,
  account_id      uuid not null references public.gl_account(id),
  debit           bigint not null default 0,
  credit          bigint not null default 0,
  party_type      text check (party_type in ('customer','vendor')),
  party_id        uuid,
  settle_doc_type text check (settle_doc_type in ('ar_invoice','ap_voucher')),
  settle_doc_id   uuid,
  description     text,
  primary key (voucher_id, line_no),
  constraint bank_txn_line_signs_chk check (debit >= 0 and credit >= 0),
  constraint bank_txn_line_onesided_chk check (not (debit > 0 and credit > 0))
);
create index if not exists bank_txn_line_settle_idx
  on public.bank_txn_line (settle_doc_type, settle_doc_id) where settle_doc_id is not null;

-- Bank reconciliation header — matches imported statement lines to posted
-- bank_txn lines, producing a book-vs-statement difference for a period.
create table if not exists public.bank_recon (
  id              uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references public.bank_account(id),
  statement_date  date not null,
  opening_balance bigint not null,
  closing_balance bigint not null,
  book_balance    bigint not null,
  status          text not null default 'open' check (status in ('open','reconciled')),
  reconciled_by   uuid references public.app_user(id),
  reconciled_at   timestamptz
);
create unique index if not exists bank_recon_acct_date_idx on public.bank_recon (bank_account_id, statement_date);

alter table public.bank_account  enable row level security;
alter table public.bank_txn      enable row level security;
alter table public.bank_txn_line enable row level security;
alter table public.bank_recon    enable row level security;

-- Store cash drawers visible/controllable only by that store; central bank (DC).
drop policy if exists bank_account_scoped_read on public.bank_account;
create policy bank_account_scoped_read on public.bank_account
  for select using (
    public.current_is_dc()
    or (location_id is not null and location_id in (select public.current_locations()))
  );


-- ############################################################################
-- SECTION 7. MIGRATION STAGING (GP -> new schema; master-first then opening
--            balances; penny-level trial-balance reconciliation gate)
-- ############################################################################
--
-- Sequencing is strict: master data first (each batch RECONCILED), THEN opening
-- balances. Go-live is blocked until GL trial balance, inventory valuation by
-- item/site, and AR/AP aging all reconcile to 0.00 IDR. GP is then archived
-- read-only for statutory retention; full GP transactional history is loaded as
-- non-posting reference only (source='migration').

create table if not exists public.migration_batch (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                     -- 'COA','VENDORS','ITEMS','IV_OPENING','GL_OPENING',...
  gp_source     text not null,                     -- 'GL00100','PM00200','IV00101',...
  phase         text not null check (phase in ('MASTER','OPENING')),
  status        text not null default 'LOADED' check (status in ('LOADED','RECONCILED','FAILED')),
  rows_loaded   integer not null default 0,
  recon_diff_idr numeric(18,2),                    -- MUST be 0.00 to pass RECONCILED
  loaded_by     uuid references public.app_user(id),
  loaded_at     timestamptz not null default now(),
  -- A batch may only be RECONCILED when recon_diff_idr = 0.00 (penny-level).
  constraint migration_batch_recon_chk
    check (status <> 'RECONCILED' or recon_diff_idr = 0.00)
);
create index if not exists migration_batch_source_idx on public.migration_batch (gp_source);

-- Every loaded business row keeps a back-pointer to its GP source key so
-- reconciliation and rollback are auditable.
create table if not exists public.migration_row_map (
  id         bigint generated always as identity primary key,
  batch_id   uuid not null references public.migration_batch(id),
  gp_key     text not null,
  new_table  text not null,
  new_id     text not null
);
create index if not exists migration_row_map_batch_idx on public.migration_row_map (batch_id);
create index if not exists migration_row_map_new_idx on public.migration_row_map (new_table, new_id);

alter table public.migration_batch   enable row level security;
alter table public.migration_row_map enable row level security;
-- Migration surface is ADMIN/migration-role only (no store/anon policies). DC
-- read for oversight.
drop policy if exists migration_batch_dc_read on public.migration_batch;
create policy migration_batch_dc_read on public.migration_batch
  for select using (public.current_is_dc());


-- ############################################################################
-- SECTION 8. SECURITY DEFINER POSTING RPCs — COMMENTED STUBS
-- ############################################################################
--
-- ALL balance/ledger/GL/budget mutations occur ONLY inside these SECURITY
-- DEFINER functions. The app role (anon AND authenticated) has NO direct INSERT/
-- UPDATE on inv_ledger, inv_onhand, inv_cost_state, gl_journal(_line),
-- ap_budget_ledger, tax_invoice, pph_withholding, or balances. Each RPC runs in
-- a single transaction; GL writes assert SUM(debit)=SUM(credit) per journal
-- (the deferred constraint trigger is the hard guarantee). Concurrency: serialize
-- per key with ONE primitive used CONSISTENTLY in EVERY mutating RPC —
-- pg_advisory_xact_lock(hashtext(item_id||':'||location_id)) for inventory
-- (matching reserve_rewards), and pg_advisory_xact_lock(hashtext(period||':'||location))
-- for the AP budget gate. NEVER mix advisory locks with SELECT...FOR UPDATE.
--
-- ---- GL core ----
-- post_journal(p_journal_id uuid, p_posted_by uuid) returns gl_journal
--   Validate gl_period.status='open' AND journal_date within bounds; recompute
--   SUM(debit)/SUM(credit) from gl_journal_line and set header totals; assign
--   journal_no from the per-period sequence; flip status='draft'->'posted'.
--   Idempotent on (source_module, source_doc_type, source_doc_id). Backstopped
--   by the header CHECK and the DEFERRED balance constraint trigger at COMMIT.
-- reverse_journal(p_journal_id uuid, p_reason text, p_by uuid) returns gl_journal
--   Insert a new posted journal with reverses_journal_id set and every line's
--   debit/credit SWAPPED, dated into an OPEN period; set the original status=
--   'reversed' + reversed_by_journal_id. Net GL effect = 0. Writes audit_log.
-- close_period(p_period_id text, p_by uuid)  -- 'open'->'closed' (re-openable)
-- lock_period(p_period_id text, p_by uuid)   -- 'closed'->'locked' after SPT filed
-- close_year(p_fiscal_year_id uuid, p_by uuid)
--   After period 12 closed: Dr revenue / Cr expense+cogs into Income Summary,
--   then Income Summary -> Retained Earnings; carry BS accounts forward.
--
-- ---- Inventory: SAVE / POST / ACCEPT (the asymmetric lifecycle) ----
-- inv_doc_save(p_doc jsonb, p_by uuid) returns inv_document
--   Writes/updates inv_document(status='draft') + lines. NO ledger/snapshot for
--   po_receipt / dc_to_store transfer / adjustment / variance — draft fully
--   deletable. EXCEPTION (store->DC transfer): immediately append NEGATIVE
--   inv_ledger rows at the origin store (status onhand, qty=-line.qty, at
--   moving-avg cost), decrement inv_onhand + inv_cost_state, set locked=true and
--   KEEP status='draft' (NOT 'posted'); the doc surfaces in the DC to-post queue.
--   Take pg_advisory_xact_lock per (item,location) before the guard+append.
-- inv_doc_post(p_doc_id uuid, p_by uuid) returns inv_document
--   PO_RECEIPT (DC): +qty onhand at DC, re-average inv_cost_state, status=
--     'received'; emit gl_journal Dr Inventory(DC) / Cr GR-IR.
--   DC->STORE TRANSFER: -qty onhand at DC AND +qty in_transit in the NEUTRAL
--     clearing dimension (NOT the store's owned on-hand); status='in_transit';
--     enters STORE to-post; NO REJECT. GL: Dr Goods-In-Transit(1-1400 entity) /
--     Cr Inventory(DC). (In-transit owned by entity clearing — matches GL.)
--   STORE->DC TRANSFER (DC receives the locked-at-save doc): +qty onhand at DC,
--     re-average; status='received'. GL: Dr Inventory(DC) / Cr Goods-In-Transit.
--   ADJUSTMENT (defect write-off, non-returnable): -qty onhand at store + COGS/
--     expense via ext_cost; status='posted'. (Returnable expiry routes as a
--     store->DC transfer instead — blocked from the write-off path.)
--   VARIANCE (opname): signed (counted-system) onhand delta at store; status='posted'.
--   VENDOR_RETURN (DC only): -qty onhand at DC; status='posted'; GL Dr AP/clearing,
--     Cr Inventory(DC), Cr PPN Input reversal.
-- inv_doc_accept(p_doc_id uuid, p_by uuid) returns inv_document
--   THE ONLY accept path; valid for DC->store transfers status='in_transit'
--   where to_location is the calling store. Append a balanced pair: -qty in
--   the in_transit clearing AND +qty onhand at the store; re-average store
--   inv_cost_state; status='accepted'. GL: Dr Inventory(Store) / Cr Goods-In-
--   Transit. NO reject — an unaccepted delivery stays in the to-post list.
-- inv_doc_reverse(p_doc_id uuid, p_reason text, p_by uuid) returns inv_document
--   New reversing document (reverses_doc_id); post appends mirror-image ledger
--   rows (reverses_ledger_id -> originals, qty negated, same cost). Snapshots +
--   cost-state adjusted in the same transaction. Ledger stays append-only.
-- inv_sale_issue(p_order jsonb, p_by uuid)
--   POS sale issue at the selling store. For OWNED items: append -qty onhand
--   (event_type='sale'), draw moving-average unit_cost into ext_cost (COGS),
--   decrement inv_onhand + inv_cost_state; guard onhand>=0 BEFORE append for
--   track_cost/is_stocked items (untracked skip, unlimited). For is_consignment
--   items: append event_type='consignment_sale' for the SOLD-units feed, but DO
--   NOT decrement owned on-hand and DO NOT book COGS (we don't own it) — COGS is
--   recognized at the monthly settlement Tukar Faktur. Serialize per (item,loc).
-- inv_rebuild_snapshot()      -- recompute inv_onhand/inv_cost_state from inv_ledger
-- inv_assert_consistency()    -- assert SUM(ledger)=snapshot (nightly cron + close gate)
--
-- ---- Sales / AR ----
-- post_pos_zbatch(p_batch_id uuid, p_by uuid) returns pos_z_batch
--   ONE gl_journal per store per business_date: Dr Kas(cash_total), Dr Bank-QRIS-
--   clearing(qris_total), Dr Bank-card-clearing(card_total); Cr Sales Revenue
--   (dpp_total, store segment); Cr PPN Keluaran(ppn_total); Dr/Cr Rounding. Then
--   the COGS leg for OWNED items sold that day: Dr COGS(store) / Cr Inventory
--   (store) at cost (consignment SKUs excluded — see inv_sale_issue). Insert one
--   aggregated tax_invoice(direction='output', doc_type='pos_zbatch') under the
--   retail consumer-aggregation rule (NSFP drawn only if a per-request faktur was
--   not separately issued). Idempotent on the batch id.
-- post_ar_invoice(p_invoice_id uuid, p_by uuid, p_override uuid default null)
--   Credit-limit gate (open AR + this invoice > customer.credit_limit requires a
--   supervisor override). Dr Piutang(gross); Cr Sales Revenue(dpp); Cr PPN
--   Keluaran(ppn). Allocate one NSFP -> tax_invoice(direction='output').
-- post_credit_note(p_cn_id uuid, p_by uuid)
--   Faktur retur: tax_invoice(direction='output_retur', reverses=original) reduces
--   the CURRENT period's PPN output. Retail: Dr Sales Revenue(dpp), Dr PPN Keluaran
--   (ppn); Cr Kas/Bank/QRIS or Cr Piutang. AR: Cr Piutang, reduce amount remaining.
--
-- ---- Purchasing / AP / Consignment ----
-- post_receipt(p_receipt_id uuid, p_by uuid) returns ap_receipt
--   Calls the inventory RPC to create DC on-hand; GL Dr Inventory(DC) / Cr GR-IR.
--   SoD: created_by <> posted_by. No PPN, no budget impact.
-- post_tukar_faktur(p_voucher_id uuid, p_by uuid, p_override uuid default null) returns ap_voucher
--   pg_advisory_xact_lock(hashtext(budget_period||':'||location)). consumed_before
--   = SUM(ap_budget_ledger.amount) for (budget_period,location). If consumed_before
--   + gross_amount > ap_budget.budget_amount, REQUIRE a supervisor override row
--   (authorized_by holds can_override_budget, distinct from creator) else RAISE.
--   GL: Dr GR-IR(matched lines, clears the receiving accrual) or Dr Expense; Dr
--   Input PPN(if is_pkp_input) -> tax_invoice(direction='input', is_creditable);
--   Cr AP control at GROSS. NO PPh here. Set open_amount=gross, status='posted',
--   stamp receipt.tukar_faktur_id; write ap_budget_ledger(+gross, was_over_budget,
--   override id); write audit_log (and 'BUDGET_OVERRIDE' if applicable). SoD enforced.
-- void_tukar_faktur(p_voucher_id uuid, p_reason text, p_by uuid)
--   Reversing journal; NEGATIVE ap_budget_ledger row (release budget); status=
--   'void', open_amount=0; clear matched receipts' tukar_faktur_id (re-open GR-IR).
-- post_ap_payment(p_payment_id uuid, p_by uuid) returns ap_payment
--   Per allocation: pph_withheld = round(pph_base*pph_rate); net_paid =
--   amount_applied - pph_withheld; reduce voucher.open_amount by amount_applied
--   (FULL gross settled against AP). Issue e-Bupot + pph_withholding row. GL: Dr
--   AP control(sum amount_applied); Cr Bank(net_disbursed); Cr PPh-payable(total
--   withheld). Routes the Cr Bank line through bank_account.gl_account_id.
-- run_consignment_settlement(p_period text, p_by uuid)
--   Idempotent per period. (1) INSERT consignment_sale from the store sales feed
--   for consigned SKUs (unique key prevents double-count). (2) Per consignor with
--   unsettled sales, generate ONE ap_voucher(doc_type='consignment') = one line
--   per SKU SUM(qty_sold)*unit_cost, due_date defaulted-but-admin-editable.
--   (3) Stamp consignment_sale.settled_voucher_id. The voucher then follows
--   post_tukar_faktur (budget gate + GL: Dr COGS-Consignment(store) + Dr Input PPN
--   if PKP; Cr AP control). This is where consignment COGS is recognized.
--
-- ---- Bank / Cash ----
-- post_bank_txn(p_txn_id uuid, p_by uuid) returns bank_txn
--   Validate the open period; build ONE balanced gl_journal from bank_txn_line
--   (any postable accounts). txn_type:
--     'journal'   -> arbitrary balanced JE (bank charges, accruals, owner inject).
--     'ar_settle' -> Dr Kas/Bank; Cr Piutang(party=customer, settle ar_invoice);
--                    increment ar_invoice.amount_settled -> part_paid/paid.
--     'ap_settle' -> Dr AP(settle ap_voucher); Cr Bank(net); Cr PPh-payable
--                    (withheld) + pph_withholding row (delegates to post_ap_payment).
--     'transfer'  -> Dr dest Bank/Kas; Cr source Bank/Kas.
--   Control-account lines must carry party/settle refs. Assert balanced.
-- reconcile_bank(p_recon_id uuid, p_matches jsonb, p_by uuid)
--   Mark matched bank_txn.reconciled=true; statement-only items (interest, fees)
--   are entered as new bank_txn journals that DO post GL, then reconciled.
-- post_ppn_remittance(p_period_id text, p_by uuid)
--   Monthly SPT Masa PPN settlement: payable = SUM(output PPN) - SUM(creditable
--   input PPN) from tax_invoice for the period. Dr PPN Keluaran (clear output);
--   Cr PPN Masukan (clear creditable input); Cr Bank (net payable) or Dr Bank
--   (lebih bayar / carry forward). Mark gl_period.ppn_filed + tax_invoice.status
--   ='reported'; then lock the period against backdated entries.
--
-- ---- Tax helpers ----
-- allocate_nsfp(p_year int) returns text  -- advance efaktur_nsfp.next_no under
--   a row lock (no gaps/dupes); flip exhausted + alert near range_end.
--
-- ---- Migration ----
-- post_opening_balances(p_batch_id uuid, p_by uuid)
--   One balanced MIGRATION_OPENING gl_journal per location against Opening
--   Balance Equity (3-9000), dr=cr to the sen; IV opening as inv_cost_state /
--   inv_cost_layer + matching migration_opening inv_ledger rows so on-hand qty
--   AND value tie to the GP IV valuation report; open AR/AP as ar_invoice /
--   ap_voucher at remaining balance with GP due dates preserved.
-- reconcile_migration(p_batch_id uuid)  -- compute recon_diff_idr (GL TB / IV
--   valuation by item-site / AR-AP aging); set RECONCILED only at 0.00; block
--   OPENING batches until prerequisite MASTER batches are RECONCILED; block
--   go-live until all three reconcile to 0.00. Writes audit_log('MIGRATION_LOAD').

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
