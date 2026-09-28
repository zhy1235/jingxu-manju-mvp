import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "镜序｜漫剧分镜粗剪工作台",
  description: "从定稿脚本和角色参考，快速生成可逐镜确认的漫剧粗剪。",
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
