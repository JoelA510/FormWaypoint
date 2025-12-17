
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import UploadZone from '../upload/UploadZone';
import ShipmentList from './ShipmentList';
import FeatureGuard from '../common/FeatureGuard';
// Note: We might need to export keys from context or a constants file. 
// For now using string literals or importing from context if available.

export default function Dashboard() {
    const navigate = useNavigate();

    return (
        <div className="space-y-12">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <div className="mb-8 text-center max-w-2xl mx-auto">
                    <h2 className="text-3xl font-bold text-slate-900 mb-2">Upload Shipping Documents</h2>
                    <p className="text-slate-500 text-lg">
                        Drag and drop your files (PDF, CSV, Excel) to automatically extract data and create a new shipment.
                    </p>
                </div>

                <UploadZone onDocumentUploaded={(doc) => {
                    navigate(`/documents/${doc.id}`);
                }} />
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
            >
                <ShipmentList />
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="flex justify-end"
            >
                <FeatureGuard featureKey="ERP_EXPORT">
                    <button
                        onClick={() => navigate('/erp')}
                        className="text-slate-500 hover:text-slate-700 underline text-sm"
                    >
                        Go to ERP Dashboard
                    </button>
                </FeatureGuard>
            </motion.div>
        </div>
    );
}
