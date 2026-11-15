import type { Metadata } from "next";
import { Poppins, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { GlassmorphismProvider } from "@/components/glassmorphism-provider";
import { SidebarPinProvider } from "@/components/sidebar-pin-provider";
import { TourProvider } from "@/components/tour/tour-provider";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SimpleNS Admin Dashboard",
  description: "Admin dashboard for the SimpleNS notification service",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Load runtime configuration before React hydration */}
        <Script src="/runtime-config.js" strategy="beforeInteractive" />
      </head>
      <body
        className={`${poppins.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SidebarPinProvider>
            <GlassmorphismProvider>
              <TourProvider>
                {children}
              </TourProvider>
              <Toaster richColors position="top-right" />
            </GlassmorphismProvider>
          </SidebarPinProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
