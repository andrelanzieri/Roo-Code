# Use the official Node.js image as base
FROM node:20.19.2-bookworm-slim

# Install basic development tools
RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    ca-certificates \
    gnupg \
    lsb-release \
    # Clean up apt cache to reduce image size
    && rm -rf /var/lib/apt/lists/*

# Install pnpm globally with the exact version from package.json
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate

# Set pnpm store directory for better caching
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Create a non-root user for development
ARG USERNAME=node
ARG USER_UID=1000
ARG USER_GID=$USER_UID

# Ensure the node user has the correct UID/GID
RUN groupmod --gid $USER_GID $USERNAME \
    && usermod --uid $USER_UID --gid $USER_GID $USERNAME \
    && chown -R $USER_UID:$USER_GID /home/$USERNAME

# Create pnpm directories with correct permissions
RUN mkdir -p /pnpm /workspace \
    && chown -R $USERNAME:$USERNAME /pnpm /workspace

# Switch to non-root user
USER $USERNAME

# Set the working directory
WORKDIR /workspace