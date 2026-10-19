import AppShell from "@/components/layout/AppShell";

export default function AssistantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
