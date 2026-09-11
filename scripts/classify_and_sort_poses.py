import os
import glob
import cv2
import numpy as np

face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

def classify_photo(img_path):
    img = cv2.imread(img_path)
    if img is None:
        return "invalid", 0
    
    h, w, _ = img.shape
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    small = cv2.resize(gray, (600, int(600 * h / w)))
    faces = face_cascade.detectMultiScale(small, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30))
    has_face = len(faces) > 0

    # Upper chest skin region (y: 22% to 35%, x: 40% to 60%)
    crop_chest = img[int(h*0.22):int(h*0.35), int(w*0.40):int(w*0.60)]
    hsv_chest = cv2.cvtColor(crop_chest, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv_chest, np.array([0, 20, 70]), np.array([25, 255, 255]))
    skin_pct = float((mask > 0).mean() * 100)

    # Center garment area
    center_val = float(img[int(h*0.4):int(h*0.6), int(w*0.4):int(w*0.6)].mean())
    
    # Top corners (background check)
    tl = float(img[0:int(h*0.1), 0:int(w*0.2)].mean())
    tr = float(img[0:int(h*0.1), int(w*0.8):w].mean())
    is_white_bg = (tl > 220 and tr > 220)

    # Head area (y: 5% to 20%, x: 40% to 60%)
    head_val = float(img[int(h*0.05):int(h*0.20), int(w*0.40):int(w*0.60)].mean())
    has_head = head_val < 220

    # Tag check: white center tag or closeup
    if center_val > 215 and not has_face:
        return "tag", 0

    # Full length check: pants/legs in center
    if center_val > 140 and has_face and skin_pct < 15.0:
        return "full_length", 0

    # Front view: has face and skin on neck/chest
    if has_face and skin_pct > 15.0:
        return "front", skin_pct

    # Back view: no face, waist up with head/hair, no chest skin
    if not has_face and is_white_bg and has_head and skin_pct < 8.0:
        return "back", center_val

    # Side profile or detail
    if has_face:
        return "side", skin_pct
    
    return "detail", 0

def get_color_folders(root):
    color_dirs = []
    for dirpath, dirnames, filenames in os.walk(root):
        if "extracted_images" in dirpath or "_archive" in dirpath:
            continue
        imgs = [f for f in filenames if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
        if imgs and not any(d for d in dirnames if d != "_archive"):
            color_dirs.append((dirpath, sorted(imgs)))
    return color_dirs

def plan_sorting(dry_run=True):
    root = r"quality\new\quality"
    color_dirs = get_color_folders(root)
    print(f"Found {len(color_dirs)} color folders.")

    stats = {"ok": 0, "partial": 0, "fallback": 0}

    for dirpath, files in color_dirs:
        # Ignore already renamed folders
        if set(files).issubset({"front_1.jpg", "front_2.jpg", "back.jpg", "front_1.png", "front_2.png", "back.png"}):
            continue

        classifications = []
        for f in files:
            img_path = os.path.join(dirpath, f)
            role, score = classify_photo(img_path)
            classifications.append((f, role, score))

        fronts = [f for f, r, _ in classifications if r == "front"]
        backs = [f for f, r, _ in classifications if r == "back"]
        sides = [f for f, r, _ in classifications if r == "side"]

        # Selection logic
        front_1 = None
        front_2 = None
        back = None

        if len(fronts) >= 2:
            front_1, front_2 = fronts[0], fronts[1]
        elif len(fronts) == 1:
            front_1 = fronts[0]
            front_2 = sides[0] if sides else (files[1] if len(files) > 1 and files[1] != front_1 else None)
        else:
            # Fallback to first two files
            front_1 = files[0]
            front_2 = files[1] if len(files) > 1 else None

        if backs:
            back = backs[0]
        else:
            # Look for non-front files that might be back
            candidates = [f for f in files if f not in (front_1, front_2)]
            back = candidates[-2] if len(candidates) >= 2 else (candidates[0] if candidates else None)

        if front_1 and front_2 and back:
            stats["ok"] += 1
        else:
            stats["partial"] += 1

        if not dry_run:
            # Perform the move and rename
            archive_dir = os.path.join(dirpath, "_archive")
            os.makedirs(archive_dir, exist_ok=True)

            to_rename = {
                front_1: "front_1.jpg",
                back: "back.jpg"
            }
            if front_2:
                to_rename[front_2] = "front_2.jpg"

            for f in files:
                src_path = os.path.join(dirpath, f)
                if f in to_rename:
                    dest_path = os.path.join(dirpath, to_rename[f])
                    # Avoid collision if already same name
                    if src_path != dest_path:
                        os.rename(src_path, dest_path)
                else:
                    # Move to _archive
                    dest_path = os.path.join(archive_dir, f)
                    os.rename(src_path, dest_path)

    print(f"\nCompleted! Perfect 3-photo selections: {stats['ok']}, Partial/Special: {stats['partial']}")

if __name__ == "__main__":
    plan_sorting(dry_run=False)
