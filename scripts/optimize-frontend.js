const fs = require('fs');
const path = require('path');

/**
 * Frontend Optimization Script
 * Generates optimized configurations and components for the Next.js frontend
 */

const FRONTEND_PATH = path.join(__dirname, '../../beige-web-v2');
const OPTIMIZATION_OUTPUT = path.join(__dirname, '../frontend-optimizations');

// Create optimization output directory
if (!fs.existsSync(OPTIMIZATION_OUTPUT)) {
  fs.mkdirSync(OPTIMIZATION_OUTPUT, { recursive: true });
}

/**
 * Generate optimized Next.js configuration
 */
function generateNextConfig() {
  const nextConfig = `const nextConfig = {
  // Core Performance Optimizations
  reactStrictMode: true,
  swcMinify: true,
  poweredByHeader: false,

  // Bundle Analysis
  bundleAnalyzer: {
    enabled: process.env.ANALYZE === 'true',
  },

  // Image Optimization
  images: {
    domains: ['your-cdn-domain.com', 'images.unsplash.com'],
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    dangerouslyAllowSVG: false,
    unoptimized: false,
  },

  // Code Splitting and Bundle Optimization
  experimental: {
    optimizeCss: true,
    esmExternals: true,
    scrollRestoration: true,
    largePageDataBytes: 128 * 1000, // 128KB
  },

  // Webpack Optimizations
  webpack: (config, { dev, isServer }) => {
    // Production optimizations
    if (!dev) {
      // Tree shaking optimization
      config.optimization.usedExports = true;

      // Split chunks optimization
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          default: {
            minChunks: 2,
            priority: -20,
            reuseExistingChunk: true,
          },
          vendor: {
            test: /[\\\\/]node_modules[\\\\/]/,
            name: 'vendors',
            priority: -10,
            chunks: 'all',
          },
          // UI Library chunks
          mui: {
            test: /[\\\\/]node_modules[\\\\/]@mui[\\\\/]/,
            name: 'mui',
            priority: 10,
            chunks: 'all',
          },
          mantine: {
            test: /[\\\\/]node_modules[\\\\/]@mantine[\\\\/]/,
            name: 'mantine',
            priority: 10,
            chunks: 'all',
          },
          // Chart libraries
          charts: {
            test: /[\\\\/]node_modules[\\\\/](chart\\.js|react-chartjs-2|apexcharts|react-apexcharts)[\\\\/]/,
            name: 'charts',
            priority: 15,
            chunks: 'all',
          },
          // Redux
          redux: {
            test: /[\\\\/]node_modules[\\\\/](@reduxjs|react-redux|redux)[\\\\/]/,
            name: 'redux',
            priority: 15,
            chunks: 'all',
          }
        },
      };

      // Minimize bundle size
      config.optimization.minimize = true;
    }

    return config;
  },

  // Headers for Performance
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          }
        ]
      },
      {
        source: '/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
          }
        ]
      }
    ];
  },

  // Compression
  compress: true,

  // Performance budgets
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },

  // ESLint during build
  eslint: {
    ignoreDuringBuilds: false,
  },

  // TypeScript during build
  typescript: {
    ignoreBuildErrors: false,
  },
};

module.exports = nextConfig;`;

  fs.writeFileSync(
    path.join(OPTIMIZATION_OUTPUT, 'next.config.js'),
    nextConfig
  );

  console.log('✅ Generated optimized Next.js configuration');
}

/**
 * Generate code splitting components
 */
