# syntax=docker/dockerfile:1.7
#
# windle X feed relay. Build from services/x-relay:
#   docker build -t windle/x-relay:<tag> -t windle/x-relay:current --build-arg APP_COMMIT=<tag> services/x-relay
# Static binary on distroless (CA bundle included, no shell), runs as uid 65532 (nonroot).

ARG GO_IMAGE=golang:1.25-alpine

FROM ${GO_IMAGE} AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/x-relay .

FROM gcr.io/distroless/static-debian12:nonroot
ARG APP_COMMIT=""
COPY --from=build /out/x-relay /x-relay
LABEL fun.windle.project="windle" \
      fun.windle.service="x-relay" \
      org.opencontainers.image.title="windle-x-relay" \
      org.opencontainers.image.revision="${APP_COMMIT}"
ENV X_RELAY_ADDR=0.0.0.0:3010
USER nonroot:nonroot
EXPOSE 3010
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 CMD ["/x-relay", "-healthcheck"]
ENTRYPOINT ["/x-relay"]
