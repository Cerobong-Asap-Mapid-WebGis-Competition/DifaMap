'use client';

import { useState, useEffect } from 'react';

/**
 * Custom hook untuk mendeteksi apakah layar berukuran mobile (default <= 768px).
 * Sangat berguna untuk menyesuaikan layout responsif, bottom sheet, dan bilah navigasi bawah.
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= breakpoint);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [breakpoint]);

  return isMobile;
}

/**
 * Custom hook untuk mendeteksi perangkat tablet (769px - 1024px).
 */
export function useIsTablet(minWidth = 769, maxWidth = 1024): boolean {
  const [isTablet, setIsTablet] = useState<boolean>(false);

  useEffect(() => {
    const checkTablet = () => {
      setIsTablet(window.innerWidth >= minWidth && window.innerWidth <= maxWidth);
    };

    checkTablet();
    window.addEventListener('resize', checkTablet);
    return () => window.removeEventListener('resize', checkTablet);
  }, [minWidth, maxWidth]);

  return isTablet;
}
