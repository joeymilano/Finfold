/**
 * 真实的生成用时预估（替换 OutputBoard 里写死的固定公式）。
 *
 * 数据来源：每次生成成功后，把"平台数 → 实际耗时"记进 localStorage。
 * 预估时取最近若干次的单平台耗时中位数 × 本次平台数；样本不足时回落到
 * 基于 queue 批次（2 平台/批）校准的保守默认值。这样显示的"预计用时"
 * 会随着该用户实际使用越来越准，而不是一个永远不变的固定数字。
 *
 * 只在浏览器端读写 localStorage；SSR / 不可用存储时静默回落到默认值，
 * 不抛错、不阻断渲染。
 */

const STORAGE_KEY = "finfold-generation-durations-v1";
const MAX_SAMPLES = 12;

type DurationSample = {
  platformCount: number;
  durationSec: number;
  at: number;
};

function isBrowserStorageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readSamples(): DurationSample[] {
  if (!isBrowserStorageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is DurationSample =>
        item != null &&
        Number.isFinite(item.platformCount) &&
        Number.isFinite(item.durationSec) &&
        Number.isFinite(item.at)
    );
  } catch {
    return [];
  }
}

function writeSamples(samples: DurationSample[]): void {
  if (!isBrowserStorageAvailable()) return;
  try {
    // 只保留最近 MAX_SAMPLES 条，避免无限增长。
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(samples.slice(-MAX_SAMPLES))
    );
  } catch {
    // 存储被禁用 / 配额不足：静默放弃，预估退回默认值即可。
  }
}

/**
 * 生成成功后调用：记录本次真实耗时，供后续预估校准。
 * platformCount 为本次实际生成的平台数；durationMs 为端到端墙钟耗时。
 */
export function recordGenerationDuration(
  platformCount: number,
  durationMs: number
): void {
  if (!Number.isFinite(platformCount) || platformCount <= 0) return;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return;
  const samples = readSamples();
  samples.push({
    platformCount,
    durationSec: Math.round(durationMs / 1000),
    at: Date.now()
  });
  writeSamples(samples);
}

// 校准的保守默认值（仅在尚无任何观测样本时使用）。
// 后端走 durable queue，每批 2 个平台、每批约 18–25s（Qwen/DeepSeek flash），
// queue 并发 3。按批次估算：ceil(N/2) × 22s，再兜一个 30s 下限。
const FALLBACK_MIN_SECONDS = 30;
const FALLBACK_SECONDS_PER_BATCH = 22;

function fallbackEstimate(platformCount: number): number {
  const batches = Math.max(1, Math.ceil(platformCount / 2));
  return Math.max(FALLBACK_MIN_SECONDS, batches * FALLBACK_SECONDS_PER_BATCH);
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * 基于历史真实耗时预估本次生成用时（秒）。
 * 取最近 6 次的单平台耗时（durationSec / platformCount）中位数作为基准，
 * 再按本次平台数线性放大。样本 < 3 次时与默认值取平均，避免初期抖动。
 */
export function estimatedGenerationSeconds(platformCount?: number): number {
  const n = Math.max(1, Math.round(platformCount ?? 0) || 4);

  const samples = readSamples();
  if (samples.length === 0) {
    return fallbackEstimate(n);
  }

  const recent = samples.slice(-6);
  const perPlatformRates = recent
    .map((sample) => sample.durationSec / Math.max(1, sample.platformCount))
    .filter((rate) => Number.isFinite(rate) && rate > 0);

  if (perPlatformRates.length === 0) {
    return fallbackEstimate(n);
  }

  const medianRate = median(perPlatformRates);
  const fallbackPerPlatform = fallbackEstimate(n) / n;
  // 样本少时与校准默认值混合，样本充足后完全信任真实数据。
  const blended =
    perPlatformRates.length >= 3
      ? medianRate
      : (medianRate + fallbackPerPlatform) / 2;

  return Math.max(FALLBACK_MIN_SECONDS, Math.round(n * blended));
}
