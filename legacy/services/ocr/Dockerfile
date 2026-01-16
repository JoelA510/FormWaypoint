FROM python:3.9-slim

WORKDIR /app

# Install system dependencies required for OpenCV (used by EasyOCR)
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
# Install torch CPU version specifically to save space if GPU not needed/available in container
# But easyocr pulls torch anyway. Let's stick to simple install first.
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 5000

# Run the application
CMD ["python", "app.py"]
