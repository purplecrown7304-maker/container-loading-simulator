# Local picomatch security maintenance

This private package vendors the runtime files of MIT-licensed `picomatch@4.0.7`.
The original license and README are retained. `package.json.upstream` records the
exact npm tarball and its integrity. This is a local fork, not an upstream release.

The sole runtime change is in `lib/parse.js`, for
[GHSA-fc5q-39xc-vjpf / CVE-2026-112366](https://github.com/advisories/GHSA-fc5q-39xc-vjpf).
At the time of this patch no official fixed release is available. Single-branch
repeated extglobs containing ordinary `*` wildcards can generate nested unbounded
regex quantifiers. Patterns such as `+(*a)` and `*(a*)`, including wildcard suffixes
and malformed character classes, now use the parser's existing escaped-literal
fallback. They no longer compile to those unsafe wildcard regexes.

The check uses parsed tokens so quoted/escaped stars and closed character classes
retain their literal meanings. Existing flat character-class rewrites remain in
use; their unbounded repetition is tracked if nested again. This guard is applied
even when `maxExtglobRecursion` is disabled. Other existing parser behavior and
public entry points remain unchanged. This is not a general untrusted-regex sandbox.

Both npm and pnpm resolve every transitive `picomatch` import to this package.
There are no audit exclusions, install scripts, runtime dependencies or upstream
development dependencies. The private scoped name identifies the modified code;
the actual parser fix and regression tests, rather than package renaming, provide
the mitigation. `src/picomatchSecurity.test.ts` checks bounded child-process
execution, literal semantics, public entry points and development-tool globs.

Replace the local fork with an official fixed release after verifying the same
regressions and both package-manager installation paths. Do not remove the guard
or merely suppress this advisory.
