-- ============================================================
-- Migration 059: Traceable Credits, reconciliation, adjustments
--
-- The Credits ledger is append-only, but generationRunId/requestId used to
-- live only in an unindexed JSON detail object. This migration adds explicit
-- correlation columns, a persistent read-only reconciliation report, and an
-- operator adjustment RPC that always appends a transaction.
--
-- Reconciliation never repairs data automatically. A discrepancy is evidence
-- for an operator; any repair must go through apply_credit_adjustment so the
-- operator, reason, idempotency key, and related business object are durable.
-- ============================================================

ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS generation_run_id uuid
  REFERENCES public.generation_runs(id) ON DELETE SET NULL;

ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS request_id text;

ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS purchase_id uuid
  REFERENCES public.credit_purchases(id) ON DELETE SET NULL;

ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS period_key text;

CREATE TABLE IF NOT EXISTS public.credit_adjustments (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid        NOT NULL REFERENCES auth.users(id)
                                        ON DELETE CASCADE,
  operator_user_id          uuid        NOT NULL REFERENCES auth.users(id)
                                        ON DELETE RESTRICT,
  delta                     integer     NOT NULL,
  reason                    text        NOT NULL,
  idempotency_key           text        NOT NULL,
  related_generation_run_id uuid        REFERENCES public.generation_runs(id)
                                        ON DELETE SET NULL,
  related_purchase_id       uuid        REFERENCES public.credit_purchases(id)
                                        ON DELETE SET NULL,
  transaction_id            uuid        UNIQUE
                                        REFERENCES public.credit_transactions(id)
                                        ON DELETE RESTRICT,
  created_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_adjustments_delta_check CHECK (delta <> 0),
  CONSTRAINT credit_adjustments_reason_check
    CHECK (char_length(trim(reason)) BETWEEN 8 AND 1000),
  CONSTRAINT credit_adjustments_idempotency_check
    CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  UNIQUE (operator_user_id, idempotency_key)
);

ALTER TABLE public.credit_adjustments ENABLE ROW LEVEL SECURITY;
-- No client policies. Operator routes use service-role after ADMIN_USER_IDS.

ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS adjustment_id uuid
  REFERENCES public.credit_adjustments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_credit_tx_generation_run
  ON public.credit_transactions(generation_run_id, created_at);

