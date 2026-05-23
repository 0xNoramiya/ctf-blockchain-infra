# Cloudflare hardening

Cloudflare is the only door into your origin. Direct IP hits to the VPS must fail.

## Architecture

```
player → Cloudflare edge → VPS:8080 (nginx)
                ↑
        proxy + WAF + TLS termination
```

## DNS

| Type | Name | Content | Proxy status |
|---|---|---|---|
| A | `ctf` | your.vps.ip.address | **Proxied** (orange cloud) |
| AAAA | `ctf` | your::vps::ipv6 | Proxied (optional) |

`Proxied` is mandatory. A grey-cloud (DNS-only) record exposes your origin IP and bypasses the WAF.

## Origin Rule: rewrite destination port

The nginx vhost listens on `8080` to stay clear of any other web server on the VPS (e.g. you might already have a separate Docker stack on 80/443).

In Cloudflare dashboard:

1. **Rules → Origin Rules → Create rule**
2. Match: `Hostname equals ctf.example.com`
3. Action: **Rewrite to → Destination port → 8080**
4. Deploy.

Without this, Cloudflare connects to port 443/80 and you get connection refused.

## SSL/TLS mode

| Mode | Use when |
|---|---|
| **Flexible** | nginx serves plain HTTP on 8080. Simpler, fine for a CTF. |
| **Full** | nginx serves HTTPS with a self-signed cert on 8080. |
| **Full (strict)** | nginx serves HTTPS with a real cert (e.g. Let's Encrypt). |

The default `deploy/nginx/site.conf` serves HTTP, so set **Flexible** unless you add TLS to nginx yourself.

Also enable:

- **SSL/TLS → Edge Certificates → Always Use HTTPS: On**
- **SSL/TLS → Edge Certificates → Minimum TLS Version: 1.2**

## Firewall the origin

The bundled UFW script accepts traffic on port 8080 *only* from Cloudflare's published CIDR list.

```bash
sudo PORT=8080 ./deploy/cloudflare/ufw-allow-cloudflare.sh
sudo ufw default deny incoming
sudo ufw allow ssh
sudo ufw --force enable
```

What the script does:

- Wipes any existing rules for the port.
- Fetches `https://www.cloudflare.com/ips-v4` and `…/ips-v6`.
- Adds one `ufw allow` per CIDR, scoped to your port.

The list does change. Add it to weekly cron:

```cron
# /etc/cron.d/ufw-cloudflare
0 4 * * 0 root PORT=8080 /opt/ctf-blockchain-infra/deploy/cloudflare/ufw-allow-cloudflare.sh
```

## Verify the lockdown

From any machine that isn't Cloudflare:

```bash
curl -v --connect-timeout 5 http://your.vps.ip:8080/api/health
# expect: connection timed out
```

From a CF-IP-bearing curl (use a CF Worker or an SSH session on a CF-owned host) — that's harder to test, so the practical check is:

```bash
curl -s https://ctf.example.com/api/health
# expect: {"ok":true,"challenges":N}
```

The first request goes to `your.vps.ip:8080` directly → blocked.  
The second request goes through Cloudflare → allowed.

## Security headers

Both nginx vhosts ship with these always-on headers:

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` |

`script-src` allows `cdn.jsdelivr.net` because the frontend imports
ethers from `https://cdn.jsdelivr.net/npm/ethers@…/+esm`. Drop it if
you self-host ethers, or pin to a specific path with SRI.

`connect-src 'self'` is sufficient for the proxy RPC path
(`/api/rpc/<id>`). Players in direct-port mode talk to anvil from
outside the browser, so CSP doesn't constrain them.

### Adding HSTS

The bare-metal and compose nginx configs have a commented `Strict-Transport-Security`
line. Uncomment it when you're serving HTTPS end-to-end:

- **Cloudflare Full / Full (strict)** — origin terminates TLS; safe to enable.
- **Cloudflare Flexible** — origin is HTTP. HSTS on the origin response
  is fine since players never hit the origin directly, but if you ever
  remove the proxy your players' browsers will be locked into HTTPS for
  the duration of the max-age. Keep `max-age=15552000` (180 days) until
  you're confident in the TLS setup; start with a smaller value if you
  expect to roll back.

You can also let Cloudflare add HSTS at the edge via **SSL/TLS → Edge
Certificates → HTTP Strict Transport Security**. Pick one location, not
both.

## Optional WAF rules

Cloudflare's free plan ships a managed WAF. For a CTF, the bots-and-spam-blocking defaults are fine. Things to *not* enable:

- **Rate limiting on `/api/sign`**: legitimate players hit it once. CF's per-IP defaults work, but be careful not to block faucet-shared IPs.
- **Bot Fight Mode** can be aggressive against `cast`/`forge` scripts. Test before turning it on.

## Common breakages

| Symptom | Cause |
|---|---|
| `522 Connection timed out` | Origin Rule missing — CF is hitting port 443/80 on your VPS. |
| `521 Web server is down` | UFW blocking CF IP because the CIDR list rotated. Re-run the script. |
| `525 SSL handshake failed` | SSL mode is Full but nginx serves plain HTTP. Switch to Flexible. |
| Player can't connect wallet | CSP too tight, or Cloudflare's Rocket Loader is mangling ES modules. Disable Rocket Loader for this domain. |
