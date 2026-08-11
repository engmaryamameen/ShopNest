import bookImg from "@/assets/images/categories/books.png"
import Image from "next/image";


export function CategoryIcon({ slug }: { slug: string }) {
  const normalized = slug.toLowerCase();

  if (/books|mobile/.test(normalized)) {
    return (
      <Image src={bookImg} alt="Book" width={124} />
    );
  }

  if (/phone|mobile/.test(normalized)) {
    return (
      <img src={""} alt="" />
    );
  }
  if (/computer|laptop/.test(normalized)) {
    return <path d="M4 5h16v11H4V5Zm-2 14h20M9 16v3m6-3v3" />;
  }
  if (/watch/.test(normalized)) {
    return (
      <path d="M9 2h6l1 4H8l1-4Zm-1 16h8l-1 4H9l-1-4Zm4-10v4l2 1m-6-7h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
    );
  }
  if (/camera/.test(normalized)) {
    return (
      <path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm8 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
    );
  }
  if (/headphone|audio/.test(normalized)) {
    return (
      <path d="M4 13v-2a8 8 0 0 1 16 0v2M4 13h3v7H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 1-2Zm16 0h-3v7h2a2 2 0 0 0 2-2v-3a2 2 0 0 0-1-2Z" />
    );
  }
  if (/game/.test(normalized)) {
    return (
      <path d="M7 8h10a5 5 0 0 1 4.7 6.7l-1 2.8a2.4 2.4 0 0 1-4.1.7L15 16H9l-1.6 2.2a2.4 2.4 0 0 1-4.1-.7l-1-2.8A5 5 0 0 1 7 8Zm0 3v4m-2-2h4m7-1h.01M18 14h.01" />
    );
  }
  if (/beauty|skin|fragrance/.test(normalized)) {
    return <path d="M9 3h6v4l2 3v10H7V10l2-3V3Zm0 4h6M9 13h6" />;
  }
  if (/home|furniture|decor/.test(normalized)) {
    return <path d="m3 11 9-8 9 8v10h-6v-6H9v6H3V11Z" />;
  }
  if (/sport|outdoor/.test(normalized)) {
    return (
      <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-8 8h16M7 5.5c3 3 3 10 0 13m10-13c-3 3-3 10 0 13" />
    );
  }

  return <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z" />;
}