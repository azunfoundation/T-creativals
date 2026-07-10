import AppShell from '@/components/layout/AppShell';
import { RouteGuard } from '@/components/auth/RouteGuard';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <RouteGuard>
      <AppShell>{children}</AppShell>
    </RouteGuard>
  );
}
