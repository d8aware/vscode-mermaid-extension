// Command server is the gateway's HTTP entry point.
package main

import (
	"fmt"
	"net/http"

	"example.com/acme/gateway/server/routes"
	"example.com/acme/gateway/shared/auth"
	log "example.com/acme/gateway/shared/logging"
	// "example.com/acme/gateway/shared/legacy" is commented out: it does not count
	"github.com/google/uuid"
)

func main() {
	// A string that looks like an import path is not an import.
	fmt.Println("example.com/acme/gateway/shared/banner", uuid.NewString())
	http.Handle("/", auth.Require(routes.Handler()))
	log.Info("listening")
	_ = http.ListenAndServe(":8080", nil)
}
