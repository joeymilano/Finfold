import { NextResponse } from "next/server";
import { verifyInternalWorkerRequest } from "@/lib/internal-worker-auth";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { dispatchWechatPublicationJobs } from "@/lib/wechat-publication-jobs";

export async function POST(request: Request) {
  if (!(await verifyInternalWorkerRequest(request))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "WeChat publication persistence is unavailable." }, { status: 503 });
  try {
    const result = await dispatchWechatPublicationJobs(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[wechat-publication] dispatch failed:", error);
    return NextResponse.json({ error: "WeChat publication dispatch failed." }, { status: 503 });
  }
}
