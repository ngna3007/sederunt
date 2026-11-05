-- The Google Forms preset stores a marker, not a loopback URL.
-- Remote connectors stay https-only.

alter table public.mcp_connectors drop constraint mcp_connectors_url_check;

alter table public.mcp_connectors add constraint mcp_connectors_url_check check (
  url is null
  or url = 'builtin:google-forms'
  or (url ~ '^https://' and char_length(url) <= 2048)
);
