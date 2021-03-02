FROM node:lts-buster-slim

# Arguments
ARG BROWSER_BUILD_TARBALL
ARG VANILLA_PROFILE_TARBALL
ARG BLOCK3P_PROFILE_TARBALL

# Install necessary rerequisites
RUN apt update && apt install -y \
    dumb-init \
    libxcomposite1 \
    libxcursor1 \
    libxi6 \
    libxtst6 \
    libglib2.0-0 \
    libnss3 \
    libatk-bridge2.0-0 \
    libxss1 \
    libcups2 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libgtk-3-0 \
    xvfb

# Copy in external build artifacts
WORKDIR /work/bin
COPY $BROWSER_BUILD_TARBALL build.tar
RUN tar xf build.tar && rm build.tar

# and profile seed snapshots
WORKDIR /work/data
COPY $VANILLA_PROFILE_TARBALL vanilla.tar
RUN tar xf vanilla.tar && rm vanilla.tar
COPY $BLOCK3P_PROFILE_TARBALL block3p.tar
RUN tar xf block3p.tar && rm block3p.tar

# Copy in application and install dependencies as runtime user
COPY --chown=node:node . /home/node/app/
WORKDIR /home/node/app
USER node
RUN npm install --production

# Secret ENV vars (this default is not suitable for production)
ENV MONGODB_URL=mongodb://localhost:27017/efs_perf_test

# Fixed env vars (should not need to change in deployment, but can)
ENV BROWSER_BINARY_PATH=/work/bin/brave
ENV VANILLA_PROFILE_SEED=/work/data/vanilla
ENV BLOCK3P_PROFILE_SEED=/work/data/block3p

# Run app entry point under dumb-init (cli args tunable in CMD)
ENTRYPOINT ["/usr/bin/dumb-init", "--", "node", "./kpw.js"]
CMD ["-c3", "8080"]
