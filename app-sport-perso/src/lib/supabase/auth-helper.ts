import { NextResponse } from 'next/server';
import { createClient } from './server';

export async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  return user.id;
}

export async function requireAuthenticatedUserId(): Promise<{ userId: string; error: NextResponse | null }> {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return {
      userId: '',
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  return { userId, error: null };
}
