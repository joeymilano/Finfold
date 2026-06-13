import { DashboardShell } from "@/components/app-shell/DashboardShell";
import { ToastContainer } from "@/components/ui/Toast";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell>
      <ToastContainer />
      {children}
    </DashboardShell>
  );
}
