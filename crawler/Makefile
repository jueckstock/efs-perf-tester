# Where to push the image for "make up" (and where we may get the base image)
DOCKER_REPO = localhost:5000

# Paths to the artifact bundles we use when constructing the image
BROWSER_BUILD_TARBALL = artifacts/noPageGraphPrototypeBuild.tar.gz
VANILLA_PROFILE_TARBALL = artifacts/vanilla.tar.gz
BLOCK3P_PROFILE_TARBALL = artifacts/block3p.tar.gz

# This is the given name of this vpc build (should include the base browser build version/features)
TAG_ROOT = efs-perf-crawler

# Computed tag name based on Git hash (of the "crawler" subtree of the repo) and given name
TAG_HASH = $(shell git rev-parse --verify --short=0 "HEAD:crawler")
IMAGE_TAG = $(TAG_ROOT):$(TAG_HASH)

# Default: build the Docker image locally
image:
	docker build -t $(IMAGE_TAG) \
		--build-arg BROWSER_BUILD_TARBALL=$(BROWSER_BUILD_TARBALL) \
		--build-arg VANILLA_PROFILE_TARBALL=$(VANILLA_PROFILE_TARBALL) \
		--build-arg BLOCK3P_PROFILE_TARBALL=$(BLOCK3P_PROFILE_TARBALL) \
		.
	docker tag $(IMAGE_TAG) $(TAG_ROOT):latest

# Upstream: tag and push the current git-hash's build (if created) to the upstream repository
up:
	docker tag $(IMAGE_TAG) $(DOCKER_REPO)/$(IMAGE_TAG)
	docker push $(DOCKER_REPO)/$(IMAGE_TAG)