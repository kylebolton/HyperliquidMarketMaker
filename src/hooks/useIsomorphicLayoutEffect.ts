import { useEffect, useLayoutEffect } from 'react';

/**
 * Hook that uses useLayoutEffect on the client and useEffect on the server
 * to avoid hydration mismatches while maintaining proper timing for DOM operations.
 * 
 * This is particularly important for wallet components that need to interact
 * with browser-specific APIs like window.ethereum while maintaining SSR compatibility.
 */
export const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;