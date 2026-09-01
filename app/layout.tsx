import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") || incoming.get("host") || "localhost:3000";
  const protocol = incoming.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "缠镜 Chan Lab｜A 股缠论结构分析台";
  const description = "输入股票代码，自动识别分型、笔、线段、中枢、背驰与三类买卖点候选。";
  return {
    title,
    description,
    metadataBase: new URL(origin),
    icons: { icon: "/favicon.png", shortcut: "/favicon.png" },
    openGraph: {
      type: "website",
      title,
      description,
      images: [{ url: `${origin}/og.png`, width: 1733, height: 907, alt: "缠镜 Chan Lab 市场结构分析台" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [`${origin}/og.png`] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
