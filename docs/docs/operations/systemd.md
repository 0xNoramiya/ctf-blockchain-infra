# Systemd service

The bundled unit lives at `deploy/systemd/ctf-backend.service` and gets installed by `install.sh` to `/etc/systemd/system/`.

## Lifecycle

```bash
sudo systemctl start ctf-backend          # start now
sudo systemctl stop ctf-backend           # stop
sudo systemctl restart ctf-backend        # apply env / manifest changes
sudo systemctl status ctf-backend         # current state + last lines
sudo systemctl enable ctf-backend         # start on boot (install.sh does this)
sudo journalctl -u ctf-backend -f         # live logs
sudo journalctl -u ctf-backend --since=1h # recent logs
```

## When to restart

| Change | Restart required? |
|---|---|
| Edit `/opt/ctf/backend/.env` | yes |
| Edit `/opt/ctf/backend/challenges.json` | yes (manifest read on boot) |
| Edit static files in `/opt/ctf/frontend/*` | no — nginx serves them directly |
| Deploy a new contract address | yes (paste address into manifest, then restart) |

## Hardening

The shipped unit enables most of systemd's sandboxing knobs:

- `NoNewPrivileges=true`
- `PrivateTmp=true`
- `ProtectSystem=strict` + `ReadWritePaths=/opt/ctf/backend`
- `ProtectHome=true`
- `ProtectKernelTunables`, `ProtectKernelModules`, `ProtectControlGroups`
- `RestrictNamespaces`, `RestrictSUIDSGID`, `LockPersonality`, `MemoryDenyWriteExecute`
- `SystemCallFilter=@system-service` + drop `@privileged` and `@resources`

If you extend `server.js` with anything that needs `/dev/shm`, network namespaces, or shells out to a subprocess, you may need to relax these. Test changes with:

```bash
sudo systemctl daemon-reload
sudo systemctl restart ctf-backend
sudo journalctl -u ctf-backend -n 50 --no-pager
```

A startup that fails immediately is usually a sandbox violation. The journal will name the syscall that got denied.

## Running as a non-privileged user

The unit runs as user `ctf` (created by `install.sh`). The user has:

- No login shell (`/usr/sbin/nologin`).
- No sudo / wheel membership.
- Read+write only on `/opt/ctf/backend`.
- Read-only on `/opt/ctf/frontend` (nginx serves it; backend doesn't touch).

`/opt/ctf/backend/.env` is `chmod 600 root:root`. systemd reads it as root via `EnvironmentFile=` *before* dropping to `ctf`. The Node process never has direct read access to the file — it only sees the resulting environment variables.

## Reading logs in CI

For automated checks (e.g. a health probe that reads journal output):

```bash
sudo journalctl -u ctf-backend -n 200 --output=cat --no-pager
```

`--output=cat` strips the systemd metadata, so only the actual log lines come through.

## Memory / CPU limits

Add caps to the `[Service]` block if your VPS is shared:

```ini
MemoryMax=256M
CPUQuota=50%
TasksMax=64
```

Apply with `sudo systemctl daemon-reload && sudo systemctl restart ctf-backend`. The default Node footprint is ~70 MB idle for the bundled server.