function generateCodeSplittingComponents() {
  // Lazy loading wrapper component
  const lazyWrapper = `import React, { Suspense } from 'react';
import { Skeleton, Box, CircularProgress } from '@mui/material';

interface LazyWrapperProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  height?: string | number;
  variant?: 'skeleton' | 'spinner' | 'custom';
}

const LazyWrapper: React.FC<LazyWrapperProps> = ({
  children,
  fallback,
  height = 200,
  variant = 'skeleton'
}) => {
  const getDefaultFallback = () => {
    switch (variant) {
      case 'spinner':
        return (
          <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            height={height}
          >
            <CircularProgress />
          </Box>
        );
      case 'skeleton':
        return (
          <Box p={2}>
            <Skeleton variant="rectangular" height={height} />
          </Box>
        );
      default:
        return (
          <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            height={height}
          >
            Loading...
          </Box>
        );
    }
  };

  return (
    <Suspense fallback={fallback || getDefaultFallback()}>
      {children}
    </Suspense>
  );
};

export default LazyWrapper;`;

  // Optimized booking components with lazy loading
  const optimizedBookingComponents = `import { lazy } from 'react';
import LazyWrapper from './LazyWrapper';

// Lazy load heavy booking components
export const BookingModal = lazy(() =>
  import('../components/booking/BookingModal').then(module => ({
    default: module.BookingModal
  }))
);

export const BookingDashboard = lazy(() =>
  import('../components/dashboard/BookingDashboard').then(module => ({
    default: module.BookingDashboard
  }))
);

export const PaymentForm = lazy(() =>
  import('../components/payment/PaymentForm').then(module => ({
    default: module.PaymentForm
  }))
);

export const OrderTracking = lazy(() =>
  import('../components/orders/OrderTracking').then(module => ({
    default: module.OrderTracking
  }))
);

export const BookingCalendar = lazy(() =>
  import('../components/booking/BookingCalendar').then(module => ({
    default: module.BookingCalendar
  }))
);

export const AnalyticsDashboard = lazy(() =>
  import('../components/analytics/AnalyticsDashboard').then(module => ({
    default: module.AnalyticsDashboard
  }))
);

// HOC for wrapping lazy components
export const withLazyLoading = (Component: React.ComponentType, fallbackHeight?: number) => {
  return (props: any) => (
    <LazyWrapper height={fallbackHeight}>
      <Component {...props} />
    </LazyWrapper>
  );
};

// Pre-configured lazy components with appropriate fallbacks
export const LazyBookingModal = withLazyLoading(BookingModal, 400);
export const LazyBookingDashboard = withLazyLoading(BookingDashboard, 600);
export const LazyPaymentForm = withLazyLoading(PaymentForm, 300);
export const LazyOrderTracking = withLazyLoading(OrderTracking, 200);
export const LazyBookingCalendar = withLazyLoading(BookingCalendar, 500);
export const LazyAnalyticsDashboard = withLazyLoading(AnalyticsDashboard, 400);`;

  // Performance monitoring hook
  const performanceHook = `import { useEffect, useRef } from 'react';

interface PerformanceMetrics {
  renderTime: number;
  componentName: string;
  timestamp: number;
}

export const usePerformanceMonitoring = (componentName: string) => {
  const renderStartTime = useRef<number>(Date.now());
  const isFirstRender = useRef<boolean>(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const renderTime = Date.now() - renderStartTime.current;

    // Log performance metrics
    if (process.env.NODE_ENV === 'development') {
      console.log(\`🔍 \${componentName} render time: \${renderTime}ms\`);
    }

    // Send metrics to analytics in production
    if (process.env.NODE_ENV === 'production' && renderTime > 100) {
      // Track slow renders
      window.gtag?.('event', 'slow_component_render', {
        component_name: componentName,
        render_time: renderTime,
        custom_map: {
          metric1: renderTime
        }
      });
    }
  });

  useEffect(() => {
    renderStartTime.current = Date.now();
  });

  return {
    renderTime: Date.now() - renderStartTime.current
  };
};

// Hook for measuring page load performance
export const usePagePerformance = (pageName: string) => {
  useEffect(() => {
    // Measure Core Web Vitals
    if (typeof window !== 'undefined' && 'web-vital' in window) {
      import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
        getCLS(console.log);
        getFID(console.log);
        getFCP(console.log);
        getLCP(console.log);
        getTTFB(console.log);
      });
    }

    // Track page load timing
    const handleLoad = () => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

      const metrics = {
        page: pageName,
        loadTime: navigation.loadEventEnd - navigation.loadEventStart,
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        firstByte: navigation.responseStart - navigation.requestStart,
        totalTime: navigation.loadEventEnd - navigation.fetchStart
      };

      console.log('📊 Page Performance Metrics:', metrics);

      // Send to analytics
      if (process.env.NODE_ENV === 'production') {
        window.gtag?.('event', 'page_load_performance', {
          page_name: pageName,
          load_time: metrics.loadTime,
          total_time: metrics.totalTime
        });
      }
    };

    if (document.readyState === 'complete') {
      handleLoad();
    } else {
      window.addEventListener('load', handleLoad);
      return () => window.removeEventListener('load', handleLoad);
    }
  }, [pageName]);
};`;

  // Bundle analyzer helper
  const bundleAnalyzer = `// Bundle analysis utility
export const analyzeBundleSize = () => {
  if (process.env.NODE_ENV === 'development') {
    console.log('📦 Bundle Analysis:');
    console.log('Run "ANALYZE=true npm run build" to analyze bundle size');
  }
};

// Runtime bundle size monitoring
export const monitorBundleLoading = () => {
  if (typeof window !== 'undefined' && 'performance' in window) {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'resource' && entry.name.includes('/_next/static/chunks/')) {
          console.log(\`📦 Chunk loaded: \${entry.name.split('/').pop()} (\${Math.round(entry.transferSize / 1024)}KB)\`);
        }
      }
    });

    observer.observe({ entryTypes: ['resource'] });

    return () => observer.disconnect();
  }
};

// Preload critical resources
export const preloadCriticalResources = () => {
  const criticalResources = [
    '/_next/static/chunks/framework.js',
    '/_next/static/chunks/main.js',
    '/_next/static/chunks/webpack.js'
  ];

  criticalResources.forEach(resource => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = resource;
    link.as = 'script';
    document.head.appendChild(link);
  });
};`;

  // Write optimization files
  fs.writeFileSync(
    path.join(OPTIMIZATION_OUTPUT, 'LazyWrapper.tsx'),
    lazyWrapper
  );

  fs.writeFileSync(
    path.join(OPTIMIZATION_OUTPUT, 'OptimizedComponents.tsx'),
    optimizedBookingComponents
  );

  fs.writeFileSync(
    path.join(OPTIMIZATION_OUTPUT, 'usePerformance.ts'),
    performanceHook
  );

  fs.writeFileSync(
    path.join(OPTIMIZATION_OUTPUT, 'bundleUtils.ts'),
    bundleAnalyzer
  );

  console.log('✅ Generated code splitting components');
}

