# Attention Training

A lightweight attention-training app for daily practice. It includes Schulte-table exercises, cognitive interference tasks, multiple-object tracking, and locally stored training history. The repository currently contains the WeChat Mini Program source and a deployable static H5 build.

## Features

### Schulte table

- **Practice**: tap numbers in ascending order; completed cells are dimmed.
- **Classic**: complete the full board in ascending order.
- **Reverse**: tap in descending order; alphabet boards support Z–A and z–a.
- **Challenge**: one mistake ends the session immediately.
- **Crazy**: the board is reshuffled after every correct tap.
- **Arithmetic**: solve an equation and tap the matching answer.
- **Patience**: repeatedly complete a 5×5 board within a time limit and track completed rounds.

The app supports numeric boards from 3×3 through 9×9, plus A–Z and a–z alphabet boards. Arithmetic uses numeric boards.

### Cognitive training

- **Stroop**: identify ink color while resisting the word meaning.
- **Simon effect**: respond to color while ignoring stimulus position.
- **Flanker**: judge only the central arrow and ignore the flankers.
- **Go/No-Go**: tap when a circle appears and withhold the response for a square.

### Multiple-object tracking

Remember highlighted targets, follow the moving dots, and identify the targets afterward. The session supports 2, 4, or 8 rounds and configurable target counts.

### History and statistics

- Stores duration, correct responses, errors, and completion status for each session.
- Filters history by game, mode, and board specification.
- Calculates records and statistics separately for each mode and specification.
- Requires no account or remote service; data stays on the device.

## Getting started

### WeChat Mini Program

1. Install and open [WeChat DevTools](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html).
2. Import this repository.
3. Use `miniprogram/` as the Mini Program root; this is already configured in `project.config.json`.
4. Compile the TypeScript project and preview it in the simulator or on a device.

The main project configuration is in `project.config.json`, and the page entry points are declared in `miniprogram/app.json`.

### H5 static build

`xiaohongshu-dist/` is a self-contained static directory. Serve it as the website root, or run a local static server:

```bash
cd xiaohongshu-dist
python3 -m http.server 8080
```

Open <http://localhost:8080> in a browser.

## Project structure

```text
.
├── miniprogram/                 # WeChat Mini Program source
│   ├── core/                    # Training models, rules, records, and storage
│   ├── components/              # Reusable components
│   ├── pages/                  # Home, training, history, and related pages
│   └── assets/                 # Image assets
├── xiaohongshu-dist/            # Static H5 distribution
├── project.config.json          # WeChat DevTools project configuration
└── .gitignore
```

Core training logic lives in `miniprogram/core/`, while UI pages live in `miniprogram/pages/`. Sending the app to the background or locking the screen interrupts the active session.

## Technical notes

- Native WeChat Mini Program pages and components
- TypeScript
- WXML / WXSS
- Canvas for multiple-object tracking
- Static browser H5 assets

There is no backend API. Training history is stored using Mini Program local storage or browser local storage.

## Privacy and data

By default, training history and settings are stored only on the current device and are not uploaded. Clearing the Mini Program or browser storage also removes the associated records.

## License

This repository currently does not declare an open-source license. Unless the maintainers provide separate permission, do not redistribute the code or assets.
