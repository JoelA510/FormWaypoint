import { Route as rootRoute } from './routes/__root'
import { indexRoute } from './routes/index'

const routeTree = rootRoute.addChildren([indexRoute])

export { routeTree }
