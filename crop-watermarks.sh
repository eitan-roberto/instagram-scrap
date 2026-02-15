#!/bin/bash

# Crop bottom 5% from all generated images to remove Google watermarks
# Run this after generation is complete

echo "🖼️  Cropping images to remove watermarks..."
echo ""

# Find all generated.jpg files and crop them
find ./output/helena-cropped -name "generated.jpg" -type f | while read file; do
    dir=$(dirname "$file")
    filename=$(basename "$file")
    
    echo "Processing: $file"
    
    # Get image dimensions
    dimensions=$(identify -format "%w %h" "$file" 2>/dev/null)
    
    if [ -n "$dimensions" ]; then
        width=$(echo $dimensions | cut -d' ' -f1)
        height=$(echo $dimensions | cut -d' ' -f2)
        
        # Calculate new height (remove bottom 5%)
        new_height=$(echo "$height * 0.95" | bc | cut -d'.' -f1)
        
        # Crop image
        convert "$file" -crop "${width}x${new_height}+0+0" "${dir}/generated-cropped.jpg"
        
        echo "  ✅ Cropped: ${width}x${height} → ${width}x${new_height}"
    else
        echo "  ❌ Could not read image dimensions"
    fi
done

echo ""
echo "✅ Done! Cropped images saved as generated-cropped.jpg"
