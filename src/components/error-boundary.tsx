import { Component, type ErrorInfo, type ReactNode } from 'react'
import { desktopBridge } from '../desktop'
import { exportDiagnostics, logError } from '../lib/error-log'
import { Button, Card, CardBody, CardHeader } from './ui'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  exported: string | null
  exportFailed: string | null
}

/**
 * What the person sees when rendering throws, instead of an empty window.
 *
 * Reconciliation, the draft and the dangerous goods assessment all run during render, on
 * whatever a document parsed into, so a thrown error there would otherwise unmount the whole
 * app and leave nothing on screen and nothing on record. The error is written to the local log
 * (`src/lib/error-log.ts`) and the person can start over or export the log.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, exported: null, exportFailed: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logError('render', Object.assign(new Error(error.message), { stack: `${error.stack ?? ''}${info.componentStack ?? ''}` }))
  }

  private exportLog = async () => {
    try {
      const delivery = await exportDiagnostics(desktopBridge())
      this.setState({ exported: delivery.path ?? delivery.fileName, exportFailed: null })
    } catch (e: unknown) {
      this.setState({ exportFailed: e instanceof Error ? e.message : String(e) })
    }
  }

  render(): ReactNode {
    const { error, exported, exportFailed } = this.state
    if (!error) return this.props.children
    return (
      <main className="mx-auto max-w-3xl px-5 py-10">
        <Card>
          <CardHeader
            title="Something went wrong"
            description="FormWaypoint stopped before it could finish this step. Nothing was filed."
          />
          <CardBody className="space-y-4 text-sm">
            <p role="alert" className="font-mono text-xs break-words">
              {error.message || 'An unknown error.'}
            </p>
            <p>
              Your exporter profile, item library and history are saved. The shipment on screen was not, so load
              the CIPL again after starting over. The error has been recorded on this machine; export it if you need
              help with it.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => this.setState({ error: null, exported: null, exportFailed: null })}>
                Start over
              </Button>
              <Button onClick={() => void this.exportLog()}>Export diagnostics</Button>
            </div>
            {exported ? <p role="status">Saved to {exported}</p> : null}
            {exportFailed ? <p role="alert">Could not export: {exportFailed}</p> : null}
          </CardBody>
        </Card>
      </main>
    )
  }
}
