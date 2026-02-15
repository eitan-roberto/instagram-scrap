#!/bin/bash

# Crop all generated images to 4:5 from top + 1% from sides
# This removes watermarks and creates perfect Instagram 4:5 ratio

echo "🖼️  Cropping images to 4:5 from top + 1% sides..."
echo ""

SIDE_CROP=2

find ./output/helena-cropped -name "generated.jpg" -type f | while read file; do
    dir=$(dirname "$file")
    
    echo "Processing: $file"
    
    dimensions=$(identify -format "%w %h" "$file" 2>/dev/null)
    
    if [ -n "$dimensions" ]; then
        width=$(echo $dimensions | cut -d' ' -f1)
        height=$(echo $dimensions | cut -d' ' -f2)
        
        # Calculate 4:5 height
        new_height=$(echo "$width * 5 / 4" | bc)
        
        # Calculate side crop (1% from each side)
        side_pixels=$(echo "$width * $SIDE_CROP / 100" | bc)
        new_width=$(echo "$width - ($side_pixels * 2)" | bc)
        
        # Crop from top + crop sides
        convert "$file" -crop "${new_width}x${new_height}+${side_pixels}+0" "${dir}/generated-cropped.jpg"
        
        echo "  ✅ Cropped: ${width}x${height} → ${new_width}x${new_height} (4:5 + ${SIDE_CROP}% sides)"
    else
        echo "  ❌ Could not read image dimensions"
    fi
done

echo ""
echo "✅ Done! All images cropped and ready for Instagram"
