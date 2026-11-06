import documents from "./legal-documents.json";

export type LegalLocale = "ko" | "en";
export type LegalPolicy = "terms" | "privacy";
type Section = { title: string; paragraphs: string[] };
type Document = { introduction: string; sections: Section[] };

export const legalUpdatedAt = "2026-11-06";
export const legalContact = "https://github.com/MindulMendul/murder-parker/issues/new";
export const legalDocuments: Record<LegalLocale, Record<LegalPolicy, Document>> = documents;
