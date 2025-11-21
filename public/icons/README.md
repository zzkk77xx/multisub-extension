# Icons

This folder should contain the extension icons in the following sizes:

- `icon16.png` - 16x16 pixels
- `icon48.png` - 48x48 pixels
- `icon128.png` - 128x128 pixels

You can create these icons using any image editor or icon generator.

## Quick Generation

You can use online tools like:
- https://icon.kitchen/
- https://www.favicon-generator.org/

Or create them programmatically with a tool like ImageMagick:

```bash
convert -size 128x128 xc:transparent -fill "#667eea" -draw "circle 64,64 64,10" icon128.png
convert icon128.png -resize 48x48 icon48.png
convert icon128.png -resize 16x16 icon16.png
```

For now, the extension will work without icons, but Chrome will show a default placeholder.
