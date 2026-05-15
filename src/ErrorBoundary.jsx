import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: String(error?.message || 'Unexpected application error'),
    };
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#030712] text-white flex items-center justify-center p-6">
          <div className="max-w-lg w-full rounded-2xl border border-red-500/30 bg-[#111827] p-6">
            <h1 className="text-xl font-semibold text-red-300">Something went wrong</h1>
            <p className="text-sm text-gray-300 mt-3">{this.state.message}</p>
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

