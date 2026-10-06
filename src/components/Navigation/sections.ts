/**
 * The places the menu can take you. The site is one journey, not pages, so
 * each is a moment of it (see BannerParticlePortal's navigate): the banner;
 * the worlds inside the black hole; and the book's three chapters.
 */
export type Section = "home" | "projects" | "education" | "experience" | "contact";

export type SectionItem = {
  id: Section;
  label: string;
  /** For the top bar on a narrow screen, where the full label won't fit. */
  short?: string;
};

export const SECTIONS: readonly SectionItem[] = [
  { id: "home", label: "Home" },
  { id: "projects", label: "Projects" },
  { id: "education", label: "Education & Certificates", short: "Education" },
  { id: "experience", label: "Experience" },
  { id: "contact", label: "Contact" },
];
