import React, { useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';

const SignaturePad = ({ onSave }) => {
    const sigCanvas = useRef({});

    const clear = () => sigCanvas.current.clear();

    const save = () => {
        // Get Base64
        const dataUrl = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png');
        onSave(dataUrl);
    };

    return (
        <div className="flex flex-col items-center">
            <div className="border border-gray-300 rounded mb-2">
                <SignatureCanvas
                    ref={sigCanvas}
                    penColor="black"
                    canvasProps={{ width: 300, height: 200, className: 'sigCanvas' }}
                />
            </div>
            <div className="flex gap-2">
                <button onClick={clear} className="px-3 py-1 text-sm bg-gray-200 rounded">Clear</button>
                <button onClick={save} className="px-3 py-1 text-sm bg-blue-600 text-white rounded">Save Signature</button>
            </div>
        </div>
    );
};

export default SignaturePad;
