from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import uuid

app = FastAPI(title="FormWaypoint AI Service", version="1.0.0")

class HtsPredictionRequest(BaseModel):
    description: str
    image_url: Optional[str] = None

class HtsPredictionResult(BaseModel):
    hts_code: str
    confidence: float
    reasoning: str

class OcrResult(BaseModel):
    text: str
    confidence: float
    fields: dict

@app.get("/")
def read_root():
    return {"status": "ok", "service": "FormWaypoint AI (Atlas/Tesseract)"}

@app.post("/predict-hts", response_model=List[HtsPredictionResult])
async def predict_hts(request: HtsPredictionRequest):
    """
    Mimics ATLAS model interface.
    Accepts product description + optional image URL.
    Returns list of probable HTS codes with reasoning.
    """
    # TODO: Integrate actual ATLAS model or calls to LLM (Gemini 2.0 Flash)
    
    # Mock logic based on keywords
    description_lower = request.description.lower()
    results = []
    
    if "chair" in description_lower:
        results.append(HtsPredictionResult(
            hts_code="9401.30",
            confidence=0.95,
            reasoning="Swivel seat with variable height adjustment"
        ))
    elif "computer" in description_lower:
        results.append(HtsPredictionResult(
            hts_code="8471.30",
            confidence=0.92,
            reasoning="Portable automatic data processing machines, weighing not more than 10 kg"
        ))
    else:
        results.append(HtsPredictionResult(
            hts_code="0000.00",
            confidence=0.10,
            reasoning="Unable to classify with high confidence. Please provide more details."
        ))
        
    return results

@app.post("/ocr-document", response_model=OcrResult)
async def ocr_document(file: UploadFile = File(...)):
    """
    Wraps Tesseract/LayoutLM.
    Accepts a file upload (PDF/Image).
    Returns extracted text and structured fields.
    """
    # TODO: Implement actual Tesseract / LayoutLMv3 inference
    # content = await file.read()
    # image = Image.open(io.BytesIO(content))
    
    return OcrResult(
        text="Mock extracted text from document...",
        confidence=0.88,
        fields={
            "shipper": "Mock Shipper Inc.",
            "consignee": "Mock Consignee LLC",
            "invoice_number": f"INV-{uuid.uuid4().hex[:8].upper()}"
        }
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
