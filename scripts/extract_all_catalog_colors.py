import os
import glob
import cv2
import numpy as np
import json

def extract_fabric_color(img_path):
    img = cv2.imread(img_path)
    if img is None:
        return None
    
    h, w, _ = img.shape
    # Crop central torso area (avoid face, collar buttons, and background edges)
    # y: 40% to 65%, x: 35% to 65%
    crop = img[int(h * 0.40):int(h * 0.65), int(w * 0.35):int(w * 0.65)]
    if crop.size == 0:
        return None
    
    # Convert BGR to RGB
    crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    
    # Filter out near-white background pixels (R > 235, G > 235, B > 235)
    pixels = crop_rgb.reshape(-1, 3)
    is_not_bg = ~((pixels[:, 0] > 235) & (pixels[:, 1] > 235) & (pixels[:, 2] > 235))
    valid_pixels = pixels[is_not_bg]
    
    if len(valid_pixels) < 100:
        return None
    
    # Return median RGB
    median_color = np.median(valid_pixels, axis=0).astype(int)
    return median_color

def scan_all_catalog_colors():
    root = r"..\aa\new\quality"
    color_samples = {}
    
    for dirpath, dirnames, filenames in os.walk(root):
        if "extracted_images" in dirpath or "_archive" in dirpath:
            continue
        imgs = [f for f in filenames if f.lower().endswith(('.jpg', '.png')) and not f.startswith("_")]
        if not imgs or any(d for d in dirnames if d != "_archive"):
            continue
        
        color_name = os.path.basename(dirpath).strip()
        if not color_name:
            continue
            
        # Pick front photo
        front_img = next((f for f in imgs if "front_1" in f.lower()), None)
        if not front_img:
            front_img = next((f for f in imgs if "front" in f.lower()), imgs[0])
            
        full_path = os.path.join(dirpath, front_img)
        rgb = extract_fabric_color(full_path)
        if rgb is not None:
            if color_name not in color_samples:
                color_samples[color_name] = []
            color_samples[color_name].append(rgb)

    print(f"Total distinct color categories sampled: {len(color_samples)}")
    
    final_hex_map = {}
    for color_name, rgbs in sorted(color_samples.items()):
        # Average across all occurrences of this color in catalog
        avg_rgb = np.mean(rgbs, axis=0).astype(int)
        r, g, b = int(avg_rgb[0]), int(avg_rgb[1]), int(avg_rgb[2])
        hex_code = f"#{r:02X}{g:02X}{b:02X}"
        final_hex_map[color_name] = {
            "hex": hex_code,
            "rgb": [r, g, b],
            "samples": len(rgbs)
        }
        print(f"'{color_name}': '{hex_code[1:]}', // sampled across {len(rgbs)} items (RGB: {r}, {g}, {b})")

    out_json = os.path.join("scripts", "vision_extracted_colors.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(final_hex_map, f, indent=2)
    print(f"\nSaved results to {out_json}")

if __name__ == "__main__":
    scan_all_catalog_colors()
