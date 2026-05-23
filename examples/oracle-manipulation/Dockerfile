# syntax=docker/dockerfile:1.7
FROM ghcr.io/foundry-rs/foundry:latest

WORKDIR /chal
USER root

COPY foundry.toml ./
COPY src ./src
COPY script ./script
# Inline the shared lib so we don't need the relative remapping at runtime.
COPY lib ./lib
RUN sed -i 's|../../contracts-template/lib/|lib/|' foundry.toml \
 && forge install foundry-rs/forge-std \
 && forge build

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8545
ENTRYPOINT ["/entrypoint.sh"]
