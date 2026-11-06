export type WorkshopStory = {
  id: string; version: number; mode: 'solo' | 'multiplayer'; locale: string;
  title: string; subtitle: string; playerCount: { min: number; max: number }; estimatedMinutes: number;
  author: { id: string | null; name: string }; thumbnailUrl: string | null;
  difficulty: 'easy' | 'normal' | 'hard' | null; publishedAt: string | null; updatedAt: string;
  averageRating: number | null; ratingCount: number; playCount: number; favoriteCount: number;
  isFavorite: boolean; canEdit: boolean; published: boolean;
};
export async function workshopRequest(path: string, init?: RequestInit) {
  const response = await fetch(`/api/workshop${path}`, init);
  const payload = await response.json();
  if (!response.ok) throw Object.assign(new Error(payload.error || '요청에 실패했어요.'), { status: response.status });
  return payload;
}