CREATE INDEX IF NOT EXISTS idx_credit_tx_request
  ON public.credit_transactions(user_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credit_tx_generation_consume_once
  ON public.credit_transactions(generation_run_id)
  WHERE generation_run_id IS NOT NULL AND delta < 0;

CREATE INDEX IF NOT EXISTS idx_credit_tx_generation_refund_once
  ON public.credit_transactions(generation_run_id)
  WHERE generation_run_id IS NOT NULL AND delta > 0 AND action = 'refund';

CREATE INDEX IF NOT EXISTS idx_credit_tx_purchase_once
  ON public.credit_transactions(purchase_id)
  WHERE purchase_id IS NOT NULL AND action = 'purchase';

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_tx_adjustment_once
  ON public.credit_transactions(adjustment_id)
  WHERE adjustment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.populate_credit_transaction_links()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_generation_run_id text;
  v_period_key text;
BEGIN
  IF NEW.generation_run_id IS NULL AND NEW.detail IS NOT NULL THEN
    v_generation_run_id := NEW.detail ->> 'generationRunId';
    IF v_generation_run_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      NEW.generation_run_id := v_generation_run_id::uuid;
    END IF;
  END IF;

  IF NEW.request_id IS NULL AND NEW.detail IS NOT NULL THEN
    NEW.request_id := NULLIF(left(NEW.detail ->> 'requestId', 128), '');
  END IF;

  IF NEW.period_key IS NULL
     AND NEW.action = 'grant'
     AND NEW.balance_id IS NOT NULL THEN
    SELECT period_key INTO v_period_key
      FROM public.credit_balances
     WHERE id = NEW.balance_id
       AND source = 'plan';
    NEW.period_key := v_period_key;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS credit_transactions_populate_links
  ON public.credit_transactions;
CREATE TRIGGER credit_transactions_populate_links
BEFORE INSERT ON public.credit_transactions
FOR EACH ROW EXECUTE FUNCTION public.populate_credit_transaction_links();

-- Backfill correlations from the legacy JSON detail and purchase balance link.
UPDATE public.credit_transactions
   SET generation_run_id = (detail ->> 'generationRunId')::uuid
 WHERE generation_run_id IS NULL
   AND detail ->> 'generationRunId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

UPDATE public.credit_transactions
   SET request_id = NULLIF(left(detail ->> 'requestId', 128), '')
 WHERE request_id IS NULL
   AND detail ? 'requestId';

UPDATE public.credit_transactions AS tx
   SET purchase_id = purchase.id
  FROM public.credit_purchases AS purchase
 WHERE tx.purchase_id IS NULL
   AND tx.action = 'purchase'
   AND tx.balance_id = purchase.balance_id;

UPDATE public.credit_transactions AS tx
   SET period_key = balance.period_key
  FROM public.credit_balances AS balance
 WHERE tx.period_key IS NULL
   AND tx.action = 'grant'
   AND tx.balance_id = balance.id
   AND balance.source = 'plan';

-- Recreate purchase fulfillment so future ledger rows carry purchase_id at
-- insertion time. The purchase row remains the trusted source of credit size.
CREATE OR REPLACE FUNCTION public.grant_purchase_credits(
  p_purchase_id uuid,
  p_provider_checkout_id text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase record;
  v_balance_id uuid;
BEGIN
  SELECT id, user_id, credits, status, balance_id
    INTO v_purchase
    FROM public.credit_purchases
    WHERE id = p_purchase_id
    FOR UPDATE;

  IF v_purchase IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_purchase.status = 'paid' THEN
    RETURN v_purchase.balance_id;
  END IF;
  IF v_purchase.status <> 'pending' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.credit_balances (
    user_id, source, granted, used, expires_at
  ) VALUES (
    v_purchase.user_id, 'purchase', v_purchase.credits, 0, NULL
  ) RETURNING id INTO v_balance_id;

  INSERT INTO public.credit_transactions (
    user_id,
    delta,
    action,
    source,
    balance_id,
    purchase_id
  ) VALUES (
    v_purchase.user_id,
    v_purchase.credits,
    'purchase',
    'checkout',
    v_balance_id,
    p_purchase_id
  );

  UPDATE public.credit_purchases
     SET status = 'paid',
         balance_id = v_balance_id,
         provider_checkout_id = COALESCE(
           p_provider_checkout_id,
           provider_checkout_id
         )
   WHERE id = p_purchase_id;

  RETURN v_balance_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_credit_adjustment(
  p_user_id uuid,
  p_operator_user_id uuid,
  p_delta integer,
  p_reason text,
  p_idempotency_key text,
  p_related_generation_run_id uuid DEFAULT NULL,
  p_related_purchase_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adjustment public.credit_adjustments%ROWTYPE;
  v_batch record;
  v_balance_id uuid;
  v_transaction_id uuid;
  v_remaining_to_apply integer;
  v_to_apply integer;
  v_available integer;
BEGIN
  IF p_delta = 0
     OR char_length(trim(p_reason)) NOT BETWEEN 8 AND 1000
     OR char_length(p_idempotency_key) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'invalid_credit_adjustment';
  END IF;

  IF p_related_generation_run_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.generation_runs
        WHERE id = p_related_generation_run_id
          AND user_id = p_user_id
     ) THEN
    RAISE EXCEPTION 'adjustment_generation_run_owner_mismatch';
  END IF;

  IF p_related_purchase_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.credit_purchases
        WHERE id = p_related_purchase_id
          AND user_id = p_user_id
     ) THEN
    RAISE EXCEPTION 'adjustment_purchase_owner_mismatch';
  END IF;

  SELECT * INTO v_adjustment
    FROM public.credit_adjustments
   WHERE operator_user_id = p_operator_user_id
     AND idempotency_key = p_idempotency_key
   FOR UPDATE;

  IF FOUND THEN
    IF v_adjustment.user_id <> p_user_id
       OR v_adjustment.delta <> p_delta
       OR v_adjustment.reason <> trim(p_reason) THEN
      RAISE EXCEPTION 'credit_adjustment_idempotency_conflict';
    END IF;
    RETURN jsonb_build_object(
      'outcome', 'duplicate',
      'adjustmentId', v_adjustment.id,
      'transactionId', v_adjustment.transaction_id,
      'available', public.get_available_credits(p_user_id)
    );
  END IF;

  INSERT INTO public.credit_adjustments (
    user_id,
    operator_user_id,
    delta,
    reason,
    idempotency_key,
    related_generation_run_id,
    related_purchase_id
  ) VALUES (
    p_user_id,
    p_operator_user_id,
    p_delta,
    trim(p_reason),
    p_idempotency_key,
    p_related_generation_run_id,
    p_related_purchase_id
  ) RETURNING * INTO v_adjustment;

  IF p_delta > 0 THEN
    INSERT INTO public.credit_balances (
      user_id, source, granted, used, expires_at
    ) VALUES (
      p_user_id, 'grant', p_delta, 0, NULL
    ) RETURNING id INTO v_balance_id;
  ELSE
    v_remaining_to_apply := -p_delta;
    SELECT public.get_available_credits(p_user_id) INTO v_available;
    IF v_available < v_remaining_to_apply THEN
      RAISE EXCEPTION 'insufficient_credits_for_adjustment';
    END IF;

    FOR v_batch IN
      SELECT id, remaining
        FROM public.credit_balances
       WHERE user_id = p_user_id
         AND remaining > 0
         AND (expires_at IS NULL OR expires_at > now())
       ORDER BY expires_at ASC NULLS LAST, created_at ASC
       FOR UPDATE
    LOOP
      EXIT WHEN v_remaining_to_apply <= 0;
      v_to_apply := LEAST(v_batch.remaining, v_remaining_to_apply);
      UPDATE public.credit_balances
         SET used = used + v_to_apply
       WHERE id = v_batch.id;
      v_remaining_to_apply := v_remaining_to_apply - v_to_apply;
    END LOOP;

    IF v_remaining_to_apply > 0 THEN
      RAISE EXCEPTION 'credit_adjustment_under_applied';
    END IF;
  END IF;

  INSERT INTO public.credit_transactions (
    user_id,
    delta,
    action,
    source,
    detail,
    balance_id,
    generation_run_id,
    request_id,
    purchase_id,
    adjustment_id
  ) VALUES (
    p_user_id,
    p_delta,
    'adjustment',
    'system',
    jsonb_build_object(
      'reason', trim(p_reason),
      'operatorUserId', p_operator_user_id
    ),
    v_balance_id,
    p_related_generation_run_id,
    (
      SELECT request_id
        FROM public.generation_runs
       WHERE id = p_related_generation_run_id
    ),
    p_related_purchase_id,
    v_adjustment.id
  ) RETURNING id INTO v_transaction_id;

  UPDATE public.credit_adjustments
     SET transaction_id = v_transaction_id
   WHERE id = v_adjustment.id;

  RETURN jsonb_build_object(
    'outcome', 'applied',
    'adjustmentId', v_adjustment.id,
    'transactionId', v_transaction_id,
    'available', public.get_available_credits(p_user_id)
  );
END;
$$;

CREATE TABLE IF NOT EXISTS public.credit_reconciliation_runs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  status            text        NOT NULL DEFAULT 'running',
  users_scanned     integer     NOT NULL DEFAULT 0,
  discrepancy_users integer     NOT NULL DEFAULT 0,
  issue_count       integer     NOT NULL DEFAULT 0,
  started_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_reconciliation_runs_status_check
    CHECK (status IN ('running', 'completed', 'failed'))
);

