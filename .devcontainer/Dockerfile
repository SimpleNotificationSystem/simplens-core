# Development Container for SimpleNS-Core
# This is optimized for development, NOT production

FROM node:22-slim

# Install development tools
RUN apt-get update && apt-get install -y \
    git \
    curl \
    vim \
    procps \
    gosu \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /workspaces/simplens-core

# Install global development tools
RUN npm install -g tsx typescript

# Create non-root user for VS Code
ARG USERNAME=node
ARG USER_UID=1000
ARG USER_GID=$USER_UID

# Create directories that will be mounted as volumes
# These will be overridden by volumes, but entrypoint will fix permissions
RUN mkdir -p /workspaces/simplens-core/node_modules \
    && mkdir -p /home/$USERNAME/.vscode-server/extensions \
    && chown -R $USERNAME:$USERNAME /workspaces \
    && chown -R $USERNAME:$USERNAME /home/$USERNAME/.vscode-server

# Create entrypoint script to fix volume permissions
RUN echo '#!/bin/bash\n\
# Fix ownership of mounted volumes (runs as root)\n\
chown -R node:node /workspaces/simplens-core/node_modules 2>/dev/null || true\n\
chown -R node:node /home/node/.vscode-server 2>/dev/null || true\n\
# Execute the main command as the node user\n\
exec gosu node "$@"' > /usr/local/bin/entrypoint.sh \
    && chmod +x /usr/local/bin/entrypoint.sh

# Default shell
ENV SHELL=/bin/bash

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# Keep container running
CMD ["sleep", "infinity"]
