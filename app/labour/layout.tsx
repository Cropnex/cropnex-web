import AppShell from "@/components/layout/AppShell";

export default function ModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
