import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { UploadCloud, FileText, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import { api } from '../../services/api';

export default function UploadZone({ onDocumentUploaded }) {
    const [status, setStatus] = useState('idle'); // idle, uploading, processing, error
    const [error, setError] = useState(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleFile = async (file) => {
        setStatus('uploading');
        setError(null);

        try {
            const response = await api.uploadFile(file);

            if (response.jobs && response.jobs.length > 0) {
                setStatus('processing');
                // Poll the first job
                pollJob(response.jobs[0].id);
            } else {
                throw new Error('No job created');
            }
        } catch (err) {
            setStatus('error');
            setError(err.message);
        }
    };

    const pollJob = async (jobId) => {
        const interval = setInterval(async () => {
            try {
                const job = await api.getJob(jobId);
                if (job.status === 'completed') {
                    clearInterval(interval);
                    const doc = await api.getDocument(job.documentId);
                    onDocumentUploaded(doc);
                } else if (job.status === 'failed') {
                    clearInterval(interval);
                    setStatus('error');
                    setError(job.error || 'Processing failed');
                }
            } catch (err) {
                clearInterval(interval);
                setStatus('error');
                setError(err.message);
            }
        }, 1000);
    };

    const onDragOver = useCallback((e) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const onDragLeave = useCallback((e) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const onDrop = useCallback((e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="max-w-2xl mx-auto">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`
                    relative rounded-2xl border-2 border-dashed transition-all duration-300 p-12
                    flex flex-col items-center justify-center text-center bg-white
                    ${isDragging
                        ? 'border-primary-500 bg-primary-50/50 scale-[1.02] shadow-xl shadow-primary-500/10'
                        : 'border-slate-300 hover:border-primary-400 hover:bg-slate-50/50'
                    }
                    ${status === 'error' ? 'border-red-300 bg-red-50/50' : ''}
                `}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
            >
                {status === 'idle' && (
                    <>
                        <div className={`p-4 rounded-full bg-primary-50 mb-6 ${isDragging ? 'bg-primary-100' : ''}`}>
                            <UploadCloud className={`w-12 h-12 text-primary-600 ${isDragging ? 'scale-110 duration-200' : ''}`} />
                        </div>
                        <h3 className="text-xl font-semibold text-slate-900 mb-2">
                            {isDragging ? 'Drop file to upload' : 'Drag & drop your document'}
                        </h3>
                        <p className="text-slate-500 mb-8 max-w-sm">
                            Supports PDF, Excel (XLSX), CSV, and Word (DOCX).
                            We&apos;ll automatically extract the data for you.
                        </p>

                        <div className="relative">
                            <input
                                type="file"
                                className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
                                onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
                                id="file-upload"
                                accept=".pdf,.xlsx,.csv,.docx"
                                aria-label="Upload document"
                            />
                            <label
                                htmlFor="file-upload"
                                className="btn-primary cursor-pointer inline-flex items-center gap-2"
                            >
                                <FileText className="w-4 h-4" />
                                Browse Files
                            </label>
                        </div>
                    </>
                )}

                {(status === 'uploading' || status === 'processing') && (
                    <div className="py-8">
                        <div className="relative mb-6">
                            <div className="w-16 h-16 border-4 border-slate-100 border-t-primary-600 rounded-full animate-spin mx-auto"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Loader2 className="w-6 h-6 text-primary-600 animate-pulse" />
                            </div>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-1">
                            {status === 'uploading' ? 'Uploading Document...' : 'Processing Content...'}
                        </h3>
                        <p className="text-slate-500">This may take a few seconds</p>
                    </div>
                )}

                {status === 'error' && (
                    <div className="py-4">
                        <div className="p-3 rounded-full bg-red-100 mb-4 w-fit mx-auto">
                            <AlertCircle className="w-8 h-8 text-red-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-red-900 mb-2">Upload Failed</h3>
                        <p className="text-red-600 mb-6 max-w-sm mx-auto">{error}</p>
                        <button
                            onClick={() => setStatus('idle')}
                            className="btn-secondary border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300"
                        >
                            Try Again
                        </button>
                    </div>
                )}
            </motion.div>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center text-sm text-slate-500">
                <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center text-green-600">
                        <CheckCircle className="w-4 h-4" />
                    </div>
                    <span>Secure Processing</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                        <FileText className="w-4 h-4" />
                    </div>
                    <span>Smart Extraction</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
                        <UploadCloud className="w-4 h-4" />
                    </div>
                    <span>Instant Export</span>
                </div>
            </div>
        </div>
    );
}
