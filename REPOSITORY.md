# Instagram Fashion Repository & Mixer

New architecture for mixing fashion outfits with scenes to generate unique posts.

## Architecture

```
repository/
├── outfits/                    # One JSON per post - outfit details from img1
│   ├── linda.sza/
│   │   ├── ABC123.json
│   │   └── DEF456.json
│   ├── lara_bsmnn/
│   └── ...
│
├── scenes/                     # One folder per post, JSON per image
│   ├── linda.sza/
│   │   ├── ABC123/
│   │   │   ├── img1.json      # location + lighting + pose
│   │   │   ├── img2.json
│   │   │   └── img3.json
│   │   └── DEF456/
│   └── ...
│
└── generated-posts/            # Mixed creations
    ├── new-post-001/
    │   ├── img1/
    │   ├── img2/
    │   └── manifest.json      # which outfit + scene were mixed
    └── ...
```

## Data Structure

### Outfit JSON
```json
{
  "handle": "linda.sza",
  "shortcode": "ABC123",
  "outfit": {
    "top": { "type": "blouse", "color": "cream", "material": "silk" },
    "bottom": { "type": "trousers", "color": "beige" },
    "accessories": ["gold necklace"],
    "overall_style": "elegant casual"
  }
}
```

### Scene JSON
```json
{
  "handle": "linda.sza",
  "shortcode": "ABC123",
  "image_index": 1,
  "scene": {
    "location": { "type": "outdoor", "setting": "city street" },
    "lighting": { "type": "natural", "time_of_day": "golden hour" },
    "pose": { "body_position": "standing", "orientation": "side" }
  }
}
```

## Workflow

### 1. Build Repository
```bash
node build-repository.js
```
Scrapes all profiles and extracts:
- Outfits (from first image of each post)
- Scenes (all images - location/lighting/pose)

### 2. Generate Mixed Posts
```bash
# Generate 5 new posts
node mix-and-generate.js --count=5
```

Mixes random outfits with random scenes:
1. Pick random outfit JSON
2. Pick random scene folder
3. Generate img1: Outfit + Scene + Identity
4. Generate img2/img3: Scene + img1 style ref + Identity

## Generation Logic

**img1:**
- Uses: Outfit description + Scene description + Identity reference
- Creates: Base style for the post

**img2/img3:**
- Uses: Scene description + img1 as STYLE reference + Identity reference  
- Creates: Consistent look within the post

## Profiles

- @linda.sza
- @lara_bsmnn
- @sina.anjulie
- @whatgigiwears
- @sofiamcoelho
