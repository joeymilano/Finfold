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
 * These estimates mirror Cloudflare's public per-model unit prices. Workers
 * AI image responses do not include measured usage, so every supported model
 * must have an explicit conservative estimator here. Unknown models return
 * null and therefore fail closed before inference rather than risking an
 * unpriced request.
 */
export const FLUX_KLEIN_4B_MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
export const FLUX_KLEIN_9B_MODEL = "@cf/black-forest-labs/flux-2-klein-9b";

const KLEIN_4B_NEURONS_PER_OUTPUT_TILE = 26.05;
const KLEIN_4B_NEURONS_PER_INPUT_TILE = 5.37;
const KLEIN_9B_FIRST_MEGAPIXEL_NEURONS = 1363.64;
const KLEIN_9B_SUBSEQUENT_MEGAPIXEL_NEURONS = 181.82;
const KLEIN_9B_INPUT_IMAGE_MEGAPIXEL_NEURONS = 181.82;
/** Reference images sent to flux-2-klein-4b must be under 512x512 (see the
 * Cloudflare changelog for input_image_0..3), so each one is always exactly
 * one input tile. */
const KLEIN_4B_NEURONS_PER_REFERENCE_IMAGE = KLEIN_4B_NEURONS_PER_INPUT_TILE;

export function estimateImageNeurons(
  size: string,
  referenceImageCount = 0,
  model: string = FLUX_KLEIN_4B_MODEL
): number | null {
  const [widthStr, heightStr] = size.split("x");
  const width = Number(widthStr) || 1024;
  const height = Number(heightStr) || 1024;

  if (model === FLUX_KLEIN_4B_MODEL) {
    const outputTiles = Math.ceil(width / 512) * Math.ceil(height / 512);
    const outputNeurons = outputTiles * KLEIN_4B_NEURONS_PER_OUTPUT_TILE;
    const inputNeurons = referenceImageCount * KLEIN_4B_NEURONS_PER_REFERENCE_IMAGE;
    return Math.ceil(outputNeurons + inputNeurons);
  }

  if (model === FLUX_KLEIN_9B_MODEL) {
    const outputMegapixels = (width * height) / (1024 * 1024);
    // Cloudflare prices the first 1024x1024 MP as a fixed unit. Round any
    // additional fraction up to a full subsequent unit so the local cap is
    // conservative if larger output sizes are introduced later.
    const subsequentMegapixels = Math.ceil(Math.max(0, outputMegapixels - 1));
    const outputNeurons = KLEIN_9B_FIRST_MEGAPIXEL_NEURONS
      + subsequentMegapixels * KLEIN_9B_SUBSEQUENT_MEGAPIXEL_NEURONS;
    // Reference covers intentionally bypass Klein 9B today. Keep a safe
    // one-MP-per-reference estimate so future support cannot under-reserve.
    const inputNeurons = referenceImageCount * KLEIN_9B_INPUT_IMAGE_MEGAPIXEL_NEURONS;
    return Math.ceil(outputNeurons + inputNeurons);
  }

  return null;
}

export type NeuronReservation = { allowed: boolean };

/**
 * Atomically reserves `neurons` against today's (UTC) budget via the
 * consume_workers_ai_neurons RPC (see migration 072). Fails CLOSED: any
 * error (missing Supabase config, RPC failure, network issue) returns
 * `allowed: false` so a broken budget check continues to the next provider
 * rather than risking an unbounded, unbudgeted Cloudflare spend.
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
