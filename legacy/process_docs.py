import os
import shutil
import re
import easyocr
from pypdf import PdfReader
# from pdf2image import convert_from_path

# Configuration
BASE_DIR = r"c:\Users\joel.abraham\Shipping Doc Gen\Shipping-Doc-Gen\training_docs"
OUTPUT_DIR = os.path.join(BASE_DIR, "grouped")
JDE_DIR = os.path.join(BASE_DIR, "JDE Output")
FORWARDER_A_DIR = os.path.join(BASE_DIR, "Forwarder A")
FORWARDER_B_DIR = os.path.join(BASE_DIR, "Forwarder B")

# Initialize OCR reader
reader = easyocr.Reader(['en'])

def extract_text_from_pdf(pdf_path):
    """Extracts text from a text-based PDF."""
    try:
        reader = PdfReader(pdf_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        return text
    except Exception as e:
        print(f"Error reading PDF {pdf_path}: {e}")
        return ""

def ocr_pdf(pdf_path):
    """Converts PDF to images and performs OCR."""
    try:
        # Note: pdf2image requires poppler installed. 
        # If poppler is missing, we might need a different approach or install it.
        # For now, assuming we can't easily install poppler, we might fail here.
        # Alternative: Use pypdf to extract images if they are embedded?
        # Or just try easyocr on the file directly if it supports it? (It doesn't support PDF directly)
        
        # Let's try a simpler approach for now: 
        # If we can't use pdf2image without poppler, we are stuck.
        # Let's assume we need to install poppler or use a python-only pdf-to-image converter.
        # 'pdf2image' is the standard but needs binary.
        # 'pymupdf' (fitz) is a good alternative that includes binaries.
        
        import fitz  # PyMuPDF
        doc = fitz.open(pdf_path)
        full_text = ""
        for page in doc:
            pix = page.get_pixmap()
            img_data = pix.tobytes("png")
            result = reader.readtext(img_data, detail=0)
            full_text += " ".join(result) + "\n"
        return full_text
    except ImportError:
        print("PyMuPDF (fitz) not installed. Please install 'pymupdf'.")
        return ""
    except Exception as e:
        print(f"Error OCRing {pdf_path}: {e}")
        return ""

def process_documents():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

    # 1. Process JDE Files to get IDs
    jde_files = [f for f in os.listdir(JDE_DIR) if f.endswith(".pdf")]
    jde_map = {} # ID -> Filename

    print(f"Processing {len(jde_files)} JDE files...")
    for f in jde_files:
        # Extract ID from filename: R5542305_REF0001_15801341_PDF.pdf -> 15801341
        match = re.search(r"_(\d+)_PDF", f)
        if match:
            shipment_id = match.group(1)
            jde_map[shipment_id] = f
            
            # Create group folder
            group_path = os.path.join(OUTPUT_DIR, shipment_id)
            if not os.path.exists(group_path):
                os.makedirs(group_path)
            
            # Copy JDE file
            src = os.path.join(JDE_DIR, f)
            dst = os.path.join(group_path, f"JDE_{shipment_id}.pdf")
            if not os.path.exists(dst):
                shutil.copy2(src, dst)

    print(f"Found {len(jde_map)} unique Shipment IDs.")

    # 2. Process Carrier Files (Forwarder A)
    # We'll walk through the directory
    print("Processing Forwarder A files (this may take a while)...")
    for root, dirs, files in os.walk(FORWARDER_A_DIR):
        for file in files:
            if file.lower().endswith(".pdf"):
                file_path = os.path.join(root, file)
                print(f"Scanning {file}...")
                
                # OCR the file
                text = ocr_pdf(file_path)
                
                # Search for any known ID
                matched = False
                for shipment_id in jde_map.keys():
                    if shipment_id in text:
                        print(f"  MATCH! {file} -> {shipment_id}")
                        
                        # Copy and rename
                        group_path = os.path.join(OUTPUT_DIR, shipment_id)
                        dst = os.path.join(group_path, f"NEU_{shipment_id}.pdf") # Or append if multiple?
                        
                        # Handle duplicates
                        if os.path.exists(dst):
                            base, ext = os.path.splitext(dst)
                            dst = f"{base}_2{ext}"
                            
                        shutil.copy2(file_path, dst)
                        matched = True
                        break # Stop searching IDs for this file
                
                if not matched:
                    print(f"  No match found for {file}")

if __name__ == "__main__":
    process_documents()
