import { Outlet, createRootRoute } from '@tanstack/react-router'


export const Route = createRootRoute({
    component: () => (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4">
            <div className="max-w-7xl mx-auto">
                <header className="mb-8 border-b border-slate-200 pb-4">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                        FormWaypoint
                    </h1>
                </header>
                <main>
                    <Outlet />
                </main>
            </div>
        </div>
    ),
})
