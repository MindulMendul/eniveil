import documents from "./legal-documents.json";

export type LegalLocale = "ko" | "en";
export type LegalPolicy = "terms" | "privacy";
type Section = { title: string; paragraphs: string[] };
type Document = { introduction: string; sections: Section[] };

// Legal dates are editorial decisions, not build timestamps. Update this with any
// policy revision; split effective and revision dates if a change takes effect later.
export const legalUpdatedAt = "2026-11-08";
export const legalContact = "https://github.com/MindulMendul/murder-parker/issues/new";
export const legalDocuments: Record<LegalLocale, Record<LegalPolicy, Document>> = documents;
