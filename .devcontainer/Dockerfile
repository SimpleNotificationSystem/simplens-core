# Development Container for SimpleNS-Core
# This is optimized for development, NOT production

FROM node:22-slim

# Install development tools
RUN apt-get update && apt-get install -y \
    git \
    curl \
    vim \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /workspaces/simplens-core

# Install global development tools
RUN npm install -g tsx typescript

# Create non-root user for VS Code
ARG USERNAME=node
ARG USER_UID=1000
ARG USER_GID=$USER_UID

# Set ownership
RUN chown -R $USERNAME:$USERNAME /workspaces

# Switch to non-root user
USER $USERNAME

# Default shell
ENV SHELL=/bin/bash

# Keep container running
CMD ["sleep", "infinity"]