CREATE TABLE IF NOT EXISTS public.credit_reconciliation_items (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_run_id           uuid        NOT NULL
                                              REFERENCES public.credit_reconciliation_runs(id)
                                              ON DELETE CASCADE,
  user_id                         uuid        NOT NULL REFERENCES auth.users(id)
                                              ON DELETE CASCADE,
  balance_remaining               integer     NOT NULL,
  ledger_delta                    integer     NOT NULL,
  balance_difference              integer     NOT NULL,
  reserved_runs_without_consume   integer     NOT NULL,
  refunded_runs_without_refund    integer     NOT NULL,
  paid_purchases_without_grant    integer     NOT NULL,
  active_subscriptions_without_plan_grant integer NOT NULL,
  issue_count                     integer     NOT NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reconciliation_run_id, user_id)
);

CREATE INDEX IF NOT EXISTS credit_reconciliation_items_issues_idx
  ON public.credit_reconciliation_items(
    reconciliation_run_id,
    issue_count DESC
  );

ALTER TABLE public.credit_reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_reconciliation_items ENABLE ROW LEVEL SECURITY;
-- No client policies. Reports are read through the admin-only API.

CREATE OR REPLACE FUNCTION public.run_credit_reconciliation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_users_scanned integer;
  v_discrepancy_users integer;
  v_issue_count integer;
