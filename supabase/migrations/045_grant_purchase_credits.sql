-- ============================================================
-- Migration 045: grant_purchase_credits — fulfill a paid top-up
--
-- Closes the §10.4 top-up loop. When Creem confirms a credit-pack
-- purchase, the webhook calls this to atomically:
--   1. create a long-lived 'purchase' balance batch (no expiry — §10.4:
--      "separately purchased credits do not expire"),
--   2. write the ledger transaction (source='checkout'), and
--   3. flip the credit_purchases row pending → paid, linking balance_id.
--
-- Idempotent on status='paid' so a replayed/duplicated Creem webhook never
-- double-grants — it returns the existing balance_id instead.
--
-- Design mirrors grant_plan_credits (SECURITY DEFINER, 044) but for
-- source='purchase' batches. Credits are READ FROM THE PURCHASE ROW, not
-- passed in, so a tampered webhook payload can never grant more than the
-- user actually paid for. Only a 'pending' order can be fulfilled; 'failed'
-- and 'refunded' are terminal states this function refuses to revive.
--
-- Returns NULL for unknown ids or non-fulfillable states (instead of
-- raising) so the webhook can log + 200 OK and NOT trigger Creem's retry
-- loop — which would otherwise re-deliver the event forever.
-- ============================================================

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

  -- Unknown purchase id: nothing to fulfill.
  IF v_purchase IS NULL THEN
    RETURN NULL;
  END IF;

  -- Already fulfilled — idempotent no-op. Hand back the existing balance id.
  IF v_purchase.status = 'paid' THEN
    RETURN v_purchase.balance_id;
  END IF;

  -- Only 'pending' orders are fulfillable. 'failed'/'refunded' stay terminal.
  IF v_purchase.status <> 'pending' THEN
    RETURN NULL;
  END IF;

  -- 1. Create the long-lived purchase balance batch (expires_at NULL).
  INSERT INTO public.credit_balances (user_id, source, granted, used, expires_at)
  VALUES (v_purchase.user_id, 'purchase', v_purchase.credits, 0, NULL)
  RETURNING id INTO v_balance_id;

  -- 2. Ledger entry. source='checkout' distinguishes a paid top-up from a
  --    'system' grant/refund; action='purchase' is ignored by
  --    get_credit_spend_summary (which only sums delta < 0), so top-ups never
  --    pollute the "where your credits went" spend breakdown.
  INSERT INTO public.credit_transactions (user_id, delta, action, source, balance_id)
  VALUES (v_purchase.user_id, v_purchase.credits, 'purchase', 'checkout', v_balance_id);

  -- 3. Flip the order to paid and link the balance batch. COALESCE keeps any
  --    provider_checkout_id already captured at checkout-create time.
  UPDATE public.credit_purchases
    SET status = 'paid',
        balance_id = v_balance_id,
        provider_checkout_id = COALESCE(p_provider_checkout_id, provider_checkout_id)
    WHERE id = p_purchase_id;

  RETURN v_balance_id;
END;
$$;
