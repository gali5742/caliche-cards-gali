import { MobileStudyReview } from "../../../components/study/MobileStudyReview";

type ReviewPageSearchParams = {
  language?: string | string[];
  collection?: string | string[];
  book?: string | string[];
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function StudyReviewPage({
  searchParams,
}: {
  searchParams: Promise<ReviewPageSearchParams>;
}) {
  const params = await searchParams;
  const languageId = first(params.language);
  const collectionId = first(params.collection);
  const rawBook = first(params.book);
  const parsedBook = rawBook ? Number(rawBook) : null;
  const book = parsedBook && Number.isInteger(parsedBook) ? parsedBook : null;

  return (
    <MobileStudyReview
      languageId={languageId}
      collectionId={collectionId}
      book={book}
    />
  );
}
