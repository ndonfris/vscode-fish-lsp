FROM mcr.microsoft.com/devcontainers/javascript-node:22

# Install fish shell 4.x from OBS repository (for Debian)
RUN apt-get update && \
    apt-get install -y curl gpg && \
    echo 'deb http://download.opensuse.org/repositories/shells:/fish:/release:/4/Debian_12/ /' > /etc/apt/sources.list.d/fish.list && \
    curl -fsSL https://download.opensuse.org/repositories/shells:fish:release:4/Debian_12/Release.key | gpg --dearmor -o /etc/apt/trusted.gpg.d/fish.gpg && \
    apt-get update && \
    apt-get install -y fish && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install yarn 1.22.22 globally
RUN npm install -g yarn@1.22.22

# Set fish as the default shell
ENV SHELL=/usr/bin/fish
