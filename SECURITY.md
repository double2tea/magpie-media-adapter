# Security

## Reporting

For a security issue, use **Security → Report a vulnerability** on the GitHub repository when private reporting is enabled. If that entry is unavailable, open a minimal issue requesting a private contact without disclosing exploit details or private data.

Never include API keys, authorization headers, Google cookies, private media or full Magpie configuration files. A useful report includes:

- Plugin and Magpie versions, client protocol and selected model family.
- A small synthetic request that reproduces the issue.
- Expected behavior, actual behavior and sanitized error/status information.

## Scope

The middleware sees gateway request bodies in memory. It does not independently access the network, filesystem, shell or credentials. Provider requests and billing remain managed by Magpie.

It validates recognized media representations and rejects known unsupported audio paths. It is not a malware scanner, Base64 decoder, MIME-content detector, semantic verifier or authorization layer.

Magpie's middleware runtime has a hook time limit and fails open on unhandled errors/timeouts. The plugin cannot enforce a stronger runtime guarantee. Test representative payload sizes and protocols in your environment.

Only the current release is maintained; report reproducible issues against that release or the current main branch.
