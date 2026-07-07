import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { PwaRegister } from './pwa-register'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Glide - Queue-free retail',
    template: '%s - Glide',
  },
  description:
    'Scan, shop, pay, and go. Glide is the queue-free retail operating system built for busy counters.',
  manifest: '/manifest.webmanifest',
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#09090b',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  )
}
