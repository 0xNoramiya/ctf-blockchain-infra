# frontend

Static HTML/CSS/JS. No build step. ESM import of ethers from a CDN.

## Files

| File | Purpose |
|---|---|
| `index.html` | DOM shell + `<template id="cardTpl">` for cards. |
| `style.css` | Light theme. CSS variables on `:root` for easy rebrand. |
| `app.js` | Loads `/api/config`, renders cards, polls `/api/status/:id`, claims flags. |

## Local dev

```bash
cd frontend
python3 -m http.server 5500
# then point BACKEND in app.js to your backend URL (or use nginx in front)
```

The backend defaults to same-origin (`BACKEND = ""`). For local dev with the backend on a different port, edit the constant at the top of `app.js`.

## Customization

- **Branding**: edit the `:root` CSS variables in `style.css` (`--accent`, `--bg`, etc).
- **Layout**: each challenge card is rendered from the `<template>` in `index.html`. Edit it once; all cards update.
- **Extra actions** (e.g. "spawn instance" button that sends a tx): add a button to the template, then dispatch from `app.js` using `state.walletProvider.getSigner()`.
