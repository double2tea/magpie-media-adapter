# Contributing

Use Node.js 22 or newer. This repository has no third-party dependencies.

```sh
npm run check
npm test
```

For a change to an encoder or profile, add a synthetic regression case that checks exact byte preservation and both request/provider hooks. Use non-throwing `ctx.reject` mocks: Magpie does not throw when rejecting, and `onProvider` cannot reject an individual candidate.

Keep request/provider options independent from credentials and local paths. Do not add real media, tokens, account configuration or live API calls to the tests. Model aliases and custom relays need explicit coverage before claiming support.

Describe which behavior was tested in Node and which was verified in a live Magpie gateway. A successful HTTP response alone is insufficient evidence of correct media understanding.

Use pull requests for changes. Contributions are licensed under Apache-2.0.
