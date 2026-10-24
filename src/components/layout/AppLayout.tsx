import { Outlet } from 'react-router'
import { MobileNav } from '@/components/layout/MobileNav'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'

export function AppLayout() {
  return (
    <div className="min-h-svh bg-muted/30">
      <Sidebar />
      <div className="lg:pl-60">
        <Topbar />
        <main className="mx-auto w-full max-w-6xl p-4 pb-24 lg:p-6 lg:pb-6">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
