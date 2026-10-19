import AppShell from "@/components/layout/AppShell";

export default function AlertsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
