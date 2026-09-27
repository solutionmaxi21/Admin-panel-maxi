'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // ✅ SECURITY: Only log error digest in production (hides sensitive stack traces)
    if (process.env.NODE_ENV === 'production') {
      console.error('Error digest:', error.digest);
    } else {
      console.error('Error:', error);
    }
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-bold text-foreground">
          Something went wrong!
        </h2>
        <p className="text-muted-foreground">
          We encountered an unexpected error. Please try again.
        </p>
        <Button 
          onClick={() => reset()}
          className="mt-4"
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
