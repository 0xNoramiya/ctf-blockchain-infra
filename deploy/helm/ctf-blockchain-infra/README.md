# Helm chart

Install the whole stack into a Kubernetes cluster with one command.
Mirrors the Kustomize base in `../kubernetes/` but with values-driven
configuration and hot-reload-friendly secret handling.

## Install from OCI registry (recommended)

Tagged releases publish to GHCR as an OCI artifact:

```bash
helm install ctf oci://ghcr.io/<owner>/charts/ctf-blockchain-infra \
  --version 0.1.0 \
  --create-namespace -n ctf \
  --values my-values.yaml
```

## Install from source

```bash
helm install ctf ./deploy/helm/ctf-blockchain-infra \
  --create-namespace -n ctf \
  --values my-values.yaml
```

A minimal `my-values.yaml`:

```yaml
backend:
  image: { repository: ghcr.io/your-org/ctf-backend, tag: "1.0" }
frontend:
  image: { repository: ghcr.io/your-org/ctf-frontend, tag: "1.0" }

env:
  RPC_URL: https://ethereum-sepolia-rpc.publicnode.com
  CHAIN_ID: "11155111"
  PUBLIC_BASE_URL: https://ctf.example.com

secrets:
  values:
    FLAG_CH01:        "CTF{real_flag_here}"
    SIGNER_KEY_CH01:  "0x..."
    ADMIN_TOKEN:      "$(openssl rand -hex 32)"
    WEBHOOK_URL:      "https://scoreboard.example.com/api/ctf-hooks"
    WEBHOOK_SECRET:   "long_random_string"

challenges:
  entries:
    - id: ch01
      title: Replay Receipt
      description: ...
      target: "0xDeployedPool"
      signer:
        enabled: true
        template:
          - { type: string,  value: Withdraw }
          - { type: address, value: $player }
          - { type: uint256, value: "100000000000000000000" }

ingress:
  enabled: true
  host: ctf.example.com
  tls: { enabled: true, secretName: ctf-tls }
```

## Upgrade

```bash
helm upgrade ctf ./deploy/helm/ctf-blockchain-infra -n ctf --values my-values.yaml
```

This rolls the backend if the manifest ConfigMap changed. To swap a
manifest without restarting, use the admin endpoint:

```bash
helm upgrade ctf ./deploy/helm/ctf-blockchain-infra -n ctf --values my-values.yaml
kubectl exec -n ctf deploy/ctf-backend -- curl -sX POST \
  http://127.0.0.1:8787/api/admin/manifest/reload \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Secret handling

| Option | When |
|---|---|
| `secrets.values: { ... }` (inline) | Quick start; **never commit values files with real flags**. |
| `secrets.existingSecret: my-secret` | You manage the Secret out-of-band (sealed-secrets, external-secrets, cloud provider). |

If you set `existingSecret`, the chart skips the `Secret` template and
your secret name is referenced directly from the backend Deployment's
`envFrom`. The secret must contain at least `RPC_URL`, `CHAIN_ID`, and
the `FLAG_<ID>` / `SIGNER_KEY_<ID>` keys your manifest needs.

## Private-anvil launcher

Disabled by default (`backend.enableLauncher: false`). Setting it true
mounts `/var/run/docker.sock` from the node — equivalent to root on
that node. Only enable on dedicated CTF nodes you treat as disposable.

A safer pattern for production: dedicate a node, taint it, set
`backend.enableLauncher: true`, and add a `tolerations` block (out of
scope for this chart's defaults).

## Uninstall

```bash
helm uninstall ctf -n ctf
kubectl delete namespace ctf
```
