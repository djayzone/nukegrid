# Manual container publishing (GHCR)

NukeGrid intentionally does **not** ship an automatic GitHub Actions publishing workflow.

This keeps repository CI usage at zero unless a maintainer explicitly publishes an image from their own machine.

## Publish manually

Authenticate:

```bash
docker login ghcr.io -u YOUR_GITHUB_USERNAME
```

Build and tag:

```bash
docker build -t ghcr.io/djayzone/nukegrid:latest .
```

Push:

```bash
docker push ghcr.io/djayzone/nukegrid:latest
```

For a versioned release:

```bash
docker build -t ghcr.io/djayzone/nukegrid:0.8.1-l08b .
docker push ghcr.io/djayzone/nukegrid:0.8.1-l08b
```

After the first push, make sure the package visibility is **Public** in GitHub Packages if you want anonymous pulls.

## Use the published image

```bash
docker run --rm -p 4176:4176 ghcr.io/djayzone/nukegrid:latest
```

For Kubernetes or Helm, set the image repository to `ghcr.io/djayzone/nukegrid`.
