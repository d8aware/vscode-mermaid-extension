package logging

import "log"

// Info writes an informational line.
func Info(msg string) { log.Println("INFO", msg) }
