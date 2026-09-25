# Cartoon sticker assets

Original, unmodified Microsoft **Fluent Emoji**, 3D style PNGs, distributed under the accompanying MIT `LICENSE`.

Source: https://github.com/microsoft/fluentui-emoji
Pinned revision: `1ffb34c752ecf5d402f04cfb4b392c77f57c54bc`

`manifest.json` records every source URL and SHA-256. Reproduce downloads with `node scripts/prepare-cartoon-stickers.cjs`.

The app arranges these transparent, pre-rendered illustrations beside the face and above the forehead using MediaPipe head pose and WebGL textured quads. These are illustrated stickers with 3D perspective, not a replacement face mesh or deformable character model. The original face is not painted over. Local copies are shared by portrait creation and video calls; no third-party image requests are made at runtime.
