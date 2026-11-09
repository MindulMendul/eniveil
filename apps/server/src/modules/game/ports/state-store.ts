import type { State } from "../model";

export interface GameStateStore {
  state: State;
  save(): void;
  friendIds?(id: string): string[];
  areFriends?(a: string, b: string): boolean;
}
