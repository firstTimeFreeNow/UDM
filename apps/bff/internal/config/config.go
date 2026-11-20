package config

import (
	"github.com/firstTimeFreeNow/UDM/apps/bff/internal/domain"
	"net/url"
	"regexp"
)

type Config struct {
	Project, SharedSecret, UpstreamURL string
	Origins                            []string
}

var execPath = regexp.MustCompile(`^/macros/s/[A-Za-z0-9_-]+/exec$`)
var secretPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

func (c Config) Validate() error {
	u, e := url.Parse(c.UpstreamURL)
	if e != nil || u.Scheme != "https" || u.Host != "script.google.com" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || !execPath.MatchString(u.Path) || u.RawPath != "" {
		return domain.Failure("CONFIG_REQUIRED")
	}
	if c.Project == "" || !secretPattern.MatchString(c.SharedSecret) || len(c.Origins) == 0 {
		return domain.Failure("CONFIG_REQUIRED")
	}
	for _, s := range c.Origins {
		u, e := url.Parse(s)
		if e != nil || u.User != nil || u.Host == "" || u.RawQuery != "" || u.Fragment != "" || u.Path != "" || (u.Scheme != "https" && !(u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1"))) {
			return domain.Failure("CONFIG_REQUIRED")
		}
	}
	return nil
}
