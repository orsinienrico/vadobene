import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "vado bene? — Lo specchio che non mente",
  description:
    "Manda la foto, dì per cosa. Un primo parere in cinque secondi; poi cinque persone vere ti rispondono in tre minuti, alla cieca.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0E2A36",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>
        <div id="bgFill" />
        {children}
      </body>
    </html>
  );
}
