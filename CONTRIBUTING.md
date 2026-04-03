# Contributing to FairShareCoin Foundation

Thanks for helping improve FSC.

## Development setup
1. Install dependencies:
   - `npm install`
2. Build:
   - `npm run build`
3. Run tests:
   - `npm test`

## Branching and PR expectations
- Keep changes small and reviewable.
- Include tests for behavior changes.
- Update docs when APIs, security controls, or operational behavior changes.
- Reference the relevant phase/task (for example `P2-004.3`) in PR descriptions.

## Security-sensitive changes
For auth/session/transfer/rate-limit logic:
- Add or update negative tests.
- Include threat/abuse notes in PR text.
- Validate preflight scripts still pass.

## Commit quality
- Clear commit messages describing intent and outcome.
- Avoid bundling unrelated refactors.

## Code of conduct
By participating, you agree to follow `CODE_OF_CONDUCT.md`.
