import { Component, type ErrorInfo, type ReactNode } from "react"

import { Button } from "@/components/ui/button"

interface ErrorBoundaryState {
  failed: boolean
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("TOVA workspace failed", error, info.componentStack)
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="fatal-error">
          <strong>The TOVA workspace could not render.</strong>
          <p>Your local mission history remains saved. Reload to reconstruct it from events.</p>
          <Button onClick={() => window.location.reload()}>Reload workspace</Button>
        </main>
      )
    }
    return this.props.children
  }
}
