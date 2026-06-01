import './globals.css'
import { Toaster } from 'sonner'

export const metadata = {
  title: 'Sheet2API AI — Turn Spreadsheets into Secure APIs',
  description: 'Convert any Google Sheet, Excel, or CSV into department-wise operational APIs, MCP servers for AI agents, and OpenAPI-spec connectors. No code required. Developed by Sthapana Technologies.',
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
