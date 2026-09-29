import { describe, it, expect, beforeEach } from 'vitest';
import { parseRoute, buildRoutePath } from '../src/router.js';

describe('router.js', () => {
  describe('parseRoute', () => {
    it('defaults to home when hash is empty or missing', () => {
      expect(parseRoute('')).toEqual({ name: 'home', params: {}, path: '/' });
      expect(parseRoute(null)).toEqual({ name: 'home', params: {}, path: '/' });
      expect(parseRoute(undefined)).toEqual({ name: 'home', params: {}, path: '/' });
      expect(parseRoute('#/')).toEqual({ name: 'home', params: {}, path: '/' });
      expect(parseRoute('#')).toEqual({ name: 'home', params: {}, path: '/' });
    });

    it('correctly parses all registered routes', () => {
      const knownRoutes = [
        'about',
        'settings',
        'database',
        'textfile',
        'ffmpeg',
        'ejs',
        'dirwatcher',
        'http',
        'git',
        'ollama',
        'lmstudio',
        'api-keys',
        'models',
        'openrouter',
        'imagemagick',
      ];

      for (const routeName of knownRoutes) {
        expect(parseRoute(`#/${routeName}`)).toEqual({
          name: routeName,
          params: {},
          path: `/${routeName}`,
        });
        // Also verify without leading slash in hash
        expect(parseRoute(`#${routeName}`)).toEqual({
          name: routeName,
          params: {},
          path: `/${routeName}`,
        });
      }
    });

    it('returns not-found route for unknown paths', () => {
      const res = parseRoute('#/unknown-screen');
      expect(res).toEqual({
        name: 'not-found',
        params: { path: '/unknown-screen' },
        path: '/unknown-screen',
      });
    });
  });

  describe('buildRoutePath', () => {
    it('builds paths for known screen names', () => {
      expect(buildRoutePath('home')).toBe('/');
      expect(buildRoutePath('about')).toBe('/about');
      expect(buildRoutePath('git')).toBe('/git');
      expect(buildRoutePath('openrouter')).toBe('/openrouter');
      expect(buildRoutePath('ollama')).toBe('/ollama');
      expect(buildRoutePath('lmstudio')).toBe('/lmstudio');
      expect(buildRoutePath('api-keys')).toBe('/api-keys');
      expect(buildRoutePath('models')).toBe('/models');
      expect(buildRoutePath('imagemagick')).toBe('/imagemagick');
    });

    it('defaults to "/" for undefined or unknown routes', () => {
      expect(buildRoutePath()).toBe('/');
      expect(buildRoutePath('nonexistent-screen')).toBe('/');
    });
  });
});
