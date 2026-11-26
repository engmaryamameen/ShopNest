'use client';
import { useState } from 'react';
import Image from 'next/image';
import { isFirstPartyImageUrl } from '@/lib/is-first-party-image';
export function ProductGallery({
  images,
  name,
}: {
  images: Array<{ url: string; altText: string | null }>;
  name: string;
}) {
  const [selected, setSelected] = useState(0);
  const image = images[selected] ?? images[0];
  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-xl border border-gray-100 bg-white">
        {image ? (
          <Image
            src={image.url}
            alt={image.altText ?? name}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            priority
            className="object-contain p-3"
            unoptimized={!isFirstPartyImageUrl(image.url)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            No product image
          </div>
        )}
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-2" aria-label="Product image gallery">
          {images.map((img, i) => (
            <button
              key={img.url}
              onClick={() => setSelected(i)}
              aria-label={`View product image ${i + 1}`}
              aria-pressed={selected === i}
              className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-white ${selected === i ? 'border-[#0077b6] ring-1 ring-[#0077b6]' : 'border-gray-200'}`}
            >
              <Image
                src={img.url}
                alt=""
                fill
                sizes="80px"
                className="object-contain p-1"
                unoptimized={!isFirstPartyImageUrl(img.url)}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
