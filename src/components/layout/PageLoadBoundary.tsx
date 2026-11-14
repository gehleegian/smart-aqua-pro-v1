import { Component, type ReactNode } from 'react';
import Button from '../ui/Button';

type State = { failed: boolean };

/**
 * Pages are code-split (Layout.tsx). If a page's chunk cannot be downloaded,
 * for example on a weak mobile connection or after a new deployment replaced
 * the old chunk files, show a recoverable message instead of unmounting the
 * whole app. Layout keys this boundary by page, so navigating away resets it.
 */
export default class PageLoadBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Page failed to load.', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="space-y-3 rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
        <p>This page could not be loaded. Check your connection, then reload.</p>
        {/* A rejected lazy import is cached by React, so only a reload retries it. */}
        <Button variant="secondary" onClick={() => window.location.reload()}>Reload</Button>
      </div>
    );
  }
}
