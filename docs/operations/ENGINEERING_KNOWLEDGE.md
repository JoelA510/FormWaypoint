# Engineering Knowledge

## Critical Rules

- **Configuration**: Always use `require('../config')` (relative to service) or absolute path alias when importing config in backend services. Do not assume `../../config`.
- **API Structure**: Use Modular Services pattern in `apps/web/src/services/modules/*`. Do not add new methods to `api.js` directly.
- **Testing**: `sanity.test.js` mocks are sensitive to import depth.

## Known Issues

- **Socket Tests**: `socket_integration.test.js` fails in CI/local due to mock resolution issues. (Tracked in DEBT_REPORT).
