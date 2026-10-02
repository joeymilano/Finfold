"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, FlaskConical, Target } from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { growthLoopDisabledCopy } from "@/components/growth-loop/copy";
import { useLocale } from "@/hooks/useLocale";

type GoalListItem = {
  goal: {
    id: string;
    title: string;
    status: "active" | "paused" | "completed" | "closed";
    target_value: number | string;
    channel_platform: string;
    end_at: string;
  };
  activeMission: { id: string; hypothesis: string; status: string; executionState: string } | null;
  missionCount: number;
  acceptedLearnings: number;
};

export function GrowthLoopOverview() {
  const locale = useLocale();
  const en = locale === "en";
  const [goals, setGoals] = useState<GoalListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: en ? "Get new activated users for my product" : "为产品获得新的有效激活用户",
    landingUrl: "",
    targetValue: "10",
    endAt: ""
  });

  const copy = en ? {
    eyebrow: "GROWTH LOOP",
    pilot: "Pilot",
    title: "Turn one growth goal into rounds you can actually review",
    body: "The operating brief decides what to sell and to whom. This loop turns the goal into one comparable experiment per round: a hypothesis, two content variants, tracking links, and recorded evidence — reviews only read server-computed numbers.",
    create: "Create a growth goal",
    createDetail: "One goal, one channel. This pilot runs on Xiaohongshu only.",
    goalTitle: "Goal title",
    goalPlaceholder: "e.g. Get new activated users for my product",
    landing: "Landing page URL",
    target: "Target activations",
    targetCaption: "Activation = signed up AND first saved generated content to the library",
    endAt: "End date",
    endAtCaption: "The channel is fixed to Xiaohongshu in this pilot",
    submit: "Create goal",
    creating: "Creating…",
    goals: "Your goals",
    goalsDetail: "Each goal keeps its own rounds, evidence, and accepted learnings.",
    empty: "No goals yet. Create the first one above.",
    open: "Open workspace",
    active: "Active",
    paused: "Paused",
    channel: "Xiaohongshu",
    metricTarget: "Target activations",
    metricRounds: "Experiment rounds",
    metricLearnings: "Accepted learnings",
    metricEnds: "Ends",
    current: "Current experiment",
    none: "No active experiment",
    loadFailed: "Unable to load your goals."
  } : {
    eyebrow: "增长闭环",
    pilot: "试点",
    title: "把一个增长目标，跑成一轮轮可复盘的实验",
    body: "运营简报定义卖什么、卖给谁；这里把目标拆成每轮一个可比较的实验：一个假设、两个内容变体、追踪链接与发布证据。复盘只看服务端统计的数字，不承诺增长结果。",
    create: "创建增长目标",
    createDetail: "一个目标、一个渠道。本轮试点仅支持小红书。",
    goalTitle: "目标名称",
    goalPlaceholder: "例如 为产品获得新的有效激活用户",
    landing: "落地页链接",
    target: "目标有效激活数",
    targetCaption: "有效激活 = 完成注册，并首次把生成内容保存到内容库",
    endAt: "结束日期",
    endAtCaption: "本轮渠道固定为小红书",
    submit: "创建增长目标",
    creating: "创建中…",
    goals: "进行中的目标",
    goalsDetail: "每个目标有独立的轮数、证据和已采纳经验。",
    empty: "还没有目标，先在上方创建第一个",
    open: "进入工作台",
    active: "进行中",
    paused: "已暂停",
    channel: "小红书",
    metricTarget: "目标激活",
    metricRounds: "实验轮数",
    metricLearnings: "已采纳经验",
    metricEnds: "截止",
    current: "当前实验",
    none: "暂无进行中的实验",
    loadFailed: "暂时无法读取目标列表。"
  };

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/growth-loop/goals", { cache: "no-store" });
      if (response.status === 403) {
        setForbidden(true);
        setGoals([]);
        return;
      }
      if (!response.ok) throw new Error((await response.json()).error ?? "failed");
      const data = await response.json();
      setGoals(data.goals ?? []);
      setError(null);
    } catch {
      setError(copy.loadFailed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [en]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!form.endAt) {
      const defaultEnd = new Date(Date.now() + 28 * 24 * 3600 * 1000);
      setForm((prev) => ({ ...prev, endAt: defaultEnd.toISOString().slice(0, 10) }));
    }
  }, [form.endAt]);

  async function createGoal(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    try {
      const response = await fetch("/api/growth-loop/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          landingUrl: form.landingUrl,
          targetValue: Number(form.targetValue),
          endAt: new Date(`${form.endAt}T23:59:59+08:00`).toISOString(),
          timezone: "Asia/Shanghai"
        })
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "failed");
      setForm((prev) => ({ ...prev, landingUrl: "" }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "failed");
    } finally {
      setCreating(false);
    }
  }

  if (forbidden) {
    return (
      <div className="mx-auto grid max-w-[1180px] gap-5 pb-10 xl:max-w-[1440px] 2xl:max-w-[1640px]">
        <Panel className="border-warn/30 bg-warn/[0.055] p-5 text-sm font-semibold leading-6 text-fg-muted md:p-6">
          {growthLoopDisabledCopy(en)}
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-[1180px] gap-5 pb-10 xl:max-w-[1440px] 2xl:max-w-[1640px]">
      <Panel className="relative overflow-hidden p-6 md:p-8">
        <div className="grain-local" aria-hidden />
        <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-action/10 blur-3xl" />
        <div className="relative max-w-4xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="eyebrow">{copy.eyebrow}</p>
            <Tag tone="info" dot>{copy.pilot}</Tag>
          </div>
          <h1 className="mt-4 max-w-4xl text-balance text-3xl font-black leading-tight text-fg md:text-5xl">{copy.title}</h1>
          <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-fg-muted md:text-base">{copy.body}</p>
        </div>
      </Panel>

      {error ? (
        <div role="alert" className="rounded-xl border border-risk/30 bg-risk/10 px-4 py-3 text-xs font-semibold leading-5 text-risk">
          {error}
        </div>
      ) : null}

      {goals === null ? (
        <Panel className="min-h-[420px] animate-pulse bg-surface-2/35"><span className="sr-only">{en ? "Loading" : "加载中"}</span></Panel>
      ) : (
        <Section icon={FlaskConical} number="01" title={copy.goals} detail={copy.goalsDetail}>
          {goals.length === 0 ? (
            <div className="grid place-items-center gap-2 rounded-xl border border-dashed border-hairline bg-surface-2/30 px-4 py-10 text-center">
              <Target className="h-5 w-5 text-fg-muted" />
              <p className="text-sm font-semibold text-fg-muted">{copy.empty}</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {goals.map((item) => (
                <GoalCard key={item.goal.id} item={item} copy={copy} />
              ))}
            </div>
          )}
        </Section>
      )}

      <Section icon={Target} number="02" title={copy.create} detail={copy.createDetail}>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={createGoal}>
          <Field label={copy.goalTitle} className="md:col-span-2">
            <input
              className="field-input"
              value={form.title}
              maxLength={200}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder={copy.goalPlaceholder}
              required
            />
          </Field>
          <Field label={copy.landing}>
            <input
              className="field-input"
              type="url"
              placeholder="https://"
              value={form.landingUrl}
              onChange={(event) => setForm((prev) => ({ ...prev, landingUrl: event.target.value }))}
              required
            />
          </Field>
          <Field label={copy.target} caption={copy.targetCaption}>
            <input
              className="field-input tabular-nums"
              type="number"
              min={1}
              max={10000}
              value={form.targetValue}
              onChange={(event) => setForm((prev) => ({ ...prev, targetValue: event.target.value }))}
              required
            />
          </Field>
          <Field label={copy.endAt} caption={copy.endAtCaption}>
            <input
              className="field-input tabular-nums"
              type="date"
              value={form.endAt}
              onChange={(event) => setForm((prev) => ({ ...prev, endAt: event.target.value }))}
              required
            />
          </Field>
          <div className="flex items-end md:col-span-2">
            <Button variant="primary" size="lg" type="submit" loading={creating}>
              {!creating ? <ArrowRight className="h-4 w-4" /> : null}
              {creating ? copy.creating : copy.submit}
            </Button>
          </div>
        </form>
      </Section>
    </div>
  );
}

