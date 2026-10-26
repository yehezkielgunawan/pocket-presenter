import { lazy, Suspense } from 'react';
import './App.css';

const HostPage = lazy(() => import('./features/host/HostPage'));
const RemotePage = lazy(() => import('./features/remote/RemotePage'));
const JoinPage = lazy(() => import('./features/remote/JoinPage'));
const App = () => {
  const path = window.location.pathname;
  return (
    <Suspense
      fallback={
        <main className="p-12 text-base-content/60">
          Opening Pocket Presenter…
        </main>
      }
    >
      {path === '/join' ? (
        <JoinPage />
      ) : path.startsWith('/remote/') ? (
        <RemotePage sessionId={path.split('/')[2]} />
      ) : path === '/' ? (
        <HostPage />
      ) : (
        <main className="p-12">
          <h1>Page not found</h1>
          <a className="btn mt-4" href="/">
            Back to home
          </a>
        </main>
      )}
    </Suspense>
  );
};

export default App;
