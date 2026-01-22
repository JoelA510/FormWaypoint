import { createRoute } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
// import { client } from '../lib/api'
import { useState } from 'react'
import { Route as rootRoute } from './__root'

export const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: Index,
})

function Index() {
    const [file, setFile] = useState<File | null>(null)

    const mutation = useMutation({
        mutationFn: async (_fileToUpload: File) => {
            // Hono RPC call
            // TODO: Implement S3 Upload Flow (Get URL -> Upload -> Trigger)
            // const res = await client.ingest.$post({ ... })
            return {} as any;
        }
    })

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFile(e.target.files[0])
        }
    }

    const handleUpload = () => {
        if (file) {
            mutation.mutate(file)
        }
    }

    return (
        <div className="space-y-6">
            <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h2 className="text-lg font-semibold mb-4">Upload Shipment Document</h2>
                <div className="flex gap-4 items-center">
                    <input
                        type="file"
                        onChange={handleFileChange}
                        className="block w-full text-sm text-slate-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100"
                    />
                    <button
                        onClick={handleUpload}
                        disabled={!file || mutation.isPending}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                        {mutation.isPending ? 'Processing...' : 'Ingest'}
                    </button>
                </div>
                {mutation.isError && (
                    <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                        Error: {mutation.error.message}
                    </div>
                )}
            </section>

            {mutation.isSuccess && mutation.data && (
                <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold text-emerald-800">Extraction Successful</h3>
                        <span className="text-xs font-mono bg-emerald-100 text-emerald-800 px-2 py-1 rounded">
                            Confidence: {(mutation.data.confidence * 100).toFixed(0)}%
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Shipper */}
                        <div className="space-y-2">
                            <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Shipper</h4>
                            <div className="p-3 bg-slate-50 rounded border border-slate-100 text-sm">
                                <p className="font-medium text-slate-900">{mutation.data.shipment?.shipper?.name}</p>
                                <p className="text-slate-600">{mutation.data.shipment?.shipper?.addressLine1}</p>
                                <p className="text-slate-600">
                                    {mutation.data.shipment?.shipper?.city}, {mutation.data.shipment?.shipper?.countryCode}
                                </p>
                            </div>
                        </div>

                        {/* Consignee */}
                        <div className="space-y-2">
                            <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Consignee</h4>
                            <div className="p-3 bg-slate-50 rounded border border-slate-100 text-sm">
                                <p className="font-medium text-slate-900">{mutation.data.shipment?.consignee?.name}</p>
                                <p className="text-slate-600">{mutation.data.shipment?.consignee?.addressLine1}</p>
                                <p className="text-slate-600">
                                    {mutation.data.shipment?.consignee?.city}, {mutation.data.shipment?.consignee?.countryCode}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Raw JSON Inspect */}
                    <details className="mt-6">
                        <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">View Raw Data</summary>
                        <pre className="mt-2 p-4 bg-slate-900 text-slate-50 rounded-lg text-xs overflow-auto max-h-60">
                            {JSON.stringify(mutation.data.shipment, null, 2)}
                        </pre>
                    </details>
                </section>
            )}
        </div>
    )
}
