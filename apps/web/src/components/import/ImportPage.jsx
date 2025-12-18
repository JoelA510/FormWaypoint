import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileSpreadsheet, CheckCircle, AlertOctagon, FileText, ScanLine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { API_URL } from '../../services/api';

export default function ImportPage() {
    const navigate = useNavigate();
    const [status, setStatus] = useState('idle'); // idle, uploading, success, error
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const [importMethod, setImportMethod] = useState('csv'); // 'csv' or 'ocr'

    const handleFile = async (file) => {
        setStatus('uploading');
        setError(null);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const token = localStorage.getItem('token');
            const endpoint = importMethod === 'csv' ? `${API_URL}/import/csv` : `${API_URL}/import/ocr`;

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Import failed');
            }

            setResult(data);
            setStatus('success');

        } catch (err) {
            console.error(err);
            setStatus('error');
            setError(err.message);
        }
    };

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Import Data</h1>
            <p className="text-slate-600 mb-8">
                Create shipments by importing external files.
            </p>

            {/* Method Toggle */}
            <div className="flex gap-4 mb-8">
                <button
                    onClick={() => setImportMethod('csv')}
                    className={`flex-1 p-4 rounded-xl border-2 flex items-center gap-3 transition-all ${importMethod === 'csv'
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-slate-200 hover:border-slate-300 text-slate-600'
                        }`}
                >
                    <div className={`p-2 rounded-lg ${importMethod === 'csv' ? 'bg-primary-100' : 'bg-slate-100'}`}>
                        <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                        <div className="font-semibold">CSV Data Import</div>
                        <div className="text-sm opacity-80">Map rows directly to shipments</div>
                    </div>
                </button>

                <button
                    onClick={() => setImportMethod('ocr')}
                    className={`flex-1 p-4 rounded-xl border-2 flex items-center gap-3 transition-all ${importMethod === 'ocr'
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-slate-200 hover:border-slate-300 text-slate-600'
                        }`}
                >
                    <div className={`p-2 rounded-lg ${importMethod === 'ocr' ? 'bg-primary-100' : 'bg-slate-100'}`}>
                        <ScanLine className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                        <div className="font-semibold">Smart Document Import (OCR)</div>
                        <div className="text-sm opacity-80">Extract data from PDF/Images</div>
                    </div>
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
                {status === 'success' ? (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-center py-8"
                    >
                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle className="w-8 h-8" />
                        </div>
                        <h2 className="text-xl font-semibold text-slate-900 mb-2">Import Successful!</h2>
                        <p className="text-slate-600 mb-6">
                            Created Shipment ID: <span className="font-mono bg-slate-100 px-2 py-1 rounded">{result?.shipmentId}</span> with {result?.totalLines} lines.
                        </p>
                        <div className="flex gap-4 justify-center">
                            <button
                                onClick={() => setStatus('idle')}
                                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium"
                            >
                                Import Another
                            </button>
                            <button
                                onClick={() => navigate(`/shipments/${result?.shipmentId}`)} // Redirect to review
                                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
                            >
                                Review Shipment
                            </button>
                        </div>
                    </motion.div>
                ) : (
                    <div className="max-w-xl mx-auto">
                        <div className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center hover:bg-slate-50 transition-colors relative">
                            <input
                                type="file"
                                accept={importMethod === 'csv' ? ".csv" : ".pdf,.png,.jpg,.jpeg,.xlsx,.docx"}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
                                disabled={status === 'uploading'}
                            />

                            {status === 'uploading' ? (
                                <div className="space-y-4">
                                    <div className="w-12 h-12 border-4 border-slate-200 border-t-primary-600 rounded-full animate-spin mx-auto" />
                                    <p className="text-primary-600 font-medium">Processing {importMethod === 'csv' ? 'CSV' : 'Document'}...</p>
                                </div>
                            ) : (
                                <>
                                    <div className="w-12 h-12 bg-primary-50 text-primary-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                        {importMethod === 'csv' ? <FileSpreadsheet className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
                                    </div>
                                    <h3 className="font-medium text-slate-900 mb-1">
                                        Click to upload {importMethod === 'csv' ? 'CSV' : 'PDF or Document'}
                                    </h3>
                                    <p className="text-sm text-slate-500">or drag and drop file here</p>
                                </>
                            )}
                        </div>

                        {status === 'error' && (
                            <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-lg flex items-start gap-3 text-red-700">
                                <AlertOctagon className="w-5 h-5 shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="font-medium">Import Failed</h4>
                                    <p className="text-sm mt-1 opacity-90">{error}</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
