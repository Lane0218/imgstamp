<p align="center">
  <img src="src/renderer/assets/logo.png" width="120" alt="ImgStamp Logo" />
</p>

<p align="center">
  <a href="https://github.com/Lane0218/imgstamp/blob/main/README.md">简体中文</a> | English
</p>

# ImgStamp

ImgStamp is an offline desktop tool for organizing personal photos. It adds a clean white border and text annotations (date / location / description) in batch, then exports a consistent, print‑ready style. It is ideal for yearly photo curation and selecting highlights from large collections.

## Features

- Import local folders (JPG / PNG) with thumbnail list
- Selection & status management (pending / complete / exported)
- Read EXIF date automatically, with manual edits and batch fill
- Location and description input with explicit “skip” markers
- Batch apply date / location / description across photos
- Export four sizes: 5" / Large 5" / 6" / Large 6"
- Project save / load with auto‑save

## System Requirements

- Windows 11 (x86)

## Download & Install

Get the installer from GitHub Releases: `ImgStamp-Setup-*.exe`
- `.blockmap` and `latest.yml` are for auto‑updates and can be ignored

## Workflow

1. Import a photo folder
2. Select photos and fill date / location / description
3. Choose export size and start export
4. Output goes to the chosen export directory

## Notes

- Original images are never modified; all outputs go to the export directory
- HEIC is not supported yet; JPG / PNG only

## Development & Build

Development:

```bash
npm install
npm run dev:renderer
npm run start
```

Build & package:

```bash
npm run build
npm run dist
```

Publish to GitHub Release:

```bash
npm run release
```

## Docs

- `docs/PRD.md` Product requirements
- `docs/TECH_DESIGN.md` Technical design
- `docs/FEAT_DESIGN.md` Layout system spec
- `docs/UI_DESIGN.md` UI design

## Contributing & Feedback

PRs and Issues are welcome. You can also reach me at `laneljc@qq.com`.

## License

MIT License. See `LICENSE`.
