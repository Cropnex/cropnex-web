import AppShell from "@/components/layout/AppShell";

export default function OfflineSyncLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
