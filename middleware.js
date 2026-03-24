export default function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // /blog/:slug → serve /blog/article.html (but not /blog/ or /blog/index)
  if (path.startsWith('/blog/') && path !== '/blog/' && !path.endsWith('.html') && !path.includes('.')) {
    const newUrl = new URL('/blog/article.html', request.url);
    newUrl.search = url.search;
    return fetch(newUrl);
  }
}

export const config = {
  matcher: '/blog/:path*',
};
