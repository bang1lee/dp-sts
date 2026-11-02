# Optional campfire motion

`tools/gujora-film.mjs` accepts an optional `--campfire=/absolute/path/to/regions.json`. When absent, it uses the existing image motion shader and Hydra graph without campfire changes. The image remains the source for all people and flame shapes; the code creates no people and assumes no number of figures.

The JSON describes fire and reflection ellipses plus one to eight protection ellipses in normalized screen coordinates: `x=0` at left, `y=0` at top, and radii measured as fractions of image width and height. Coordinates must be finite numbers from 0 to 1, and radii must be greater than 0 and no greater than 1.

```json
{
  "fire":       { "x": 0.50, "y": 0.60, "rx": 0.015, "ry": 0.020 },
  "protect": [
    { "x": 0.43, "y": 0.60, "rx": 0.025, "ry": 0.040 },
    { "x": 0.57, "y": 0.60, "rx": 0.025, "ry": 0.040 }
  ],
  "reflection": { "x": 0.50, "y": 0.66, "rx": 0.035, "ry": 0.035 }
}
```

These are schema examples only, not measured locations in a new cover. Set the ellipses after inspecting the actual edited image. Each protection ellipse must enclose its intended figure with a margin: sea and flame displacement and added glow are zero inside every ellipse, with a soft transition outside. Multiple ellipses allow the fire to remain visible between protected figures; where they overlap, protection takes precedence. For compatibility, `protect` may also be a single ellipse object.

The optional path adds a bounded, slowly varying local UV movement to existing flame strokes and a very faint neutral-white light within the fire and reflection ellipses. It neither colors the image orange nor applies a frame-wide brightness pulse. The fire and reflection radii used by the effects are capped at 0.05 and 0.12 of the frame respectively; the protected regions use their full specified radii. Both effects start at zero and fade back toward the source during the closing section. This is an image-space treatment, not physical fire or a measured reflection.

The renderer validates the file before opening the browser, preserves the zero-motion orientation check, and records the configuration, its SHA-256, and the effective shader hash in render metadata. Review a real preview for the edited image and selected regions before using these settings for the full film.
