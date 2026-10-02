"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CirclePlus,
  Clock,
  Copy,
  DatabaseZap,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  X
} from "@/components/ui/icons";
import { QRCODE_PLANS, type QrcodePlanId } from "@/lib/payment/qrcode-constants";

// Admin reconcile surface for 经营码 (Alipay QR) orders. The operator (Joey)
// matches an incoming Alipay receipt to an order by searching the PRECISE
// amount or order code, then clicks "确认收款" — the API calls
// grant_purchase_credits, granting credits atomically. Operator-facing, so
// copy is Chinese only.

type QrcodeOrder = {
  id: string;
  userId: string;
  orderCode: string;
  credits: number;
  amountCents: number;
  amountYuan: string;
  status: string;
  /** Pricing V2 self-serve plan for a subscription order. */
  plan: QrcodePlanId | null;
  expiresAt: string | null;
  createdAt: string;
  confirmedAt: string | null;
};

type Tab = "pending" | "paid" | "all";

type CreditReport = {
  run: {
    id: string;
    status: "running" | "completed" | "failed";
    usersScanned: number;
    discrepancyUsers: number;
    issueCount: number;
    startedAt: string;
    completedAt: string | null;
  } | null;
  items: Array<{
    userId: string;
    balanceRemaining: number;
    ledgerDelta: number;
    balanceDifference: number;
    reservedRunsWithoutConsume: number;
    refundedRunsWithoutRefund: number;
    paidPurchasesWithoutGrant: number;
    activeSubscriptionsWithoutPlanGrant: number;
    issueCount: number;
  }>;
};

function newAdjustmentKey() {
  return `ops-${Date.now()}-${crypto.randomUUID()}`;
}

