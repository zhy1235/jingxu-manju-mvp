import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "镜序｜单镜动态短片工作台",
  description: "浏览器内智能抠图、动态运镜、字幕合成与视频导出。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
