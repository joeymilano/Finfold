export const OPS_COST_CALCULATION_VERSION = "ops-cost-v1";
export const WEEKS_PER_MONTH = 4.33;

export type OpsCostCurrency = "CNY" | "USD";

export type OpsCostInputs = {
  postsPerWeek: number;
  platformsPerPost: number;
  minutesPerPlatform: number;
  hourlyCost: number;
  agencyMonthlyCost: number;
  delegationRate: number;
};

export type OpsCostResult = {
  monthlyPlatformTasks: number;
  monthlyHours: number;
  monthlyLaborCost: number;
  currentMonthlyCost: number;
  delegatedLaborCost: number;
  estimatedMonthlyHoursSaved: number;
  replacedMonthlyCost: number;
  finfoldMonthlyPrice: number;
  estimatedMonthlySavings: number;
};

export const OPS_COST_LIMITS = {
  postsPerWeek: { min: 1, max: 50, integer: true },
  platformsPerPost: { min: 1, max: 14, integer: true },
  minutesPerPlatform: { min: 5, max: 240, integer: false },
  hourlyCost: { min: 1, max: 10_000, integer: false },
  agencyMonthlyCost: { min: 0, max: 100_000, integer: false },
  delegationRate: { min: 25, max: 100, integer: true }
} as const;

export function isValidOpsCostInput(
  key: keyof OpsCostInputs,
  value: number
): boolean {
  const limit = OPS_COST_LIMITS[key];
  return Number.isFinite(value)
    && value >= limit.min
    && value <= limit.max
    && (!limit.integer || Number.isInteger(value));
}

export function calculateCurrentOpsCost(inputs: OpsCostInputs, finfoldMonthlyPrice: number): OpsCostResult {
  for (const key of Object.keys(inputs) as Array<keyof OpsCostInputs>) {
    if (!isValidOpsCostInput(key, inputs[key])) {
      throw new RangeError(`Invalid operations-cost input: ${key}`);
    }
  }

  const monthlyPlatformTasks = inputs.postsPerWeek * inputs.platformsPerPost * WEEKS_PER_MONTH;
  const monthlyHours = monthlyPlatformTasks * inputs.minutesPerPlatform / 60;
  const monthlyLaborCost = monthlyHours * inputs.hourlyCost;
  const currentMonthlyCost = monthlyLaborCost + inputs.agencyMonthlyCost;
  const delegatedLaborCost = monthlyLaborCost * inputs.delegationRate / 100;
  const replacedMonthlyCost = delegatedLaborCost + inputs.agencyMonthlyCost;

  return {
    monthlyPlatformTasks,
    monthlyHours,
    monthlyLaborCost,
    currentMonthlyCost,
    delegatedLaborCost,
    estimatedMonthlyHoursSaved: monthlyHours * inputs.delegationRate / 100,
    replacedMonthlyCost,
    finfoldMonthlyPrice,
    estimatedMonthlySavings: Math.max(0, replacedMonthlyCost - finfoldMonthlyPrice)
  };
}

function bucket(value: number, thresholds: Array<[number, string]>, overflow: string): string {
  return thresholds.find(([upperBound]) => value <= upperBound)?.[1] ?? overflow;
}

export function getOpsCostAnalyticsBuckets(
  inputs: OpsCostInputs,
  result: OpsCostResult
): Record<string, string> {
  return {
    posts_per_week_bucket: bucket(inputs.postsPerWeek, [[1, "1"], [3, "2-3"], [7, "4-7"]], "8+"),
    platform_count_bucket: bucket(inputs.platformsPerPost, [[1, "1"], [3, "2-3"], [6, "4-6"]], "7+"),
    minutes_per_platform_bucket: bucket(inputs.minutesPerPlatform, [[15, "<=15"], [30, "16-30"], [60, "31-60"]], "61+"),
    monthly_hours_bucket: bucket(result.monthlyHours, [[9.99, "<10"], [24.99, "10-24.9"], [49.99, "25-49.9"]], "50+")
  };
}
