# Kubernetes

Two install paths in this repo:

| Path | When |
|---|---|
| **Helm chart** at `deploy/helm/ctf-blockchain-infra/` | Most installs. Values-driven, hot-reload-friendly secret handling, NOTES with copy-paste next steps. |
| Kustomize base at `deploy/kubernetes/` | You'd rather pin manifests directly and overlay with `kustomize edit`. |

Both target any conformant cluster (k3s, EKS, GKE, kind).

## Helm quickstart

Tagged releases publish to GHCR as OCI artifacts:

```bash
helm install ctf oci://ghcr.io/<owner>/charts/ctf-blockchain-infra \
  --version 0.1.0 \
  --create-namespace -n ctf \
  --values my-values.yaml
```

Or install from the repo checkout (useful for development):

```bash
helm install ctf ./deploy/helm/ctf-blockchain-infra \
  --create-namespace -n ctf \
  --values my-values.yaml
```

A minimal `my-values.yaml` is in [the chart README](https://github.com/0xNoramiya/ctf-blockchain-infra/tree/main/deploy/helm/ctf-blockchain-infra).
Override images, manifest entries, env, and secrets there — no template
editing required.

## Kustomize quickstart

## Files

```
deploy/kubernetes/
├── kustomization.yaml      # ties everything together
├── namespace.yaml          # `ctf` namespace
├── configmap.yaml          # challenges.json
├── secret.example.yaml     # template — copy + edit + DO NOT COMMIT
├── backend.yaml            # Deployment + Service
├── frontend.yaml           # Deployment + Service
└── ingress.yaml            # cert-manager-ready Ingress
```

## Build & push images

```bash
docker build -t ghcr.io/your-org/ctf-backend:1.0 backend/
docker build -t ghcr.io/your-org/ctf-frontend:1.0 frontend/
docker push ghcr.io/your-org/ctf-backend:1.0
docker push ghcr.io/your-org/ctf-frontend:1.0
```

Then edit `deploy/kubernetes/kustomization.yaml`:

```yaml
images:
  - name: ghcr.io/example/ctf-backend
    newName: ghcr.io/your-org/ctf-backend
    newTag: "1.0"
  - name: ghcr.io/example/ctf-frontend
    newName: ghcr.io/your-org/ctf-frontend
    newTag: "1.0"
```

## Secrets

Don't commit `secret.example.yaml` with real values. Pick one:

=== "Create at apply time"

    ```bash
    kubectl create namespace ctf
    kubectl create secret generic ctf-backend-env -n ctf \
      --from-literal=RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
      --from-literal=CHAIN_ID=11155111 \
      --from-literal=FLAG_CH01='CTF{real_flag_here}' \
      --from-literal=SIGNER_KEY_CH01='0x...'
    ```

    Then remove `secret.example.yaml` from `kustomization.yaml`'s `resources:`.

=== "Sealed Secrets"

    ```bash
    kubeseal --format yaml < secret.yaml > secret.sealed.yaml
    git add secret.sealed.yaml
    ```

    Replace `secret.example.yaml` with `secret.sealed.yaml` in `kustomization.yaml`.

=== "External Secrets Operator"

    Reference your cloud provider's secret store (AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault) via an `ExternalSecret`. The synthesized `Secret` ends up at `ctf-backend-env`.

## Configure challenges

```bash
kubectl -n ctf create configmap ctf-challenges \
  --from-file=challenges.json=./backend/challenges.json \
  --dry-run=client -o yaml | kubectl apply -f -
```

The backend mounts it at `/etc/ctf/challenges.json` and the `CHALLENGES_MANIFEST` env var in `secret.example.yaml` points there.

## Apply

```bash
kubectl apply -k deploy/kubernetes/
kubectl -n ctf rollout status deployment/backend deployment/frontend
```

## Update flow

| Change | Action |
|---|---|
| New contract address | `kubectl -n ctf create configmap ctf-challenges --from-file=challenges.json=./backend/challenges.json --dry-run=client -o yaml \| kubectl apply -f -` then `kubectl -n ctf rollout restart deploy/backend` |
| New flag / signer key | Update the Secret, then `kubectl rollout restart deploy/backend` |
| New backend image | bump `newTag` in `kustomization.yaml`, `kubectl apply -k …` |
| New frontend asset | rebuild + push image, bump `newTag`, `kubectl apply -k …` |

## NetworkPolicy

The Kustomize base ships `networkpolicy.yaml` (always applied); the
Helm chart gates it behind `networkPolicy.enabled` (default `false`,
because not every CNI enforces them).

Default posture: deny-all ingress and egress in the namespace, then
allow:

- DNS to kube-system.
- Frontend ingress from the `ingress-nginx` namespace (configurable
  via `networkPolicy.ingressNamespace`).
- Backend ingress from the frontend pod, the ingress controller, and
  optionally a monitoring namespace
  (`networkPolicy.monitoringNamespace`).
- Backend egress to public IPs on TCP 80/443 (RPC + webhook); private
  CIDRs (RFC1918 + link-local) are excluded.

```bash
helm upgrade ctf ./deploy/helm/ctf-blockchain-infra \
  --reuse-values \
  --set networkPolicy.enabled=true \
  --set networkPolicy.monitoringNamespace=monitoring
```

If your CNI is kindnet, flannel-no-policy, or another no-op
implementation, leave it off — the resource will be created but won't
enforce, and the dropped traffic is invisible.

## Pod security

The manifests opt into:

- `runAsNonRoot`, `runAsUser=1000` (backend) / `101` (nginx)
- `seccompProfile: RuntimeDefault`
- `allowPrivilegeEscalation: false`
- `readOnlyRootFilesystem: true` on backend (Node only needs `/tmp`, write-mounted via the ephemeral image layer)
- `capabilities: drop ALL`
- `automountServiceAccountToken: false`

Tweak if your cluster's PodSecurity admission plugin rejects them — but tighter is always preferable to looser.

## Ingress

Default uses `ingressClassName: nginx`. For other ingress controllers, edit `ingress.yaml`:

- **Traefik**: `ingressClassName: traefik`, drop the nginx-specific annotations.
- **AWS ALB**: switch to the AWS Load Balancer Controller and add the relevant annotations.
- **Cloudflare Tunnel**: skip Ingress entirely; expose the frontend Service via a `cloudflared` sidecar / DaemonSet.

## What's *not* in here

- HPA / autoscaling. Add one if your event hits enough traffic that one backend pod isn't enough. The backend is read-mostly so a single replica handles a lot of `isSolved` calls.
- Persistent storage. There's no per-player data to persist; all state is on-chain.
- A scoreboard service. That's a separate concern — front this with CTFd or GZCTF if you need one.
