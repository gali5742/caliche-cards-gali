export type LanguageId = string;
export type CollectionId = string;

export type ContentCollectionRef = {
  languageId: LanguageId;
  collectionId: CollectionId;
};

export type ContentCollectionKind = "textbook" | "custom" | "imported";

export type ContentCollection = ContentCollectionRef & {
  kind: ContentCollectionKind;
  title: string;
};
