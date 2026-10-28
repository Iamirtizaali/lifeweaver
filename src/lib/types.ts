// Shared API types. Owned by the lead session; frontend imports, never edits.

export type MemoryKind = "photo" | "text";
export type MemoryStatus = "uploaded" | "processing" | "ready" | "failed";

export interface Memory {
  id: string;
  kind: MemoryKind;
  title: string | null;
  note: string | null; // user's note / pasted conversation for text memories
  date: string | null; // YYYY-MM-DD, null = unknown
  people: string[]; // manually entered only
  location: string | null; // manually entered only
  included: boolean; // false = excluded from AI and stories
  status: MemoryStatus;
  description: string | null; // Gemma's visual description (photos)
  userDescription: string | null; // user's correction; wins over description
  tags: string[];
  question: string | null; // Gemma's optional context question
  answer: string | null; // user's answer to that question
  questionSkipped: boolean;
  error: string | null; // last analysis error, when status = "failed"
  imageUrl: string | null; // /api/files/:id?v=original
  thumbUrl: string | null; // /api/files/:id?v=analysis
  createdAt: string;
  updatedAt: string;
}

export type MemoryPatch = Partial<
  Pick<
    Memory,
    | "title"
    | "note"
    | "date"
    | "people"
    | "location"
    | "included"
    | "userDescription"
    | "answer"
    | "questionSkipped"
  >
>;

export interface StorySection {
  heading: string;
  text: string;
  sourceIds: string[]; // memory ids this section rests on
  imageIds: string[]; // photo memory ids to show with it
}

export type StoryStatus = "current" | "outdated" | "needs_review";
export type StoryTone = "warm" | "plain" | "reflective";
export type StoryLength = "short" | "medium";

export interface Story {
  id: string;
  title: string;
  intro: string;
  theme: string;
  tone: StoryTone;
  length: StoryLength;
  sections: StorySection[];
  sourceIds: string[];
  status: StoryStatus; // outdated = a source was edited; needs_review = a source was deleted
  model: string; // e.g. gemma-4-31b-it
  createdAt: string;
  updatedAt: string;
}

export interface ApiError {
  error: { code: string; message: string };
}

export interface Health {
  gemmaConfigured: boolean;
  model: string | null;
}

export const LIMITS = {
  maxPhotosPerBatch: 10,
  maxPhotoBytes: 10 * 1024 * 1024,
  acceptedTypes: ["image/jpeg", "image/png", "image/webp"],
  maxNoteChars: 4000,
  maxThemeChars: 200,
  maxStorySources: 12,
} as const;
