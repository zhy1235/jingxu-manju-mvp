import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "镜序｜单镜动态短片工作台",
  description: "本地智能抠图与视频合成，或使用自己的 API Key 调用即梦、可灵和其他视频模型。",
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

