import easyocr
import fitz  # PyMuPDF
import numpy as np

# Initialize OCR reader once (it loads the model into memory)
# 'en' for English. Add other languages if needed.
reader = easyocr.Reader(['en'])

def extract_text_from_pdf_bytes(pdf_bytes):
    """
    Converts PDF bytes to images and performs OCR using EasyOCR.
    Returns the combined text from all pages.
    """
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        full_text = ""
        pages_text = []

        for page_num, page in enumerate(doc):
            # Render page to image (pixmap)
            pix = page.get_pixmap()
            
            # Convert to bytes (PNG)
            img_bytes = pix.tobytes("png")
            
            # EasyOCR expects bytes or file path or numpy array
            # We can pass bytes directly
            result = reader.readtext(img_bytes, detail=0)
            
            page_text = " ".join(result)
            full_text += page_text + "\n"
            pages_text.append({
                "page": page_num + 1,
                "text": page_text
            })

        return {
            "text": full_text,
            "pages": pages_text,
            "page_count": len(doc)
        }

    except Exception as e:
        print(f"Error during OCR: {e}")
        raise e
