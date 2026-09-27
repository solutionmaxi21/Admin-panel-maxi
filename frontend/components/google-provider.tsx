"use client";

import { GoogleOAuthProvider } from "@react-oauth/google";

export const GoogleProvider = ({ children }: { children: React.ReactNode }) => {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

  if (!clientId) {
    console.error("Google Client ID is missing from environment variables");
  }

  return (
    <GoogleOAuthProvider clientId={clientId}>
      {children}
    </GoogleOAuthProvider>
  );
};