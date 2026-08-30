import type { Metadata, Viewport } from "next";
import { Fraunces, Inter_Tight } from "next/font/google";
import "./globals.css";
import { getRole } from "@/lib/role.server";
import { RoleProvider } from "@/components/role/RoleProvider";
import { RolePicker } from "@/components/role/RolePicker";
import { TabBar } from "@/components/nav/TabBar";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: "variable",
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT"],
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: "variable",
});

export const metadata: Metadata = {
  title: "Giggly Gadget",
  description: "What's for dinner?",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Giggly Gadget",
  },
};

export const viewport: Viewport = {
  themeColor: "#f7efdc",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const role = await getRole();
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${interTight.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[var(--color-paper)] text-[var(--color-body)] selection:bg-[var(--color-clay)]/30">
        <RoleProvider role={role}>
          {/* bottom padding clears the tab bar + home indicator */}
          <div className="pb-[calc(4.25rem+env(safe-area-inset-bottom))]">{children}</div>
          <TabBar />
          <RolePicker />
        </RoleProvider>
      </body>
    </html>
  );
}
