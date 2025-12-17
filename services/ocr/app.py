from flask import Flask, request, jsonify
from ocr_engine import extract_text_from_pdf_bytes
import os

app = Flask(__name__)

# Limit upload size (e.g., 16MB)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

@app.route('/extract', methods=['POST'])
def extract():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    if file:
        try:
            # Read file into memory
            pdf_bytes = file.read()
            
            # Perform OCR
            result = extract_text_from_pdf_bytes(pdf_bytes)
            
            return jsonify(result)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "service": "ocr-python"})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
