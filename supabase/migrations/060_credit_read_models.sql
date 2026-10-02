-- ============================================================
-- Migration 060: Atomic, bounded Credits read models
--
-- The API must not reconstruct billing state from paginated PostgREST rows.
-- These service-role-only SQL functions aggregate inside one PostgreSQL
-- statement, so every returned field comes from one MVCC snapshot.
-- ============================================================

-- Current-cycle plan usage and total spendable balance. The cycle key and
-- expiry cutoff are derived from one statement timestamp in the database.
CREATE OR REPLACE FUNCTION public.get_credit_allowance_snapshot(
  p_user_id uuid
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH context AS (
    SELECT
      statement_timestamp() AS as_of,
      to_char(timezone('UTC', statement_timestamp()), 'YYYY-MM') AS period_key
  ),
  snapshot AS (
    SELECT
      context.period_key,
      COUNT(balance.id) FILTER (
        WHERE balance.source = 'plan'
          AND balance.period_key = context.period_key
      ) AS plan_batch_count,
      COALESCE(
        MAX(balance.used) FILTER (
          WHERE balance.source = 'plan'
            AND balance.period_key = context.period_key
        ),
        0
      )::bigint AS used,
      COALESCE(
        SUM(balance.remaining) FILTER (
          WHERE balance.remaining > 0
            AND (
              balance.expires_at IS NULL
              OR balance.expires_at > context.as_of
            )
        ),
        0
      )::bigint AS available
    FROM context
    LEFT JOIN public.credit_balances AS balance
      ON balance.user_id = p_user_id
    GROUP BY context.period_key, context.as_of
  )
  SELECT CASE
    WHEN snapshot.plan_batch_count = 1 THEN jsonb_build_object(
      'periodKey', snapshot.period_key,
      'used', snapshot.used,
      'available', snapshot.available
    )
    ELSE NULL
  END
  FROM snapshot;
$$;

-- One explicitly bounded billing-cycle summary. Operator adjustments remain
-- visible but are intentionally separate from user action attempts/refunds.
CREATE OR REPLACE FUNCTION public.get_credit_spend_summary_snapshot(
  p_user_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT
      p_period_start AS period_start,
      p_period_end AS period_end
    WHERE p_period_start IS NOT NULL
      AND p_period_end IS NOT NULL
      AND p_period_start < p_period_end
  ),
  scoped AS MATERIALIZED (
    SELECT tx.action, tx.delta
    FROM public.credit_transactions AS tx
    CROSS JOIN bounds
    WHERE tx.user_id = p_user_id
      AND tx.created_at >= bounds.period_start
      AND tx.created_at < bounds.period_end
  ),
  action_totals AS (
    SELECT
      scoped.action,
      SUM(-(scoped.delta::bigint)) AS credits
    FROM scoped
    WHERE scoped.delta < 0
      AND scoped.action NOT IN ('adjustment', 'expire')
    GROUP BY scoped.action
  ),
  items AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'action', action_totals.action,
          'credits', action_totals.credits
        )
        ORDER BY action_totals.credits DESC, action_totals.action ASC
      ),
      '[]'::jsonb
    ) AS value
    FROM action_totals
  ),
  totals AS (
    SELECT
      COALESCE(
        SUM(-(scoped.delta::bigint)) FILTER (
          WHERE scoped.delta < 0
            AND scoped.action NOT IN ('adjustment', 'expire')
        ),
        0
      ) AS gross_reserved,
      COALESCE(
        SUM(scoped.delta::bigint) FILTER (
          WHERE scoped.delta > 0
            AND scoped.action = 'refund'
        ),
        0
      ) AS refunded,
      COALESCE(
        SUM(scoped.delta::bigint) FILTER (
          WHERE scoped.delta > 0
            AND scoped.action = 'adjustment'
        ),
        0
      ) AS manual_credits,
      COALESCE(
        SUM(-(scoped.delta::bigint)) FILTER (
          WHERE scoped.delta < 0
            AND scoped.action = 'adjustment'
        ),
        0
      ) AS manual_debits,
      COALESCE(
        SUM(-(scoped.delta::bigint)) FILTER (
          WHERE scoped.delta < 0
            AND scoped.action = 'expire'
        ),
        0
      ) AS expired_credits
    FROM scoped
  )
  SELECT jsonb_build_object(
    'items', items.value,
    'grossReserved', totals.gross_reserved,
    'refunded', totals.refunded,
    'netCharged', GREATEST(totals.gross_reserved - totals.refunded, 0),
    'manualCredits', totals.manual_credits,
    'manualDebits', totals.manual_debits,
    'expiredCredits', totals.expired_credits
  )
  FROM bounds
  CROSS JOIN items
  CROSS JOIN totals;
$$;

REVOKE ALL ON FUNCTION public.get_credit_allowance_snapshot(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_credit_allowance_snapshot(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.get_credit_spend_summary_snapshot(
  uuid, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_credit_spend_summary_snapshot(
  uuid, timestamptz, timestamptz
) TO service_role;
