import './globals.css';

export const metadata = {
  title: 'Telegram Shop Admin',
  description: 'Admin dashboard for Telegram digital product shop',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
