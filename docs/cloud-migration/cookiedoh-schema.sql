-- cookiedoh-schema.sql — AUTHORITATIVE storefront schema for Cloud SQL `cookiedoh-db`.
-- Regenerated schema-only from LIVE Supabase on 2026-10-27 (pg_dump --schema-only
-- --schema=public --no-owner --no-privileges). Supersedes the old 28-table file AND
-- the DDL half of 002-auth_user.sql: this now contains ALL 30 public tables incl.
-- auth_user + auth_throttle (both still ship with RLS enabled + zero policies = owner-
-- only). Verified self-hosted-safe: 0 GRANT/REVOKE, 0 auth.* refs, 0 Supabase role
-- refs (anon/authenticated/service_role), 0 extensions; the 3 policies are all
-- `USING (true)` public-read; reserve_rewards() is plain plpgsql over public tables.
-- DRIFT FIXED vs the July file: wa_state.bot_excluded is boolean NOT NULL DEFAULT false
-- (confirmed against live: is_nullable=NO). 002-auth_user.sql is kept only for the
-- one-time insert-from-auth.users note; do NOT re-run its DDL — load THIS file.
-- Row data still comes from the separate data dump at cutover (auth_throttle excluded).
--
-- PostgreSQL database dump
--

\restrict i0cRRgrNbh8SO9PS5mAQUUTcMwZTxyR4aO6SEe10KhVDVcURlFmM18CNH9pr0dd

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: reserve_rewards(text, integer, integer, integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserve_rewards(p_phone text, p_avail_cookies integer, p_avail_drinks integer, p_want_cookies integer, p_want_drinks integer, p_midtrans_order_id text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
declare
  reserved_cookies integer;
  reserved_drinks integer;
begin
  -- Serialize concurrent checkouts for the same member.
  perform pg_advisory_xact_lock(hashtext(p_phone));

  select coalesce(sum(cookies), 0), coalesce(sum(drinks), 0)
    into reserved_cookies, reserved_drinks
    from public.loyalty_redemptions
    where phone = p_phone
      and status = 'reserved'
      and created_at > now() - interval '30 minutes';

  if (p_avail_cookies - reserved_cookies) < p_want_cookies
     or (p_avail_drinks - reserved_drinks) < p_want_drinks then
    return false;
  end if;

  insert into public.loyalty_redemptions
    (phone, cookies, drinks, midtrans_order_id, status)
    values (p_phone, p_want_cookies, p_want_drinks, p_midtrans_order_id, 'reserved');

  return true;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: auth_throttle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_throttle (
    bucket text NOT NULL,
    hits integer DEFAULT 0 NOT NULL,
    reset_at timestamp with time zone NOT NULL
);


--
-- Name: auth_user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_user (
    id uuid NOT NULL,
    email text,
    password_hash text,
    name text,
    phone text,
    google_sub text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    token_version integer DEFAULT 0 NOT NULL
);


--
-- Name: customer_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone text NOT NULL,
    label text,
    recipient_name text,
    recipient_phone text,
    address text NOT NULL,
    building_name text,
    postal text,
    city text,
    destination_area_id text,
    destination_area_label text,
    lat double precision,
    lng double precision,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone text NOT NULL,
    name text,
    email text,
    orders_count integer DEFAULT 0 NOT NULL,
    last_order_at timestamp with time zone,
    member_code text,
    auth_user_id uuid,
    phone_verified boolean DEFAULT false NOT NULL,
    cookies_redeemed integer DEFAULT 0 NOT NULL,
    drinks_redeemed integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    birthday text
);


--
-- Name: flavor_availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flavor_availability (
    flavor_id text NOT NULL,
    sold_out boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: flavor_stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flavor_stock (
    store_id text NOT NULL,
    flavor_id text NOT NULL,
    qty integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: location_stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_stock (
    location_id text NOT NULL,
    item_id text NOT NULL,
    stock integer,
    sold_out boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id text NOT NULL,
    name text NOT NULL,
    short text,
    address text,
    lat double precision,
    lng double precision,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: loyalty_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loyalty_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone text NOT NULL,
    cookies integer DEFAULT 0 NOT NULL,
    drinks integer DEFAULT 0 NOT NULL,
    reason text,
    ref text,
    order_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: loyalty_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loyalty_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone text NOT NULL,
    order_id uuid,
    midtrans_order_id text,
    cookies integer DEFAULT 0 NOT NULL,
    drinks integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'reserved'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    box_size integer NOT NULL,
    qty integer NOT NULL,
    flavors_json jsonb NOT NULL,
    unit_price_idr integer NOT NULL
);


--
-- Name: order_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_ratings (
    order_id uuid NOT NULL,
    phone text NOT NULL,
    stars integer NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    points_granted boolean DEFAULT false NOT NULL,
    CONSTRAINT order_ratings_stars_check CHECK (((stars >= 1) AND (stars <= 5)))
);


--
-- Name: orders_order_no_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orders_order_no_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_no text DEFAULT ((('CD-'::text || to_char(now(), 'YYYYMMDD'::text)) || '-'::text) || lpad((nextval('public.orders_order_no_seq'::regclass))::text, 4, '0'::text)),
    customer_name text NOT NULL,
    customer_phone text,
    email text,
    address text,
    city text,
    postal text,
    notes text,
    subtotal_idr integer,
    shipping_cost_idr integer,
    total_idr integer,
    courier_code text,
    courier_service text,
    courier_etd text,
    payment_status text DEFAULT 'PENDING'::text NOT NULL,
    midtrans_order_id text,
    midtrans_transaction_status text,
    biteship_order_id text,
    waybill text,
    tracking_url text,
    shipment_status text DEFAULT 'not_created'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_next_day boolean DEFAULT true,
    shipping_speed text DEFAULT 'NEXT_DAY'::text,
    amount bigint,
    currency text,
    items_json jsonb,
    customer_json jsonb,
    shipping_json jsonb,
    midtrans_status text,
    paid_at timestamp with time zone,
    courier_company text,
    courier_type text,
    destination_area_id text,
    destination_area_label text,
    shipping_address text,
    fulfilment_status text,
    checkout_mode text,
    meta jsonb,
    building_name text,
    printed_at timestamp with time zone,
    nudged_at timestamp with time zone,
    nudge_token text,
    accepted_at timestamp with time zone,
    recipient_name text,
    recipient_phone text
);


--
-- Name: COLUMN orders.amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.amount IS 'Total Amount';


--
-- Name: phone_otps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.phone_otps (
    phone text NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_sent_at timestamp with time zone DEFAULT now() NOT NULL,
    auth_user_id uuid
);


--
-- Name: promo_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promo_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    type text DEFAULT 'percent'::text NOT NULL,
    value integer DEFAULT 0 NOT NULL,
    min_subtotal integer DEFAULT 0 NOT NULL,
    max_discount integer,
    usage_limit integer,
    per_customer_limit integer DEFAULT 1 NOT NULL,
    starts_at timestamp with time zone,
    expires_at timestamp with time zone,
    active boolean DEFAULT true NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: promo_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promo_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    phone text,
    order_id uuid,
    discount_idr integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: redemption_otps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.redemption_otps (
    phone text NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_sent_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referrals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referrer_phone text NOT NULL,
    referrer_code text,
    referred_phone text NOT NULL,
    order_id uuid,
    status text DEFAULT 'qualified'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: spend_rewards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spend_rewards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    threshold_idr integer NOT NULL,
    label text NOT NULL,
    special_price_idr integer NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id bigint NOT NULL,
    location_id text NOT NULL,
    item_id text NOT NULL,
    qty integer NOT NULL,
    stock_before integer,
    stock_after integer,
    order_id uuid,
    order_no bigint,
    reason text DEFAULT 'order'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_movements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_movements_id_seq OWNED BY public.stock_movements.id;


--
-- Name: stock_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id text NOT NULL,
    phone text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: store_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_locations (
    id text NOT NULL,
    name text NOT NULL
);


--
-- Name: subscription_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subscription_id uuid NOT NULL,
    plan_id uuid,
    seq integer NOT NULL,
    scheduled_for date NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    resolved_items jsonb DEFAULT '[]'::jsonb NOT NULL,
    order_id uuid,
    order_no text,
    made_at timestamp with time zone,
    delivered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_reminder_offset smallint,
    CONSTRAINT subscription_deliveries_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'skipped'::text, 'made'::text, 'delivered'::text, 'failed'::text])))
);