function GoalCard({ item, copy }: { item: GoalListItem; copy: {
  active: string; paused: string; channel: string; open: string;
  metricTarget: string; metricRounds: string; metricLearnings: string; metricEnds: string;
  current: string; none: string;
} }) {
  const goal = item.goal;
  return (
    <Panel hover className="p-5">
      <Link href={`/operations/growth/${goal.id}`} className="grid gap-4 focus-ring rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-base font-black text-fg">{goal.title}</span>
            <Tag tone={goal.status === "active" ? "success" : "neutral"} dot>
              {goal.status === "active" ? copy.active : copy.paused}
            </Tag>
            <Tag tone="neutral">{copy.channel}</Tag>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-action">
            {copy.open}<ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
        <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-hairline sm:grid-cols-4">
          <Metric label={copy.metricTarget} value={String(Number(goal.target_value))} />
          <Metric label={copy.metricRounds} value={String(item.missionCount)} />
          <Metric label={copy.metricLearnings} value={String(item.acceptedLearnings)} />
          <Metric label={copy.metricEnds} value={goal.end_at.slice(0, 10)} />
        </div>
        {item.activeMission ? (
          <p className="text-xs font-semibold leading-5 text-fg-muted">
            <span className="text-fg">{copy.current}：</span>{item.activeMission.hypothesis}
          </p>
        ) : (
          <p className="text-xs font-medium text-fg-muted">{copy.none}</p>
        )}
      </Link>
    </Panel>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-r border-hairline p-3.5 last:border-r-0 sm:border-b-0 [&:nth-child(2)]:border-r-0 sm:[&:nth-child(2)]:border-r">
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-fg-muted">{label}</p>
      <p className="mt-1.5 text-lg font-black tabular-nums text-fg">{value}</p>
    </div>
  );
}

function Section({ icon: Icon, number, title, detail, children }: { icon: typeof Target; number: string; title: string; detail: string; children: React.ReactNode }) {
  return (
    <Panel className="p-5 md:p-6">
      <div className="mb-5 flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-hairline bg-surface-2 text-action"><Icon className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black tracking-[0.18em] text-fg-muted">{number}</p>
          <h2 className="mt-1 text-lg font-black text-fg">{title}</h2>
          <p className="mt-1 text-xs font-medium leading-5 text-fg-muted">{detail}</p>
        </div>
      </div>
      {children}
    </Panel>
  );
}

function Field({ label, caption, className, children }: { label: string; caption?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={className}>
      <span className="mb-2 flex items-center gap-2 text-xs font-bold text-fg">{label}</span>
      {children}
      {caption ? <span className="mt-1.5 block text-[11px] font-medium leading-4 text-fg-muted">{caption}</span> : null}
    </label>
  );
}