BEGIN
  INSERT INTO public.credit_reconciliation_runs DEFAULT VALUES
  RETURNING id INTO v_run_id;

  INSERT INTO public.credit_reconciliation_items (
    reconciliation_run_id,
    user_id,
    balance_remaining,
    ledger_delta,
    balance_difference,
    reserved_runs_without_consume,
    refunded_runs_without_refund,
    paid_purchases_without_grant,
    active_subscriptions_without_plan_grant,
    issue_count
  )
  WITH users AS (
    SELECT user_id FROM public.credit_balances
    UNION
    SELECT user_id FROM public.credit_transactions
    UNION
    SELECT user_id FROM public.generation_runs
    UNION
    SELECT user_id FROM public.credit_purchases
    UNION
    SELECT user_id FROM public.subscriptions
  ),
  balances AS (
    SELECT user_id, COALESCE(SUM(remaining), 0)::integer AS total
      FROM public.credit_balances
     GROUP BY user_id
  ),
  ledger AS (
    SELECT user_id, COALESCE(SUM(delta), 0)::integer AS total
      FROM public.credit_transactions
     GROUP BY user_id
  ),
  missing_consume AS (
    SELECT run.user_id, COUNT(*)::integer AS total
      FROM public.generation_runs AS run
     WHERE run.credits_reserved
       AND NOT EXISTS (
         SELECT 1
           FROM public.credit_transactions AS tx
          WHERE tx.generation_run_id = run.id
            AND tx.delta < 0
       )
     GROUP BY run.user_id
  ),
  missing_refund AS (
    SELECT run.user_id, COUNT(*)::integer AS total
      FROM public.generation_runs AS run
     WHERE run.credits_refunded
       AND NOT EXISTS (
         SELECT 1
           FROM public.credit_transactions AS tx
          WHERE tx.generation_run_id = run.id
            AND tx.delta > 0
            AND tx.action = 'refund'
       )
     GROUP BY run.user_id
  ),
  missing_purchase AS (
    SELECT purchase.user_id, COUNT(*)::integer AS total
      FROM public.credit_purchases AS purchase
     WHERE purchase.status = 'paid'
       AND NOT EXISTS (
         SELECT 1
           FROM public.credit_transactions AS tx
          WHERE tx.purchase_id = purchase.id
             OR (
               tx.action = 'purchase'
               AND tx.balance_id = purchase.balance_id
             )
       )
    GROUP BY purchase.user_id
  ),
  missing_subscription_grant AS (
    SELECT subscription.user_id, 1::integer AS total
      FROM public.subscriptions AS subscription
     WHERE subscription.status IN ('active', 'trialing')
       AND (
         subscription.current_period_end IS NULL
         OR subscription.current_period_end > now()
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public.credit_balances AS balance
          WHERE balance.user_id = subscription.user_id
            AND balance.source = 'plan'
            AND balance.period_key = to_char(
              timezone('UTC', now()),
              'YYYY-MM'
            )
       )
     GROUP BY subscription.user_id
  ),
  report AS (
    SELECT
      users.user_id,
      COALESCE(balances.total, 0) AS balance_remaining,
      COALESCE(ledger.total, 0) AS ledger_delta,
      COALESCE(balances.total, 0) - COALESCE(ledger.total, 0)
        AS balance_difference,
      COALESCE(missing_consume.total, 0) AS reserved_runs_without_consume,
      COALESCE(missing_refund.total, 0) AS refunded_runs_without_refund,
      COALESCE(missing_purchase.total, 0) AS paid_purchases_without_grant,
      COALESCE(missing_subscription_grant.total, 0)
        AS active_subscriptions_without_plan_grant
    FROM users
    LEFT JOIN balances USING (user_id)
    LEFT JOIN ledger USING (user_id)
    LEFT JOIN missing_consume USING (user_id)
    LEFT JOIN missing_refund USING (user_id)
    LEFT JOIN missing_purchase USING (user_id)
    LEFT JOIN missing_subscription_grant USING (user_id)
  )
  SELECT
    v_run_id,
    report.user_id,
    report.balance_remaining,
    report.ledger_delta,
    report.balance_difference,
    report.reserved_runs_without_consume,
    report.refunded_runs_without_refund,
    report.paid_purchases_without_grant,
    report.active_subscriptions_without_plan_grant,
    (
      CASE WHEN report.balance_difference <> 0 THEN 1 ELSE 0 END
      + report.reserved_runs_without_consume
      + report.refunded_runs_without_refund
      + report.paid_purchases_without_grant
      + report.active_subscriptions_without_plan_grant
    )
  FROM report;

  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE issue_count > 0)::integer,
    COALESCE(SUM(issue_count), 0)::integer
  INTO v_users_scanned, v_discrepancy_users, v_issue_count
  FROM public.credit_reconciliation_items
  WHERE reconciliation_run_id = v_run_id;

  UPDATE public.credit_reconciliation_runs
     SET status = 'completed',
         users_scanned = v_users_scanned,
         discrepancy_users = v_discrepancy_users,
         issue_count = v_issue_count,
         completed_at = now()
   WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'reconciliationRunId', v_run_id,
    'usersScanned', v_users_scanned,
    'discrepancyUsers', v_discrepancy_users,
    'issueCount', v_issue_count
  );
EXCEPTION WHEN OTHERS THEN
  IF v_run_id IS NOT NULL THEN
    UPDATE public.credit_reconciliation_runs
       SET status = 'failed',
           completed_at = now()
     WHERE id = v_run_id;
  END IF;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.populate_credit_transaction_links()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.apply_credit_adjustment(
  uuid, uuid, integer, text, text, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_credit_adjustment(
  uuid, uuid, integer, text, text, uuid, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.run_credit_reconciliation()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_credit_reconciliation()
  TO service_role;

REVOKE ALL ON FUNCTION public.grant_purchase_credits(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_purchase_credits(uuid, text)
  TO service_role;
