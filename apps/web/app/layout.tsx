import "./globals.css";
import Sidebar from "../components/Sidebar";

export const metadata = { title: "ALKAHTANI OS" };
export const viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex flex-col md:flex-row min-h-screen">
        <Sidebar />
        <div className="flex-1 min-w-0">{children}</div>
      </body>
    </html>
  );
}
