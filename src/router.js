const { useState, useEffect } = window.preactHooks;

export function parseRoute(hash = '') {
  const cleanedHash = String(hash || '').replace(/^#/, '').trim();
  const normalizedPath = cleanedHash.startsWith('/') ? cleanedHash : `/${cleanedHash}`;
  const segments = normalizedPath.split('/').filter(Boolean);

  if (segments.length === 0) {
    return { name: 'home', params: {}, path: '/' };
  }

  if (segments[0] === 'about') {
    return { name: 'about', params: {}, path: '/about' };
  }

  if (segments[0] === 'settings') {
    return { name: 'settings', params: {}, path: '/settings' };
  }

  if (segments[0] === 'database') {
    return { name: 'database', params: {}, path: '/database' };
  }

  return { name: 'not-found', params: { path: normalizedPath }, path: normalizedPath };
}

export function buildRoutePath(name = 'home', params = {}) {
  if (name === 'about') {
    return '/about';
  }
  if (name === 'settings') {
    return '/settings';
  }
  if (name === 'database') {
    return '/database';
  }
  return '/';
}

export function useHashRoute() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));

  useEffect(() => {
    const syncRoute = () => setRoute(parseRoute(window.location.hash));
    const handleHashChange = () => syncRoute();

    window.addEventListener('hashchange', handleHashChange);

    if (!window.location.hash) {
      window.location.hash = '/';
    } else {
      syncRoute();
    }

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (name, params = {}) => {
    window.location.hash = buildRoutePath(name, params);
  };

  return [route, navigate];
}