export function ReconcileClient({ initialAuthorized }: { initialAuthorized: boolean }) {
  const [authorized] = useState(initialAuthorized);
  const [orders, setOrders] = useState<QrcodeOrder[]>([]);
  const [tab, setTab] = useState<Tab>("pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<Record<string, "confirm" | "void" | undefined>>({});
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState<string | null>(null);
  const [creditReport, setCreditReport] = useState<CreditReport>({
    run: null,
    items: []
  });
  const [creditLoading, setCreditLoading] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustment, setAdjustment] = useState({
    userId: "",
    delta: "",
    reason: "",
    relatedGenerationRunId: "",
    relatedPurchaseId: "",
    idempotencyKey: newAdjustmentKey()
  });

  const load = useCallback(async (status: Tab) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reconcile?status=${status}`, { cache: "no-store" });
      const data = (await res.json()) as { orders?: QrcodeOrder[] };
      if (res.ok && data.orders) setOrders(data.orders);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCredits = useCallback(async () => {
    setCreditLoading(true);
    try {
      const response = await fetch("/api/admin/credits/reconcile", {
        cache: "no-store"
      });
      const data = (await response.json()) as CreditReport & { error?: string };
      if (!response.ok) {
        setToast(data.error ?? "Credits 对账报告加载失败");
        return;
      }
      setCreditReport(data);
    } finally {
      setCreditLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authorized) void load(tab);
  }, [authorized, tab, load]);

  useEffect(() => {
    if (authorized) void loadCredits();
  }, [authorized, loadCredits]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  async function doAction(id: string, action: "confirm" | "void") {
    setPendingAction((p) => ({ ...p, [id]: action }));
    try {
      const res = await fetch("/api/admin/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: id, action })
      });
      const data = (await res.json()) as {
        ok?: boolean;
        kind?: "credits" | "plan";
        alreadyPaid?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setToast(data.error ?? "操作失败");
        return;
      }
      if (action === "void") {
        setToast("订单已作废");
      } else if (data.alreadyPaid) {
        setToast("该订单已处理过，未重复发放");
      } else {
        setToast(
          data.kind === "plan" ? "已确认收款，套餐已开通 30 天 ✓" : "已确认收款，创作点数已发放 ✓"
        );
      }
      setOrders((prev) => prev.filter((o) => o.id !== id));
    } finally {
      setPendingAction((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    }
  }

  async function runCreditsReconciliation() {
    setCreditLoading(true);
    try {
      const response = await fetch("/api/admin/credits/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run" })
      });
      const data = (await response.json()) as {
        issueCount?: number;
        error?: string;
      };
      if (!response.ok) {
        setToast(data.error ?? "Credits 对账执行失败");
        return;
      }
      setToast(
        data.issueCount
          ? `对账完成：发现 ${data.issueCount} 项异常`
          : "对账完成：账本一致 ✓"
      );
      await loadCredits();
    } finally {
      setCreditLoading(false);
    }
  }

  async function applyAdjustment() {
    setAdjusting(true);
    try {
      const response = await fetch("/api/admin/credits/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "adjust",
          userId: adjustment.userId.trim(),
          delta: Number(adjustment.delta),
          reason: adjustment.reason.trim(),
          idempotencyKey: adjustment.idempotencyKey,
          relatedGenerationRunId:
            adjustment.relatedGenerationRunId.trim() || null,
          relatedPurchaseId: adjustment.relatedPurchaseId.trim() || null
        })
      });
      const data = (await response.json()) as {
        ok?: boolean;
        outcome?: string;
        available?: number;
        error?: string;
      };
      if (!response.ok || !data.ok) {
        setToast(data.error ?? "Credits adjustment 失败");
        return;
      }
      setToast(
        data.outcome === "duplicate"
          ? "该 adjustment 已处理过，未重复入账"
          : `Adjustment 已追加；可用余额 ${data.available ?? 0}`
      );
      setAdjustment((current) => ({
        ...current,
        delta: "",
        reason: "",
        relatedGenerationRunId: "",
        relatedPurchaseId: "",
        idempotencyKey: newAdjustmentKey()
      }));
      await runCreditsReconciliation();
    } finally {
      setAdjusting(false);
    }
  }

  if (!authorized) {
    return (
      <Wrap>
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <ShieldAlert className="h-10 w-10 text-risk" />
          <p className="text-sm font-semibold text-fg">无权访问</p>
          <p className="max-w-sm text-xs leading-relaxed text-fg-muted">
            该对账后台仅限管理员。你的账号未被列入 <code className="rounded bg-surface-2 px-1 py-0.5">ADMIN_USER_IDS</code> 白名单。
          </p>
        </div>
      </Wrap>
    );
  }

  const filtered = orders.filter((o) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      o.amountYuan.includes(q) ||
      String(o.amountCents).includes(q) ||
      o.orderCode.toLowerCase().includes(q) ||
      o.userId.toLowerCase().includes(q)
    );
  });

  return (
    <Wrap>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-5">
        <div>
          <p className="eyebrow">经营码 · 对账</p>
          <h1 className="mt-1.5 text-2xl font-bold text-fg">支付宝扫码订单对账</h1>
          <p className="mt-1.5 max-w-2xl text-xs leading-6 text-fg-muted">
            在支付宝账单看到收款后，用「金额」或「订单号」搜索对应订单，点「确认收款」即可自动发放创作点数。金额含唯一识别尾数，精确匹配即可。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(tab)}
          disabled={loading}
          className="btn-ghost focus-ring inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          刷新
        </button>
      </div>

      <CreditsLedgerPanel
        report={creditReport}
        loading={creditLoading}
        adjusting={adjusting}
        adjustment={adjustment}
        onAdjustmentChange={setAdjustment}
        onRun={() => void runCreditsReconciliation()}
        onApply={() => void applyAdjustment()}
      />

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-hairline bg-surface-2 p-1">
        {(["pending", "paid", "all"] as const).map((t) => {
          const label = t === "pending" ? "待确认" : t === "paid" ? "已完成" : "全部";
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                tab === t ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="按金额（如 49.37）或订单号搜索…"
          className="focus-ring w-full rounded-xl border border-hairline bg-surface py-2.5 pl-9 pr-3 text-sm text-fg placeholder:text-fg-muted"
        />
      </div>

      {/* List */}
      <div className="mt-4 space-y-3">
        {loading && orders.length === 0 ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-hairline bg-surface-2 p-8 text-center text-sm text-fg-muted">
            {search.trim() ? "没有匹配的订单。" : tab === "pending" ? "当前没有待确认的订单。" : "暂无订单。"}
          </div>
        ) : (
          filtered.map((o) => (
            <OrderRow
              key={o.id}
              order={o}
              now={now}
              action={pendingAction[o.id]}
              onConfirm={() => void doAction(o.id, "confirm")}
              onVoid={() => void doAction(o.id, "void")}
            />
          ))
        )}
      </div>

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-brand/30 bg-surface px-4 py-2.5 text-xs font-bold text-fg shadow-lg">
          {toast}
        </div>
      ) : null}
    </Wrap>
  );
}

function CreditsLedgerPanel({
  report,
  loading,
  adjusting,
  adjustment,
  onAdjustmentChange,
  onRun,
  onApply
}: {
  report: CreditReport;
  loading: boolean;
  adjusting: boolean;
  adjustment: {
    userId: string;
    delta: string;
    reason: string;
    relatedGenerationRunId: string;
    relatedPurchaseId: string;
    idempotencyKey: string;
  };
  onAdjustmentChange: (value: typeof adjustment) => void;
  onRun: () => void;
  onApply: () => void;
}) {
  const issueCount = report.run?.issueCount ?? 0;
  const adjustmentReady =
    /^[0-9a-f-]{36}$/i.test(adjustment.userId.trim()) &&
    Number.isInteger(Number(adjustment.delta)) &&
    Number(adjustment.delta) !== 0 &&
    adjustment.reason.trim().length >= 8;

  return (
    <section className="overflow-hidden rounded-2xl border border-hairline bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline bg-surface-2/70 p-4">
        <div className="flex gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-hairline bg-surface text-brand">
            <DatabaseZap className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-black text-fg">Credits 全账本</p>
            <p className="mt-1 max-w-xl text-[11px] leading-5 text-fg-muted">
              余额批次、追加流水、生成扣退与支付发放的只读核对。差异不会自动修复；人工修复只能追加 adjustment。
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={loading}
          className="btn-ghost focus-ring inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          立即对账
        </button>
      </div>

      <div className="grid gap-px bg-hairline sm:grid-cols-3">
        <LedgerStat label="扫描用户" value={report.run?.usersScanned ?? "—"} />
        <LedgerStat label="异常用户" value={report.run?.discrepancyUsers ?? "—"} risk={issueCount > 0} />
        <LedgerStat label="异常项" value={report.run?.issueCount ?? "—"} risk={issueCount > 0} />
      </div>

      {report.run ? (
        <div className="border-t border-hairline px-4 py-2 text-[10px] text-fg-muted">
          最近执行 {new Date(report.run.startedAt).toLocaleString("zh-CN", { hour12: false })} · {report.run.id}
        </div>
      ) : null}

      {report.items.length > 0 ? (
        <div className="border-t border-risk/20 bg-risk/[0.035] p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-black text-risk">
            <AlertTriangle className="h-4 w-4" /> 需要人工复核
          </div>
          <div className="space-y-2">
            {report.items.slice(0, 8).map((item) => (
              <div key={item.userId} className="grid gap-1 rounded-xl border border-risk/15 bg-surface px-3 py-2 text-[11px] sm:grid-cols-[1.3fr_repeat(5,1fr)]">
                <span className="font-mono font-bold text-fg">{item.userId}</span>
                <span>余额差 {item.balanceDifference}</span>
                <span>缺扣费 {item.reservedRunsWithoutConsume}</span>
                <span>缺退款 {item.refundedRunsWithoutRefund}</span>
                <span>缺发放 {item.paidPurchasesWithoutGrant}</span>
                <span>缺套餐批次 {item.activeSubscriptionsWithoutPlanGrant}</span>
              </div>
            ))}
          </div>
        </div>
      ) : report.run && issueCount === 0 ? (
        <div className="flex items-center gap-2 border-t border-brand/15 bg-brand/[0.035] px-4 py-3 text-xs font-bold text-brand">
          <CheckCircle2 className="h-4 w-4" /> 最近一次对账未发现差异
        </div>
      ) : null}

      <div className="border-t border-hairline p-4">
        <div className="mb-3 flex items-center gap-2">
          <CirclePlus className="h-4 w-4 text-fg-muted" />
          <p className="text-xs font-black text-fg">追加式人工调整</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <LedgerInput
            value={adjustment.userId}
            placeholder="用户 UUID"
            onChange={(userId) => onAdjustmentChange({ ...adjustment, userId })}
          />
          <LedgerInput
            value={adjustment.delta}
            placeholder="点数变化，如 100 或 -100"
            inputMode="numeric"
            onChange={(delta) => onAdjustmentChange({ ...adjustment, delta })}
          />
          <LedgerInput
            value={adjustment.relatedGenerationRunId}
            placeholder="关联 GenerationRun UUID（可选）"
            onChange={(relatedGenerationRunId) => onAdjustmentChange({ ...adjustment, relatedGenerationRunId })}
          />
          <LedgerInput
            value={adjustment.relatedPurchaseId}
            placeholder="关联 Purchase UUID（可选）"
            onChange={(relatedPurchaseId) => onAdjustmentChange({ ...adjustment, relatedPurchaseId })}
          />
        </div>
        <textarea
          value={adjustment.reason}
          onChange={(event) => onAdjustmentChange({ ...adjustment, reason: event.target.value })}
          placeholder="修复原因（至少 8 个字符，永久写入审计记录）"
          className="focus-ring mt-2 min-h-20 w-full resize-y rounded-xl border border-hairline bg-surface-2 px-3 py-2 text-xs text-fg placeholder:text-fg-muted"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-[10px] leading-4 text-fg-muted">
            不会直接改写历史流水。负数 adjustment 仅能扣除当前可用余额；重复提交由幂等键阻止。
          </p>
          <button
            type="button"
            onClick={onApply}
            disabled={adjusting || !adjustmentReady}
            className="btn-primary focus-ring inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold disabled:opacity-40"
          >
            {adjusting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CirclePlus className="h-3.5 w-3.5" />}
            追加 adjustment
          </button>
        </div>
        {!adjustmentReady && (adjustment.userId || adjustment.delta || adjustment.reason) ? (
          <p className="mt-2 text-[10px] font-semibold text-risk">
            需要有效用户 UUID、非零整数点数，以及至少 8 个字符的原因。
          </p>
        ) : null}
      </div>
    </section>
  );
}

function LedgerStat({ label, value, risk = false }: { label: string; value: string | number; risk?: boolean }) {
  return (
    <div className="bg-surface px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-fg-muted">{label}</p>
      <p className={`mt-1 font-mono text-xl font-black ${risk ? "text-risk" : "text-fg"}`}>{value}</p>
    </div>
  );
}

function LedgerInput({ value, placeholder, onChange, inputMode }: { value: string; placeholder: string; onChange: (value: string) => void; inputMode?: "numeric" }) {
  return (
    <input
      value={value}
      inputMode={inputMode}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="focus-ring rounded-xl border border-hairline bg-surface-2 px-3 py-2 text-xs text-fg placeholder:text-fg-muted"
    />
  );
}

function OrderRow({
  order,
  now,
  action,
  onConfirm,
  onVoid
}: {
  order: QrcodeOrder;
  now: number;
  action?: "confirm" | "void";
  onConfirm: () => void;
  onVoid: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const paid = order.status === "paid";
  const remainingMs = order.expiresAt ? new Date(order.expiresAt).getTime() - now : 0;
  const expired = !paid && remainingMs <= 0;
  const mm = Math.max(0, Math.floor(remainingMs / 60000));
  const ss = Math.max(0, Math.floor((remainingMs % 60000) / 1000));
  const countdown = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(order.orderCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black tabular text-brand">¥{order.amountYuan}</span>
            {order.plan ? (
              <span className="inline-flex items-center rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                {QRCODE_PLANS[order.plan].nameCN} · 订阅月
              </span>
            ) : (
              <span className="text-xs text-fg-muted">{order.credits.toLocaleString()} 点数</span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-muted">
            <button
              type="button"
              onClick={() => void copy()}
              className="focus-ring inline-flex items-center gap-1 rounded font-semibold text-fg hover:text-brand"
            >
              {order.orderCode}
              {copied ? <CheckCircle2 className="h-3 w-3 text-brand" /> : <Copy className="h-3 w-3 text-fg-muted" />}
            </button>
            <span>用户 {order.userId.slice(0, 8)}</span>
            <span>{new Date(order.createdAt).toLocaleString("zh-CN", { hour12: false })}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {paid ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-brand/10 px-2.5 py-1 text-[11px] font-bold text-brand">
              <CheckCircle2 className="h-3.5 w-3.5" /> 已发放
            </span>
          ) : expired ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-risk/10 px-2.5 py-1 text-[11px] font-bold text-risk">
              <Clock className="h-3.5 w-3.5" /> 已过期
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-fg-muted tabular">
              <Clock className="h-3.5 w-3.5" /> {countdown}
            </span>
          )}
          {order.confirmedAt ? (
            <span className="text-[10px] text-fg-muted">
              确认于 {new Date(order.confirmedAt).toLocaleString("zh-CN", { hour12: false })}
            </span>
          ) : null}
        </div>
      </div>

      {!paid ? (
        <div className="mt-3 flex items-center justify-end gap-2 border-t border-hairline pt-3">
          {expired ? null : (
            <button
              type="button"
              onClick={onConfirm}
              disabled={action === "confirm"}
              className="btn-primary focus-ring inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold disabled:opacity-50"
            >
              {action === "confirm" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              确认收款
            </button>
          )}
          <button
            type="button"
            onClick={onVoid}
            disabled={action === "void"}
            className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-hairline px-3 py-1.5 text-xs font-bold text-fg-muted transition-colors hover:border-risk/40 hover:text-risk disabled:opacity-50"
          >
            {action === "void" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            作废
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto grid max-w-3xl gap-6 pb-10">{children}</div>;
}
