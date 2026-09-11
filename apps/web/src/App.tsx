import { AppShell } from '@/components/layout/AppShell';
import { ToastProvider } from '@/components/ui/toaster';
import { useLibraryState } from '@/state';

export default function App() {
  const { status } = useLibraryState();

  if (status.state === 'loading') {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Opening your library…
      </div>
    );
  }

  if (status.state === 'error') {
    return (
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-lg font-semibold">OpenCite cannot start</h1>
        <p className="text-sm text-muted-foreground">{status.message}</p>
      </div>
    );
  }

  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