--
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subscription_id uuid NOT NULL,
    boxes_total smallint NOT NULL,
    boxes_used smallint DEFAULT 0 NOT NULL,
    amount_idr integer NOT NULL,
    midtrans_order_id text NOT NULL,
    payment_status text DEFAULT 'PENDING'::text NOT NULL,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT subscription_plans_boxes_total_check CHECK ((boxes_total > 0)),
    CONSTRAINT subscription_plans_payment_status_check CHECK ((payment_status = ANY (ARRAY['PENDING'::text, 'PAID'::text, 'UNPAID'::text, 'FAILED'::text])))
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_phone text NOT NULL,
    auth_user_id uuid,
    name text,
    email text,
    box_size smallint NOT NULL,
    mode text NOT NULL,
    frequency text NOT NULL,
    fixed_flavours jsonb DEFAULT '[]'::jsonb NOT NULL,
    anchor_dom smallint,
    fulfilment text DEFAULT 'delivery'::text NOT NULL,
    ship_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending_payment'::text NOT NULL,
    next_delivery_on date,
    skip_next boolean DEFAULT false NOT NULL,
    delivery_seq integer DEFAULT 0 NOT NULL,
    refund_idr integer,
    refund_status text,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    renewed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pending_rewards jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT subscriptions_box_size_check CHECK ((box_size = ANY (ARRAY[3, 6]))),
    CONSTRAINT subscriptions_frequency_check CHECK ((frequency = ANY (ARRAY['weekly'::text, 'biweekly'::text, 'monthly'::text]))),
    CONSTRAINT subscriptions_fulfilment_check CHECK ((fulfilment = ANY (ARRAY['delivery'::text, 'pickup'::text]))),
    CONSTRAINT subscriptions_mode_check CHECK ((mode = ANY (ARRAY['fixed'::text, 'curated'::text]))),
    CONSTRAINT subscriptions_refund_status_check CHECK ((refund_status = ANY (ARRAY['pending'::text, 'paid'::text]))),
    CONSTRAINT subscriptions_status_check CHECK ((status = ANY (ARRAY['pending_payment'::text, 'active'::text, 'paused'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: tbs_stock_interest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbs_stock_interest (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sku text NOT NULL,
    store text NOT NULL,
    name text,
    phone text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notified_at timestamp with time zone
);


--
-- Name: vip_tiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vip_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    reach_annual_idr integer NOT NULL,
    maintain_monthly_idr integer DEFAULT 0 NOT NULL,
    loyalty_per_free integer DEFAULT 10 NOT NULL,
    free_delivery boolean DEFAULT false NOT NULL,
    free_cookie_per_order boolean DEFAULT false NOT NULL,
    active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wa_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wa_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone text NOT NULL,
    role text NOT NULL,
    text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wa_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);


--
-- Name: wa_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wa_state (
    phone text NOT NULL,
    auto_paused_until timestamp with time zone,
    last_inbound_id text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    bot_excluded boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN wa_state.bot_excluded; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.wa_state.bot_excluded IS 'Permanent opt-out from the auto-reply (suppliers, partners, our own lines). Unlike auto_paused_until this never expires. Inbound messages are still stored.';


--
-- Name: stock_movements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements ALTER COLUMN id SET DEFAULT nextval('public.stock_movements_id_seq'::regclass);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: auth_throttle auth_throttle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_throttle
    ADD CONSTRAINT auth_throttle_pkey PRIMARY KEY (bucket);


--
-- Name: auth_user auth_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user
    ADD CONSTRAINT auth_user_pkey PRIMARY KEY (id);


--
-- Name: customer_addresses customer_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_addresses
    ADD CONSTRAINT customer_addresses_pkey PRIMARY KEY (id);


--
-- Name: customers customers_member_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_member_code_key UNIQUE (member_code);


--
-- Name: customers customers_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_phone_key UNIQUE (phone);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: flavor_availability flavor_availability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flavor_availability
    ADD CONSTRAINT flavor_availability_pkey PRIMARY KEY (flavor_id);


--
-- Name: flavor_stock flavor_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flavor_stock
    ADD CONSTRAINT flavor_stock_pkey PRIMARY KEY (store_id, flavor_id);


--
-- Name: location_stock location_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_stock
    ADD CONSTRAINT location_stock_pkey PRIMARY KEY (location_id, item_id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: loyalty_grants loyalty_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_grants
    ADD CONSTRAINT loyalty_grants_pkey PRIMARY KEY (id);


--
-- Name: loyalty_redemptions loyalty_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_redemptions
    ADD CONSTRAINT loyalty_redemptions_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: order_ratings order_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_ratings
    ADD CONSTRAINT order_ratings_pkey PRIMARY KEY (order_id);


--
-- Name: orders orders_midtrans_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_midtrans_order_id_key UNIQUE (midtrans_order_id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: phone_otps phone_otps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_otps
    ADD CONSTRAINT phone_otps_pkey PRIMARY KEY (phone);


--
-- Name: promo_codes promo_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_code_key UNIQUE (code);


--
-- Name: promo_codes promo_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_pkey PRIMARY KEY (id);


--
-- Name: promo_redemptions promo_redemptions_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_redemptions
    ADD CONSTRAINT promo_redemptions_order_id_key UNIQUE (order_id);


--
-- Name: promo_redemptions promo_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_redemptions
    ADD CONSTRAINT promo_redemptions_pkey PRIMARY KEY (id);


--
-- Name: redemption_otps redemption_otps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redemption_otps
    ADD CONSTRAINT redemption_otps_pkey PRIMARY KEY (phone);


--
-- Name: referrals referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);


--
-- Name: referrals referrals_referred_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referred_phone_key UNIQUE (referred_phone);


--
-- Name: spend_rewards spend_rewards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spend_rewards
    ADD CONSTRAINT spend_rewards_pkey PRIMARY KEY (id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: stock_subscriptions stock_subscriptions_item_id_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_subscriptions
    ADD CONSTRAINT stock_subscriptions_item_id_phone_key UNIQUE (item_id, phone);


--
-- Name: stock_subscriptions stock_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_subscriptions
    ADD CONSTRAINT stock_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: store_locations store_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_locations
    ADD CONSTRAINT store_locations_pkey PRIMARY KEY (id);


--
-- Name: subscription_deliveries subscription_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_deliveries
    ADD CONSTRAINT subscription_deliveries_pkey PRIMARY KEY (id);


--
-- Name: subscription_deliveries subscription_deliveries_sub_seq_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_deliveries
    ADD CONSTRAINT subscription_deliveries_sub_seq_uniq UNIQUE (subscription_id, seq);


--
-- Name: subscription_plans subscription_plans_midtrans_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_midtrans_order_id_key UNIQUE (midtrans_order_id);


--
-- Name: subscription_plans subscription_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: tbs_stock_interest tbs_stock_interest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbs_stock_interest
    ADD CONSTRAINT tbs_stock_interest_pkey PRIMARY KEY (id);


--
-- Name: vip_tiers vip_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vip_tiers
    ADD CONSTRAINT vip_tiers_pkey PRIMARY KEY (id);


--
-- Name: wa_messages wa_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_messages
    ADD CONSTRAINT wa_messages_pkey PRIMARY KEY (id);


--
-- Name: wa_state wa_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_state
    ADD CONSTRAINT wa_state_pkey PRIMARY KEY (phone);


--
-- Name: auth_user_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX auth_user_email_key ON public.auth_user USING btree (lower(email)) WHERE (email IS NOT NULL);


--
-- Name: auth_user_google_sub_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX auth_user_google_sub_key ON public.auth_user USING btree (google_sub) WHERE (google_sub IS NOT NULL);


--
-- Name: customer_addresses_one_default_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX customer_addresses_one_default_idx ON public.customer_addresses USING btree (phone) WHERE is_default;


--
-- Name: customer_addresses_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_addresses_phone_idx ON public.customer_addresses USING btree (phone);


--
-- Name: customers_birthday_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customers_birthday_idx ON public.customers USING btree (birthday) WHERE (birthday IS NOT NULL);


--
-- Name: customers_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customers_name_idx ON public.customers USING btree (lower(name));


--
-- Name: flavor_stock_flavor_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX flavor_stock_flavor_id_idx ON public.flavor_stock USING btree (flavor_id);


--
-- Name: flavor_stock_store_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX flavor_stock_store_id_idx ON public.flavor_stock USING btree (store_id);


--
-- Name: location_stock_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_stock_item_idx ON public.location_stock USING btree (item_id);


--
-- Name: loyalty_grants_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loyalty_grants_phone_idx ON public.loyalty_grants USING btree (phone);


--
-- Name: loyalty_grants_reason_ref_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX loyalty_grants_reason_ref_uidx ON public.loyalty_grants USING btree (reason, ref) WHERE (ref IS NOT NULL);


--
-- Name: loyalty_redemptions_midtrans_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loyalty_redemptions_midtrans_idx ON public.loyalty_redemptions USING btree (midtrans_order_id);


--
-- Name: loyalty_redemptions_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loyalty_redemptions_phone_idx ON public.loyalty_redemptions USING btree (phone, status);


--
-- Name: orders_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_created_at_idx ON public.orders USING btree (created_at DESC);


--
-- Name: orders_nudge_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_nudge_idx ON public.orders USING btree (payment_status, created_at) WHERE (nudged_at IS NULL);


--
-- Name: orders_paid_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_paid_at_idx ON public.orders USING btree (paid_at) WHERE (payment_status = 'PAID'::text);


--
-- Name: orders_print_queue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_print_queue_idx ON public.orders USING btree (paid_at) WHERE (printed_at IS NULL);


--
-- Name: orders_unaccepted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_unaccepted_idx ON public.orders USING btree (created_at) WHERE ((payment_status = 'PAID'::text) AND (accepted_at IS NULL));


--
-- Name: promo_redemptions_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promo_redemptions_code_idx ON public.promo_redemptions USING btree (code);


--
-- Name: promo_redemptions_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promo_redemptions_phone_idx ON public.promo_redemptions USING btree (phone);


--
-- Name: referrals_referrer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX referrals_referrer_idx ON public.referrals USING btree (referrer_phone);


--
-- Name: stock_movements_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_created_idx ON public.stock_movements USING btree (created_at DESC);


--
-- Name: stock_movements_loc_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_loc_item_idx ON public.stock_movements USING btree (location_id, item_id, created_at DESC);


--
-- Name: stock_subscriptions_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_subscriptions_item_idx ON public.stock_subscriptions USING btree (item_id);


--
-- Name: subscription_deliveries_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscription_deliveries_due_idx ON public.subscription_deliveries USING btree (scheduled_for) WHERE (status = 'scheduled'::text);


--
-- Name: subscription_deliveries_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscription_deliveries_order_idx ON public.subscription_deliveries USING btree (order_id) WHERE (order_id IS NOT NULL);


--
-- Name: subscription_deliveries_orphan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscription_deliveries_orphan_idx ON public.subscription_deliveries USING btree (made_at) WHERE ((status = 'made'::text) AND (order_id IS NULL));


--
-- Name: subscription_plans_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscription_plans_active_idx ON public.subscription_plans USING btree (subscription_id) WHERE ((payment_status = 'PAID'::text) AND (boxes_used < boxes_total));


--
-- Name: subscription_plans_sub_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscription_plans_sub_idx ON public.subscription_plans USING btree (subscription_id);


--
-- Name: subscriptions_auth_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_auth_user_idx ON public.subscriptions USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);


--
-- Name: subscriptions_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_due_idx ON public.subscriptions USING btree (next_delivery_on) WHERE (status = 'active'::text);


--
-- Name: subscriptions_owner_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_owner_phone_idx ON public.subscriptions USING btree (owner_phone);


--
-- Name: tbs_interest_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tbs_interest_open_idx ON public.tbs_stock_interest USING btree (store) WHERE (notified_at IS NULL);


--
-- Name: tbs_interest_sku_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tbs_interest_sku_idx ON public.tbs_stock_interest USING btree (sku, store);


--
-- Name: vip_tiers_reach_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vip_tiers_reach_idx ON public.vip_tiers USING btree (reach_annual_idr);


--
-- Name: wa_messages_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wa_messages_phone_idx ON public.wa_messages USING btree (phone, created_at DESC);


--
-- Name: flavor_stock flavor_stock_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flavor_stock
    ADD CONSTRAINT flavor_stock_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.store_locations(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: subscription_deliveries subscription_deliveries_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_deliveries
    ADD CONSTRAINT subscription_deliveries_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id);


--
-- Name: subscription_deliveries subscription_deliveries_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_deliveries
    ADD CONSTRAINT subscription_deliveries_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE CASCADE;


--
-- Name: subscription_plans subscription_plans_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE CASCADE;


--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_throttle; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auth_throttle ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_user; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auth_user ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_addresses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: flavor_availability; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.flavor_availability ENABLE ROW LEVEL SECURITY;

--
-- Name: flavor_stock; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.flavor_stock ENABLE ROW LEVEL SECURITY;

--
-- Name: location_stock; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.location_stock ENABLE ROW LEVEL SECURITY;

--
-- Name: locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

--
-- Name: loyalty_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.loyalty_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: loyalty_redemptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.loyalty_redemptions ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: order_ratings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_ratings ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: phone_otps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.phone_otps ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_redemptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;

--
-- Name: flavor_availability public read flavor_availability; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public read flavor_availability" ON public.flavor_availability FOR SELECT USING (true);


--
-- Name: flavor_stock public read flavor_stock; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public read flavor_stock" ON public.flavor_stock FOR SELECT USING (true);


--
-- Name: store_locations public read store_locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public read store_locations" ON public.store_locations FOR SELECT USING (true);


--
-- Name: redemption_otps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.redemption_otps ENABLE ROW LEVEL SECURITY;

--
-- Name: referrals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

--
-- Name: spend_rewards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.spend_rewards ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: store_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.store_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: tbs_stock_interest; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tbs_stock_interest ENABLE ROW LEVEL SECURITY;

--
-- Name: vip_tiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vip_tiers ENABLE ROW LEVEL SECURITY;

--
-- Name: wa_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: wa_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wa_state ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict i0cRRgrNbh8SO9PS5mAQUUTcMwZTxyR4aO6SEe10KhVDVcURlFmM18CNH9pr0dd


-- ======================================================================
-- TBS product-pages content tables (tbs_content_*) — appended 2026-10-28.
-- These 7 tables were added to live AFTER the 2026-10-27 regen above and
-- were missing from this file (and from the standby, until reconciled).
-- RLS-enabled, zero policies: the app connects as owner (cookiedoh_app),
-- which bypasses RLS — identical read semantics to live. No role deps.
-- ======================================================================
CREATE TABLE public.tbs_content_block (
    block_key text NOT NULL,
    section text,
    heading text,
    body text,
    review_status text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbs_content_category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbs_content_category (
    code text NOT NULL,
    name text NOT NULL,
    icon text,
    icon_id text,
    display_order integer DEFAULT 999 NOT NULL,
    subcategories jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbs_content_fact; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbs_content_fact (
    id bigint NOT NULL,
    product_id text NOT NULL,
    kind text NOT NULL,
    display_order integer DEFAULT 1 NOT NULL,
    title text NOT NULL,
    description text,
    source_name text,
    source_url text,
    checked_date text,
    review_status text
);


--
-- Name: tbs_content_fact_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tbs_content_fact_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbs_content_fact_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tbs_content_fact_id_seq OWNED BY public.tbs_content_fact.id;


--
-- Name: tbs_content_load; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbs_content_load (
    id bigint NOT NULL,
    loaded_at timestamp with time zone DEFAULT now() NOT NULL,
    source text,
    products integer,
    variants integer,
    recipes integer,
    images integer,
    orphans integer,
    notes text
);


--
-- Name: tbs_content_load_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tbs_content_load_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbs_content_load_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tbs_content_load_id_seq OWNED BY public.tbs_content_load.id;


--
-- Name: tbs_content_product; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbs_content_product (
    product_id text NOT NULL,
    sku text,
    name text NOT NULL,
    slug text,
    category_code text,
    category_label text,
    subcategory_code text,
    record_type text DEFAULT 'Existing'::text NOT NULL,
    listed boolean DEFAULT true NOT NULL,
    tagline text,
    price_note text,
    origin text,
    weight_contents text,
    storage text,
    notice text,
    story_heading text,
    story_intro text,
    description text,
    detail_heading text,
    checkpoints text[] DEFAULT '{}'::text[] NOT NULL,
    tip text,
    note text,
    content_status text,
    copy_review text,
    sheet_price integer,
    primary_unit text,
    has_bundles boolean DEFAULT false NOT NULL,
    images jsonb DEFAULT '[]'::jsonb NOT NULL,
    drive_folder_url text,
    barcodes text[] DEFAULT '{}'::text[] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbs_content_recipe; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbs_content_recipe (
    recipe_id text NOT NULL,
    product_id text NOT NULL,
    display_order integer DEFAULT 1 NOT NULL,
    title text NOT NULL,
    serving_note text,
    ingredients text[] DEFAULT '{}'::text[] NOT NULL,
    steps text[] DEFAULT '{}'::text[] NOT NULL,
    tbs_note text,
    source_name text,
    source_url text,
    review_status text,
    image_url text,
    image_alt text,
    shopping jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbs_content_variant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbs_content_variant (
    variant_id text NOT NULL,
    product_id text NOT NULL,
    variant_name text,
    variant_type text,
    price integer,
    discounted_price numeric,
    pos_item_number text,
    barcode text,
    base_uom text,
    base_qty integer,
    bundle_discount numeric,
    base_barcode text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbs_content_fact id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbs_content_fact ALTER COLUMN id SET DEFAULT nextval('public.tbs_content_fact_id_seq'::regclass);


--
-- Name: tbs_content_load id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbs_content_load ALTER COLUMN id SET DEFAULT nextval('public.tbs_content_load_id_seq'::regclass);


--
-- Name: tbs_content_block tbs_content_block_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbs_content_block
    ADD CONSTRAINT tbs_content_block_pkey PRIMARY KEY (block_key);


--
-- Name: tbs_content_category tbs_content_category_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbs_content_category
    ADD CONSTRAINT tbs_content_category_pkey PRIMARY KEY (code);


--
-- Name: tbs_content_fact tbs_content_fact_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbs_content_fact
    ADD CONSTRAINT tbs_content_fact_pkey PRIMARY KEY (id);


--
-- Name: tbs_content_load tbs_content_load_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbs_content_load
    ADD CONSTRAINT tbs_content_load_pkey PRIMARY KEY (id);


--
-- Name: tbs_content_product tbs_content_product_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbs_content_product
    ADD CONSTRAINT tbs_content_product_pkey PRIMARY KEY (product_id);


--
-- Name: tbs_content_recipe tbs_content_recipe_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbs_content_recipe
    ADD CONSTRAINT tbs_content_recipe_pkey PRIMARY KEY (recipe_id);


--
-- Name: tbs_content_variant tbs_content_variant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbs_content_variant
    ADD CONSTRAINT tbs_content_variant_pkey PRIMARY KEY (variant_id);


--
-- Name: tbs_content_fact_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tbs_content_fact_product ON public.tbs_content_fact USING btree (product_id);


--
-- Name: tbs_content_product_cat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tbs_content_product_cat ON public.tbs_content_product USING btree (category_code) WHERE listed;


--
-- Name: tbs_content_product_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tbs_content_product_sku ON public.tbs_content_product USING btree (sku);


--
-- Name: tbs_content_recipe_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tbs_content_recipe_product ON public.tbs_content_recipe USING btree (product_id);


--
-- Name: tbs_content_variant_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tbs_content_variant_product ON public.tbs_content_variant USING btree (product_id);


--
-- Name: tbs_content_fact tbs_content_fact_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbs_content_fact
    ADD CONSTRAINT tbs_content_fact_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.tbs_content_product(product_id) ON DELETE CASCADE;


--
-- Name: tbs_content_recipe tbs_content_recipe_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbs_content_recipe
    ADD CONSTRAINT tbs_content_recipe_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.tbs_content_product(product_id) ON DELETE CASCADE;


--
-- Name: tbs_content_variant tbs_content_variant_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbs_content_variant
    ADD CONSTRAINT tbs_content_variant_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.tbs_content_product(product_id) ON DELETE CASCADE;


--
-- Name: tbs_content_block; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tbs_content_block ENABLE ROW LEVEL SECURITY;

--
-- Name: tbs_content_category; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tbs_content_category ENABLE ROW LEVEL SECURITY;

--
-- Name: tbs_content_fact; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tbs_content_fact ENABLE ROW LEVEL SECURITY;

--
-- Name: tbs_content_load; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tbs_content_load ENABLE ROW LEVEL SECURITY;

--
-- Name: tbs_content_product; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tbs_content_product ENABLE ROW LEVEL SECURITY;

--
-- Name: tbs_content_recipe; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tbs_content_recipe ENABLE ROW LEVEL SECURITY;

--
-- Name: tbs_content_variant; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tbs_content_variant ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict PcTe3FMqpkBXqUWbJG0ufQkfUEGZVhRHNbpH6GwVeyvh6TnJBAyIkrmX990fU1Y

