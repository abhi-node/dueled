import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen bg-arena-900 flex items-center justify-center p-4">
          <div className="bg-arena-800 rounded-lg shadow-xl p-6 max-w-lg w-full">
            <h1 className="text-2xl font-bold text-red-500 mb-4">Something went wrong</h1>
            <p className="text-arena-300 mb-4">
              An error occurred while rendering this component.
            </p>
            <details className="bg-arena-700 rounded p-4">
              <summary className="cursor-pointer text-arena-200 font-semibold">
                Error Details
              </summary>
              <pre className="mt-2 text-xs text-arena-400 overflow-auto">
                {this.state.error?.toString()}
              </pre>
            </details>
            <button
              onClick={() => window.location.href = '/'}
              className="mt-4 btn-primary w-full"
            >
              Return to Home
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}