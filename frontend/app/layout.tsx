import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { DemoBanner } from "@/components/DemoBanner";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { Providers } from "./providers";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo" });
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: { default: "Margarita · Agave Barrel", template: "%s · Margarita" },
  description:
    "Open a barrel on BNB Chain testnet. Chainlink VRF picks the tier, you age it up, and an Extra Añejo redeems a real bottle.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexSans.variable} ${plexMono.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col bg-paper text-ink">
        <Providers>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:bg-paper focus:p-3">
            Skip to content
          </a>
          <DemoBanner />
          <SiteHeader />
          <main id="main" className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-5 pb-20 pt-10 sm:px-10 sm:pt-14">
            {children}
          </main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
