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

  if (segments[0] === 'textfile') {
    return { name: 'textfile', params: {}, path: '/textfile' };
  }

  if (segments[0] === 'ffmpeg') {
    return { name: 'ffmpeg', params: {}, path: '/ffmpeg' };
  }

  if (segments[0] === 'ejs') {
    return { name: 'ejs', params: {}, path: '/ejs' };
  }

  if (segments[0] === 'dirwatcher') {
    return { name: 'dirwatcher', params: {}, path: '/dirwatcher' };
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
  if (name === 'textfile') {
    return '/textfile';
  }
  if (name === 'ffmpeg') {
    return '/ffmpeg';
  }
  if (name === 'ejs') {
    return '/ejs';
  }
  if (name === 'dirwatcher') {
    return '/dirwatcher';
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
