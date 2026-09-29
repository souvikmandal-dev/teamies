import type { Metadata } from "next";
import "./globals.css";
import { FeedbackWidget } from "@/components/feedback-widget";
import { APP_NAME, APP_DESCRIPTION } from "@/lib/brand";

export const metadata: Metadata = {
  title: { default: `${APP_NAME} — Find people to build with`, template: `%s | ${APP_NAME}` },
  applicationName: APP_NAME,
  description: APP_DESCRIPTION,
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
      { url: "/brand/teamies-icon.png", type: "image/png", sizes: "1024x1024" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: { title: APP_NAME, siteName: APP_NAME, description: APP_DESCRIPTION, type: "website" },
  twitter: { card: "summary", title: APP_NAME, description: APP_DESCRIPTION },
  appleWebApp: { title: APP_NAME },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}<FeedbackWidget /></body>
    </html>
  );
}
