#!/usr/bin/env python3
"""
Standalone MCQ scanner. Reads mcq_template.json for geometry.
Usage:
  python3 mcq_opencv.py --image PATH --total 20 [--json]
Outputs JSON to stdout: {"1":"A","2":"B",...,"confidence":{"1":142}}
"""
import argparse, json, sys, os
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
TPL_PATH = os.path.join(HERE, '..', 'config', 'mcq_template.json')
with open(TPL_PATH) as f:
    TPL = json.load(f)

PAPER_W = TPL['paper']['width_pt']
PAPER_H = TPL['paper']['height_pt']
WARP_W  = TPL['warp']['width_px']
WARP_H  = TPL['warp']['height_px']
SCALE   = WARP_W / PAPER_W

# Grid in warped space — prefer grid_px, fall back to grid_pt * SCALE
if 'grid_px' in TPL:
    GP = TPL['grid_px']
    LEFT_X  = int(GP['left_column_x'])
    RIGHT_X = int(GP['right_column_x'])
    SPACING = int(GP['bubble_spacing'])
    FIRST_Y = int(GP['first_row_y'])
    ROW_H   = int(GP['row_height'])
else:
    GRID = TPL['grid']
    LEFT_X  = int(GRID['left_column_x_pt']  * SCALE)
    RIGHT_X = int(GRID['right_column_x_pt'] * SCALE)
    SPACING = int(GRID['bubble_spacing_pt'] * SCALE)
    FIRST_Y = int(GRID['first_row_y_pt']    * SCALE)
    ROW_H   = int(GRID['row_height_pt']     * SCALE)

DET = TPL['detect']
HSV_LO  = tuple(DET['hsv_lower'])
HSV_HI  = tuple(DET['hsv_upper'])
MIN_PX  = DET['min_blue_pixels']
ROI_R   = DET['roi_radius_px']


def find_anchors(img):
    """Return 4 corner points in TL, TR, BR, BL order, or None."""
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # Black squares → look for dark blobs
    _, thresh = cv2.threshold(gray, 80, 255, cv2.THRESH_BINARY_INV)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    candidates = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < 100 or area > 8000:
            continue
        x, y, cw, ch = cv2.boundingRect(c)
        aspect = cw / max(ch, 1)
        if 0.6 < aspect < 1.6 and 0.5 < (area / (cw * ch + 1)) < 1.0:
            M = cv2.moments(c)
            if M['m00'] == 0: continue
            cx, cy = M['m10']/M['m00'], M['m01']/M['m00']
            candidates.append((cx, cy, area))

    if len(candidates) < 4:
        return None

    # Pick the 4 nearest to image corners
    corners = [(0,0), (w,0), (w,h), (0,h)]
    chosen = []
    for corner in corners:
        best = min(candidates, key=lambda p: (p[0]-corner[0])**2 + (p[1]-corner[1])**2)
        chosen.append(best[:2])
        candidates.remove(best)

    return np.array(chosen, dtype='float32')


def order_points(pts):
    rect = np.zeros((4,2), dtype='float32')
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]  # TL
    rect[2] = pts[np.argmax(s)]  # BR
    d = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(d)]  # TR
    rect[3] = pts[np.argmax(d)]  # BL
    return rect


def warp(img):
    anchors = find_anchors(img)
    if anchors is None:
        # fall back to full page
        h, w = img.shape[:2]
        rect = np.array([[0,0],[w,0],[w,h],[0,h]], dtype='float32')
    else:
        rect = order_points(anchors)
    dst = np.array([[0,0],[WARP_W,0],[WARP_W,WARP_H],[0,WARP_H]], dtype='float32')
    M = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(img, M, (WARP_W, WARP_H))


def detect(warped, total_q=20):
    hsv = cv2.cvtColor(warped, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, HSV_LO, HSV_HI)

    results = {}
    conf = {}
    for q in range(1, total_q + 1):
        if q <= 10:
            col_x = LEFT_X
            row_i = q - 1
        else:
            col_x = RIGHT_X
            row_i = q - 11
        y = FIRST_Y + row_i * ROW_H

        best_opt, best_px = None, -1
        for opt_i, letter in enumerate('ABCD'):
            cx = col_x + opt_i * SPACING
            roi = mask[y-ROI_R:y+ROI_R, cx-ROI_R:cx+ROI_R]
            n = int(cv2.countNonZero(roi))
            if n > best_px:
                best_px, best_opt = n, letter
        if best_px < MIN_PX:
            results[str(q)] = 'X'
            conf[str(q)] = best_px
        else:
            results[str(q)] = best_opt
            conf[str(q)] = best_px
    return results, conf




def draw_debug_grid(warped):
    """Draw assumed grid positions on a copy so we can see misalignment."""
    vis = warped.copy()
    for q in range(1, 21):
        if q <= 10:
            col_x = LEFT_X
            row_i = q - 1
        else:
            col_x = RIGHT_X
            row_i = q - 11
        y = FIRST_Y + row_i * ROW_H
        for opt_i, letter in enumerate('ABCD'):
            cx = col_x + opt_i * SPACING
            cv2.circle(vis, (cx, y), ROI_R, (0, 0, 255), 1)   # red circle
        cv2.putText(vis, str(q), (col_x - 40, y + 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)
    return vis

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--image', required=True)
    ap.add_argument('--total', type=int, default=20)
    ap.add_argument('--json', action='store_true', help='emit JSON only')
    ap.add_argument('--debug', metavar='DIR', help='save warped+mask for inspection')
    args = ap.parse_args()

    img = cv2.imread(args.image)
    if img is None:
        print(json.dumps({'error': 'cannot load image'}))
        sys.exit(1)

    warped = warp(img)
    answers, conf = detect(warped, args.total)

    if args.debug:
        os.makedirs(args.debug, exist_ok=True)
        cv2.imwrite(os.path.join(args.debug, 'warped.jpg'), warped)
        hsv = cv2.cvtColor(warped, cv2.COLOR_BGR2HSV)
        mask = cv2.inRange(hsv, HSV_LO, HSV_HI)
        cv2.imwrite(os.path.join(args.debug, 'mask.jpg'), mask)
        cv2.imwrite(os.path.join(args.debug, 'grid-overlay.jpg'), draw_debug_grid(warped))

    print(json.dumps({'answers': answers, 'confidence': conf}))


if __name__ == '__main__':
    main()
