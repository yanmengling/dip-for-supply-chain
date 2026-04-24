import { useState, useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * Custom hook to dynamically calculate header height
 * 
 * @param headerRef - React ref to the header element
 * @returns Calculated header height in pixels
 */
export const useHeaderHeight = <T extends HTMLElement = HTMLElement>(headerRef: RefObject<T | null>): number => {
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    const calculateHeight = () => {
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.offsetHeight);
      }
    };

    // Calculate initially
    calculateHeight();

    // Recalculate on window resize
    window.addEventListener('resize', calculateHeight);

    // Cleanup
    return () => {
      window.removeEventListener('resize', calculateHeight);
    };
  }, [headerRef]);

  return headerHeight;
};

