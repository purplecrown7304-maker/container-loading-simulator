import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean; message: string };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : '알 수 없는 화면 오류가 발생했습니다.',
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[ContainerLoadingSimulator] render error', error, info.componentStack);
  }

  private reload = () => window.location.reload();

  private clearLocalData = () => {
    localStorage.removeItem('container-loading-simulator-v1');
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="fatal-error-shell" role="alert">
        <section className="fatal-error-card">
          <strong>화면을 정상적으로 표시하지 못했습니다.</strong>
          <p>{this.state.message}</p>
          <p className="muted">먼저 새로고침을 시도하고, 계속 문제가 생기면 저장된 브라우저 데이터를 초기화하세요.</p>
          <div className="fatal-error-actions">
            <button onClick={this.reload}>새로고침</button>
            <button className="danger" onClick={this.clearLocalData}>로컬 데이터 초기화</button>
          </div>
        </section>
      </main>
    );
  }
}
