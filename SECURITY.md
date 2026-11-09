# Security

Keep real credentials in deployment settings or ignored environment files. `.env.example` contains names and placeholders only. Never include credentials or real customer exports in issues, pull requests, screenshots or test fixtures.

Report suspected vulnerabilities privately to the repository owner through GitHub's security reporting interface when available. Include the affected route or module and a minimal reproduction using disposable accounts. Do not post live tokens or customer data.

Before deploying, configure authentication, durable Redis and server-side Supabase credentials. Development fake modes and an unconfigured console are intended for local use. Database migrations are applied explicitly; do not replay historical migrations based only on filename timestamps.
