import { hc } from 'hono/client'
// Import type from the API workspace built definitions
import type { AppType } from '../../../api/dist'

// Create the client
// We point to / as the base, Vite proxy handles /ingest -> localhost:3000/ingest
export const client = hc<AppType>('/')
