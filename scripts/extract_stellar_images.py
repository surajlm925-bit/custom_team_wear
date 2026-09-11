import os
import io
from pypdf import PdfReader
from PIL import Image

PDF_TARGETS = [
    {
        "name": "Softberry_Men",
        "pdf": r"quality\new\quality\Premium\collar\cotton\Stellars\Stellers Softberry Golf Polo Men Half Sleeve.pdf",
        "out_dir": r"quality\new\quality\Premium\collar\cotton\Stellars\extracted_images\Softberry_Men"
    },
    {
        "name": "Softberry_Women",
        "pdf": r"quality\new\quality\Premium\collar\cotton\Stellars\Stellers Softberry Golf Polo Women_s Half Sleeve_compressed.pdf",
        "out_dir": r"quality\new\quality\Premium\collar\cotton\Stellars\extracted_images\Softberry_Women"
    },
    {
        "name": "Nano_Dry",
        "pdf": r"quality\new\quality\Premium\collar\polyester\Stellers Nano-Dry.pdf",
        "out_dir": r"quality\new\quality\Premium\collar\polyester\extracted_images\Nano_Dry"
    }
]

def extract_pdf_images():
    total_saved = 0
    
    for target in PDF_TARGETS:
        pdf_path = target["pdf"]
        out_dir = target["out_dir"]
        name = target["name"]
        
        if not os.path.exists(pdf_path):
            print(f"Skipping {name}: PDF not found at {pdf_path}")
            continue
            
        os.makedirs(out_dir, exist_ok=True)
        print(f"\n==========================================")
        print(f"Extracting images from: {name}")
        print(f"Source: {pdf_path}")
        print(f"Output: {out_dir}")
        
        reader = PdfReader(pdf_path)
        saved_for_target = 0
        
        for p_idx, page in enumerate(reader.pages):
            for i_idx, img_file in enumerate(page.images):
                try:
                    img_data = img_file.data
                    img = Image.open(io.BytesIO(img_data))
                    
                    # Filter out tiny spacers/icons (e.g. < 60px)
                    if img.width < 60 or img.height < 60:
                        continue
                    
                    # Convert to RGB JPEG
                    if img.mode in ("RGBA", "P", "LA"):
                        bg = Image.new("RGB", img.size, (255, 255, 255))
                        if img.mode == "P":
                            img = img.convert("RGBA")
                        bg.paste(img, mask=img.split()[-1] if "A" in img.mode else None)
                        img = bg
                    elif img.mode != "RGB":
                        img = img.convert("RGB")
                    
                    filename = f"p{p_idx+1:02d}_{i_idx+1:02d}_{img.width}x{img.height}.jpg"
                    out_path = os.path.join(out_dir, filename)
                    img.save(out_path, "JPEG", quality=90)
                    saved_for_target += 1
                except Exception as e:
                    print(f"  Warning: could not process image {i_idx+1} on page {p_idx+1}: {e}")
                    
        print(f"Extracted and saved {saved_for_target} high-res photos for {name}")
        total_saved += saved_for_target

    print(f"\n==========================================")
    print(f"Extraction complete! Total photos saved: {total_saved}")

if __name__ == "__main__":
    extract_pdf_images()
