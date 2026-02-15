
#!/usr/bin/env python3
"""
Gemini Identity Swap (Image-Based Only)
Relies on Gemini 3 Pro / 2.5 Flash's native "Character Consistency" capabilities.
"""

import os
import csv
import base64
import requests
from pathlib import Path
import time
import random

# ==========================================
# CONFIGURATION
# ==========================================
API_KEY = "AIzaSyAxQ7X3xweJdEG1lgzQDEFVWz07ZMSwZR0"

# USE THE NEWEST MODEL for best "Character Consistency"
# Options: "gemini-3-pro-image-preview" (Best Quality) or "gemini-2.5-flash-image" (Faster)
MODEL_VERSION = "gemini-3-pro-image-preview" 

API_ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL_VERSION}:generateContent"
MODEL_IMAGE_PATH = "face.png"
CSV_FILE = "mayalanez_.csv"
OUTPUT_BASE_DIR = "generated_images"

# ==========================================
# PROMPTING LOGIC
# ==========================================

def create_role_based_prompt():
    return "Recreate the first image but with the model of the second image, keeping the outfit and body shape from the first image but with the skin type and tone of the second image."

# ==========================================
# CORE FUNCTIONS
# ==========================================

def image_to_base64(image_path_or_bytes):
    if isinstance(image_path_or_bytes, str):
        with open(image_path_or_bytes, 'rb') as f:
            return base64.b64encode(f.read()).decode('utf-8')
    else:
        return base64.b64encode(image_path_or_bytes).decode('utf-8')

def download_image(url):
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        return response.content
    except Exception as e:
        print(f"Error downloading {url}: {e}")
        return None

def call_gemini_api(identity_b64, structure_b64):
    headers = {
        "x-goog-api-key": API_KEY,
        "Content-Type": "application/json"
    }

    # The order here MATTERS because the prompt refers to "FIRST" and "SECOND" image
    payload = {
        "contents": [{
            "parts": [
                {"text": create_role_based_prompt()},
                {"inline_data": {"mime_type": "image/jpeg", "data": structure_b64}}, # FIRST IMAGE (outfit/structure)
                {"inline_data": {"mime_type": "image/jpeg", "data": identity_b64}}   # SECOND IMAGE (skin/identity)
            ]
        }],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "imageConfig": {"aspectRatio": "9:16"}
        }
    }

    try:
        response = requests.post(API_ENDPOINT, headers=headers, json=payload, timeout=120)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"API call failed: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response: {e.response.text}")
        return None

def extract_and_save_images(api_response, output_dir, base_filename):
    if not api_response: return 0
    saved_count = 0
    try:
        candidates = api_response.get('candidates', [])
        for i, candidate in enumerate(candidates):
            parts = candidate.get('content', {}).get('parts', [])
            for j, part in enumerate(parts):
                if 'inlineData' in part:
                    img_data = base64.b64decode(part['inlineData']['data'])
                    filename = f"{base_filename}_c{i}_p{j}.jpg"
                    with open(output_dir / filename, 'wb') as f:
                        f.write(img_data)
                    print(f"  Saved: {filename}")
                    saved_count += 1
    except Exception as e:
        print(f"Error saving: {e}")
    return saved_count

def has_image_extension(url):
    """Check if a URL contains a common image extension."""
    if not url:
        return False
    image_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg']
    url_lower = url.lower()
    return any(ext in url_lower for ext in image_extensions)

def detect_image_columns(rows):
    """Detect which columns contain image URLs by checking for image extensions."""
    if not rows:
        return []

    # Get all column names
    all_columns = list(rows[0].keys())
    image_columns = []

    # Check each column to see if it contains image URLs
    for col in all_columns:
        # Sample first few rows to see if this column has image URLs
        sample_values = [row.get(col, '').strip() for row in rows[:min(5, len(rows))]]
        if any(has_image_extension(val) for val in sample_values if val):
            image_columns.append(col)
            print(f"✓ Detected image column: {col}")

    return image_columns

def main():
    if not API_KEY or API_KEY == "xxx":
        print("❌ Error: API_KEY is missing.")
        return

    print(f"🚀 Starting Identity Swap using {MODEL_VERSION}")
    print("   Mode: Pure Image-Based (No text description)")

    # Load Identity Image (The "Who")
    if not os.path.exists(MODEL_IMAGE_PATH):
        print(f"❌ Model image not found: {MODEL_IMAGE_PATH}")
        return
    identity_b64 = image_to_base64(MODEL_IMAGE_PATH)

    # Process CSV
    with open(CSV_FILE, 'r', encoding='utf-8-sig') as f:
        rows = list(csv.DictReader(f))

    if not rows:
        print("❌ No rows found in CSV.")
        return

    # Automatically detect image columns
    print("\n🔍 Detecting image columns...")
    image_columns = detect_image_columns(rows)

    if not image_columns:
        print("❌ No image columns detected in CSV.")
        return

    print(f"📊 Found {len(image_columns)} image column(s): {', '.join(image_columns)}\n")

    # Filter for valid rows (rows that have at least one image URL)
    valid_rows = []
    for row in rows:
        if any(row.get(col, '').strip() for col in image_columns):
            valid_rows.append(row)

    if not valid_rows:
        print("❌ No valid rows with image URLs found.")
        return

    # Shuffle rows to process in random order without repetition
    random.shuffle(valid_rows)
    print(f"🎲 Processing {len(valid_rows)} rows in random order")

    # Process all rows
    for row in valid_rows:
        row_idx = rows.index(row) + 1
        print(f"\n{'='*50}")
        print(f"Processing Row {row_idx}")
        print(f"{'='*50}")

        output_dir = Path(OUTPUT_BASE_DIR) / f"row_{row_idx}"
        output_dir.mkdir(parents=True, exist_ok=True)

        # Process all detected image columns
        for col_name in image_columns:
            if url := row.get(col_name, '').strip():
                print(f"🔄 Processing {col_name}...")
                if img_bytes := download_image(url):
                    structure_b64 = image_to_base64(img_bytes)
                    response = call_gemini_api(identity_b64, structure_b64)
                    # Sanitize column name for filename
                    safe_col_name = col_name.replace('/', '_').replace('\\', '_')
                    extract_and_save_images(response, output_dir, safe_col_name)
                    time.sleep(2)

if __name__ == "__main__":
    main()