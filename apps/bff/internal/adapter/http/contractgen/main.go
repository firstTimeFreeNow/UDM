// Command contractgen derives the legacy action mapping from the OpenAPI operations.
package main

import (
	"encoding/json"
	"fmt"
	"go/format"
	"os"
	"sort"
	"strings"
)

func main() {
	raw, err := os.ReadFile(os.Args[1])
	must(err)
	var spec struct {
		Paths map[string]map[string]struct {
			OperationID string `json:"operationId"`
			Action      string `json:"x-udm-action"`
			View        string `json:"x-udm-view"`
			Parameters  []any  `json:"parameters"`
		} `json:"paths"`
	}
	must(json.Unmarshal(raw, &spec))
	var routes, methods []string
	for path, operations := range spec.Paths {
		for method, op := range operations {
			if op.Action != "" {
				routes = append(routes, fmt.Sprintf("%q: {Action: %q, View: %q},", strings.ToUpper(method)+" "+path, op.Action, op.View))
			}
			name := strings.ToUpper(op.OperationID[:1]) + op.OperationID[1:]
			params := ""
			if len(op.Parameters) > 0 {
				params = ", _ " + name + "Params"
			}
			methods = append(methods, fmt.Sprintf("func (h *APIHandler) %s(w http.ResponseWriter, r *http.Request%s) { h.handleHTTP(w,r) }", name, params))
		}
	}
	sort.Strings(routes)
	sort.Strings(methods)
	code := "// Code generated from openapi.json; DO NOT EDIT.\npackage httpadapter\nimport \"net/http\"\nvar _ ServerInterface = (*APIHandler)(nil)\ntype operationInfo struct { Action, View string }\nvar operationCatalog = map[string]operationInfo{\n" + strings.Join(routes, "\n") + "\n}\n" + strings.Join(methods, "\n")
	out, err := format.Source([]byte(code))
	must(err)
	must(os.WriteFile("routes.gen.go", out, 0644))
}
func must(err error) {
	if err != nil {
		panic(err)
	}
}