/**
 * Generate webpack optimization plugins
 */
function generateWebpackOptimizations() {
  const webpackConfig = `// Advanced webpack optimizations for production
const path = require('path');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

const webpackOptimizations = {
  // Module resolution optimizations
  resolve: {
    modules: ['node_modules'],
    extensions: ['.tsx', '.ts', '.js', '.jsx', '.json'],
    alias: {
      // Optimize commonly used imports
      '@': path.resolve(__dirname, 'src'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@hooks': path.resolve(__dirname, 'src/hooks'),
      '@redux': path.resolve(__dirname, 'src/redux'),
      '@types': path.resolve(__dirname, 'src/types'),
    },
  },

  // Cache optimization
  cache: {
    type: 'filesystem',
    buildDependencies: {
      config: [__filename],
    },
  },

  // Plugin optimizations
  plugins: [
    // Bundle analyzer (conditional)
    ...(process.env.ANALYZE === 'true' ? [
      new BundleAnalyzerPlugin({
        analyzerMode: 'static',
        openAnalyzer: false,
        reportFilename: 'bundle-analysis.html',
      })
    ] : []),
  ],

  // Optimization configuration
  optimization: {
    moduleIds: 'deterministic',
    runtimeChunk: {
      name: 'runtime',
    },
    splitChunks: {
      chunks: 'all',
      minSize: 20000,
      maxSize: 244000,
      cacheGroups: {
        framework: {
          chunks: 'all',
          name: 'framework',
          test: /(?<!node_modules.*)[\\\\/]node_modules[\\\\/](react|react-dom|scheduler|prop-types|use-subscription)[\\\\/]/,
          priority: 40,
          enforce: true,
        },
        lib: {
          test(module) {
            return (
              module.size() > 160000 &&
              /node_modules[/\\\\]/.test(module.identifier())
            );
          },
          name(module) {
            const hash = crypto.createHash('sha1');
            hash.update(module.libIdent ? module.libIdent({ context: '/' }) : module.identifier());
            return hash.digest('hex').substring(0, 8);
          },
          priority: 30,
          minChunks: 1,
          reuseExistingChunk: true,
        },
        commons: {
          name: 'commons',
          minChunks: 2,
          priority: 20,
        },
        shared: {
          name(module, chunks) {
            return (\`shared.\${crypto
              .createHash('sha1')
              .update(chunks.reduce((acc, chunk) => acc + chunk.name, ''))
              .digest('hex')
              .substring(0, 8)}\`);
          },
          priority: 10,
          minChunks: 2,
          reuseExistingChunk: true,
        },
      },
      maxInitialRequests: 25,
      maxAsyncRequests: 25,
    },
  },

  // Performance hints
  performance: {
    maxAssetSize: 250000,
    maxEntrypointSize: 250000,
    hints: process.env.NODE_ENV === 'production' ? 'warning' : false,
  },
};

module.exports = webpackOptimizations;`;

  fs.writeFileSync(
    path.join(OPTIMIZATION_OUTPUT, 'webpack.optimizations.js'),
    webpackConfig
  );

  console.log('✅ Generated webpack optimizations');
}

