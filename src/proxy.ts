import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Refresh the session - this will also validate the JWT
  await supabase.auth.getUser();

  const { data: { user } } = await supabase.auth.getUser();

  const url = request.nextUrl.clone();

  // Protect /dashboard and all /(app) routes
  if (url.pathname.startsWith('/dashboard') || url.pathname.startsWith('/sessions') ||
      url.pathname.startsWith('/exercises') || url.pathname.startsWith('/progression') ||
      url.pathname.startsWith('/gyms') || url.pathname.startsWith('/bodyweight') ||
      url.pathname.startsWith('/settings') || url.pathname.startsWith('/daily-state') ||
      url.pathname.startsWith('/session')) {
    if (!user) {
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
  }

  // If logged in and going to /login or /register, redirect to dashboard
  if ((url.pathname === '/login' || url.pathname === '/register') && user) {
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/sessions/:path*',
    '/exercises/:path*',
    '/progression/:path*',
    '/gyms/:path*',
    '/bodyweight/:path*',
    '/settings/:path*',
    '/daily-state/:path*',
    '/session/:path*',
    '/login',
    '/register',
  ],
};
