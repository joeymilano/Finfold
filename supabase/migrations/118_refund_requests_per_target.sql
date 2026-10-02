-- 118: Refund requests — one open request per refund TARGET, not per user
-- ----------------------------------------------------------------------------
-- 订单记录页上线后，订阅退款与一次性订单退款（积分包 / 扫码套餐单）并存。
-- 原「每用户仅一条 pending」的唯一索引（033）会让两类退款互相阻塞：用户在
-- 订阅退款处理中就无法再申请订单退款，反之亦然。
--
-- 唯一键改为 (user_id, COALESCE(provider_order_id, provider_subscription_id))：
--   • 订阅退款行必填 provider_subscription_id（provider_order_id 可为 NULL，
--     COALESCE 落到订阅 id）
--   • 订单退款行必填 provider_order_id（= credit_purchases.order_code，
--     无 order_code 的老单用行 id 兜底）
-- 应用层在插入前按目标查重，本索引做并发兜底（23505）。

DROP INDEX IF EXISTS idx_refund_requests_one_open;

CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_requests_one_open_target
  ON public.refund_requests(
    user_id,
    COALESCE(provider_order_id, provider_subscription_id)
  )
  WHERE status = 'pending';

-- 同一目标已有 completed 退款时也不允许再次申请（应用层查重，无索引需要）。