/**
 * Generate performance monitoring utilities
 */
function generatePerformanceMonitoring() {
  const performanceService = `// Frontend performance monitoring service
class PerformanceMonitoringService {
  private metrics: Map<string, number[]> = new Map();

  // Track component render times
  trackComponentRender(componentName: string, renderTime: number) {
    if (!this.metrics.has(componentName)) {
      this.metrics.set(componentName, []);
    }

    this.metrics.get(componentName)!.push(renderTime);

    // Keep only last 100 measurements
    const measurements = this.metrics.get(componentName)!;
    if (measurements.length > 100) {
      measurements.shift();
    }

    // Alert on slow renders
    if (renderTime > 100) {
      console.warn(\`⚠️ Slow render detected: \${componentName} took \${renderTime}ms\`);
    }
  }

  // Get performance statistics
  getComponentStats(componentName: string) {
    const measurements = this.metrics.get(componentName) || [];

    if (measurements.length === 0) {
      return null;
    }

    const sorted = [...measurements].sort((a, b) => a - b);
    const avg = measurements.reduce((sum, time) => sum + time, 0) / measurements.length;
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];

    return {
      component: componentName,
      samples: measurements.length,
      average: Math.round(avg),
      p50: Math.round(p50),
      p95: Math.round(p95),
      p99: Math.round(p99),
      min: Math.round(Math.min(...measurements)),
      max: Math.round(Math.max(...measurements))
    };
  }

  // Generate performance report
  generateReport() {
    console.log('📊 FRONTEND PERFORMANCE REPORT');
    console.log('=' .repeat(50));

    this.metrics.forEach((_, componentName) => {
      const stats = this.getComponentStats(componentName);
      if (stats) {
        console.log(\`\${componentName}:\`);
        console.log(\`  Samples: \${stats.samples}\`);
        console.log(\`  Average: \${stats.average}ms\`);
        console.log(\`  P95: \${stats.p95}ms\`);
        console.log(\`  Range: \${stats.min}ms - \${stats.max}ms\`);
        console.log('');
      }
    });
  }

  // Monitor Core Web Vitals
  async monitorCoreWebVitals() {
    if (typeof window === 'undefined') return;

    try {
      const { getCLS, getFID, getFCP, getLCP, getTTFB } = await import('web-vitals');

      getCLS((metric) => {
        console.log('CLS:', metric.value);
        this.sendMetricToAnalytics('CLS', metric.value);
      });

      getFID((metric) => {
        console.log('FID:', metric.value);
        this.sendMetricToAnalytics('FID', metric.value);
      });

      getFCP((metric) => {
        console.log('FCP:', metric.value);
        this.sendMetricToAnalytics('FCP', metric.value);
      });

      getLCP((metric) => {
        console.log('LCP:', metric.value);
        this.sendMetricToAnalytics('LCP', metric.value);
      });

      getTTFB((metric) => {
        console.log('TTFB:', metric.value);
        this.sendMetricToAnalytics('TTFB', metric.value);
      });
    } catch (error) {
      console.error('Error loading web-vitals:', error);
    }
  }

  // Send metrics to analytics
  private sendMetricToAnalytics(metricName: string, value: number) {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'web_vital', {
        metric_name: metricName,
        metric_value: Math.round(value),
        custom_map: {
          metric1: value
        }
      });
    }
  }

  // Monitor JavaScript errors
  monitorErrors() {
    window.addEventListener('error', (event) => {
      console.error('JavaScript Error:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
      });

      // Send to error tracking service
      this.sendErrorToTracking({
        type: 'javascript',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        stack: event.error?.stack
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled Promise Rejection:', event.reason);

      this.sendErrorToTracking({
        type: 'promise_rejection',
        message: event.reason?.message || 'Unhandled promise rejection',
        stack: event.reason?.stack
      });
    });
  }

  private sendErrorToTracking(error: any) {
    // Implement error tracking service integration (Sentry, etc.)
    if (process.env.NODE_ENV === 'production') {
      // window.Sentry?.captureException(error);
    }
  }

  // Monitor network performance
  monitorNetworkPerformance() {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
      return;
    }

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'resource') {
          const resourceEntry = entry as PerformanceResourceTiming;

          // Monitor API calls
          if (resourceEntry.name.includes('/api/')) {
            const duration = resourceEntry.responseEnd - resourceEntry.requestStart;
            console.log(\`🌐 API Call: \${resourceEntry.name} - \${Math.round(duration)}ms\`);

            if (duration > 2000) {
              console.warn(\`⚠️ Slow API call: \${resourceEntry.name} took \${Math.round(duration)}ms\`);
            }
          }
        }
      }
    });

    observer.observe({ entryTypes: ['resource'] });
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitoringService();

// Auto-initialize in browser
if (typeof window !== 'undefined') {
  performanceMonitor.monitorCoreWebVitals();
  performanceMonitor.monitorErrors();
  performanceMonitor.monitorNetworkPerformance();
}`;

  fs.writeFileSync(
    path.join(OPTIMIZATION_OUTPUT, 'performanceMonitor.ts'),
    performanceService
  );

  console.log('✅ Generated performance monitoring utilities');
}

