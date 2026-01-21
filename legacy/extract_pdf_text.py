import os
from pypdf import PdfReader

def extract_text(file_path):
    try:
        reader = PdfReader(file_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        return text
    except Exception as e:
        return f"Error reading {file_path}: {e}"

def analyze_files(directory, keywords=None):
    results = {}
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.lower().endswith(".pdf"):
                path = os.path.join(root, file)
                print(f"Processing {file}...")
                content = extract_text(path)
                results[file] = content
                
                # Simple keyword search
                if keywords:
                    for kw in keywords:
                        if kw in content:
                            print(f"  FOUND MATCH: {kw} in {file}")

    return results

if __name__ == "__main__":
    # Test with a few JDE files and forwarder files
    base_dir = r"c:\Users\joel.abraham\Shipping Doc Gen\Shipping-Doc-Gen\training_docs"
    
    # 1. Extract text from a JDE file to find potential IDs
    jde_file = os.path.join(base_dir, "JDE Output", "R5542305_REF0001_15801341_PDF.pdf")
    print(f"--- Extracting from JDE File: {jde_file} ---")
    jde_text = extract_text(jde_file)
    print(jde_text[:1000]) # Print first 1000 chars
    
    # 2. Extract text from a forwarder file
    forwarder_file = os.path.join(base_dir, "Forwarder", "Scans", "FWD-51042563.pdf")
    print(f"\n--- Extracting from Forwarder File: {forwarder_file} ---")
    forwarder_text = extract_text(forwarder_file)
    print(forwarder_text[:1000])

    # 3. Search for JDE ID in forwarder file
    if "15801341" in forwarder_text:
        print("\nMATCH FOUND: 15801341 found in forwarder file!")
    else:
        print("\nNo direct match found in this forwarder file.")
