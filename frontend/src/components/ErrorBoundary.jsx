import { Component } from 'react';
export default class ErrorBoundary extends Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error('[EB]', err, info); }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 16, fontFamily: 'monospace', color: 'red', background: '#fff' }}>
          <b>Child crashed:</b>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, marginTop: 8 }}>
            {String(this.state.err?.stack || this.state.err)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
