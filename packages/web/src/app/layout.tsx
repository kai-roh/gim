import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GIM — Geometry Information Modeling",
  description: "AI-driven architectural design through architect forum, graph generation, and 3D visualization",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
