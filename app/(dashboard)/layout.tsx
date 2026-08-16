import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/app-shell/DashboardShell";
import { ToastContainer } from "@/components/ui/Toast";
import { WorkbenchProvider } from "@/components/workbench/WorkbenchProvider";
import { isLocalMockMode } from "@/lib/runtime-mode";
import { createSupabaseServerClient } from "@/lib/supabase";
import { buildAuthHref } from "@/lib/auth-return";


export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false, noimageindex: true }
  }
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // /workbench is the product's real anonymous trial. Every other route in
  // this group remains private and fails closed without a valid session.
  // ALLOW_MOCK remains an explicit local-development escape hatch only.
  if (!isLocalMockMode()) {
    const requestHeaders = await headers();
    const pathname = requestHeaders.get("x-finfold-pathname") ?? "";
    const requestTarget = requestHeaders.get("x-finfold-request-target") ?? pathname;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user }
    } = supabase
      ? await supabase.auth.getUser()
      : { data: { user: null } };

    if (!user && pathname !== "/workbench") {
      redirect(buildAuthHref("/login", requestTarget));
    }
  }

  return (
    <DashboardShell>
      {/* 工作台状态与生成逻辑提升到此层：dashboard 内切路由时组件不卸载，
          正在进行的生成、画板内容与输入草稿都保留。children 作为 prop 传入，
          provider 重渲染不会扩散到其他页面。 */}
      <WorkbenchProvider>
        <ToastContainer />
        {children}
      </WorkbenchProvider>
    </DashboardShell>
  );
}
