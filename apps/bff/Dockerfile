FROM golang:1.27.4-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /bff ./cmd/bff

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /bff /bff
USER 65532:65532
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/bff"]
