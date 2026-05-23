# syntax=docker/dockerfile:1.7
#
# Per-challenge image. The launcher runs one of these per player.
#
# Build:
#   docker build -t ghcr.io/your-org/ctf-chN:1.0 .
#
# Reference from challenges.json:
#   "mode": "private-anvil",
#   "image": "ghcr.io/your-org/ctf-chN:1.0",
#   "timeout": 1800
#
# Container contract:
#   - Exposes anvil on 0.0.0.0:8545.
#   - On startup: reads $PLAYER from env, deploys via forge.
#   - Prints exactly one line `CTF_META={json}` containing "target" address.
#   - Stays foreground; launcher kills it on expiry or player request.

FROM ghcr.io/foundry-rs/foundry:latest

WORKDIR /chal
USER root

COPY foundry.toml ./
COPY src ./src
COPY script ./script
RUN forge install foundry-rs/forge-std \
 && forge build

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8545
ENTRYPOINT ["/entrypoint.sh"]
