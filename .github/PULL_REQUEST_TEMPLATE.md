## Description

<!-- Provide a brief description of the changes in this PR -->

## Type of Change

<!-- Mark the relevant option with an 'x' -->

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)
- [ ] Performance improvement
- [ ] Dependency update / Security improvement
- [ ] Test addition/update

## Changes Made

<!-- List the changes made in this PR -->

-
-
-

## Related Issue

<!-- Link the issue this PR addresses, e.g. "Closes #123" -->

## Checklist

- [ ] I ran the quality gate locally: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`
- [ ] I ran `pnpm lint:css` if this PR touches CSS/SCSS
- [ ] I added or updated tests for the behaviour I changed
- [ ] I updated documentation (README, `docs/`, or inline comments) where needed
- [ ] If this changes the API contract, I updated every layer (schema + migration, services/routes, `types/domain.ts`, the matching `*Api.ts`, and the MSW handlers)
- [ ] Every commit is signed off (`git commit -s`) per the [DCO](https://developercertificate.org/)
