module example.com/acme/gateway/server

go 1.22

require (
	example.com/acme/gateway/shared v0.0.0
	github.com/google/uuid v1.6.0 // not in this repository: no arrow
)

replace example.com/acme/gateway/shared => ../shared
