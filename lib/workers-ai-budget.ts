import { createSupabaseAdminClient } from "@/lib/supabase";

/**
 * Cloudflare Workers AI's free daily allocation, shared across text and
 * image models, resetting at 00:00 UTC. On a paid Workers plan (required
 * for Queues, which this project uses) exceeding it is silently billed at
 * $0.011/1k Neurons rather than rejected — this module is what turns that
 * into an actual stop.
 */
const FREE_NEURONS_PER_DAY = 10_000;

/** Leaves headroom below the raw Cloudflare allocation so a slightly
 * stale estimate never tips the account into billed overage. */
function dailyNeuronBudget(): number {
  const configured = Number(process.env.WORKERS_AI_DAILY_NEURON_BUDGET);
  return Number.isFinite(configured) && configured > 0 ? configured : FREE_NEURONS_PER_DAY - 1_000;
}

/**
 * flux-2-klein-4b pricing is per 512x512 tile: $0.000287/output tile
 * (~26.05 Neurons/tile) and $0.000059/input tile (~5.36 Neurons/tile) at
 * the $0.011/1k Neurons rate. This is a static estimate, not a measured
 * cost — Workers AI's REST response for image models carries no
 * usage/neuron field to read back.
 */
const NEURONS_PER_OUTPUT_TILE = 26.05;
const NEURONS_PER_INPUT_TILE = 5.36;
/** Reference images sent to flux-2-klein-4b must be under 512x512 (see the
 * Cloudflare changelog for input_image_0..3), so each one is always exactly
 * one input tile. */
const NEURONS_PER_REFERENCE_IMAGE = NEURONS_PER_INPUT_TILE;

export function estimateImageNeurons(size: string, referenceImageCount = 0): number {
  const [widthStr, heightStr] = size.split("x");
  const width = Number(widthStr) || 1024;
  const height = Number(heightStr) || 1024;
  const outputTiles = Math.ceil(width / 512) * Math.ceil(height / 512);
  const outputNeurons = outputTiles * NEURONS_PER_OUTPUT_TILE;
  const inputNeurons = referenceImageCount * NEURONS_PER_REFERENCE_IMAGE;
  return Math.ceil(outputNeurons + inputNeurons);
}

export type NeuronReservation = { allowed: boolean };

/**
 * Atomically reserves `neurons` against today's (UTC) budget via the
 * consume_workers_ai_neurons RPC (see migration 072). Fails CLOSED: any
 * error (missing Supabase config, RPC failure, network issue) returns
 * `allowed: false` so a broken budget check degrades to "use the Agnes
 * fallback" rather than risking an unbounded, unbudgeted spend.
 */
export async function reserveNeurons(neurons: number): Promise<NeuronReservation> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { allowed: false };

  try {
    const { data, error } = await admin
      .rpc("consume_workers_ai_neurons", {
        p_neurons: neurons,
        p_budget: dailyNeuronBudget()
      })
      .single();
    if (error || !data) return { allowed: false };
    return { allowed: (data as { allowed: boolean }).allowed === true };
  } catch {
    return { allowed: false };
  }
}

/**
 * Returns previously reserved neurons to today's budget after a request
 * that reserved them failed to actually produce an image. Best-effort: a
 * failure here just means today's budget is slightly under-credited, never
 * a reason to fail the caller's already-failed request harder.
 */
export async function releaseNeurons(neurons: number): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (!admin) return;

  try {
    await admin.rpc("release_workers_ai_neurons", { p_neurons: neurons });
  } catch (error) {
    console.warn("[workers-ai-budget] failed to release neurons:", error instanceof Error ? error.message : error);
  }
}
