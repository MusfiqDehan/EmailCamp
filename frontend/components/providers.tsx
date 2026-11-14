'use client';

import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from 'sonner';
import { ThemeProvider, useTheme } from 'next-themes';

function ThemedSonnerToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <SonnerToaster
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      richColors
      closeButton
      position="top-right"
    />
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider 
      attribute="class" 
      defaultTheme="system" 
      enableSystem 
      disableTransitionOnChange={false}
    >
      <AuthProvider>
        {children}
        <Toaster />
        <ThemedSonnerToaster />
      </AuthProvider>
    </ThemeProvider>
  );
}

