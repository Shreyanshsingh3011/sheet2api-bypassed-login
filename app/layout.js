import './globals.css'
import { Toaster } from 'sonner'

export const metadata = {
  title: 'SheetFlow AI — Turn Google Sheets into Secure APIs',
  description: 'Convert any Google Sheet into department-wise operational APIs, webhooks, and connectors. No code required.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <head>
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);'}} />
      </head>
      <body className="bg-background text-foreground antialiased">
        {children}
        <Toaster position="top-right" theme="dark" richColors />
      </body>
    </html>
  )
}
