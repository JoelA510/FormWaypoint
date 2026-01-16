import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { client } from '../utils/client'

// Ideally we import the Shipment type from @repo/schema or inferred from API
// import type { Shipment } from '@repo/schema'

export const Route = createFileRoute('/shipments')({
    component: ShipmentReviewPage,
})

function ShipmentReviewPage() {
    const { data, isLoading, error } = useQuery({
        queryKey: ['shipments', 'search'],
        queryFn: async () => {
            // Example RPC call to classification search (mocking shipment search for now)
            const res = await client.classification.search.$get({
                query: { q: 'demo', limit: '10' }
            })
            if (!res.ok) throw new Error('Failed to fetch')
            return await res.json()
        },
    })

    if (isLoading) return <div className="p-4">Loading shipments...</div>
    if (error) return <div className="p-4 text-red-500">Error loading shipments</div>

    return (
        <div className="container mx-auto p-6">
            <h1 className="text-2xl font-bold mb-6">Shipment Review</h1>

            <div className="grid gap-4">
                {data?.results.map((item: any) => ( // 'any' until strict types propagate
                    <div key={item.id} className="p-4 border rounded shadow-sm bg-white">
                        <h3 className="font-semibold">{item.code}</h3>
                        <p className="text-gray-600">{item.description}</p>
                        <div className="mt-2 text-sm text-blue-600">
                            Score: {item.score}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
