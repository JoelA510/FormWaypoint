import { useState } from 'react';
import { Shield, FileText, CheckCircle, AlertTriangle, Copy, ExternalLink, Loader } from 'lucide-react';

export default function AESFilingWizard({ shipment, onClose, onFiled }) {
    const [step, setStep] = useState('review'); // review, file, success
    const [filingMethod, setFilingMethod] = useState('carrier'); // carrier, direct
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [generatedXml, setGeneratedXml] = useState('');

    const [eeiData, setEeiData] = useState({
        usppi: {
            name: shipment?.shipper?.name || '',
            address: shipment?.shipper?.address || '',
            ein: ''
        },
        consignee: {
            name: shipment?.consignee?.name || '',
            country: shipment?.consignee?.country || ''
        },
        commodity: [
            { description: 'General Cargo', scheduleB: '', value: shipment?.header?.totalValue || '' }
        ],
        portOfExport: ''
    });

    const handleFileWithCarrier = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/compliance/file/carrier', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    provider: 'fedex', // Defaulting to FedEx for now
                    shipmentId: shipment.id,
                    eeiData
                })
            });
            const data = await res.json();

            if (res.ok) {
                setResult(data);
                setStep('success');
                if (onFiled) onFiled(data.itn);
            } else {
                alert(`Filing failed: ${data.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Filing error:', error);
            alert('Filing failed');
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateForDirect = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/compliance/generate/aes-direct', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ eeiData })
            });
            const data = await res.json();
            setGeneratedXml(data.content);
            setStep('direct_instruction');
        } catch (error) {
            console.error('Generation error:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full mx-auto overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-emerald-600" />
                    AES / EEI Filing
                </h2>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                    &times;
                </button>
            </div>

            <div className="p-6">
                {step === 'review' && (
                    <div className="space-y-6">
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex gap-3">
                            <AlertTriangle className="w-5 h-5 text-blue-600 shrink-0" />
                            <p className="text-sm text-blue-800">
                                International shipments valued over $2,500 require an Internal Transaction Number (ITN) from AES.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="label">USPPI EIN (Tax ID)</label>
                                <input
                                    value={eeiData.usppi.ein}
                                    onChange={e => setEeiData({ ...eeiData, usppi: { ...eeiData.usppi, ein: e.target.value } })}
                                    className="input-field"
                                    placeholder="XX-XXXXXXX"
                                />
                            </div>
                            <div>
                                <label className="label">Port of Export</label>
                                <input
                                    value={eeiData.portOfExport}
                                    onChange={e => setEeiData({ ...eeiData, portOfExport: e.target.value })}
                                    className="input-field"
                                    placeholder="e.g. 2704 (LAX)"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="label mb-2 block">Filing Method</label>
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => setFilingMethod('carrier')}
                                    className={`p-4 rounded-lg border-2 text-left transition-all ${filingMethod === 'carrier'
                                        ? 'border-purple-600 bg-purple-50'
                                        : 'border-slate-200 hover:border-slate-300'
                                        }`}
                                >
                                    <div className="font-bold text-slate-900 mb-1">Carrier Integrated</div>
                                    <p className="text-xs text-slate-500">File directly through FedEx/UPS API. Instant ITN.</p>
                                </button>
                                <button
                                    onClick={() => setFilingMethod('direct')}
                                    className={`p-4 rounded-lg border-2 text-left transition-all ${filingMethod === 'direct'
                                        ? 'border-purple-600 bg-purple-50'
                                        : 'border-slate-200 hover:border-slate-300'
                                        }`}
                                >
                                    <div className="font-bold text-slate-900 mb-1">CBP AES Direct</div>
                                    <p className="text-xs text-slate-500">Generate data for manual entry in ACE portal.</p>
                                </button>
                            </div>
                        </div>

                        <div className="flex justify-end pt-4">
                            <button
                                onClick={filingMethod === 'carrier' ? handleFileWithCarrier : handleGenerateForDirect}
                                disabled={loading || !eeiData.usppi.ein}
                                className="btn-primary flex items-center gap-2"
                            >
                                {loading ? <Loader className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                                {filingMethod === 'carrier' ? 'File Now' : 'Generate Data'}
                            </button>
                        </div>
                    </div>
                )}

                {step === 'success' && (
                    <div className="text-center py-8">
                        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle className="w-8 h-8 text-emerald-600" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-2">Filing Accepted!</h3>
                        <div className="bg-slate-100 p-4 rounded-lg inline-block mb-6">
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Internal Transaction Number</p>
                            <p className="text-2xl font-mono font-bold text-slate-900">{result?.itn}</p>
                        </div>
                        <div className="flex justify-center">
                            <button onClick={onClose} className="btn-primary">Done</button>
                        </div>
                    </div>
                )}

                {step === 'direct_instruction' && (
                    <div className="space-y-4">
                        <div className="bg-amber-50 p-4 rounded-lg border border-amber-100">
                            <h4 className="font-bold text-amber-800 mb-2 flex items-center gap-2">
                                <ExternalLink className="w-4 h-4" />
                                Instructions
                            </h4>
                            <ol className="list-decimal list-inside text-sm text-amber-800 space-y-1">
                                <li>Log in to the <a href="https://ace.cbp.dhs.gov/" target="_blank" rel="noopener noreferrer" className="underline font-medium">ACE Portal</a>.</li>
                                <li>Navigate to AES Direct.</li>
                                <li>Create a new shipment.</li>
                                <li>Copy the data below or upload if supported.</li>
                            </ol>
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="label">Generated Data (XML)</label>
                                <button
                                    onClick={() => navigator.clipboard.writeText(generatedXml)}
                                    className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1"
                                >
                                    <Copy className="w-3 h-3" /> Copy
                                </button>
                            </div>
                            <pre className="bg-slate-900 text-slate-50 p-4 rounded-lg overflow-x-auto text-xs font-mono h-48">
                                {generatedXml}
                            </pre>
                        </div>

                        <div className="flex justify-end pt-4">
                            <button onClick={onClose} className="btn-secondary">Close</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
