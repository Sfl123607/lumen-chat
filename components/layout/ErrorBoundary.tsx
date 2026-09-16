"use client";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { error: Error | null }

/** Catches render errors in a subtree so one broken message can't take down the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("[ui]", error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      this.props.fallback ?? (
        <div role="alert" className="m-4 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          <p className="font-medium">This part of the page failed to render.</p>
          <button type="button" className="mt-2 underline" onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      )
    );
  }
}
