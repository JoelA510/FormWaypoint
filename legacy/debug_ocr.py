import easyocr
import fitz # PyMuPDF

reader = easyocr.Reader(['en'])

def ocr_pdf(pdf_path):
    try:
        doc = fitz.open(pdf_path)
        full_text = ""
        for page in doc:
            pix = page.get_pixmap()
            img_data = pix.tobytes("png")
            result = reader.readtext(img_data, detail=0)
            full_text += " ".join(result) + "\n"
        return full_text
    except Exception as e:
        return f"Error: {e}"

if __name__ == "__main__":
    path = r"c:\Users\joel.abraham\Shipping Doc Gen\Shipping-Doc-Gen\training_docs\Forwarder A\Scans\NEU-51042563.pdf"
    print(f"OCRing {path}...")
    text = ocr_pdf(path)
    print("--- OCR OUTPUT ---")
    print(text)
    print("------------------")
