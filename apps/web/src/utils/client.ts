import { hc } from 'hono/client'
import type { AppType } from '../../../apps/api/src/index' // In monorepo, we might need a better path or types package export

// Best practice: Export AppType from a shared package OR import via relative path if workspaces configured
// Since 'apps/web' consumes 'apps/api' types via workspace, we should import from 'apps/api' or define it.
// Ideally, apps/api/package.json exports types.
// For now, using relative path assuming monorepo structure availability.
// BUT: 'apps/api' is not built yet in a way traversing imports works easily in Vite without proper config.
// The user requirement said: "Frontend must import this type to construct the hc".

// If tsconfig 'paths' are set, we might use '@api/...'
// We'll trust relative import or assume 'api' workspace is visible.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export const client = hc<AppType>(API_URL)
