FROM golang:1.27.4-alpine AS build
WORKDIR /workspace/apps/bff
COPY apps/bff/go.mod apps/bff/go.sum ./
RUN go mod download
COPY apps/bff/cmd ./cmd
COPY apps/bff/internal ./internal
COPY packages/contracts/openapi.json /workspace/packages/contracts/openapi.json
RUN go generate ./internal/adapter/http
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /bff ./cmd/bff

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /bff /bff
USER 65532:65532
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/bff"]
