import { Navbar } from '@/components/Navbar'

export function UsersPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Users</h1>
      </main>
    </div>
  )
}
