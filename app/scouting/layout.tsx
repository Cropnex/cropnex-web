import AppShell from "@/components/layout/AppShell";

export default function ScoutingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
