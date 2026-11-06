import type { StoryPackage } from "@festival/shared";

export type WorkshopDifficulty = "easy" | "normal" | "hard" | null;

export type WorkshopStory = {
  id: string;
  story: StoryPackage["story"];
  author: { id: string | null; name: string };
  thumbnailUrl: string | null;
  difficulty: WorkshopDifficulty;
  published: boolean;
  publishedAt: string | null;
  updatedAt: string;
};

export type WorkshopItem = Omit<WorkshopStory, "story"> & Omit<StoryPackage["story"], "startSceneId"> & {
  averageRating: number | null;
  ratingCount: number;
  playCount: number;
  favoriteCount: number;
  isFavorite: boolean;
  canEdit: boolean;
};

export type WorkshopDraftInput = {
  package: StoryPackage;
  thumbnailUrl: string | null;
  difficulty: WorkshopDifficulty;
  published: boolean;
};
