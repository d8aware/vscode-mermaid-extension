// Package routes wires the gateway's handlers.
package routes

import "net/http"

// Handler is the gateway's root handler.
func Handler() http.Handler { return http.NotFoundHandler() }