/**
 * Generate optimization documentation
 */
function generateOptimizationDocs() {
  const optimizationGuide = `# Frontend Optimization Implementation Guide

## Overview
This guide contains production-ready optimizations for the Beige booking system frontend built with Next.js.

## Performance Targets
- First Contentful Paint (FCP): < 1.5s
- Largest Contentful Paint (LCP): < 2.5s
- First Input Delay (FID): < 100ms
- Cumulative Layout Shift (CLS): < 0.1
- Bundle size: < 500KB (initial load)

## Implementation Steps

### 1. Next.js Configuration
Replace your \`next.config.js\` with the optimized version:
\`\`\`bash
cp frontend-optimizations/next.config.js ../beige-web-v2/next.config.js
\`\`\`

### 2. Code Splitting Components
Implement lazy loading for heavy components:
\`\`\`bash
cp frontend-optimizations/LazyWrapper.tsx ../beige-web-v2/src/components/
cp frontend-optimizations/OptimizedComponents.tsx ../beige-web-v2/src/components/
\`\`\`

### 3. Performance Monitoring
Add performance hooks to your components:
\`\`\`bash
cp frontend-optimizations/usePerformance.ts ../beige-web-v2/src/hooks/
cp frontend-optimizations/performanceMonitor.ts ../beige-web-v2/src/utils/
\`\`\`

### 4. Bundle Analysis
Install bundle analyzer:
\`\`\`bash
npm install --save-dev @next/bundle-analyzer
\`\`\`

Run bundle analysis:
\`\`\`bash
ANALYZE=true npm run build
\`\`\`

## Component Optimization Examples

### Before (Heavy Component)
\`\`\`tsx
import BookingModal from '../components/BookingModal';

export default function HomePage() {
  return (
    <div>
      <BookingModal />
    </div>
  );
}
\`\`\`

### After (Optimized with Lazy Loading)
\`\`\`tsx
import { LazyBookingModal } from '../components/OptimizedComponents';

export default function HomePage() {
  return (
    <div>
      <LazyBookingModal />
    </div>
  );
}
\`\`\`

## Performance Monitoring Usage

### Component Performance Tracking
\`\`\`tsx
import { usePerformanceMonitoring } from '../hooks/usePerformance';

export default function BookingDashboard() {
  usePerformanceMonitoring('BookingDashboard');

  return (
    <div>
      {/* Your component content */}
    </div>
  );
}
\`\`\`

### Page Performance Tracking
\`\`\`tsx
import { usePagePerformance } from '../hooks/usePerformance';

export default function Dashboard() {
  usePagePerformance('dashboard');

  return (
    <div>
      {/* Your page content */}
    </div>
  );
}
\`\`\`

## Image Optimization

### Before
\`\`\`tsx
<img src="/booking-hero.jpg" alt="Hero" />
\`\`\`

### After
\`\`\`tsx
import Image from 'next/image';

<Image
  src="/booking-hero.jpg"
  alt="Hero"
  width={800}
  height={600}
  priority
  placeholder="blur"
  blurDataURL="data:image/jpeg;base64,..."
/>
\`\`\`

## Font Optimization

Add to \`_document.tsx\`:
\`\`\`tsx
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html>
      <Head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          as="style"
          onLoad="this.onload=null;this.rel='stylesheet'"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
\`\`\`

## CSS Optimization

### Critical CSS Inlining
Add to \`_app.tsx\`:
\`\`\`tsx
import { useEffect } from 'react';

export default function App({ Component, pageProps }) {
  useEffect(() => {
    // Remove unused CSS
    const criticalCss = document.getElementById('critical-css');
    if (criticalCss) {
      criticalCss.remove();
    }
  }, []);

  return <Component {...pageProps} />;
}
\`\`\`

## Production Deployment Checklist

### Pre-deployment
- [ ] Run \`ANALYZE=true npm run build\` to check bundle sizes
- [ ] Verify all lazy components load correctly
- [ ] Test performance on slow 3G network
- [ ] Run Lighthouse audit (score > 90)
- [ ] Check Core Web Vitals in PageSpeed Insights

### Environment Variables
\`\`\`env
# Production
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
\`\`\`

### CDN Configuration
- Enable gzip/brotli compression
- Set proper cache headers for static assets
- Configure image optimization service
- Enable HTTP/2

## Monitoring in Production

### Core Web Vitals Tracking
\`\`\`tsx
import { performanceMonitor } from '../utils/performanceMonitor';

// In your _app.tsx
useEffect(() => {
  performanceMonitor.monitorCoreWebVitals();
}, []);
\`\`\`

### Performance Budgets
Set up performance budgets in CI/CD:
\`\`\`json
{
  "budgets": [
    {
      "type": "initial",
      "maximumWarning": "500kb",
      "maximumError": "1mb"
    },
    {
      "type": "anyComponentStyle",
      "maximumWarning": "2kb",
      "maximumError": "4kb"
    }
  ]
}
\`\`\`

## Expected Performance Improvements

### Bundle Size Reduction
- Initial bundle: 40-60% smaller
- Lazy-loaded components: 70-80% reduction in initial load
- Better caching with chunk splitting

### Runtime Performance
- Faster page navigation with route prefetching
- Reduced memory usage with component lazy loading
- Better Core Web Vitals scores

### User Experience
- Faster perceived loading with progressive enhancement
- Better mobile performance
- Improved SEO scores

## Troubleshooting

### Common Issues
1. **Hydration Errors**: Ensure SSR/CSR consistency
2. **Flash of Unstyled Content**: Proper CSS-in-JS setup
3. **Slow Initial Load**: Check for unnecessary imports in pages
4. **Large Bundle Size**: Review dependencies and implement tree shaking

### Debug Commands
\`\`\`bash
# Analyze bundle
ANALYZE=true npm run build

# Check for duplicate dependencies
npx next-bundle-analyzer

# Performance audit
npm run lighthouse

# Check unused dependencies
npx depcheck
\`\`\`
`;

  fs.writeFileSync(
    path.join(OPTIMIZATION_OUTPUT, 'OPTIMIZATION_GUIDE.md'),
    optimizationGuide
  );

  console.log('✅ Generated optimization documentation');
}

/**
 * Main optimization script runner
 */
function main() {
  console.log('🚀 Generating frontend optimizations...\n');

  try {
    generateNextConfig();
    generateCodeSplittingComponents();
    generateWebpackOptimizations();
    generatePerformanceMonitoring();
    generateOptimizationDocs();

    console.log('\n🎉 Frontend optimization files generated successfully!');
    console.log(`📁 Files created in: ${OPTIMIZATION_OUTPUT}`);
    console.log('\n📖 Next steps:');
    console.log('1. Review the generated files');
    console.log('2. Follow the implementation guide');
    console.log('3. Run bundle analysis to verify improvements');
    console.log('4. Test performance on various devices');

  } catch (error) {
    console.error('❌ Error generating optimizations:', error);
    process.exit(1);
  }
}

// Run optimization generator if called directly
if (require.main === module) {
  main();
}

module.exports = {
  generateNextConfig,
  generateCodeSplittingComponents,
  generateWebpackOptimizations,
  generatePerformanceMonitoring,
  generateOptimizationDocs
};