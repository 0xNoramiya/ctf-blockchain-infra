# Pack: sigreplay

Worked-example pack mirroring [`examples/signature-replay/`](../../examples/signature-replay).

Install into your deployment:

```bash
ctf-admin install-pack ./packs/example-sigreplay \
  --target 0xDeployedPool \
  --packs-dir /opt/ctf/backend/packs \
  --frontend-dist /opt/ctf/frontend/dist
```

That:

1. Reads `pack.yaml` to discover the pack's id.
2. Substitutes `$INSTALL_TARGET` in `manifest.json` with `--target`.
3. Writes the resolved manifest to `<packs-dir>/<id>.json`.
4. Copies `dist/*` to `<frontend-dist>/<id>/`.
5. Reminds you to reference `<packs-dir>/<id>.json` from your main
   `challenges.json` (or run `ctf-admin reload`).

The dist directory in this example pack is empty — drop the contracts
zip there before installing.
