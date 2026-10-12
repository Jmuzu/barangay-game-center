import { Geist, Geist_Mono } from "next/font/google";
import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@code/state";
import { AppShell } from "@code/components";
import { getGameCenterSession } from "@code/auth/parentSession";
import { redirect } from "next/navigation";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Brgy Game Center | Barangay Platform",
  description: "Play, connect, and manage your barangay game account.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getGameCenterSession();
  if (!session) {
    const parentUrl = process.env.BARANGAY_PLATFORM_URL || "http://localhost:3000";
    redirect(new URL("/login?next=game-center", parentUrl).toString());
  }
  const parentDashboardPath = session.user.role === "super_admin"
    ? "/superadmin"
    : session.user.role === "admin"
      ? "/admin"
      : "/dashboard";
  const parentDashboardUrl = new URL(
    parentDashboardPath,
    process.env.BARANGAY_PLATFORM_URL || "http://localhost:3000",
  ).toString();

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <StoreProvider>
          <AppShell returnUrl={parentDashboardUrl}>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  );
}
